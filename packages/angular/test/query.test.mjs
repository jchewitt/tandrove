import { configureChangeDetection } from './test-environment.mjs';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  InjectionToken,
  runInInjectionContext,
  signal,
  computed,
  Component,
  DestroyRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AcquisitionClient, resourceAddress } from '@tandrove/core';
import { createSchema, createGraphQLClient } from '@tandrove/graphql';
import {
  injectStateQuery,
  provideTandroveClient,
  tandroveSignal,
} from './adapter.mjs';

beforeEach(configureChangeDetection);
afterEach(() => TestBed.resetTestingModule());
const scope = (providers) =>
  createEnvironmentInjector(
    providers ?? [],
    TestBed.inject(EnvironmentInjector),
  );
const tick = () => TestBed.tick();
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    tick();
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('Condition did not settle.');
}
function handles() {
  const opened = [];
  const open = (value) => {
    let snapshot = Object.freeze({ value });
    const listeners = new Set();
    const calls = [];
    const handle = {
      stateAddress: value,
      ready: Promise.resolve(),
      getSnapshot: () => snapshot,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
          handle.removals++;
        };
      },
      dispose: () => {
        handle.disposals++;
      },
      ensure: async () => {
        calls.push(['ensure']);
      },
      invalidate: async (...args) => {
        calls.push(['invalidate', ...args]);
      },
      refresh: async (...args) => {
        calls.push(['refresh', ...args]);
      },
      refreshList: async () => {
        calls.push(['refreshList']);
      },
      poll: (options) => {
        calls.push(['poll', options]);
        return () => calls.push(['stopPoll', options]);
      },
      publish(next) {
        snapshot = Object.freeze({ value: next });
        for (const fn of [...listeners]) fn();
      },
      calls,
      listeners,
      disposals: 0,
      removals: 0,
    };
    opened.push(handle);
    return handle;
  };
  return { open, opened };
}

test('component-owned signals and queries stop at destruction and reject a destroyed component ref', () => {
  const { open, opened } = handles();
  let subscriptions = 0;
  let removals = 0;
  let value = Object.freeze({ label: 'initial' });
  let notify;
  const reader = {
    getSnapshot: () => value,
    subscribe: (listener) => {
      subscriptions++;
      notify = listener;
      return () => removals++;
    },
  };
  class Host {
    lifetime = inject(DestroyRef);
    snapshot = tandroveSignal(reader);
    parameter = signal('A');
    query = injectStateQuery(this.parameter, open);
  }
  Component({
    selector: 'lifecycle-host',
    standalone: true,
    template: '{{ snapshot().label }}:{{ query.state().status }}',
  })(Host);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  assert.equal(host.lifetime.destroyed, false);
  assert.match(fixture.nativeElement.textContent, /initial:active/);
  value = Object.freeze({ label: 'updated' });
  notify();
  host.parameter.set('B');
  tick();
  fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /updated:active/);
  assert.equal(opened[0].disposals, 1);
  assert.equal(host.query.state().stateAddress, 'B');
  fixture.destroy();
  assert.equal(host.lifetime.destroyed, true);
  assert.equal(host.query.state().status, 'disposed');
  assert.equal(opened[1].disposals, 1);
  assert.equal(removals, 1);
  value = Object.freeze({ label: 'late' });
  notify();
  assert.equal(host.snapshot().label, 'updated');
  assert.throws(
    () => tandroveSignal(reader, { destroyRef: host.lifetime }),
    /destroyed Angular scope/,
  );
  assert.equal(subscriptions, 1);
});

test('provider lazily owns one client per providing injector, inherited by children', () => {
  const token = new InjectionToken('client');
  let creates = 0,
    disposals = 0;
  const factory = () => {
    creates++;
    return {
      dispose() {
        disposals++;
      },
    };
  };
  const root = scope([provideTandroveClient(token, factory)]);
  const child = createEnvironmentInjector([], root);
  assert.equal(creates, 0);
  assert.equal(root.get(token), child.get(token));
  assert.equal(creates, 1);
  child.destroy();
  assert.equal(disposals, 0);
  const override = createEnvironmentInjector(
    [provideTandroveClient(token, factory)],
    root,
  );
  assert.notEqual(override.get(token), root.get(token));
  override.destroy();
  assert.equal(disposals, 1);
  root.destroy();
  assert.equal(disposals, 2);
});

test('provider disposes a client returned after its creation destroys the owning scope', () => {
  const token = new InjectionToken('reentrant client');
  let disposals = 0;
  const owner = scope([
    provideTandroveClient(token, () => {
      owner.destroy();
      return {
        dispose() {
          disposals++;
        },
      };
    }),
  ]);
  assert.throws(() => owner.get(token), /destroyed/);
  assert.equal(disposals, 1);
});

test('identical snapshot notifications preserve the owned state signal identity', () => {
  const owner = scope();
  const fixture = handles();
  const query = injectStateQuery(() => 'A', fixture.open, { injector: owner });
  const previous = query.state();
  for (const notify of fixture.opened[0].listeners) notify();
  assert.equal(query.state(), previous);
  owner.destroy();
});

test('reactive arguments hide old state and reject commands before replacement runs', async () => {
  const owner = scope();
  const id = signal('A');
  const fixture = handles();
  const query = injectStateQuery(id, fixture.open, { injector: owner });
  assert.equal(query.state().snapshot.value, 'A');
  tick();
  assert.equal(fixture.opened.length, 1);
  id.set('B');
  assert.equal(query.state().status, 'pending');
  await assert.rejects(query.refresh(), /current binding/);
  tick();
  assert.equal(query.state().snapshot.value, 'B');
  assert.equal(fixture.opened[0].disposals, 1);
  fixture.opened[0].publish('late A');
  assert.equal(query.state().snapshot.value, 'B');
  await query.invalidate('name', { refetch: 'none' });
  await query.ensure();
  await query.refreshList();
  assert.deepEqual(fixture.opened[1].calls, [
    ['invalidate', 'name', { refetch: 'none' }],
    ['ensure'],
    ['refreshList'],
  ]);
  owner.destroy();
  assert.equal(fixture.opened[1].disposals, 1);
});

test('observed A to B to A transitions do not reuse the old binding before flush', () => {
  const owner = scope();
  const id = signal('A');
  const fixture = handles();
  const query = injectStateQuery(id, fixture.open, { injector: owner });
  id.set('B');
  assert.equal(query.state().status, 'pending');
  id.set('A');
  assert.equal(query.state().status, 'pending');
  tick();
  assert.equal(query.state().snapshot.value, 'A');
  assert.equal(fixture.opened.length, 2);
  assert.equal(fixture.opened[0].disposals, 1);
  owner.destroy();
});

test('polling is synchronous, checks the current binding, and never transfers a stop to its replacement', () => {
  const owner = scope();
  const id = signal('A');
  const fixture = handles();
  const query = injectStateQuery(id, fixture.open, { injector: owner });
  const options = { target: 'name', everyMs: 100 };
  const stop = query.poll(options);
  assert.equal(typeof stop, 'function');
  assert.deepEqual(fixture.opened[0].calls, [['poll', options]]);
  id.set('B');
  assert.throws(() => query.poll(options), /current binding/);
  tick();
  assert.equal(fixture.opened[0].disposals, 1);
  assert.deepEqual(fixture.opened[1].calls, []);
  stop();
  assert.deepEqual(fixture.opened[0].calls, [
    ['poll', options],
    ['stopPoll', options],
  ]);
  assert.deepEqual(fixture.opened[1].calls, []);
  query.poll({ everyMs: false });
  assert.deepEqual(fixture.opened[1].calls, [['poll', { everyMs: false }]]);
  owner.destroy();
  assert.throws(() => query.poll(options), /disposed/);
});

test('poll registration does not capture reactive dependencies from the binding or handle', () => {
  const owner = scope();
  const id = signal('A');
  const incidental = signal(0);
  const fixture = handles();
  const query = injectStateQuery(
    id,
    (value) => {
      const handle = fixture.open(value);
      const poll = handle.poll;
      handle.poll = (options) => {
        incidental();
        return poll(options);
      };
      return handle;
    },
    { injector: owner },
  );
  let evaluations = 0;
  const registration = computed(() => {
    evaluations++;
    return query.poll({ target: 'name', everyMs: 100 });
  });
  const stop = registration();
  incidental.set(1);
  id.set('B');
  tick();
  assert.equal(registration(), stop);
  assert.equal(evaluations, 1);
  assert.deepEqual(fixture.opened[1].calls, []);
  owner.destroy();
});

test('owned query replacement and injector destruction cancel polling without closing the shared client', async (t) => {
  const timers = [];
  const client = new AcquisitionClient({
    pollingScheduler: {
      now: () => 0,
      wait: (_ms, signal) =>
        new Promise((resolve) => timers.push({ signal, resolve })),
    },
  });
  t.after(() => client.dispose());
  const owner = scope();
  t.after(() => {
    if (!owner.destroyed) owner.destroy();
  });
  const id = signal('A');
  const authority = {};
  const source = (value) => ({
    authority,
    stateAddress: resourceAddress({ source: 'angular-poll', scope: value }, [
      { name: 'item', arguments: {} },
    ]),
    selection: [
      { name: 'name', responseName: 'name', arguments: {}, children: [] },
    ],
    read: async () => [
      {
        identity: { id: '1' },
        fields: [
          { kind: 'write', path: [{ name: 'name', arguments: {} }], value },
        ],
      },
    ],
  });
  const query = injectStateQuery(id, (value) => client.watch(source(value)), {
    injector: owner,
  });
  await query.ensure();
  const stopA = query.poll({ target: 'name', everyMs: 100 });
  await until(() => timers.some((timer) => !timer.signal.aborted));
  const timerA = timers.find((timer) => !timer.signal.aborted);
  id.set('B');
  assert.throws(() => query.poll({ everyMs: 100 }), /current binding/);
  tick();
  await query.ensure();
  assert.equal(timerA.signal.aborted, true);
  assert.equal(timers.filter((timer) => !timer.signal.aborted).length, 0);
  query.poll({ target: 'name', everyMs: 100 });
  await until(() => timers.some((timer) => !timer.signal.aborted));
  const timerB = timers.find((timer) => !timer.signal.aborted);
  stopA();
  stopA();
  assert.equal(timerB.signal.aborted, false);
  owner.destroy();
  assert.equal(timerB.signal.aborted, true);
  const peer = client.watch(source('B'));
  await peer.ready;
  assert.equal(peer.getSnapshot().records[0].data.name, 'B');
  peer.dispose();
});

test('parameter and factory errors detach old handles and recover after parameter change', async () => {
  const owner = scope();
  const id = signal('A');
  const fixture = handles();
  const query = injectStateQuery(
    () => {
      const value = id();
      if (value === 'bad-params') throw new Error('parameter failure');
      return value;
    },
    (value) => {
      if (value === 'bad-open') throw new Error('factory failure');
      return fixture.open(value);
    },
    { injector: owner },
  );
  id.set('bad-params');
  assert.match(query.state().error.message, /parameter failure/);
  await assert.rejects(query.ensure(), /current binding/);
  tick();
  assert.equal(fixture.opened[0].disposals, 1);
  id.set('bad-open');
  tick();
  assert.match(query.state().error.message, /factory failure/);
  id.set('B');
  tick();
  assert.equal(query.state().snapshot.value, 'B');
  owner.destroy();
});

test('factory injection is consistent and incidental reads do not become parameter dependencies', () => {
  const token = new InjectionToken('tag');
  const owner = scope([{ provide: token, useValue: 'injected' }]);
  const id = signal('A');
  const incidental = signal(0);
  const fixture = handles();
  const query = runInInjectionContext(owner, () =>
    injectStateQuery(id, (value) => {
      incidental();
      return fixture.open(`${inject(token)}-${value}`);
    }),
  );
  tick();
  incidental.set(1);
  tick();
  assert.equal(fixture.opened.length, 1);
  id.set('B');
  tick();
  assert.equal(query.state().snapshot.value, 'injected-B');
  owner.destroy();
});

test('manual disposal is idempotent, releases only the handle, and stops evaluating parameters', async () => {
  const owner = scope();
  const id = signal('A');
  let evaluations = 0;
  const fixture = handles();
  const query = injectStateQuery(
    () => {
      evaluations++;
      return id();
    },
    fixture.open,
    { injector: owner },
  );
  query.dispose();
  query.dispose();
  id.set('B');
  tick();
  assert.equal(query.state().status, 'disposed');
  assert.equal(evaluations, 1);
  await assert.rejects(query.ensure(), /disposed/);
  owner.destroy();
  assert.equal(fixture.opened[0].disposals, 1);
  assert.equal(fixture.opened[0].removals, 1);
});

test('reentrant parameter change or destruction during open disposes the returned obsolete handle', () => {
  for (const action of ['change', 'destroy']) {
    const owner = scope();
    const id = signal('A');
    const fixture = handles();
    const query = injectStateQuery(
      id,
      (value) => {
        const handle = fixture.open(value);
        if (value === 'A') {
          if (action === 'change') id.set('B');
          else owner.destroy();
        }
        return handle;
      },
      { injector: owner },
    );
    assert.equal(fixture.opened[0].disposals, 1);
    assert.equal(
      query.state().status,
      action === 'change' ? 'pending' : 'disposed',
    );
    tick();
    if (action === 'change') {
      assert.equal(query.state().snapshot.value, 'B');
      owner.destroy();
    }
  }
});

test('failed or synchronously notifying subscriptions release the owned handle', () => {
  for (const mode of ['subscribe', 'read', 'destroy']) {
    const owner = scope();
    const fixture = handles();
    const query = injectStateQuery(
      () => 'A',
      (value) => {
        const handle = fixture.open(value);
        const subscribe = handle.subscribe;
        handle.subscribe = (fn) => {
          if (mode === 'subscribe') throw new Error('subscribe failure');
          const cleanup = subscribe(fn);
          fn();
          if (mode === 'destroy') owner.destroy();
          return cleanup;
        };
        if (mode === 'read')
          handle.getSnapshot = () => {
            throw new Error('read failure');
          };
        return handle;
      },
      { injector: owner },
    );
    assert.equal(fixture.opened[0].disposals, 1);
    assert.equal(fixture.opened[0].listeners.size, 0);
    assert.equal(
      query.state().status,
      mode === 'destroy' ? 'disposed' : 'error',
    );
    if (mode !== 'destroy') owner.destroy();
    assert.equal(fixture.opened[0].disposals, 1);
  }
});

test('missing, destroyed and reactive construction contexts reject before opening', () => {
  const fixture = handles();
  assert.throws(
    () => injectStateQuery(() => 'A', fixture.open),
    /injection context/,
  );
  const owner = scope();
  assert.throws(
    () =>
      computed(() =>
        injectStateQuery(() => 'A', fixture.open, { injector: owner }),
      )(),
    /reactive context/,
  );
  owner.destroy();
  assert.throws(
    () => injectStateQuery(() => 'A', fixture.open, { injector: owner }),
    /destroyed/,
  );
  assert.equal(fixture.opened.length, 0);
});

test('shared core acquisition survives one argument switch and late data stays under its own scope', async () => {
  const token = new InjectionToken('acquisition');
  const root = scope([
    provideTandroveClient(token, () => new AcquisitionClient()),
  ]);
  const a = createEnvironmentInjector([], root);
  const b = createEnvironmentInjector([], root);
  const requests = [];
  const selection = [
    { name: 'name', responseName: 'name', arguments: {}, children: [] },
  ];
  const authority = {}; // These wrappers use one backend; the address isolates sessions.
  const source = (id) => ({
    authority,
    stateAddress: resourceAddress({ source: 'test', scope: id }, [
      { name: 'item', arguments: {} },
    ]),
    selection,
    read: (_fields, context) =>
      new Promise((resolve) => requests.push({ id, context, resolve })),
  });
  const firstId = signal('A');
  const open = (id) => inject(token).watch(source(id));
  const first = injectStateQuery(firstId, open, { injector: a });
  const second = injectStateQuery(() => 'A', open, { injector: b });
  await until(() => requests.length === 1);
  firstId.set('B');
  assert.equal(first.state().status, 'pending');
  await until(() => requests.length === 2);
  assert.equal(requests[0].context.signal.aborted, false);
  const result = (value) => [
    {
      identity: { id: '1' },
      fields: [
        { kind: 'write', path: [{ name: 'name', arguments: {} }], value },
      ],
    },
  ];
  requests[1].resolve(result('B-value'));
  await until(
    () => first.state().snapshot?.records?.[0]?.data.name === 'B-value',
  );
  requests[0].resolve(result('A-value'));
  await until(
    () => second.state().snapshot?.records?.[0]?.data.name === 'A-value',
  );
  assert.equal(first.state().snapshot.records[0].data.name, 'B-value');
  a.destroy();
  const refresh = second.refresh();
  await until(() => requests.length === 3);
  const rejected = assert.rejects(refresh);
  b.destroy();
  await rejected;
  assert.equal(requests[2].context.signal.aborted, true);
  root.destroy();
});

test('GraphQL definitions retain alias invalidation and cached siblings through the Angular wrapper', async () => {
  const token = new InjectionToken('graphql');
  const requests = [];
  let version = 1;
  const definition = createSchema(
    'type Query { item(id: ID!): Item! } type Item { id: ID! name: String! amount: Int! }',
  )
    .field('item')
    .select({ name: { as: 'label' }, amount: true });
  const root = scope([
    provideTandroveClient(token, () =>
      createGraphQLClient({
        transport: async (operation) => {
          requests.push(operation.query);
          return {
            data: {
              item: {
                __typename: 'Item',
                label: `name-${version}`,
                amount: version * 10,
              },
            },
          };
        },
      }),
    ),
  ]);
  const owner = createEnvironmentInjector([], root);
  const query = injectStateQuery(
    () =>
      definition.bind({ item: { id: '1' } }, { source: 'fixture', scope: 'A' }),
    (bound) => inject(token).watch(bound),
    { injector: owner },
  );
  await query.ensure();
  assert.equal(query.state().snapshot.records[0].data.label, 'name-1');
  version = 2;
  await query.invalidate('label');
  assert.match(requests.at(-1), /label: name/);
  assert.doesNotMatch(requests.at(-1), /amount/);
  assert.equal(query.state().snapshot.records[0].data.amount, 10);
  assert.equal(query.state().snapshot.records[0].data.label, 'name-2');
  owner.destroy();
  // The component owned a handle, not the provider's shared client.
  const peer = root
    .get(token)
    .watch(
      definition.bind({ item: { id: '1' } }, { source: 'fixture', scope: 'A' }),
    );
  await peer.ready;
  assert.equal(requests.length, 2);
  peer.dispose();
  root.destroy();
});
