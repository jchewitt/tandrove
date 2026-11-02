import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { checkAngularPackage } from './check-angular-package.mjs';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const arguments_ = process.argv.slice(2);
assert.ok(
  arguments_.every((argument) => argument === '--registry'),
  'Only --registry is supported by this consumer check.',
);
const registry = arguments_.includes('--registry');
const version = JSON.parse(
  readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
).version;
const artifacts = join(root, '.artifacts', randomUUID());
mkdirSync(artifacts, { recursive: true });
const manager = process.env.npm_execpath;
assert.ok(manager, 'Run this check using pnpm pack:check.');
const npm = (args, cwd) =>
  execFileSync(process.execPath, [manager, 'exec', 'npm', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

// A removed source must never leave an obsolete file in the shipping payload.
const output = join(root, 'packages/core/dist');
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, '__stale-build-probe.js'),
  'export const obsolete = true;\n',
);
const [packed] = JSON.parse(
  npm(
    ['pack', '--json', '--pack-destination', artifacts],
    join(root, 'packages/core'),
  ),
);
const files = packed.files.map(({ path }) => path);
for (const expected of [
  'dist/index.js',
  'dist/index.d.ts',
  'LICENSE',
  'README.md',
])
  assert.ok(files.includes(expected), `Missing package file: ${expected}`);
assert.ok(
  !files.includes('dist/__stale-build-probe.js'),
  'Build must remove stale outputs.',
);
assert.ok(
  files.every((path) =>
    /^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(path),
  ),
);
assert.equal(
  readFileSync(join(root, 'LICENSE'), 'utf8'),
  readFileSync(join(root, 'packages/core/LICENSE'), 'utf8'),
);

const graphqlOutput = join(root, 'packages/graphql/dist');
mkdirSync(graphqlOutput, { recursive: true });
writeFileSync(
  join(graphqlOutput, '__stale-build-probe.js'),
  'export const obsolete = true;\n',
);
// pnpm resolves workspace dependencies in the packed manifest. Its lifecycle
// banner precedes the final JSON object, even with the silent reporter.
const packOutput = execFileSync(
  process.execPath,
  [manager, 'pack', '--json', '--pack-destination', artifacts],
  {
    cwd: join(root, 'packages/graphql'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
const jsonStart = packOutput.search(/^\{/m);
assert.ok(jsonStart >= 0, 'pnpm pack must return package metadata.');
const graphqlPacked = JSON.parse(packOutput.slice(jsonStart));
const graphqlFiles = graphqlPacked.files.map(({ path }) => path);
for (const expected of [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/codegen.js',
  'dist/codegen.d.ts',
  'LICENSE',
  'README.md',
])
  assert.ok(
    graphqlFiles.includes(expected),
    `Missing GraphQL package file: ${expected}`,
  );
assert.ok(!graphqlFiles.includes('dist/__stale-build-probe.js'));
assert.ok(
  graphqlFiles.every((path) =>
    /^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(path),
  ),
);
assert.equal(
  readFileSync(join(root, 'LICENSE'), 'utf8'),
  readFileSync(join(root, 'packages/graphql/LICENSE'), 'utf8'),
);
assert.equal(dirname(graphqlPacked.filename), artifacts);

// Outside the repository so Node/TypeScript cannot resolve undeclared workspace dependencies.
const tempRoot = realpathSync(tmpdir());
const consumer = realpathSync(
  mkdtempSync(join(tempRoot, 'tandrove-consumer-')),
);
try {
  const relativeConsumer = relative(root, consumer);
  assert.ok(
    relativeConsumer.startsWith('..') || isAbsolute(relativeConsumer),
    'Consumer must be outside the repository.',
  );
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      registry ? '--package-lock' : '--no-package-lock',
      ...(registry ? ['--prefer-online'] : []),
      '--registry=https://registry.npmjs.org/',
      registry ? `@tandrove/core@${version}` : join(artifacts, packed.filename),
      registry ? `@tandrove/graphql@${version}` : graphqlPacked.filename,
      'graphql@16.14.2',
    ],
    consumer,
  );
  const coreManifest = JSON.parse(
    readFileSync(
      join(consumer, 'node_modules/@tandrove/core/package.json'),
      'utf8',
    ),
  );
  const graphqlManifest = JSON.parse(
    readFileSync(
      join(consumer, 'node_modules/@tandrove/graphql/package.json'),
      'utf8',
    ),
  );
  assert.equal(coreManifest.name, '@tandrove/core');
  assert.equal(graphqlManifest.name, '@tandrove/graphql');
  for (const manifest of [coreManifest, graphqlManifest]) {
    assert.notEqual(manifest.private, true);
    assert.equal(
      manifest.version,
      JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'))
        .version,
    );
    assert.equal(
      manifest.repository.url,
      'git+https://github.com/jchewitt/tandrove.git',
    );
    assert.equal(manifest.publishConfig.tag, 'next');
  }
  assert.equal(
    graphqlManifest.dependencies[coreManifest.name],
    coreManifest.version,
    'Packed GraphQL must use the exact published core version, not a workspace protocol.',
  );
  // Run the actual examples against only installed packages, without tsx/TypeScript.
  assert.equal(existsSync(join(consumer, 'node_modules/typescript')), false);
  for (const file of [
    'fixture.mjs',
    'javascript.mjs',
    'fake-adapters.mjs',
    'adapters.mjs',
    'deadline.mjs',
    'freshness.mjs',
    'polling.mjs',
    'retention.mjs',
    'providers.mjs',
  ])
    writeFileSync(
      join(consumer, file),
      readFileSync(join(root, 'examples/vanilla/src', file)),
    );
  writeFileSync(
    join(consumer, 'typescript.js'),
    readFileSync(join(root, 'examples/vanilla/dist/typescript.js')),
  );
  for (const file of [
    'javascript.mjs',
    'adapters.mjs',
    'deadline.mjs',
    'freshness.mjs',
    'polling.mjs',
    'retention.mjs',
    'providers.mjs',
    'typescript.js',
  ])
    execFileSync(process.execPath, [join(consumer, file)], {
      cwd: consumer,
      stdio: 'inherit',
    });
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      const { createSchema, createGraphQLClient } = await import('@tandrove/graphql');
      const { StateStore, AcquisitionCancelledError, AcquisitionSupersededError, ReadTransportError } = await import('@tandrove/core');
      const assert = (await import('node:assert/strict')).default;
      const { generateSchemaModule } = await import('@tandrove/graphql/codegen');
      const sdl = 'type Query { item: Item! } type Item { id: ID! name: String }';
      const bound = createSchema(sdl).field('item').select({ name: true }).bind({}, { source: 'test', scope: 'test' });
      if (!bound.prepare('name').query.includes('name')) throw new Error('Packed planner failed.');
      if (!generateSchemaModule(sdl).includes('GeneratedTypes')) throw new Error('Packed code generator failed.');
      const store = new StateStore();
      const view = store.watch(bound.stateAddress, bound.selection);
      store.commit(bound.stateAddress, [
        { kind: 'membership', records: [{ id: '1' }] },
        { kind: 'write', record: { id: '1' }, path: [{ name: 'name', arguments: {} }], value: 'Packed store' },
      ]);
      if (view.getSnapshot().records?.[0]?.data.name !== 'Packed store') throw new Error('Packed shared store failed.');
      store.dispose();
      let result = { data: { item: { __typename: 'Item', name: 'Acquired' } } };
      const client = createGraphQLClient({ transport: async () => result });
      const acquired = client.watch(bound);
      await acquired.ready;
      if (acquired.getSnapshot().records?.[0]?.data.name !== 'Acquired') throw new Error('Packed acquisition failed.');
      await acquired.invalidate('name', { refetch: 'none' });
      if (!acquired.getSnapshot().stale) throw new Error('Packed invalidation failed.');
      await acquired.refresh('name');
      if (acquired.getSnapshot().stale) throw new Error('Packed refresh failed.');
      if (acquired.getSnapshot().membershipStale) throw new Error('Packed membership state failed.');
      result = { data: { item: { __typename: 'Item', name: null } }, errors: [{ message: 'field failed', path: ['item', 'name'] }] };
      await acquired.refresh().then(() => { throw new Error('Expected partial failure.'); }, () => {});
      if (acquired.getSnapshot().records?.[0]?.data.name !== 'Acquired' || acquired.getSnapshot().records?.[0]?.fields[0]?.error !== 'field failed') throw new Error('Packed field failure failed.');
      result = { data: null, errors: [{ message: 'resource failed', path: ['item'] }] };
      await acquired.refresh().then(() => { throw new Error('Expected resource failure.'); }, () => {});
      if (acquired.getSnapshot().records !== null || acquired.getSnapshot().resourceError !== 'resource failed') throw new Error('Packed resource failure failed.');
      const listDefinition = createSchema('type Query { items: [Item!]! } type Item { id: ID! name: String }', { identities: { Item: ['id'] } }).field('items').select({ name: true }).bind({}, { source: 'test', scope: 'list' });
      let items = [{ __typename: 'Item', id: '1', name: 'first' }];
      const lists = createGraphQLClient({ transport: async () => ({ data: { items } }) });
      const list = lists.watch(listDefinition);
      await list.ready;
      items = [{ __typename: 'Item', id: '2', name: 'second' }];
      await list.refreshList();
      if (list.getSnapshot().records?.[0]?.identity.id !== '2' || list.getSnapshot().membershipStale) throw new Error('Packed list refresh failed.');
      lists.dispose();
      client.dispose();
      const reads = [];
      const concurrent = createGraphQLClient({
        transport: (operation, context) => new Promise(resolve => reads.push({ resolve, context })),
      });
      async function waitForReads(count) {
        for (let i = 0; i < 100; i++) {
          if (reads.length === count) return;
          await Promise.resolve();
        }
        throw new Error('Packed concurrent acquisition did not start.');
      }
      const current = concurrent.watch(bound);
      await waitForReads(1);
      reads[0].resolve({ data: { item: { __typename: 'Item', name: 'initial' } } });
      await current.ready;
      const old = current.refresh('name');
      const obsolete = assert.rejects(old, AcquisitionSupersededError);
      await waitForReads(2);
      const fresh = current.invalidate('name');
      await waitForReads(3);
      reads[2].resolve({ data: { item: { __typename: 'Item', name: 'newest' } } });
      await fresh;
      reads[1].resolve({ data: { item: { __typename: 'Item', name: 'obsolete' } } });
      await obsolete;
      assert.equal(current.getSnapshot().records[0].data.name, 'newest');
      const canceled = assert.rejects(current.refresh('name'), AcquisitionCancelledError);
      await waitForReads(4);
      current.dispose();
      await canceled;
      assert.equal(reads[3].context.signal.aborted, true);
      concurrent.dispose();
      let attempts = 0;
      const waits = [];
      const retrying = createGraphQLClient({
        retry: { retries: 1, initialDelayMs: 100 },
        scheduler: { random: () => 0.5, wait: async (delay) => { waits.push(delay); } },
        transport: async () => {
          if (++attempts === 1) throw new ReadTransportError('transient', { retryable: true });
          return { data: { item: { __typename: 'Item', name: 'retried' } } };
        },
      });
      const recovered = retrying.watch(bound);
      await recovered.ready;
      assert.equal(attempts, 2);
      assert.deepEqual(waits, [50]);
      assert.equal(recovered.getSnapshot().records[0].data.name, 'retried');
      retrying.dispose();
    `,
    ],
    {
      cwd: consumer,
      stdio: 'inherit',
    },
  );
  writeFileSync(
    join(consumer, 'consumer.ts'),
    "import { AcquisitionCancelledError, AcquisitionSupersededError, type AcquisitionContext, type CancellationSignal, type StoreReader } from '@tandrove/core';\n" +
      'declare const reader: StoreReader<Readonly<{ id: string }>>;\n' +
      'const id: string = reader.getSnapshot().id;\nvoid id;\n' +
      '// @ts-expect-error undeclared fields must not be inferred as any\nreader.getSnapshot().missing;\n' +
      'declare const context: AcquisitionContext;\n' +
      'const signal: CancellationSignal = context.signal;\n' +
      'const reason: AcquisitionCancelledError | undefined = signal.reason;\n' +
      'const unsubscribe: () => void = signal.subscribe(() => {});\n' +
      'const superseded: Error = new AcquisitionSupersededError();\n' +
      'void reason; void unsubscribe; void superseded;\n',
  );
  writeFileSync(
    join(consumer, 'planner.ts'),
    `
    import { createSchema, createGraphQLClient, type FieldType, type ObjectRef, type ResultOf, type GraphQLTransportContext } from '@tandrove/graphql';
    import { ReadTransportError, type ReadRetryPolicy, type RetryScheduler, type AcquisitionClientOptions, type AcquiredPatch, type AcquisitionSource, type AcquisitionClient, type SnapshotData } from '@tandrove/core';
    declare const core: AcquisitionClient;
    declare const source: AcquisitionSource;
    declare const patch: AcquiredPatch;
    core.ingest(source, patch);
    const retry: ReadRetryPolicy = { retries: 2, initialDelayMs: 100, maxDelayMs: 2000 };
    const scheduler: RetryScheduler = { random: () => 0.5, wait: async (_delay, signal) => { if (signal.aborted) throw signal.reason; } };
    const coreOptions: AcquisitionClientOptions = { retry, scheduler };
    void coreOptions;
    const retryable: boolean = new ReadTransportError('network', { retryable: true }).retryable;
    void retryable;
    declare const transportContext: GraphQLTransportContext;
    const signal: AbortSignal = transportContext.signal;
    void signal;
    type Model = { Query: { item: FieldType<ObjectRef<'Item'>> }; Item: { name: FieldType<string | null> } };
    const definition = createSchema<Model>('type Query { item: Item! } type Item { name: String }').field('item').select({ name: { as: 'label' } });
    declare const result: ResultOf<typeof definition>;
    const label: string | null = result.label;
    void label;
    // @ts-expect-error unknown selected field
    definition.bind({}, { source: 'test', scope: 'test' }).prepare('missing');
    const client = createGraphQLClient({ endpoint: 'http://localhost/graphql', retry, scheduler });
    const handle = client.watch(definition.bind({}, { source: 'test', scope: 'test' }));
    const selectedData: SnapshotData<ResultOf<typeof definition>> | undefined = handle.getSnapshot().records?.[0]?.data;
    const selectedLabel: string | null | undefined = selectedData?.label;
    void selectedLabel;
    // @ts-expect-error Partial snapshots cannot promise a present scalar.
    const requiredLabel: string | null = selectedData!.label;
    // @ts-expect-error Only the selected alias is exposed.
    selectedData?.name;
    // @ts-expect-error Projected data is readonly.
    selectedData!.label = 'changed';
    void requiredLabel;
    void handle.invalidate('label', { refetch: 'none' });
    void handle.refresh();
    void handle.refreshList();
    const membershipStale: boolean = handle.getSnapshot().membershipStale;
    void membershipStale;
    const resourceError: string | undefined = handle.getSnapshot().resourceError;
    void resourceError;
    // @ts-expect-error canonical source name is not the selected alias
    void handle.invalidate('name');
  `,
  );
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--strict',
      '--noEmit',
      '--module',
      'NodeNext',
      '--target',
      'ES2022',
      '--allowJs',
      '--checkJs',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
      'consumer.ts',
      'planner.ts',
      'javascript.mjs',
      'adapters.mjs',
      'deadline.mjs',
      'freshness.mjs',
      'polling.mjs',
      'retention.mjs',
      'providers.mjs',
    ],
    {
      cwd: consumer,
      stdio: 'inherit',
    },
  );
  console.log(
    `${registry ? 'Public registry' : 'Packed artifact'} isolated ESM/TypeScript consumer passed: @tandrove/core and @tandrove/graphql ${version}`,
  );
  if (registry)
    console.log(
      npm(
        ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
        consumer,
      ),
    );
} finally {
  // Delete only this exact generated temporary directory, never an unchecked path.
  assert.equal(dirname(consumer), tempRoot);
  assert.ok(basename(consumer).startsWith('tandrove-consumer-'));
  rmSync(consumer, { recursive: true, force: true });
}

checkAngularPackage({
  root,
  artifacts,
  coreTarball: join(artifacts, packed.filename),
  graphqlTarball: graphqlPacked.filename,
  npm,
  registry,
});
