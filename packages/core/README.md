# Tandrove core

Experimental foundation for Tandrove's framework-independent runtime.

Exports observation contracts, portable canonical addresses, immutable selection composition, a provisional `StateStore`, and `AcquisitionClient`. Acquisition reuses shared fresh fields and asks a source for missing selections. Query handles support field/branch invalidation, mark-only invalidation, forced refresh, and explicit keyed-list membership refresh. Decoded partial failures retain successful fields, while structural nulls discard obsolete descendants. Snapshots distinguish unknown, null, and populated/empty resources and expose shared field/resource errors. Concurrent acquisition deduplicates identical work, filters superseded writes using local generations, and cancels work after its final interested owner leaves. Optional bounded read retries use an injected scheduler and explicit transport-failure classification.

## Install and compatibility

Installation example for `1.0.0-alpha.6`:

```sh
npm install @tandrove/core@1.0.0-alpha.6
```

Use matching Tandrove alpha versions. Core is portable ESM JavaScript with optional TypeScript declarations and no runtime dependencies. The repository tests Node 22.14+ and Node 24; browser integration is tested through Angular 21.2.25. For ordinary GraphQL applications, start with the [assembled GraphQL client](https://github.com/jchewitt/tandrove/tree/main/packages/graphql) rather than constructing an acquisition source manually.

This is an experimental alpha, not a stable API promise. Extension contracts remain provisional. Polling and typed snapshot results are implemented on main and pending a batched release; WebSockets, persistence, a server companion and durable writes remain planned. Alpha changes may require migrations; review each changelog and keep packages on the same version. See [release status and publishing](https://github.com/jchewitt/tandrove/blob/main/docs/RELEASING.md).

The observation interface has no Angular, React, RxJS, GraphQL, DOM, or Node dependencies. Runtime snapshots must be immutable; TypeScript callers supply an immutable snapshot type. Framework adapters will subscribe to this same runtime rather than maintain a separate cache.

See the [store guide](https://github.com/jchewitt/tandrove/blob/main/docs/STORE.md) for commit semantics and the boundary between storage and request coordination.

The [concurrency contract](https://github.com/jchewitt/tandrove/blob/main/docs/CONCURRENCY.md) describes ownership, cancellation signals, and `AcquisitionSupersededError`. Local request ordering does not establish server revision ordering.

The [retry contract](https://github.com/jchewitt/tandrove/blob/main/docs/RETRIES.md) covers `ReadRetryPolicy`, `RetryScheduler`, `ReadTransportError`, and terminal field errors. Portable core defaults to no retries; enabling them requires a scheduler. Optional [shared request deadlines](https://github.com/jchewitt/tandrove/blob/main/docs/DEADLINES.md) use `requestPolicy`, `requestPolicyGroups`, resource binding overrides and an injected `DelayScheduler`; they reject with `ReadTimeoutError` and default to disabled. No automatic write retry is implemented.

See the [project plan](https://github.com/jchewitt/tandrove/blob/main/PLAN.md) and [task list](https://github.com/jchewitt/tandrove/blob/main/docs/TASKS.md).

Provisional `AcquisitionClient.ingest(source, patch)` applies validated patches to existing acquired records through the same reconciliation and commit path as reads. It requires active ownership, cannot change membership, and protects accepted fields from older local reads. The [vanilla guide](https://github.com/jchewitt/tandrove/blob/main/docs/VANILLA.md) documents constraints and simulated adapters. This is not server revision ordering or a production socket protocol.

The package ships ESM JavaScript and optional TypeScript declarations. JavaScript consumers do not need a compiler or TypeScript loader.

Opt-in `requestPolicy.freshness` tracks field and membership ages with an injected `FreshnessScheduler`. Expiry retains values; on-demand or active revalidation shares normal acquisition. See [freshness configuration and lifecycle](https://github.com/jchewitt/tandrove/blob/main/docs/FRESHNESS.md).

Opt-in `requestPolicy.retentionMs` retains an inactive resource for integer milliseconds, disables eviction with `false`, or evicts at final-owner departure with zero. Positive retention uses `retentionScheduler` or a supplied `freshnessScheduler`. See [ownership, eviction and rebinding](https://github.com/jchewitt/tandrove/blob/main/docs/RETENTION.md).

B4's optional `createProviderScope`, `provide` and capability tokens resolve shared infrastructure before ordinary clients are constructed. Instance/sync/async registrations, owned/borrowed lifetime and failure cleanup follow the [provider contract](https://github.com/jchewitt/tandrove/blob/main/docs/PROVIDERS.md). These additions are pending a batched release and are absent from alpha.5.

B5 adds `providerScope`, `providers: { acquisition: token }`, `resourceGroups`, and resource overrides. Assigned bound sources can serve canonical descriptors without a dummy read function. Shared cached resources must agree on authority and policy; equivalent custom source wrappers should reuse an instance or declare a stable `authority` object. See [configuration and migration](https://github.com/jchewitt/tandrove/blob/main/docs/CONFIGURATION.md). B5 is also pending a batched release.

B6 adds `handle.poll({ target?, everyMs? })`, returning an owner-bound stop function. Identical selections share the fastest active cadence and existing reads/retries. Intervals can inherit from `requestPolicy.polling.everyMs`, but registration is always explicit. Portable core needs `pollingScheduler` or `freshnessScheduler`. See [polling semantics and cleanup](https://github.com/jchewitt/tandrove/blob/main/docs/POLLING.md). B6 is pending a batched release and is absent from alpha.5.

B7a adds `SnapshotData<Result>` and defaulted result parameters for snapshot/handle types. Inferred values remain readonly and optional; nested objects also allow structural nulls after errors. Portable custom acquisition retains generic JSON data. See [typed snapshots and migration](https://github.com/jchewitt/tandrove/blob/main/docs/TYPED-SNAPSHOTS.md). B7a is pending a batched release and is absent from alpha.5.
