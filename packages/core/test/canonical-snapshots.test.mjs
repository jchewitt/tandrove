import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalInput,
  fieldAddress,
  resourceAddress,
  snapshotInput,
} from '../dist/index.js';

test('canonical snapshots retain normalized nested values and address equality', () => {
  const first = {
    z: [{ second: 2, first: -0 }],
    omitted: undefined,
    a: Object.assign(Object.create(null), { z: null, a: true }),
    10: 'ten',
    2: 'two',
  };
  const equivalent = {
    2: 'two',
    10: 'ten',
    a: { a: true, z: null },
    z: [{ first: 0, second: 2 }],
  };
  const expected =
    '{"2":"two","10":"ten","a":{"a":true,"z":null},"z":[{"first":0,"second":2}]}';
  const snapshot = snapshotInput(first);
  assert.equal(canonicalInput(first), expected);
  assert.equal(canonicalInput(snapshot), expected);
  assert.equal(canonicalInput(equivalent), expected);
  assert.equal(Object.is(snapshot.z[0].first, -0), false);
  assert.equal(Object.hasOwn(snapshot, 'omitted'), false);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.a));
  assert.ok(Object.isFrozen(snapshot.z));
  assert.ok(Object.isFrozen(snapshot.z[0]));

  const scope = { source: 'canonical-tests', scope: 'tenant-A' };
  const path = (args) => [{ name: 'invoices', arguments: args }];
  const address = resourceAddress(scope, path(first));
  assert.equal(resourceAddress(scope, path(equivalent)), address);
  assert.equal(
    fieldAddress(address, path(snapshot), { tenant: 'A', id: '1' }),
    fieldAddress(address, path(equivalent), { id: '1', tenant: 'A' }),
  );
  const protoKey = JSON.parse('{"__proto__":{"safe":true},"constructor":1}');
  assert.equal(
    canonicalInput(snapshotInput(protoKey)),
    canonicalInput(protoKey),
  );
  assert.equal(Object.getPrototypeOf(snapshotInput(protoKey)), null);
});

test('finite JSON validation still rejects invalid roots, nested values and array holes', () => {
  const invalid = [
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol('value'),
    () => 1,
    { nested: { value: NaN } },
    [undefined],
    new Array(1),
    { nested: [1, undefined] },
    new Date(0),
    new (class Value {})(),
    Object.create({ inherited: true }),
    { [Symbol('key')]: undefined },
  ];
  for (const input of invalid) {
    assert.throws(() => snapshotInput(input));
    assert.throws(() => canonicalInput(input));
  }
  assert.equal(
    canonicalInput({ omitted: undefined, empty: [] }),
    '{"empty":[]}',
  );
});

test('raw and externally frozen containers are captured again without trusting mutable descendants', () => {
  const child = { value: 1 };
  const input = { child };
  const frozen = Object.freeze({ child });
  const first = snapshotInput(input);
  const frozenFirst = snapshotInput(frozen);
  assert.equal(canonicalInput(input), '{"child":{"value":1}}');
  assert.equal(canonicalInput(frozen), '{"child":{"value":1}}');

  child.value = 2;
  input.extra = true;
  assert.equal(canonicalInput(input), '{"child":{"value":2},"extra":true}');
  assert.equal(canonicalInput(frozen), '{"child":{"value":2}}');
  assert.equal(canonicalInput(first), '{"child":{"value":1}}');
  assert.equal(canonicalInput(frozenFirst), '{"child":{"value":1}}');
  assert.throws(() => (first.child.value = 3), TypeError);

  child.value = Infinity;
  assert.throws(() => snapshotInput(input), /finite JSON/);
  assert.throws(() => canonicalInput(frozen), /finite JSON/);
  assert.equal(canonicalInput(frozenFirst), '{"child":{"value":1}}');
});

test('untrusted descriptors and proxies remain validated after earlier successful calls', () => {
  let getterCalls = 0;
  const input = { value: 1 };
  assert.equal(canonicalInput(input), '{"value":1}');
  Object.defineProperty(input, 'value', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls++;
      return 2;
    },
  });
  Object.freeze(input);
  assert.throws(() => snapshotInput(input), /accessors/);
  assert.throws(() => canonicalInput(input), /accessors/);
  assert.equal(getterCalls, 0);

  const target = { value: 1 };
  const proxy = new Proxy(target, {});
  const captured = snapshotInput(proxy);
  target.value = 2;
  assert.equal(canonicalInput(proxy), '{"value":2}');
  assert.equal(canonicalInput(captured), '{"value":1}');
  target.value = undefined;
  assert.equal(canonicalInput(proxy), '{}');
  target[Symbol('invalid')] = true;
  assert.throws(() => canonicalInput(proxy), /Symbol input keys/);

  const sentinel = new Error('proxy validation must be observed');
  const wrappedSnapshot = new Proxy(captured, {
    ownKeys() {
      throw sentinel;
    },
  });
  assert.throws(
    () => snapshotInput(wrappedSnapshot),
    (error) => error === sentinel,
  );
  assert.throws(
    () => canonicalInput(wrappedSnapshot),
    (error) => error === sentinel,
  );
});

test('cycles remain invalid while shared descendants and failed copies remain safe', () => {
  const shared = { value: 1 };
  const graph = { left: shared, right: shared };
  const captured = snapshotInput(graph);
  assert.equal(
    canonicalInput(graph),
    '{"left":{"value":1},"right":{"value":1}}',
  );
  shared.value = 2;
  assert.equal(
    canonicalInput(captured),
    '{"left":{"value":1},"right":{"value":1}}',
  );
  assert.equal(
    canonicalInput(graph),
    '{"left":{"value":2},"right":{"value":2}}',
  );

  const cycle = { shared };
  cycle.self = cycle;
  const arrayCycle = [];
  arrayCycle.push(arrayCycle);
  for (const input of [cycle, arrayCycle, Object.freeze(cycle)]) {
    assert.throws(() => snapshotInput(input), /Cyclic input/);
    assert.throws(() => canonicalInput(input), /Cyclic input/);
  }

  const descendant = { value: 1 };
  const failed = { a: descendant, z: Infinity };
  assert.throws(() => snapshotInput(failed), /finite JSON/);
  descendant.value = NaN;
  failed.z = 2;
  assert.throws(() => canonicalInput(failed), /finite JSON/);
  descendant.value = 3;
  assert.equal(canonicalInput(failed), '{"a":{"value":3},"z":2}');
});

test('previous snapshots do not make neighboring untrusted inputs immutable or valid', () => {
  const source = { profile: { name: 'first' } };
  const held = snapshotInput(source);
  const pending = { value: 1 };
  const mixed = Object.freeze({ held, pending });
  const first = snapshotInput(mixed);
  assert.equal(
    canonicalInput(mixed),
    '{"held":{"profile":{"name":"first"}},"pending":{"value":1}}',
  );

  source.profile.name = 'changed';
  pending.value = 2;
  assert.equal(
    canonicalInput(mixed),
    '{"held":{"profile":{"name":"first"}},"pending":{"value":2}}',
  );
  assert.equal(
    canonicalInput(first),
    '{"held":{"profile":{"name":"first"}},"pending":{"value":1}}',
  );
  pending.self = pending;
  assert.throws(() => snapshotInput(mixed), /Cyclic input/);
  delete pending.self;
  pending.value = undefined;
  assert.equal(
    canonicalInput(mixed),
    '{"held":{"profile":{"name":"first"}},"pending":{}}',
  );
});

test('externally frozen arrays retain iterator-based capture and validation', () => {
  let current = 1;
  const array = [99];
  Object.defineProperty(array, Symbol.iterator, {
    value: function* () {
      yield { current };
      yield -0;
    },
  });
  Object.freeze(array);
  const first = snapshotInput(array);
  assert.equal(canonicalInput(first), '[{"current":1},0]');
  current = 2;
  assert.equal(canonicalInput(array), '[{"current":2},0]');
  assert.equal(canonicalInput(first), '[{"current":1},0]');
  current = NaN;
  assert.throws(() => snapshotInput(array), /finite JSON/);
  assert.throws(() => canonicalInput(array), /finite JSON/);
});

test('held array snapshots retain later prototype iterator and serialization semantics', () => {
  const held = snapshotInput({ items: ['held'] });
  const expected = '{"items":["held"]}';
  assert.equal(canonicalInput(held), expected);
  assert.equal(canonicalInput(snapshotInput(held)), expected);
  const iterator = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator,
  );
  let iteratedSnapshot;
  let iteratedCanonical;
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      ...iterator,
      value: function* () {
        if (this === held.items) yield 'changed';
        else yield* iterator.value.call(this);
      },
    });
    iteratedSnapshot = snapshotInput(held);
    iteratedCanonical = canonicalInput(held);
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, iterator);
  }
  assert.equal(canonicalInput(iteratedSnapshot), '{"items":["changed"]}');
  assert.equal(iteratedCanonical, '{"items":["changed"]}');
  assert.equal(canonicalInput(held), expected);

  const toJSON = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let serialized;
  try {
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value() {
        return this.length === 1 && this[0] === 'held'
          ? { encoded: 'held' }
          : this;
      },
    });
    serialized = canonicalInput(held);
  } finally {
    if (toJSON) Object.defineProperty(Array.prototype, 'toJSON', toJSON);
    else delete Array.prototype.toJSON;
  }
  assert.equal(serialized, '{"items":{"encoded":"held"}}');
  assert.equal(canonicalInput(held), expected);
});
