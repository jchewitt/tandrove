import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AcquisitionClient, canonicalInput } from '../dist/index.js';

const field = (name) => ({
  name,
  responseName: name,
  arguments: {},
  children: [],
});
const path = (name) => [{ name, arguments: {} }];
const rows = (values) => [
  {
    identity: { id: 'one' },
    fields: Object.entries(values).map(([name, value]) => ({
      kind: 'write',
      path: path(name),
      value,
    })),
  },
];
async function setup(t, values = { name: 'A' }) {
  const listenerErrors = [];
  const client = new AcquisitionClient({
    onListenerError: (error) => listenerErrors.push(error),
  });
  t.after(() => client.dispose());
  const source = {
    authority: {},
    stateAddress: 'view-equality',
    selection: Object.keys(values).map((name) => field(name)),
    read: async () => rows(values),
  };
  const first = client.watch(source);
  await first.ready;
  const second = client.watch(source);
  const third = client.watch(source);
  await Promise.all([second.ready, third.ready]);
  return {
    client,
    source,
    first,
    second,
    third,
    listenerErrors,
    patch(next) {
      client.ingest(source, {
        selection: Object.keys(next).map((name) => field(name)),
        records: rows(next),
      });
    },
  };
}

test('reentrant freshness changes preserve early reads and suppress an unseen stale-to-fresh cycle', async (t) => {
  const f = await setup(t);
  const initial = f.third.getSnapshot();
  let staleRead;
  const firstEvents = [];
  const secondEvents = [];
  const thirdEvents = [];
  f.first.subscribe(() => {
    const snapshot = f.first.getSnapshot();
    firstEvents.push(snapshot.stale);
    if (snapshot.stale) {
      staleRead = f.second.getSnapshot();
      f.patch({ name: 'A' });
    }
  });
  f.second.subscribe(() => secondEvents.push(f.second.getSnapshot()));
  f.third.subscribe(() => thirdEvents.push(f.third.getSnapshot()));

  await f.first.invalidate('name', { refetch: 'none' });

  assert.deepEqual(firstEvents, [true, false]);
  assert.equal(staleRead.stale, true);
  assert.equal(staleRead.records[0].data.name, 'A');
  assert.equal(f.second.getSnapshot().stale, false);
  assert.notStrictEqual(f.second.getSnapshot(), staleRead);
  assert.strictEqual(f.third.getSnapshot(), initial);
  assert.deepEqual(secondEvents, []);
  assert.deepEqual(thirdEvents, []);
  f.patch({ name: 'B' });
  assert.deepEqual(
    secondEvents.map((s) => s.records[0].data.name),
    ['B'],
  );
  assert.deepEqual(
    thirdEvents.map((s) => s.records[0].data.name),
    ['B'],
  );
  assert.deepEqual(f.listenerErrors, []);
});

test('projection values named like snapshot metadata remain independent of handle status', async (t) => {
  const f = await setup(t, {
    error: 'A',
    fetching: false,
    records: { second: [2, 3], first: 1 },
  });
  const initial = f.first.getSnapshot();
  const events = [];
  f.first.subscribe(() => events.push(f.first.getSnapshot()));
  f.patch({ records: { first: 1, second: [2, 3] } });
  assert.strictEqual(f.first.getSnapshot(), initial);
  assert.deepEqual(events, []);
  f.patch({ error: 'B', fetching: true });
  const current = f.first.getSnapshot();
  assert.equal(current.error, undefined);
  assert.equal(current.fetching, false);
  assert.equal(current.records[0].data.error, 'B');
  assert.equal(current.records[0].data.fetching, true);
  assert.equal(events.length, 1);
  assert.equal(initial.records[0].data.error, 'A');
  assert.deepEqual(f.listenerErrors, []);
});

test('untyped JSON Error.message values keep canonical validation and owner isolation', async (t) => {
  const f = await setup(t);
  const peerInitial = f.second.getSnapshot();
  const peerEvents = [];
  const ownerEvents = [];
  f.second.subscribe(() => peerEvents.push(f.second.getSnapshot()));
  f.first.subscribe(() => ownerEvents.push(f.first.getSnapshot()));
  for (const message of [null, { second: 2, first: [1] }, ['code', null]]) {
    const failure = new Error('placeholder');
    failure.message = message;
    f.source.fingerprint = () => {
      throw failure;
    };
    // watch captures methods, so use an equivalent bound source for this owner.
    const owner = f.client.watch(f.source);
    await owner.ready;
    const before = owner.getSnapshot();
    await assert.rejects(owner.refresh(), (error) => error === failure);
    const failed = owner.getSnapshot();
    assert.strictEqual(failed.error, message);
    assert.equal(canonicalInput(failed.error), canonicalInput(message));
    assert.strictEqual(failed.records, before.records);
    await owner.ensure();
    assert.equal(owner.getSnapshot().error, undefined);
    assert.strictEqual(owner.getSnapshot().records, before.records);
    owner.dispose();
  }
  assert.strictEqual(f.second.getSnapshot(), peerInitial);
  assert.deepEqual(peerEvents, []);
  assert.deepEqual(ownerEvents, []);
  assert.deepEqual(f.listenerErrors, []);
});

test('invalid untyped Error.message values still reject without replacing the last valid snapshot', async (t) => {
  const f = await setup(t);
  const cyclic = {};
  cyclic.self = cyclic;
  for (const message of [NaN, [undefined], cyclic, () => 'bad']) {
    const failure = new Error('placeholder');
    failure.message = message;
    const source = {
      ...f.source,
      fingerprint() {
        throw failure;
      },
    };
    const owner = f.client.watch(source);
    await owner.ready;
    const before = owner.getSnapshot();
    let notifications = 0;
    owner.subscribe(() => notifications++);
    await assert.rejects(owner.refresh(), /finite JSON|Cyclic input/);
    assert.throws(() => owner.getSnapshot(), /finite JSON|Cyclic input/);
    await owner.ensure();
    assert.strictEqual(owner.getSnapshot(), before);
    assert.equal(notifications, 0);
    owner.dispose();
  }
  assert.deepEqual(f.listenerErrors, []);
});

test('listener failure and unsubscription do not consume a reentrant peer notification', async (t) => {
  const f = await setup(t);
  const failure = new Error('listener failure');
  const events = [];
  let read;
  let unsubscribe;
  f.first.subscribe(() => {
    if (f.first.getSnapshot().records[0].data.name !== 'B') return;
    read = f.second.getSnapshot();
    unsubscribe();
    f.patch({ name: 'C' });
    throw failure;
  });
  unsubscribe = f.second.subscribe(() => assert.fail('removed listener ran'));
  f.second.subscribe(() => events.push(f.second.getSnapshot()));
  f.patch({ name: 'B' });
  assert.equal(read.records[0].data.name, 'B');
  assert.deepEqual(
    events.map((s) => s.records[0].data.name),
    ['C'],
  );
  assert.strictEqual(f.second.getSnapshot(), events[0]);
  assert.deepEqual(f.listenerErrors, [failure]);
});
