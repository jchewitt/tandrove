# @tandrove/graphql

## 1.0.0-alpha.6

### Minor Changes

- 5fd2c7c: Assign ready providers through captured global defaults, resource groups and per-resource overrides. Explicit false disables inherited capabilities; group names do not change cache identity. Add bound-source descriptors and shared provider/policy resolution while preserving the default GraphQL endpoint setup.

  Reject conflicting authorities at shared state addresses, including local patch ingress, until the cached scope is evicted. Equivalent custom core source wrappers must reuse a source instance or declare one stable authority object. GraphQL uses the selected transport identity automatically. Provider scopes remain borrowed by clients.

- 357472a: Add explicit owner-bound `poll({ target?, everyMs? })` interests with inherited global/group/resource defaults. Identical canonical field selections share the fastest active cadence, join pending reads/retries and wait until settlement before scheduling again. Stopping or disposing an owner releases its interests while preserving other owners' shared work. GraphQL supplies native timing; Angular guards current bindings and releases polling on replacement/destruction. Polling preserves ordinary field-refresh and explicit list-membership semantics.
- b2c20b7: Infer selected snapshot data through GraphQL handles and Angular query signals. Add `SnapshotData<Result>` and defaulted snapshot/result generics while retaining readonly partial fields, scalar nullability, structural object nulls, dynamic JSON fallbacks and existing target-only consumers. `ResultOf` remains the full declared selection. Explicit `watch<Result>(...)` calls should instead infer from a typed bound definition. Cache storage, projection behavior, snapshot identity and JavaScript execution are unchanged.

### Patch Changes

- 88a307f: Add optional runtime-scoped provider registration with validated typed tokens, supplied instances, single-flight sync/async factories and explicit owned/borrowed cleanup. Support partial-initialization cleanup, cancellation, memoized failures and safe disposal of late factory results. GraphQL transport and custom acquisition tokens work with the existing synchronous clients; default GraphQL setup remains unchanged.
- Updated dependencies [4e03e5d]
- Updated dependencies [080a611]
- Updated dependencies [5fd2c7c]
- Updated dependencies [88a307f]
- Updated dependencies [ac898c9]
- Updated dependencies [c0d58c5]
- Updated dependencies [357472a]
- Updated dependencies [b2c20b7]
  - @tandrove/core@1.0.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- b492abe: Add opt-in inactive resource retention with global/group/resource `retentionMs` policies. Evict full cached scopes after the final owner leaves, preserve active owners and disposed snapshots, and allow fresh acquisition and policy rebinding after eviction. Support zero/disabled retention, monotonic scheduling, safe cancellation and late-response isolation; GraphQL supplies platform defaults.
- Updated dependencies [b492abe]
  - @tandrove/core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- 154c387: Add opt-in field and membership freshness expiry with shared global/group/resource policies, on-demand or active revalidation, injected monotonic scheduling, and lifecycle cleanup. Retain cached values when stale and preserve in-flight generation, retry, and deadline protections. GraphQL supplies the default platform clock; plain JavaScript consumers need no TypeScript runtime.
- Updated dependencies [154c387]
  - @tandrove/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- c5cdb32: Add opt-in shared-request deadlines covering source attempts and retry backoff. Resolve captured timeout policies through global defaults, named groups and resource bindings; reject conflicts for consumers sharing a state address. Timeout aborts transport/retry work, preserves cached values with eligible field errors, and rejects with ReadTimeoutError. GraphQL supplies platform scheduling; portable core accepts a DelayScheduler. Existing clients keep deadlines disabled by default.
- Updated dependencies [c5cdb32]
  - @tandrove/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- 8768c25: Validate automated reviewed releases: synchronized versions, changelogs and installation examples now flow through a bot-maintained release PR and trusted publication after its reviewed merge. No runtime API changes.
- Updated dependencies [8768c25]
  - @tandrove/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- Validate the synchronized alpha release through GitHub trusted publishing. Release tooling waits for npm processing without repeating uploads, checks installed registry consumers and registry signatures, and reports a missing release-tag setting explicitly. Library runtime APIs are unchanged.
- Updated dependencies
  - @tandrove/core@0.1.0-alpha.1

## 0.1.0-alpha.0

- Rename the unpublished StateQL candidate to Tandrove: packages are `@tandrove/core`, `@tandrove/graphql` and `@tandrove/angular`. Angular APIs are `tandroveSignal` and `provideTandroveClient`. This is the first public version, with no old-name compatibility aliases.

### Minor Changes

- Prepare the first usable standalone alpha under the @tandrove scope: portable shared state, schema-driven GraphQL acquisition and selective refresh, and Angular signals/providers/owned query views. Ship ESM JavaScript with optional TypeScript declarations and an Angular partial-compilation package. Install matching alpha versions together; no server companion or streaming infrastructure is required. Extension interfaces and runtime snapshot typing remain experimental.

### Patch Changes

- Updated dependencies [96a9479]
- Updated dependencies [a1ceca0]
- Updated dependencies [b14d41b]
- Updated dependencies
- Updated dependencies [9b4a1ae]
- Updated dependencies [51d9b8e]
- Updated dependencies [272b3f2]
- Updated dependencies [75587d5]
- Updated dependencies [1d50674]
- Updated dependencies [b30c6e2]
  - @tandrove/core@0.1.0-alpha.0
