# Tandrove GraphQL source

Experimental GraphQL source implementing schema-generated TypeScript definitions, immutable selection composition, argument validation/coercion, canonical addressing, and GraphQL AST generation. Operations include required ancestors, variables, and configured identity fields, and are validated against the supplied schema.

It consumes portable selections from core. A validated acquisition decoder and default HTTP client connect the planner to shared storage. Located GraphQL execution errors are mapped through aliases, list identities, and schema nullability into field failures or structural nulls; valid sibling fields can commit. See the [acquisition guide](https://github.com/jchewitt/tandrove/blob/main/docs/ACQUISITION.md) for executable usage and remaining reconciliation limits, and the [planner guide](https://github.com/jchewitt/tandrove/blob/main/docs/PLANNER.md) for definition semantics.

## Install and first query

Installation example with matching `1.0.0-alpha.6` versions:

```sh
npm install @tandrove/core@1.0.0-alpha.6 @tandrove/graphql@1.0.0-alpha.6 graphql@^16.14.2
```

This native JavaScript example expects an ordinary GraphQL endpoint matching the supplied SDL:

```js
import { createGraphQLClient, createSchema } from '@tandrove/graphql';

const schema = createSchema(
  'type Query { invoice(id: ID!): Invoice } type Invoice { id: ID! accountId: ID! amount: Float! }',
  { identities: { Invoice: ['id'] } },
);
const invoice = schema
  .field('invoice')
  .select({ accountId: true, amount: true });
const client = createGraphQLClient({
  endpoint: 'https://api.example.com/graphql',
});
const view = client.watch(
  invoice.bind(
    { invoice: { id: 'I1' } },
    { source: 'billing', scope: 'current-session' },
  ),
);
const unsubscribe = view.subscribe(() => console.log(view.getSnapshot()));
try {
  await view.ready;
  await view.invalidate('accountId'); // Fetch/replace accountId; keep amount cached.
} finally {
  unsubscribe();
  view.dispose();
  client.dispose();
}
```

Use an absolute HTTP(S) endpoint URL in both browsers and Node. The default transport requires native `fetch`/`AbortController`; Node 22.14+ and Node 24 are tested, as is Chromium through the Angular demo. The GraphQL peer range is `^16.14.2`. ESM JavaScript works without TypeScript or code generation. No Tandrove server companion, Redis or socket service is needed.

The alpha supports singleton objects, keyed top-level resource lists and nested objects; nested object lists, unions/interfaces, pagination and global entity normalization are not implemented. Published alpha.5 exposes generic JSON snapshot data; B7a on main infers partial snapshot data from typed definitions, as described below. Extension contracts remain provisional; review alpha changelogs for migrations and keep Tandrove packages on matching versions. See [release status](https://github.com/jchewitt/tandrove/blob/main/docs/RELEASING.md) before installing a version not yet published.

Native JavaScript consumers can call `createSchema(sdl, options)` with runtime SDL and configured identities. Names and arguments are validated at runtime; generated TypeScript models are optional. Explicit `createSchema<Model>(sdl, options)` retains strict schema-aware editor checks. Both use the same JavaScript runtime, and neither needs a TypeScript loader. See [runnable vanilla examples and typing limits](https://github.com/jchewitt/tandrove/blob/main/docs/VANILLA.md).

An injected `GraphQLTransport` receives the prepared operation and an optional `GraphQLTransportContext` containing a native `AbortSignal`. The client supplies this context for every acquisition; custom transports should forward the signal to their network implementation. The default HTTP transport forwards it to `fetch`. Core uses a portable cancellation interface and imports no browser globals. See the [concurrency contract](https://github.com/jchewitt/tandrove/blob/main/docs/CONCURRENCY.md).

The assembled client defaults to two retries for classified transient transport failures, with jittered exponential backoff and native timers. Configure `retry`, pass `retry: false` to disable, or inject `scheduler` for deterministic control. Custom transports opt in by throwing `ReadTransportError` from core; ordinary exceptions, malformed JSON, and GraphQL errors do not retry. See [classification, terminal field errors, and limits](https://github.com/jchewitt/tandrove/blob/main/docs/RETRIES.md).

Set `requestPolicy: { requestTimeoutMs: 10_000 }` to bound each shared read including retry waits. Deadlines default to disabled; native scheduling is supplied even with `retry: false`. Named `requestPolicyGroups` and optional `watch(definition, { group, requestPolicy })` bindings support consistent resource overrides. All consumers of one state address must agree on the effective timeout. See [deadline behavior and configuration](https://github.com/jchewitt/tandrove/blob/main/docs/DEADLINES.md).

Enable `requestPolicy.freshness: { staleTimeMs: 30000, revalidate: 'on-demand' }` for field and membership expiry. GraphQL supplies the monotonic clock and timers; `freshnessScheduler` supports custom clocks. Global/group/resource inheritance and active mode follow the [freshness contract](https://github.com/jchewitt/tandrove/blob/main/docs/FRESHNESS.md).

Set `requestPolicy.retentionMs` to bound inactive-cache retention. The assembled client supplies a monotonic clock and timer; zero evicts after the final consumer leaves and `false` preserves indefinite retention. See [retention policies](https://github.com/jchewitt/tandrove/blob/main/docs/RETENTION.md).

B4 adds `createGraphQLTransportToken()` for use with core's provider scopes. Resolve official HTTP or custom transport factories during bootstrap, then pass the ready transport to ordinary `createGraphQLClient({ transport })`. Existing endpoint setup remains unchanged. See [provider ownership and examples](https://github.com/jchewitt/tandrove/blob/main/docs/PROVIDERS.md); these additions are pending a batched release and are absent from alpha.5.

B5 adds optional `providerScope`, `providers: { transport: token }`, `resourceGroups`, and resource overrides. Omission inherits and `false` disables without falling back to a configured endpoint. Cached resources must agree on effective policies and transport identity. See [provider assignment and migration](https://github.com/jchewitt/tandrove/blob/main/docs/CONFIGURATION.md); B5 is also pending a batched release.

B6 adds `handle.poll({ target?, everyMs? })` with native timing defaults and generated narrow operations. Configuration alone never starts polling; identical active selections share scheduling and existing reads/retries. See [polling semantics and cleanup](https://github.com/jchewitt/tandrove/blob/main/docs/POLLING.md). B6 is pending a batched release and is absent from alpha.5.

B7a infers `record.data` from the bound definition, including aliases and nested fields, while preserving possible absence/null/error states. `ResultOf` remains the full declared selection; `SnapshotData<ResultOf<...>>` describes partial consumer data. Dynamic SDL usage stays generic. See [typed snapshots and migration](https://github.com/jchewitt/tandrove/blob/main/docs/TYPED-SNAPSHOTS.md). B7a is pending a batched release and is absent from alpha.5.
