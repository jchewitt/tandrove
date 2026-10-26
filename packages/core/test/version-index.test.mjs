import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AcquisitionCancelledError,
  AcquisitionClient,
  AcquisitionSupersededError,
} from '../dist/index.js';

const field = (name, children = [], options = {}) => ({
  name,
  responseName: name,
  arguments: {},
  children,
  ...options,
});
const path = (...names) => names.map((name) => ({ name, arguments: {} }));
const write = (name, value) => ({ kind: 'write', path: path(name), value });
const record = (identity, fields) => ({ identity, fields });
const identities = [
  { tenant: 'A', id: '1' },
  { tenant: 'B', id: '1' },
  { tenant: 'A', id: 1 },
];
const rows = (name = 'seed', amount = 10) =>
  identities.map((identity, index) =>
    record(identity, [
      write('name', `${name} ${index}`),
      write('amount', amount),
    ]),
  );
const data = (handle) =>
  handle.getSnapshot().records.map((entry) => ({ ...entry.data }));
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('Expected asynchronous progress.');
}
function setup(t, selection = [field('name'), field('amount')]) {
  const client = new AcquisitionClient();
  t.after(() => client.dispose());
  const reads = [];
  const source = {
    authority: {},
    stateAddress: 'version-index',
    collection: true,
    selection,
    read: (fields, { signal }) =>
      new Promise((resolve, reject) => {
        reads.push({ fields, signal, resolve, reject });
      }),
  };
  return { client, source, reads };
}
async function seed(f, response = rows()) {
  const handle = f.client.watch(f.source);
  await until(() => f.reads.length === 1);
  f.reads[0].resolve(response);
  await handle.ready;
  return handle;
}

test('an older disjoint commit cannot erase a newer barrier for a canonical composite record', async (t) => {
  const f = setup(t);
  const handle = await seed(f);
  const amount = handle.refresh('amount');
  await until(() => f.reads.length === 2);
  const name = assert.rejects(
    handle.refresh('name'),
    AcquisitionSupersededError,
  );
  await until(() => f.reads.length === 3);
  // Property order is irrelevant, but both the tenant and scalar ID type matter.
  f.client.ingest(f.source, {
    selection: [field('name')],
    records: [record({ id: '1', tenant: 'A' }, [write('name', 'event')])],
  });
  f.reads[1].resolve(
    identities.map((identity) => record(identity, [write('amount', 20)])),
  );
  await amount;
  f.reads[2].resolve(
    identities.map((identity, index) =>
      record(identity, [write('name', `read ${index}`)]),
    ),
  );
  await name;
  assert.deepEqual(data(handle), [
    { name: 'event', amount: 20 },
    { name: 'read 1', amount: 20 },
    { name: 'read 2', amount: 20 },
  ]);
  assert.equal(handle.getSnapshot().stale, false);
});

test('record barriers distinguish field arguments while canonicalizing argument property order', async (t) => {
  const english = field('label', [], {
    responseName: 'english',
    arguments: { format: { locale: 'en', style: 'short' } },
  });
  const french = field('label', [], {
    responseName: 'french',
    arguments: { format: { locale: 'fr', style: 'short' } },
  });
  const label = (definition, value) => ({
    kind: 'write',
    path: [{ name: definition.name, arguments: definition.arguments }],
    value,
  });
  const f = setup(t, [english]);
  const handle = await seed(
    f,
    identities.map((identity) =>
      record(identity, [label(english, 'old English')]),
    ),
  );
  const other = f.client.watch({ ...f.source, selection: [french] });
  await until(() => f.reads.length === 2);
  f.reads[1].resolve(
    identities.map((identity) =>
      record(identity, [label(french, 'old French')]),
    ),
  );
  await other.ready;
  const pending = assert.rejects(handle.refresh(), AcquisitionSupersededError);
  await until(() => f.reads.length === 3);
  const disjoint = other.refresh();
  await until(() => f.reads.length === 4);
  const reordered = {
    ...english,
    arguments: { format: { style: 'short', locale: 'en' } },
  };
  f.client.ingest(f.source, {
    selection: [reordered],
    records: [record(identities[1], [label(reordered, 'event English')])],
  });
  f.reads[3].resolve(
    identities.map((identity) =>
      record(identity, [label(french, 'read French')]),
    ),
  );
  await disjoint;
  f.reads[2].resolve(
    identities.map((identity) =>
      record(identity, [label(english, 'read English')]),
    ),
  );
  await pending;
  assert.deepEqual(data(handle), [
    { english: 'read English' },
    { english: 'event English' },
    { english: 'read English' },
  ]);
  assert.deepEqual(
    data(other),
    identities.map(() => ({ french: 'read French' })),
  );
});

test('a later-record event invalidates overlapping deduplication while disjoint work remains shareable', async (t) => {
  const f = setup(t);
  const handle = await seed(f);
  const oldName = assert.rejects(
    handle.refresh('name'),
    AcquisitionSupersededError,
  );
  await until(() => f.reads.length === 2);
  const amount = handle.refresh('amount');
  await until(() => f.reads.length === 3);
  f.client.ingest(f.source, {
    selection: [field('name')],
    records: [record(identities[2], [write('name', 'event')])],
  });
  const freshName = handle.refresh('name');
  const sharedAmount = handle.refresh('amount');
  await until(() => f.reads.length === 4);
  f.reads[3].resolve(
    identities.map((identity) => record(identity, [write('name', 'fresh')])),
  );
  f.reads[2].resolve(
    identities.map((identity) => record(identity, [write('amount', 20)])),
  );
  await Promise.all([freshName, amount, sharedAmount]);
  assert.equal(f.reads.length, 4);
  f.reads[1].resolve(
    identities.map((identity) => record(identity, [write('name', 'obsolete')])),
  );
  await oldName;
  assert.deepEqual(
    data(handle),
    identities.map(() => ({ name: 'fresh', amount: 20 })),
  );
});

test('null, replacement and ancestor-error barriers exclude only their own records', async (t) => {
  const members = [...identities, { tenant: 'C', id: '1' }];
  const user = field('user', [field('name'), field('nickname')]);
  const object = {
    kind: 'object',
    path: path('user'),
    identity: { id: 'old-user' },
  };
  const nested = (name, value) => ({
    kind: 'write',
    path: path('user', name),
    value,
  });
  const f = setup(t, [user]);
  const handle = await seed(
    f,
    members.map((identity) =>
      record(identity, [
        object,
        nested('name', 'old name'),
        nested('nickname', 'old nickname'),
      ]),
    ),
  );
  const pending = assert.rejects(
    handle.refresh('user.nickname'),
    AcquisitionSupersededError,
  );
  await until(() => f.reads.length === 2);
  f.client.ingest(f.source, {
    selection: [field('user', [field('name')])],
    records: [
      record(members[0], [write('user', null)]),
      record(members[1], [
        { ...object, identity: { id: 'new-user' } },
        nested('name', 'new name'),
      ]),
      record(members[2], [
        { kind: 'error', path: path('user'), message: 'new branch error' },
      ]),
    ],
  });
  f.reads[1].resolve(
    members.map((identity) =>
      record(identity, [object, nested('nickname', 'read nickname')]),
    ),
  );
  await pending;
  const result = handle.getSnapshot().records;
  assert.equal(result[0].data.user, null);
  assert.deepEqual({ ...result[1].data.user }, { name: 'new name' });
  assert.equal(result[2].data.user.nickname, 'old nickname');
  assert.equal(
    result[2].fields.find((status) => status.path[1] === 'nickname').error,
    'new branch error',
  );
  assert.deepEqual(
    { ...result[3].data.user },
    { name: 'old name', nickname: 'read nickname' },
  );
});

test('reentrant patches and owner disposal preserve barriers for peers completing an older read', async (t) => {
  const f = setup(t);
  const handle = await seed(f);
  const peer = f.client.watch(f.source);
  await peer.ready;
  const cancelled = assert.rejects(handle.refresh(), AcquisitionCancelledError);
  await until(() => f.reads.length === 2);
  const peerPending = assert.rejects(
    peer.refresh(),
    AcquisitionSupersededError,
  );
  await Promise.resolve();
  assert.equal(f.reads.length, 2);
  let deliveries = 0;
  handle.subscribe(() => {
    if (handle.getSnapshot().records[2].data.name !== 'first event') return;
    if (deliveries++ !== 0) return;
    f.client.ingest(f.source, {
      selection: [field('name')],
      records: [record(identities[0], [write('name', 'reentrant event')])],
    });
    handle.dispose();
  });
  f.client.ingest(f.source, {
    selection: [field('name')],
    records: [record(identities[2], [write('name', 'first event')])],
  });
  await cancelled;
  const frozen = handle.getSnapshot();
  assert.equal(f.reads.length, 2);
  assert.equal(f.reads[1].signal.aborted, false);
  f.reads[1].resolve(rows('read', 20));
  await peerPending;
  assert.deepEqual(data(peer), [
    { name: 'reentrant event', amount: 20 },
    { name: 'read 1', amount: 20 },
    { name: 'first event', amount: 20 },
  ]);
  assert.equal(handle.getSnapshot(), frozen);
  assert.equal(frozen.records[0].data.name, 'reentrant event');
  assert.equal(frozen.records[0].data.amount, 10);
});

test('an event on a later record blocks older whole-resource replacements', async (t) => {
  for (const replacement of [[], { kind: 'null' }]) {
    const f = setup(t);
    const handle = await seed(f);
    const pending = assert.rejects(
      handle.refreshList(),
      AcquisitionSupersededError,
    );
    await until(() => f.reads.length === 2);
    f.client.ingest(f.source, {
      selection: [field('name')],
      records: [record(identities[2], [write('name', 'event')])],
    });
    f.reads[1].resolve(replacement);
    await pending;
    assert.deepEqual(data(handle), [
      { name: 'seed 0', amount: 10 },
      { name: 'seed 1', amount: 10 },
      { name: 'event', amount: 10 },
    ]);
    assert.equal(handle.getSnapshot().membershipStale, false);
  }
});

for (const reset of ['empty membership', 'null resource']) {
  test(`${reset} protects reacquired identities from pre-reset reads after record events`, async (t) => {
    const f = setup(t);
    const handle = await seed(f);
    f.client.ingest(f.source, {
      selection: [field('name')],
      records: [record(identities[2], [write('name', 'event')])],
    });
    const obsolete = assert.rejects(
      handle.refresh('amount'),
      AcquisitionSupersededError,
    );
    await until(() => f.reads.length === 2);
    const remove = handle.refreshList();
    await until(() => f.reads.length === 3);
    f.reads[2].resolve(reset === 'empty membership' ? [] : { kind: 'null' });
    await remove;
    const insert = handle.refreshList();
    await until(() => f.reads.length === 4);
    f.reads[3].resolve(rows('reacquired', 30));
    await insert;
    f.reads[1].resolve(
      identities.map((identity) => record(identity, [write('amount', 999)])),
    );
    await obsolete;
    const fresh = handle.refresh('name');
    await until(() => f.reads.length === 5);
    f.reads[4].resolve(
      identities.map((identity) => record(identity, [write('name', 'fresh')])),
    );
    await fresh;
    assert.deepEqual(
      data(handle),
      identities.map(() => ({ name: 'fresh', amount: 30 })),
    );
    assert.equal(handle.getSnapshot().complete, true);
    assert.equal(handle.getSnapshot().stale, false);
  });
}
