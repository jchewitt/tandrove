import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StateStore } from '../dist/index.js';

const address = 'projection-cache';
const record = { tenant: 'A', id: '1' };
const field = (name, children = [], responseName = name, args = {}) => ({
  name,
  children,
  responseName,
  arguments: args,
});
const segment = (name, args = {}) => ({ name, arguments: args });
const path = (...names) => names.map((name) => segment(name));
const write = (fields, value) => ({
  kind: 'write',
  record,
  path: fields,
  value,
});
const member = { kind: 'membership', records: [record] };
const row = (view) => view.getSnapshot().records[0];

function setup(t) {
  const store = new StateStore();
  t.after(() => store.dispose());
  return store;
}

test('fetching-only changes preserve value equality and overlapping request notifications', (t) => {
  const store = setup(t);
  const view = store.watch(address, [field('details')]);
  const unrelated = store.watch(address, [field('amount')]);
  store.commit(address, [
    member,
    write(path('details'), { first: 1, second: [2, 3] }),
    write(path('amount'), 10),
  ]);
  const before = view.getSnapshot();
  const unrelatedBefore = unrelated.getSnapshot();
  const events = [];
  view.subscribe(() => events.push(view.getSnapshot()));

  store.setFetching(address, 'first', [field('details', [], 'alias')]);
  const fetching = view.getSnapshot();
  assert.equal(fetching.fetching, true);
  assert.deepEqual(fetching.records, before.records);
  assert.strictEqual(unrelated.getSnapshot(), unrelatedBefore);

  store.commit(address, [
    write(path('details'), { second: [2, 3], first: 1 }),
    write(path('unselected'), 'new'),
  ]);
  assert.strictEqual(view.getSnapshot(), fetching);
  store.setFetching(address, 'second', [field('details')]);
  store.setFetching(address, 'first');
  store.setFetching(address, 'unknown');
  assert.strictEqual(view.getSnapshot(), fetching);
  assert.equal(events.length, 1);

  store.setFetching(address, 'second');
  const settled = view.getSnapshot();
  store.commit(address, [write(path('details'), { first: 1, second: [2, 3] })]);
  assert.strictEqual(view.getSnapshot(), settled);
  assert.deepEqual(
    events.map((snapshot) => snapshot.fetching),
    [true, false],
  );
  assert.deepEqual(settled.records, before.records);
  assert.equal(before.fetching, false);
  assert.equal(fetching.fetching, true);
  assert.throws(
    () => fetching.records[0].data.details.second.push(4),
    TypeError,
  );
  assert.ok(Object.isFrozen(settled));
});

test('request replacement updates canonical argument coverage atomically across aliases and membership requests', (t) => {
  const store = setup(t);
  const usd = { currency: 'USD', filter: { region: 'US', active: true } };
  const reorderedUsd = {
    filter: { active: true, region: 'US' },
    currency: 'USD',
  };
  const eur = { currency: 'EUR', filter: { region: 'US', active: true } };
  const selection = (args, alias) => [
    field('quote', [field('value', [], 'total')], alias, args),
  ];
  const first = store.watch(address, selection(usd, 'dollars'));
  const alias = store.watch(address, selection(reorderedUsd, 'display'));
  const other = store.watch(address, selection(eur, 'euros'));
  const views = [first, alias, other];
  let expected = [false, false, false];
  let notifications = 0;
  for (const view of views) {
    view.subscribe(() => {
      notifications++;
      assert.deepEqual(
        views.map((peer) => peer.getSnapshot().fetching),
        expected,
      );
    });
  }

  expected = [true, true, false];
  store.setFetching(
    address,
    'moving',
    selection(reorderedUsd, 'transportAlias'),
  );
  assert.equal(notifications, 2);
  expected = [false, false, true];
  store.setFetching(address, 'moving', selection(eur, 'transportAlias'));
  assert.equal(notifications, 5);
  expected = [true, true, true];
  store.setFetching(address, 'parent', [
    field('quote', [], 'branch', reorderedUsd),
  ]);
  assert.equal(notifications, 7);
  store.setFetching(address, 'membership', [field('unrelated')], true);
  store.setFetching(address, 'moving');
  store.setFetching(address, 'parent');
  assert.equal(notifications, 7);
  expected = [false, false, false];
  store.setFetching(address, 'membership');
  assert.equal(notifications, 10);
});

test('nested argument and alias paths retain missing, structural null and descendant error semantics across fetching changes', (t) => {
  const store = setup(t);
  const userArgs = { region: 'US' };
  const profileArgs = { locale: 'en', format: { compact: true } };
  const selection = [
    field(
      'user',
      [
        field(
          'profile',
          [field('name', [], 'label'), field('email')],
          'card',
          profileArgs,
        ),
      ],
      'customer',
      userArgs,
    ),
  ];
  const view = store.watch(address, selection);
  const parent = [
    segment('user', userArgs),
    segment('profile', { format: { compact: true }, locale: 'en' }),
  ];
  const name = [...parent, segment('name')];
  store.commit(address, [
    member,
    { kind: 'error', record, path: name, message: 'name missing' },
  ]);
  assert.equal(Object.hasOwn(row(view).data, 'customer'), false);
  assert.deepEqual(row(view).fields.find((status) => status.error)?.path, [
    'customer',
    'card',
    'label',
  ]);
  store.setFetching(address, 'nested', selection);
  assert.equal(
    row(view).fields.find((status) => status.error)?.error,
    'name missing',
  );
  assert.equal(view.getSnapshot().complete, false);

  store.commit(address, [write(parent, null)]);
  const successfulNull = view.getSnapshot();
  assert.equal(row(view).data.customer.card, null);
  assert.equal(successfulNull.complete, true);
  assert.equal(successfulNull.stale, false);
  store.commit(address, [
    { kind: 'error', record, path: name, message: 'name beneath null' },
  ]);
  store.setFetching(address, 'nested');
  assert.equal(row(view).data.customer.card, null);
  assert.equal(view.getSnapshot().complete, false);
  assert.equal(
    row(view).fields.find((status) => status.error)?.error,
    'name beneath null',
  );

  store.commit(address, [write(name, 'Ann')]);
  assert.equal(row(view).data.customer.card.label, 'Ann');
  assert.equal(Object.hasOwn(row(view).data.customer.card, 'email'), false);
  assert.equal(view.getSnapshot().complete, false);
  store.commit(address, [
    write([...parent, segment('email')], 'a@example.test'),
  ]);
  const complete = view.getSnapshot();
  assert.equal(complete.complete, true);
  assert.equal(complete.stale, false);
  store.commit(address, [
    write(
      [
        segment('user', userArgs),
        segment('profile', { locale: 'fr', format: { compact: true } }),
        segment('name'),
      ],
      'unselected locale',
    ),
  ]);
  assert.strictEqual(view.getSnapshot(), complete);
  assert.equal(successfulNull.records[0].data.customer.card, null);
  assert.throws(() => row(view).fields[0].path.push('mutated'), TypeError);
});

test('failed batches and invalid request replacements cannot leak through later fetching-only updates', (t) => {
  const store = setup(t);
  const first = store.watch(address, [field('name')]);
  const second = store.watch(address, [field('name', [], 'label')]);
  store.commit(address, [member, write(path('name'), 'original')]);
  store.setFetching(address, 'pending', [field('name')]);
  const before = first.getSnapshot();
  let notifications = 0;
  first.subscribe(() => notifications++);

  assert.throws(
    () =>
      store.commit(address, [
        write(path('name'), 'uncommitted'),
        { kind: 'membership', records: [record, record] },
      ]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      store.setFetching(address, 'pending', [field('other', [], 'other', [])]),
    /arguments must be an object/,
  );
  assert.strictEqual(first.getSnapshot(), before);
  assert.equal(second.getSnapshot().fetching, true);
  store.setFetching(address, 'unrelated', [field('other')]);
  assert.strictEqual(first.getSnapshot(), before);
  assert.equal(notifications, 0);
  store.setFetching(address, 'pending');
  assert.equal(first.getSnapshot().fetching, false);
  assert.equal(row(first).data.name, 'original');
  assert.equal(row(second).data.label, 'original');
  assert.equal(notifications, 1);
  store.commit(address, [write(path('name'), 'committed')]);
  assert.equal(row(second).data.label, 'committed');
});

test('fetching transitions preserve unknown, empty, successful null and failed null resource states', (t) => {
  const store = setup(t);
  const view = store.watch(address, [field('name')]);
  function checkFetching() {
    const before = view.getSnapshot();
    store.setFetching(address, 'root', [field('unrelated')], true);
    const fetching = view.getSnapshot();
    assert.equal(fetching.fetching, true);
    assert.deepEqual({ ...fetching, fetching: false }, before);
    store.setFetching(address, 'root');
    assert.deepEqual(view.getSnapshot(), before);
    assert.equal(fetching.fetching, true);
  }
  assert.equal(view.getSnapshot().records, undefined);
  checkFetching();
  store.commit(address, [{ kind: 'membership', records: [] }]);
  assert.deepEqual(view.getSnapshot().records, []);
  assert.equal(view.getSnapshot().complete, true);
  checkFetching();
  store.commit(address, [{ kind: 'resource-null' }]);
  assert.equal(view.getSnapshot().records, null);
  assert.equal(view.getSnapshot().stale, false);
  checkFetching();
  store.commit(address, [
    { kind: 'resource-null', error: 'resource unavailable' },
  ]);
  assert.equal(view.getSnapshot().resourceError, 'resource unavailable');
  assert.equal(view.getSnapshot().complete, false);
  checkFetching();
  store.commit(address, [member]);
  assert.equal(view.getSnapshot().resourceError, undefined);
  assert.equal(Object.hasOwn(row(view).data, 'name'), false);
  assert.equal(view.getSnapshot().complete, false);
  checkFetching();
});

test('reentrant fetching, commits and disposal keep peer snapshots current before each callback', (t) => {
  const store = setup(t);
  const first = store.watch(address, [field('name')]);
  const second = store.watch(address, [field('name', [], 'label')]);
  const disposed = store.watch(address, [field('name')]);
  store.commit(address, [member, write(path('name'), 'A')]);
  const original = second.getSnapshot();
  let reentered = false;
  let disposedEvents = 0;
  let captured;
  const observations = [];
  first.subscribe(() => {
    assert.equal(row(first).data.name, row(second).data.label);
    assert.equal(first.getSnapshot().fetching, second.getSnapshot().fetching);
    if (!reentered && first.getSnapshot().fetching) {
      reentered = true;
      captured = second.getSnapshot();
      disposed.dispose();
      store.commit(address, [write(path('name'), 'B')]);
      store.setFetching(address, 'request');
    }
  });
  second.subscribe(() => {
    assert.equal(row(first).data.name, row(second).data.label);
    assert.equal(first.getSnapshot().fetching, second.getSnapshot().fetching);
    observations.push(second.getSnapshot());
  });
  disposed.subscribe(() => disposedEvents++);

  store.setFetching(address, 'request', [field('name')]);
  assert.equal(reentered, true);
  assert.ok(observations.length > 0);
  assert.equal(row(second).data.label, 'B');
  assert.equal(second.getSnapshot().fetching, false);
  assert.equal(captured.records[0].data.label, 'A');
  assert.equal(captured.fetching, true);
  assert.equal(original.records[0].data.label, 'A');
  assert.equal(original.fetching, false);
  assert.equal(disposedEvents, 0);
  const finalDisposed = disposed.getSnapshot();
  assert.equal(finalDisposed.fetching, true);
  assert.equal(finalDisposed.records[0].data.name, 'A');
  store.commit(address, [write(path('name'), 'C')]);
  assert.strictEqual(disposed.getSnapshot(), finalDisposed);
  assert.equal(row(second).data.label, 'C');
});

test('captured nested selections keep their arguments and response paths after caller mutation', (t) => {
  const store = setup(t);
  const args = { locale: 'en', filter: { enabled: true } };
  const children = [field('name', [], 'label')];
  const selection = [field('profile', children, 'card', args)];
  const view = store.watch(address, selection);
  args.locale = 'fr';
  args.filter.enabled = false;
  children[0].responseName = 'changed';
  children.push(field('unselected'));
  selection[0].name = 'different';
  const captured = [
    field('profile', [field('name')], 'transport', {
      filter: { enabled: true },
      locale: 'en',
    }),
  ];
  store.commit(address, [
    member,
    write(
      [
        segment('profile', { filter: { enabled: true }, locale: 'en' }),
        segment('name'),
      ],
      'captured',
    ),
  ]);
  store.setFetching(address, 'captured', captured);
  assert.equal(view.getSnapshot().fetching, true);
  assert.equal(row(view).data.card.label, 'captured');
  assert.deepEqual(row(view).fields[0].path, ['card', 'label']);
  assert.equal(view.getSnapshot().complete, true);
  const before = view.getSnapshot();
  store.setFetching(address, 'changed', selection);
  assert.strictEqual(view.getSnapshot(), before);
  store.setFetching(address, 'captured');
  assert.equal(view.getSnapshot().fetching, false);
});
