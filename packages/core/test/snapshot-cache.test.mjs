import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AcquisitionClient } from '../dist/index.js';

const field = (name) => ({
  name,
  responseName: name,
  arguments: {},
  children: [],
});
const rows = (values) => [
  {
    identity: { id: '1' },
    fields: Object.entries(values).map(([name, value]) => ({
      kind: 'write',
      path: [{ name, arguments: {} }],
      value,
    })),
  },
];
const nameOf = (snapshot) => snapshot.records[0].data.name;
async function until(predicate) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('Expected asynchronous progress.');
}
function setup(t, names = ['name']) {
  const errors = [];
  const client = new AcquisitionClient({
    onListenerError: (error) => errors.push(error),
  });
  t.after(() => {
    client.dispose();
    assert.deepEqual(errors, []);
  });
  const reads = [];
  const source = {
    authority: {},
    stateAddress: 'snapshot-cache',
    selection: names.map(field),
    read: (selection, { signal }) =>
      new Promise((resolve, reject) =>
        reads.push({ selection, signal, resolve, reject }),
      ),
  };
  return {
    client,
    source,
    reads,
    patch(values) {
      client.ingest(source, {
        selection: Object.keys(values).map(field),
        records: rows(values),
      });
    },
  };
}
async function seed(f, values = { name: 'A' }) {
  const handle = f.client.watch(f.source);
  await until(() => f.reads.length === 1);
  f.reads[0].resolve(rows(values));
  await handle.ready;
  return handle;
}

test('handle snapshots stay identical across repeated reads, equivalent payloads and unrelated writes', async (t) => {
  const f = setup(t, ['name', 'amount', 'details']);
  const wide = await seed(f, {
    name: 'A',
    amount: 10,
    details: { first: 1, second: [2, 3] },
  });
  const narrow = f.client.watch({ ...f.source, selection: [field('name')] });
  await narrow.ready;
  const initialWide = wide.getSnapshot();
  const initialNarrow = narrow.getSnapshot();
  const wideEvents = [];
  const narrowEvents = [];
  wide.subscribe(() => wideEvents.push(wide.getSnapshot()));
  narrow.subscribe(() => narrowEvents.push(narrow.getSnapshot()));

  f.patch({ details: { second: [2, 3], first: 1 }, name: 'A' });
  for (let index = 0; index < 3; index++) {
    assert.strictEqual(wide.getSnapshot(), initialWide);
    assert.strictEqual(narrow.getSnapshot(), initialNarrow);
  }
  assert.deepEqual(wideEvents, []);
  assert.deepEqual(narrowEvents, []);

  f.patch({ amount: 20 });
  assert.equal(wideEvents.length, 1);
  assert.strictEqual(wide.getSnapshot(), wideEvents[0]);
  assert.notStrictEqual(wide.getSnapshot(), initialWide);
  assert.strictEqual(narrow.getSnapshot(), initialNarrow);
  assert.deepEqual(narrowEvents, []);
  assert.equal(initialWide.records[0].data.amount, 10);
  assert.ok(Object.isFrozen(wide.getSnapshot()));
  assert.ok(Object.isFrozen(wide.getSnapshot().records[0].data.details.second));
});

test('reading a peer before its pending callback updates its snapshot without consuming its notification', async (t) => {
  const f = setup(t);
  const first = await seed(f);
  const second = f.client.watch(f.source);
  await second.ready;
  const observedEarly = [];
  const notified = [];
  first.subscribe(() => {
    const snapshot = second.getSnapshot();
    observedEarly.push(snapshot);
    assert.strictEqual(second.getSnapshot(), snapshot);
  });
  second.subscribe(() => notified.push(second.getSnapshot()));

  f.patch({ name: 'B' });
  f.patch({ name: 'B' });
  f.patch({ name: 'C' });

  assert.deepEqual(notified.map(nameOf), ['B', 'C']);
  assert.equal(observedEarly.length, 2);
  assert.strictEqual(notified[0], observedEarly[0]);
  assert.strictEqual(notified[1], observedEarly[1]);
  assert.strictEqual(second.getSnapshot(), notified[1]);
});

test('a reentrant A to B to A update suppresses unseen transitions but preserves intermediate reads', async (t) => {
  const f = setup(t);
  const first = await seed(f);
  const readEarly = f.client.watch(f.source);
  const unread = f.client.watch(f.source);
  await Promise.all([readEarly.ready, unread.ready]);
  const unreadInitial = unread.getSnapshot();
  const firstEvents = [];
  const earlyEvents = [];
  const unreadEvents = [];
  let intermediate;
  first.subscribe(() => {
    const name = nameOf(first.getSnapshot());
    firstEvents.push(name);
    if (name === 'B') {
      intermediate = readEarly.getSnapshot();
      f.patch({ name: 'A' });
    }
  });
  readEarly.subscribe(() => earlyEvents.push(readEarly.getSnapshot()));
  unread.subscribe(() => unreadEvents.push(unread.getSnapshot()));

  f.patch({ name: 'B' });

  assert.deepEqual(firstEvents, ['B', 'A']);
  assert.equal(nameOf(intermediate), 'B');
  assert.equal(nameOf(readEarly.getSnapshot()), 'A');
  assert.notStrictEqual(readEarly.getSnapshot(), intermediate);
  assert.strictEqual(readEarly.getSnapshot(), readEarly.getSnapshot());
  assert.strictEqual(unread.getSnapshot(), unreadInitial);
  assert.deepEqual(earlyEvents, []);
  assert.deepEqual(unreadEvents, []);

  f.patch({ name: 'C' });
  assert.deepEqual(earlyEvents.map(nameOf), ['C']);
  assert.deepEqual(unreadEvents.map(nameOf), ['C']);
});

test('attempt errors and clearing them replace only the owner snapshot when cached data is unchanged', async (t) => {
  const f = setup(t);
  let failPlanning = false;
  f.source.fingerprint = () => {
    if (failPlanning) throw new Error('Cannot prepare request');
    return 'one';
  };
  const owner = await seed(f);
  const peer = f.client.watch(f.source);
  await peer.ready;
  const initial = owner.getSnapshot();
  const peerInitial = peer.getSnapshot();
  const ownerEvents = [];
  const peerEvents = [];
  owner.subscribe(() => ownerEvents.push(owner.getSnapshot()));
  peer.subscribe(() => peerEvents.push(peer.getSnapshot()));

  failPlanning = true;
  await assert.rejects(owner.refresh(), /Cannot prepare request/);
  const failed = owner.getSnapshot();
  assert.equal(failed.error, 'Cannot prepare request');
  assert.equal(failed.fetching, false);
  assert.notStrictEqual(failed, initial);
  assert.strictEqual(failed.records, initial.records);
  assert.strictEqual(owner.getSnapshot(), failed);
  assert.strictEqual(ownerEvents[0], failed);
  assert.strictEqual(peer.getSnapshot(), peerInitial);

  await owner.ensure(); // Fresh data needs no source call, but clears attempt error.
  const cleared = owner.getSnapshot();
  assert.equal(cleared.error, undefined);
  assert.strictEqual(cleared.records, initial.records);
  assert.deepEqual(
    ownerEvents.map((snapshot) => snapshot.error),
    ['Cannot prepare request', undefined],
  );
  await owner.ensure();
  assert.strictEqual(owner.getSnapshot(), cleared);
  assert.equal(ownerEvents.length, 2);
  assert.deepEqual(peerEvents, []);
  assert.equal(f.reads.length, 1);
});

test('fetching transitions notify selected handles even when the response repeats cached data', async (t) => {
  const f = setup(t, ['name', 'amount']);
  const wide = await seed(f, { name: 'A', amount: 10 });
  const narrow = f.client.watch({ ...f.source, selection: [field('name')] });
  const sibling = f.client.watch({ ...f.source, selection: [field('amount')] });
  await Promise.all([narrow.ready, sibling.ready]);
  const siblingInitial = sibling.getSnapshot();
  const events = [];
  const siblingEvents = [];
  narrow.subscribe(() => events.push(narrow.getSnapshot()));
  sibling.subscribe(() => siblingEvents.push(sibling.getSnapshot()));
  const pending = wide.refresh('name');
  await until(() => f.reads.length === 2);
  const fetching = narrow.getSnapshot();
  assert.equal(fetching.fetching, true);
  assert.strictEqual(narrow.getSnapshot(), fetching);
  assert.strictEqual(events[0], fetching);
  assert.strictEqual(sibling.getSnapshot(), siblingInitial);

  f.reads[1].resolve(rows({ name: 'A' }));
  await pending;
  assert.deepEqual(
    events.map((snapshot) => snapshot.fetching),
    [true, false],
  );
  assert.strictEqual(narrow.getSnapshot(), events[1]);
  assert.equal(nameOf(fetching), 'A');
  assert.deepEqual(siblingEvents, []);
  assert.strictEqual(sibling.getSnapshot(), siblingInitial);
});

test('disposing a peer before its callback captures the current state and keeps the final snapshot frozen', async (t) => {
  const f = setup(t);
  const first = await seed(f);
  const second = f.client.watch(f.source);
  await second.ready;
  const initial = second.getSnapshot();
  const events = [];
  first.subscribe(() => second.dispose());
  second.subscribe(() => events.push(second.getSnapshot()));

  f.patch({ name: 'B' });
  const disposed = second.getSnapshot();
  assert.equal(nameOf(disposed), 'B');
  assert.notStrictEqual(disposed, initial);
  assert.deepEqual(events, []);
  f.patch({ name: 'C' });
  second.dispose();
  assert.strictEqual(second.getSnapshot(), disposed);
  assert.equal(nameOf(first.getSnapshot()), 'C');
  assert.throws(() => second.subscribe(() => {}), /disposed/);
});

test('client cleanup preserves final snapshots and suppresses late request and observer updates', async (t) => {
  const f = setup(t);
  const handle = await seed(f);
  const events = [];
  handle.subscribe(() => events.push(handle.getSnapshot()));
  const pending = handle.refresh();
  void pending.catch(() => {});
  await until(() => f.reads.length === 2);
  const final = handle.getSnapshot();
  assert.equal(final.fetching, true);
  f.client.dispose();
  await assert.rejects(pending, /disposed/);
  const count = events.length;
  assert.equal(f.reads[1].signal.aborted, true);
  f.reads[1].resolve(rows({ name: 'late' }));
  await new Promise(setImmediate);
  assert.strictEqual(handle.getSnapshot(), final);
  assert.equal(nameOf(handle.getSnapshot()), 'A');
  assert.equal(events.length, count);
  assert.throws(() => handle.subscribe(() => {}), /disposed/);
});
