import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computed,
  createEnvironmentInjector,
  DestroyRef,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { StateStore, resourceAddress } from '@tandrove/core';
import { tandroveSignal } from './adapter.mjs';

function lifetime() {
  const injector = createEnvironmentInjector([]);
  return {
    injector,
    ref: runInInjectionContext(injector, () => inject(DestroyRef)),
    destroy: () => injector.destroy(),
  };
}

function fixture() {
  let current = Object.freeze({ value: 1 });
  let subscriptions = 0;
  let removals = 0;
  let disposals = 0;
  const listeners = new Set();
  return {
    getSnapshot: () => current,
    subscribe(callback) {
      subscriptions++;
      listeners.add(callback);
      return () => {
        removals++;
        listeners.delete(callback);
      };
    },
    dispose: () => {
      disposals++;
    },
    change(value) {
      current = Object.freeze({ value });
      for (const callback of [...listeners]) callback();
    },
    notify() {
      for (const callback of [...listeners]) callback();
    },
    counts: () => ({ subscriptions, removals, disposals }),
  };
}

test('reads immediately, preserves snapshot identity and freezes observation at scope destruction', () => {
  const owner = lifetime();
  const reader = fixture();
  const state = runInInjectionContext(owner.injector, () =>
    tandroveSignal(reader),
  );
  assert.equal(state(), reader.getSnapshot());
  assert.equal(state.set, undefined);
  let computations = 0;
  const value = computed(() => {
    computations++;
    return state().value;
  });
  assert.equal(value(), 1);
  reader.notify();
  assert.equal(value(), 1);
  assert.equal(computations, 1);
  reader.change(2);
  assert.equal(value(), 2);
  const last = state();
  owner.destroy();
  reader.change(3);
  assert.equal(state(), last);
  assert.deepEqual(reader.counts(), {
    subscriptions: 1,
    removals: 1,
    disposals: 0,
  });
});

test('explicit lifetime works outside injection context and two owners remain independent', () => {
  const a = lifetime();
  const b = lifetime();
  const reader = fixture();
  const first = tandroveSignal(reader, { destroyRef: a.ref });
  const second = tandroveSignal(reader, { destroyRef: b.ref });
  a.destroy();
  reader.change(2);
  assert.equal(first().value, 1);
  assert.equal(second().value, 2);
  b.destroy();
  assert.deepEqual(reader.counts(), {
    subscriptions: 2,
    removals: 2,
    disposals: 0,
  });
});

test('rejects missing/destroyed lifetime and reactive construction before subscribing', () => {
  const reader = fixture();
  assert.throws(() => tandroveSignal(reader), /injection context/);
  const owner = lifetime();
  assert.throws(
    () => computed(() => tandroveSignal(reader, { destroyRef: owner.ref }))(),
    /reactive context/,
  );
  owner.destroy();
  assert.throws(
    () => tandroveSignal(reader, { destroyRef: owner.ref }),
    /destroyed/,
  );
  assert.equal(reader.counts().subscriptions, 0);
});

test('rechecks after subscribing and accepts synchronous notifications', () => {
  for (const notify of [false, true]) {
    const owner = lifetime();
    let current = Object.freeze({ value: 1 });
    let removals = 0;
    const reader = {
      getSnapshot: () => current,
      subscribe(callback) {
        current = Object.freeze({ value: 2 });
        if (notify) callback();
        return () => {
          removals++;
        };
      },
    };
    const state = tandroveSignal(reader, { destroyRef: owner.ref });
    assert.equal(state().value, 2);
    owner.destroy();
    assert.equal(removals, 1);
  }
});

test('cleans subscription if construction fails after subscribing', () => {
  for (const failure of ['read', 'destroy', 'register']) {
    const owner = lifetime();
    let reads = 0;
    let removals = 0;
    const reader = {
      getSnapshot() {
        if (++reads === 2 && failure === 'read') throw new Error('read failed');
        return 1;
      },
      subscribe() {
        if (failure === 'destroy') owner.destroy();
        return () => {
          removals++;
        };
      },
    };
    const ref =
      failure === 'register'
        ? {
            destroyed: false,
            onDestroy() {
              throw new Error('register failed');
            },
          }
        : owner.ref;
    assert.throws(() => tandroveSignal(reader, { destroyRef: ref }));
    assert.equal(removals, 1);
    if (!owner.ref.destroyed) owner.destroy();
    assert.equal(removals, 1);
  }
});

test('propagates initial read/subscription failures without retaining a destroy callback', () => {
  for (const stage of ['read', 'subscribe']) {
    let registrations = 0;
    const ref = {
      destroyed: false,
      onDestroy() {
        registrations++;
        return () => {};
      },
    };
    const reader = {
      getSnapshot() {
        if (stage === 'read') throw new Error('read failed');
        return 1;
      },
      subscribe() {
        throw new Error('subscribe failed');
      },
    };
    assert.throws(() => tandroveSignal(reader, { destroyRef: ref }), /failed/);
    assert.equal(registrations, 0);
  }
});

test('a synchronous notification cannot strand cleanup when the next snapshot read fails', () => {
  const owner = lifetime();
  const listeners = new Set();
  let reads = 0;
  let removals = 0;
  const reader = {
    getSnapshot() {
      if (++reads === 2) throw new Error('notification read failed');
      return 1;
    },
    subscribe(callback) {
      listeners.add(callback);
      callback();
      return () => {
        removals++;
        listeners.delete(callback);
      };
    },
  };
  assert.throws(
    () => tandroveSignal(reader, { destroyRef: owner.ref }),
    /notification read failed/,
  );
  assert.equal(listeners.size, 0);
  assert.equal(removals, 1);
  owner.destroy();
  assert.equal(removals, 1);
});

test('real shared core views update atomically and remain usable after Angular destruction', () => {
  const store = new StateStore();
  const address = resourceAddress({ source: 'test', scope: 'A' }, [
    { name: 'invoice', arguments: {} },
  ]);
  const fields = ['accountId', 'amount'].map((name) => ({
    name,
    responseName: name,
    arguments: {},
    children: [],
  }));
  const view = store.watch(address, fields);
  const owner = lifetime();
  const state = tandroveSignal(view, { destroyRef: owner.ref });
  const write = (name, value) => ({
    kind: 'write',
    record: { id: '1' },
    path: [{ name, arguments: {} }],
    value,
  });
  store.commit(address, [
    { kind: 'membership', records: [{ id: '1' }] },
    write('accountId', 'original'),
    write('amount', 10),
  ]);
  assert.equal(state(), view.getSnapshot());
  assert.equal(state().records[0].data.accountId, 'original');
  store.commit(address, [write('accountId', 'updated')]);
  assert.equal(state().records[0].data.accountId, 'updated');
  assert.equal(state().records[0].data.amount, 10);
  const last = state();
  owner.destroy();
  store.commit(address, [write('accountId', 'still alive')]);
  assert.equal(state(), last);
  assert.equal(view.getSnapshot().records[0].data.accountId, 'still alive');
  view.dispose();
  store.dispose();
});
