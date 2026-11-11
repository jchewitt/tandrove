import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StateStore, canonicalInput } from '../dist/index.js';
import * as publicApi from '../dist/index.js';
import { readViewProjectionSignature } from '../dist/state-store.js';

const field = (name, responseName = name) => ({
  name,
  responseName,
  arguments: {},
  children: [],
});
const write = (name, value) => ({
  kind: 'write',
  record: { id: 1 },
  path: [{ name, arguments: {} }],
  value,
});
function fixture(t) {
  const store = new StateStore();
  t.after(() => store.dispose());
  const view = store.watch('metadata', [field('a', 'z'), field('b', 'a')]);
  store.commit('metadata', [
    { kind: 'membership', records: [{ id: 1 }] },
    write('a', 1),
    write('b', [2]),
  ]);
  return { store, view };
}
const projection = (view) => {
  const { fetching, ...value } = view.getSnapshot();
  return value;
};
function iteratorHook(run, hook) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator,
  );
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      ...descriptor,
      value: function* () {
        yield* hook.call(this, descriptor.value);
      },
    });
    run();
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, descriptor);
  }
}

test('fixed metadata comparison retains canonical values, optional states and aliases', (t) => {
  assert.equal('copyCanonicalInput' in publicApi, false);
  const { store, view } = fixture(t);
  const check = () =>
    assert.equal(
      readViewProjectionSignature(view),
      canonicalInput(projection(view)),
    );
  check();
  const before = view.getSnapshot();
  store.commit('metadata', [write('a', 1)]);
  assert.equal(view.getSnapshot(), before);
  for (const changes of [
    [
      {
        kind: 'error',
        record: { id: 1 },
        path: [{ name: 'a', arguments: {} }],
        message: 'failed',
      },
    ],
    [write('a', null)],
    [{ kind: 'resource-null', error: 'unavailable' }],
    [{ kind: 'membership', records: [] }],
    [{ kind: 'membership', records: [{ id: 1 }] }],
  ]) {
    store.commit('metadata', changes);
    check();
  }
});

test('metadata arrays retain iterator reordering and validate injected values', (t) => {
  const { store, view } = fixture(t);
  iteratorHook(
    () => {
      store.commit('metadata', [write('a', 3)]);
      assert.equal(
        readViewProjectionSignature(view),
        canonicalInput(projection(view)),
      );
    },
    function* (original) {
      if (this[0]?.path && typeof this[0].present === 'boolean') {
        for (let i = this.length - 1; i >= 0; i--) yield this[i];
      } else yield* original.call(this);
    },
  );
  iteratorHook(
    () => assert.throws(() => store.commit('metadata', []), /finite JSON/),
    function* (original) {
      if (this[0]?.path && typeof this[0].present === 'boolean')
        yield undefined;
      else yield* original.call(this);
    },
  );
  store.commit('metadata', []);
  assert.equal(view.getSnapshot().records[0].data.z, 3);
});

test('generic fallback shares ancestor detection with specialized metadata', (t) => {
  const { store, view } = fixture(t);
  let parent;
  let injected = false;
  iteratorHook(
    () => assert.throws(() => store.commit('metadata', []), /Cyclic input/),
    function* (original) {
      if (this[0]?.data && this[0]?.fields) parent = this[0];
      if (!injected && parent && this === parent.fields) {
        injected = true;
        yield parent;
      } else yield* original.call(this);
    },
  );
  store.commit('metadata', []);
  assert.equal(view.getSnapshot().records[0].data.z, 1);
});

test('native serialization retains frozen array receivers and metadata property keys', (t) => {
  const { store, view } = fixture(t);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let calls = [];
  try {
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value(key) {
        calls.push([key, Object.isFrozen(this), this.length]);
        return this;
      },
    });
    store.commit('metadata', []);
    const actual = calls;
    calls = [];
    const expected = canonicalInput(projection(view));
    assert.equal(readViewProjectionSignature(view), expected);
    assert.deepEqual(actual, calls);
    assert.ok(calls.some(([key]) => key === 'records'));
    assert.ok(calls.some(([key]) => key === 'fields'));
    assert.ok(calls.some(([key]) => key === 'path'));
    assert.ok(calls.every(([, frozen]) => frozen));
  } finally {
    if (descriptor)
      Object.defineProperty(Array.prototype, 'toJSON', descriptor);
    else delete Array.prototype.toJSON;
  }
});

test('untyped changing error getters retain canonical validation', (t) => {
  for (const resource of [false, true]) {
    const { store, view } = fixture(t);
    const before = view.getSnapshot();
    let reads = 0;
    const change = resource
      ? {
          kind: 'resource-null',
          get error() {
            return ++reads <= 3 ? 'valid' : Infinity;
          },
        }
      : {
          kind: 'error',
          record: { id: 1 },
          path: [{ name: 'a', arguments: {} }],
          get message() {
            return ++reads <= 2 ? 'valid' : Infinity;
          },
        };
    assert.throws(() => store.commit('metadata', [change]), /finite JSON/);
    assert.equal(view.getSnapshot(), before);
  }
});
