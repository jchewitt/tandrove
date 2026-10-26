# @tandrove/core

## 1.0.0-alpha.6

### Minor Changes

- 5fd2c7c: Assign ready providers through captured global defaults, resource groups and per-resource overrides. Explicit false disables inherited capabilities; group names do not change cache identity. Add bound-source descriptors and shared provider/policy resolution while preserving the default GraphQL endpoint setup.

  Reject conflicting authorities at shared state addresses, including local patch ingress, until the cached scope is evicted. Equivalent custom core source wrappers must reuse a source instance or declare one stable authority object. GraphQL uses the selected transport identity automatically. Provider scopes remain borrowed by clients.

- 357472a: Add explicit owner-bound `poll({ target?, everyMs? })` interests with inherited global/group/resource defaults. Identical canonical field selections share the fastest active cadence, join pending reads/retries and wait until settlement before scheduling again. Stopping or disposing an owner releases its interests while preserving other owners' shared work. GraphQL supplies native timing; Angular guards current bindings and releases polling on replacement/destruction. Polling preserves ordinary field-refresh and explicit list-membership semantics.
- b2c20b7: Infer selected snapshot data through GraphQL handles and Angular query signals. Add `SnapshotData<Result>` and defaulted snapshot/result generics while retaining readonly partial fields, scalar nullability, structural object nulls, dynamic JSON fallbacks and existing target-only consumers. `ResultOf` remains the full declared selection. Explicit `watch<Result>(...)` calls should instead infer from a typed bound definition. Cache storage, projection behavior, snapshot identity and JavaScript execution are unchanged.

### Patch Changes

- 4e03e5d: Reuse handle snapshots without rebuilding and serializing their contents when the immutable state view and handle error are unchanged. Preserve value-based equality and notification tracking when state changes, including reentrant updates and reads before another consumer's notification.
- 080a611: Index committed request-version barriers by canonical record identity and field path, avoiding repeated scans of unrelated records during field refresh. A conservative version upper bound skips unnecessary barrier scans while preserving resource-wide intent, invalidation, structural replacement and membership race protection. No public API or authoritative server-version semantics change.
- 88a307f: Add optional runtime-scoped provider registration with validated typed tokens, supplied instances, single-flight sync/async factories and explicit owned/borrowed cleanup. Support partial-initialization cleanup, cancellation, memoized failures and safe disposal of late factory results. GraphQL transport and custom acquisition tokens work with the existing synchronous clients; default GraphQL setup remains unchanged.
- ac898c9: Prepare canonical field addresses and response paths once per store view, and reuse immutable projected data for request-loading changes. Compare loading state separately while preserving value-based equality for data commits and updating every view before notifying consumers.
- c0d58c5: Reuse internally validated, immutable array-free input snapshots and their canonical strings to reduce repeated identity and argument processing. Caller-owned inputs remain validated on every call. Arrays continue through iteration and native serialization rather than being memoized.

## 0.1.0-alpha.5

### Patch Changes

- b492abe: Add opt-in inactive resource retention with global/group/resource `retentionMs` policies. Evict full cached scopes after the final owner leaves, preserve active owners and disposed snapshots, and allow fresh acquisition and policy rebinding after eviction. Support zero/disabled retention, monotonic scheduling, safe cancellation and late-response isolation; GraphQL supplies platform defaults.

## 0.1.0-alpha.4

### Patch Changes

- 154c387: Add opt-in field and membership freshness expiry with shared global/group/resource policies, on-demand or active revalidation, injected monotonic scheduling, and lifecycle cleanup. Retain cached values when stale and preserve in-flight generation, retry, and deadline protections. GraphQL supplies the default platform clock; plain JavaScript consumers need no TypeScript runtime.

## 0.1.0-alpha.3

### Patch Changes

- c5cdb32: Add opt-in shared-request deadlines covering source attempts and retry backoff. Resolve captured timeout policies through global defaults, named groups and resource bindings; reject conflicts for consumers sharing a state address. Timeout aborts transport/retry work, preserves cached values with eligible field errors, and rejects with ReadTimeoutError. GraphQL supplies platform scheduling; portable core accepts a DelayScheduler. Existing clients keep deadlines disabled by default.

## 0.1.0-alpha.2

### Patch Changes

- 8768c25: Validate automated reviewed releases: synchronized versions, changelogs and installation examples now flow through a bot-maintained release PR and trusted publication after its reviewed merge. No runtime API changes.

## 0.1.0-alpha.1

### Patch Changes

- Validate the synchronized alpha release through GitHub trusted publishing. Release tooling waits for npm processing without repeating uploads, checks installed registry consumers and registry signatures, and reports a missing release-tag setting explicitly. Library runtime APIs are unchanged.

## 0.1.0-alpha.0

- Rename the unpublished StateQL candidate to Tandrove: packages are `@tandrove/core`, `@tandrove/graphql` and `@tandrove/angular`. Angular APIs are `tandroveSignal` and `provideTandroveClient`. This is the first public version, with no old-name compatibility aliases.

### Minor Changes

- 96a9479: Add provisional automatic acquisition with serialized cache reuse, missing-field requests, and observable acquisition errors. The private GraphQL source now provides strict decoding and an HTTP client.
- a1ceca0: Add explicit transport-failure classification, bounded read retries with injected scheduling, jittered exponential backoff, server delay hints, and shared terminal field errors. Retry attempts preserve request identity, generation, ownership, and fetching state; cancellation and supersession stop further attempts. Portable core retries remain opt-in with a scheduler, while the private GraphQL client defaults to two additional attempts and supports retry:false. HTTP failures are classified separately from JSON/schema decoding. Writes, timeouts, timed retention, and stream reconnect policies remain outside this increment.
- b14d41b: Run forced reads concurrently with scoped in-flight deduplication, local field generations, structural replacement barriers, and ownership-based cancellation. Superseded reads cannot overwrite newer fields; unaffected changes may still commit before AcquisitionSupersededError rejects the read. ensure recomputes missing coverage after supersession. Sources receive a portable cancellation signal and may provide a wire fingerprint. GraphQL bridges cancellation to AbortSignal and the default HTTP fetch. Retries, timed retention, and authoritative server revision ordering remain future work.
- Prepare the first usable standalone alpha under the @tandrove scope: portable shared state, schema-driven GraphQL acquisition and selective refresh, and Angular signals/providers/owned query views. Ship ESM JavaScript with optional TypeScript declarations and an Angular partial-compilation package. Install matching alpha versions together; no server companion or streaming infrastructure is required. Extension interfaces and runtime snapshot typing remain experimental.
- 9b4a1ae: Reconcile narrow list responses by identity without changing membership or order. Expose membership staleness, retain missing records with stale targeted fields, and add explicit refreshList to replace membership/order atomically using the calling view's selection.
- 51d9b8e: Support portable field failures and explicit null-resource acquisition. Retain successful partial updates and cached scalar values on field errors, mark omitted fields stale, and discard obsolete data on structural nulls or singleton identity changes. Snapshots now distinguish null resources from unknown/empty membership and expose shared resourceError. The private GraphQL source maps aliased execution-error paths and schema null bubbling into these changes. Concurrent scheduling and retries remain deferred.
- 272b3f2: Add selective invalidation, mark-only invalidation, and forced refresh on shared query handles. Separate fetched coverage from commit coverage for broader sources and preserve invalidations that arrive during an older serialized read.
- 75587d5: Add provisional shared-record storage with atomic commits, consumer projections, stable immutable snapshots, field metadata, subscriptions, and explicit disposal/eviction.
- 1d50674: Add portable immutable selection composition, JSON input canonicalization, and scoped resource/field addressing primitives for the experimental GraphQL planner. This does not implement a cache or enable publishing.
- b30c6e2: Add provisional validated patch ingestion for existing acquired records through the shared acquisition commit path. Preserve unaffected records and fields while blocking older overlapping reads. Reject malformed patches before changing state or local generations.

  Support dynamic JSON field paths in consumer typing and reject empty object narrowing. Add native JavaScript, TypeScript, whole-resource, and simulated event examples, including isolated packed-package checks.
