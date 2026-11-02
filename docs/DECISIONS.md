# Architecture decisions

## D037 Angular compatibility follows public API requirements

Use Angular 20.1.0 as the build and supported minimum because it publicly exposes `DestroyRef.destroyed`, required by component lifecycle guards. Do not require the demo's newer Angular patch solely because it is the original test baseline. Earlier 20.0 patches expose this member only as internal; no private-API fallback is introduced. Build partial APF output with compiler-cli/ng-packagr 20.1.0 and TypeScript 5.8.3, retaining ng-packagr's generated entrypoints. Angular-local extensionless imports use its Bundler module resolution and support that declaration bundler.

Declare only tested major ranges (`^20.1.0 || ^21.0.0 || ^22.0.0`) and maintain isolated tarball tests at their lower bounds and current patches, including the external trial's 21.2.17. Exercise explicit Zone/zoneless modes, component and environment lifetimes, argument replacement, GraphQL invalidation and strict AOT declarations. Keep the billing demo on 21.2.25. Compatibility changes receive independent review and a batched Changeset; neither the existing-application gate nor publication is completed by this matrix. See [Angular compatibility](ANGULAR.md#angular-compatibility).

## D036 Typed snapshots preserve partial availability

B7a carries the selected declaration result through GraphQL handles and Angular signals, while keeping the portable cache and snapshot runtime unchanged. Add a separate `SnapshotData<Result>` for recursively readonly optional data; keep `ResultOf` as the full declaration. Nested object branches admit structural null after errors, and scalar arrays retain their declared element/nullability types. Neither settled acquisition nor complete cached coverage narrows to a full schema result.

Infer from the passed definition's result witness, with generic JSON fallback for dynamic/untyped sources. Append defaulted result generics so existing target-only handles and generic consumers keep working. Lower each public producer contract to its actual output type before comparing assignments, and retain a private optional declaration-only result witness to prevent untyped-to-typed narrowing, including optional-only models. No runtime marker or new snapshot allocation is introduced. Keep assertions localized to the GraphQL source boundary. See [contracts, limits and migration](TYPED-SNAPSHOTS.md). B7's application trial, performance/memory evidence and final API/release-readiness review remain separate tasks.

## D035 Polling interests reuse shared acquisition

B6 adds explicit owner-bound `poll({ target?, everyMs? })` registrations, with disabled-by-default global/group/resource interval inheritance. Configuration alone does not start reads. Group identical canonical leaf selections and arguments independently of aliases; the fastest active interval wins, while different selections keep separate schedules. Restart cadence after shared work settles, without missed-tick queues. Stop/disposal releases scheduling, not another owner's current read.

Keep timers/interests in a small portable coordinator; reuse acquisition for overlapping read/retry joining, coverage subtraction, deadlines and generation-checked commits. Only requested successful coverage satisfies a tick, never extra fetched siblings. Polling retains explicit refresh/list semantics and does not become membership reconciliation or a stream. Capture a monotonic scheduler at the core boundary; GraphQL supplies defaults and Angular delegates with current-binding checks. A registration belongs to its original handle, including across tenant replacement. See [the polling contract](POLLING.md). This feature joins the batched release without enabling publication.

## D034 Assign ready capabilities through one resource configuration

B5 captures global defaults, one primary resource group and resource overrides using a portable `ResourceConfiguration` shared by core acquisition and GraphQL transport. Normalize legacy policy-only groups into the same namespace; reject duplicate declarations. Omission inherits, false disables without fallback, and explicit tokens re-enable. Assignment reads ready providers without starting factories. Keep provider ownership separate from client/cache ownership.

Core accepts canonical descriptors backed by existing bound-source providers; avoid inventing a second route language or a speculative multi-resource adapter. Preserve full advertised fetch coverage while the descriptor controls observation and commit intent. GraphQL transport remains reusable across resources. Bind effective policies and authority to the cached resource lifetime. Authority is the actual GraphQL transport or, for custom core sources, the source instance unless equivalent wrappers explicitly share an authority object. Guard both watches and patch ingress; eviction releases the binding. Identity checks cannot detect mutations to credentials/backends inside the same object. See [configuration, limitations and migration](CONFIGURATION.md). B4/B5 remain queued for a batched release; no npm publication is implied by feature completion.

## D033 Resolve provider infrastructure before synchronous client construction

B4 adds runtime-scoped tokens, captured instance/factory registrations, lazy single-flight async resolution and ready-only synchronous access. Preserve synchronous GraphQL and Angular clients; async provider setup belongs to bootstrap. Official GraphQL transports and application-owned acquisition sources use the same capability validation and existing decode/commit path. Tokens never enter resource identities. Capability assignment and global/group/resource provider precedence remain B5, without a speculative dependency resolver or generic adapter framework.

Borrow provider values by default; ownership requires an explicit disposer. Successfully created scopes own supplied owned instances even if never resolved. Factories can journal private cleanup before failing awaits. Initialization failure and scope disposal cancel that provider, preserve errors, release partial allocations and clean late owned results. Disposal seals before reentrant callbacks, is idempotent, continues after cleanup failures and releases internal references when settled. Clients must be disposed before their infrastructure scope. See [provider semantics and limits](PROVIDERS.md).

## D032 Batch releases while continuing reviewed feature delivery

The October 22 user direction separates implementation cadence from npm publication. Continue reviewed feature PRs and meaningful CI per slice, accumulating Changesets in the bot release PR. Leave that PR open until a useful release milestone is chosen or publication is explicitly requested. A request to continue development does not automatically authorize merging the release PR. No workflow bypass or versioning change is needed: ordinary main merges already skip publication.

## D031 Eviction ends the cached resource lifetime

B3 adds `requestPolicy.retentionMs` to the existing immutable policy resolver: false/default retains inactive state, zero evicts after final-owner cleanup, and positive integer milliseconds create an inactive reuse window. Retention is independent of freshness and request deadlines. Valid reacquisition cancels retention without renewing field ages; rejected watches and repeated disposal cannot extend the deadline. Check elapsed age before enforcing old bindings, so eviction permits a new policy at the same canonical address.

Evict the entire scope: data/membership/error storage, generations, freshness coverage and internal view. Clear obsolete internal references even when the application retains disposed handles; preserve those handles' last immutable snapshots. Instance and lifecycle generation checks protect replacement scopes from late work and reentrant adapters. Reuse the `MonotonicScheduler` capability, retain `FreshnessScheduler` as a compatible alias, and supply GraphQL platform defaults. Inactive scheduler failure evicts conservatively and reports through optional isolated `onRetentionError`; it does not retry or evict active owners. See [the full contract](RETENTION.md). This is elapsed inactive retention, not an active-cache memory budget, persistence or provider lifecycle implementation.

## D030 Freshness is accepted coverage age

B2 adds `requestPolicy.freshness` to the existing immutable global/group/resource resolver. Default disabled/on-demand preserves earlier behavior. Track each accepted field/null and membership independently; never renew uncommitted fetched context or untouched sibling leaves. Zero duration is immediately stale and on-demand only. An ensure call may settle with immediately stale data, but explicit invalidations during awaited work must still be honored. Active expiry uses normal shared acquisition, retries, deadlines and handle errors, with no self-rearming failure loop.

Membership expiry intentionally enables full-caller-selection membership reacquisition, including empty/null resources. Ordinary mismatch detected by a narrow read still requires explicit `refreshList()`. Expiry marks accepted coverage stale without creating request invalidations, preserving newer in-flight work. Retain due metadata but stop timers with no owners; check it on reuse. Capture a portable monotonic clock/wait capability; GraphQL supplies platform defaults. Scheduler failures fail closed with stale coverage and observable errors. See [the precise contract](FRESHNESS.md). Retention, field-specific duration overrides, provider registration and interval polling remain separate work.

## D029 Deliver client lifecycle through reviewed slices

Stage B starts with shared request deadlines and timeout-policy resolution, then separate freshness, inactive retention, provider ownership/registration, full capability assignment, polling and beta-readiness slices. Track an explicit alpha-exit checklist and a separate stable gate. The standalone client can stabilize before optional server/streaming packages; beta/stable publication still needs a reviewed release-policy change.

Deadline policy is immutable for the lifetime of a cached resource scope. Resolve global defaults, one named group and a resource binding before attaching owners. Compare effective values rather than group names; conflicting policies cannot silently split identity or change already-shared work. Deadlines default to disabled and cover one acquisition's attempts/backoff, not the entire chain of requests that an `ensure()` may require. Timeout is terminal, aborts work and preserves existing field-level error/generation semantics. Timers live behind the injected portable wait interface; GraphQL supplies platform timers. This does not claim that A1 provider tokens, factories or other timing policies exist yet.

## D027 Separate accepted publication from install-index visibility

The [alpha.1 trusted-publishing run](https://github.com/jchewitt/tandrove/actions/runs/39658759688) published all three packages with provenance on October 21. Its first attempt passed direct version/integrity checks before npm's install index exposed the same version; the consumer install failed with ETARGET. The guarded second attempt confirmed identical bytes, skipped uploads and passed consumers and `npm audit signatures`. Provenance identifies source commit `039dee24470c37e19adba3dbdaf1fd380c07568e`, `jchewitt/tandrove`, `.github/workflows/publish.yml`, and attempt 1.

Keep direct endpoint checks for publication preflight so lagging installation metadata cannot trigger duplicate upload attempts. Use the npm installation index as the additional post-upload/read-only acceptance gate and revalidate consumer install caches. Missing indexed versions/tags are pending; malformed indexes, conflicting metadata, and auth/network failures are errors. This tooling follow-up does not move tags, alter published bytes or publish another version.

## D026 Trusted publishing acceptance and registry processing

The three `0.1.0-alpha.0` packages were published locally and verified against their saved SHA512 artifacts on October 21. Isolated public-registry JavaScript, TypeScript and Angular consumers passed. They have no CI provenance. The user configured trusted publishing and authorized testing it with the next synchronized alpha, `0.1.0-alpha.1`; do not republish alpha.0.

Release tooling allows up to 20 minutes of registry availability checks after accepted uploads, retrying only explicit absence every 30 seconds. It never repeats an upload during that wait. Integrity/version/tag conflicts, missing required provenance and registry/auth/network failures still stop immediately. The workflow has a 45-minute budget for preparation, publication, processing and installed-consumer signature checks. Record actual OIDC, provenance and registry results after execution; configuration alone does not establish success.

## D025 Tandrove prepublication name and npm scope

On October 21 the user selected Tandrove and confirmed securing `@tandrove`. The release packages are `@tandrove/core`, `@tandrove/graphql` and `@tandrove/angular`. None of the old StateQL packages were published, so the first Tandrove candidate remains `0.1.0-alpha.0` on `next`. Rename current APIs, generated imports, examples, package metadata, Angular APF output and release checks together. Angular's branded APIs become `tandroveSignal` and `provideTandroveClient`; this is a prepublication rename, not a compatibility alias layer.

The user renamed the GitHub repository from `jchewitt/stateql` to `jchewitt/tandrove` before publication. Update current URLs, provenance metadata, release guards and trusted-publisher settings together, verifying the canonical repository name before tagging. Use a new `tandrove-v<VERSION>` tag and newly built artifacts; preserve the old tag and historical review/measurement evidence without republishing or relabeling their bytes. Historical decisions below retain their original names. Superseded StateQL release instructions must not be used. No Weftlet implementation is part of this repository.

## D001 GraphQL first with an execution boundary

One schema-informed definition drives selection, canonical state addresses, and GraphQL generation. The boundary lies where a planned selection becomes an executable operation. GraphQL is the default assembled experience. Keep the source interface internal during the proof of concept. Future REST and event adapters must not force a second query language or mapping model into the default flow.

## D002 Framework-independent observation

Core exposes immutable snapshots and subscriptions without Angular, React, or RxJS. The first exported types describe observation and disposal only; they do not claim to implement a cache. Angular is the first adapter. React and richer Observable integration are later work.

## D003 Identity and partial updates

State identity includes scope, canonical path, and arguments; request fingerprints can vary by selection without producing separate stored state. Lists need reliable record identity for selective merging. Field refresh and membership refresh have different semantics. Refer to `PLAN.md` for null/error and race rules.

## D004 Foundation tooling

Use a pnpm workspace, strict TypeScript, ESM and declarations, native Node tests for the current tooling, and a real tarball-consumer check. Add the runtime-specific test framework only when its implementation needs warrant it. Reserved modules have documentation rather than empty publishable packages. Add Angular Package Format tooling with the actual Angular implementation.

## D005 Releases

Use MIT. Track versions and changelogs with Changesets. The first npm releases must be prereleases on `next`, manually dispatched from a reviewed version tag contained in `main`. Use npm OIDC trusted publishing with provenance after external account configuration. A tracked readiness flag prevents releasing the scaffold.

The GitHub repository belongs to verified personal account `jchewitt`. npm authentication and scope ownership have not been established; `@jchewitt/stateql-core` is a provisional identifier, to be confirmed or changed before any release.

October 20 update: the user selected `@launch-echo` for the core, GraphQL and Angular release set. Existing manifests still use `@jchewitt`; R1 migrates all references together and verifies npm scope access. Exact versions and multi-package publication remain pending.

October 21 update: R1 migrates the complete release set to `@launch-echo` and prepares `0.1.0-alpha.0` on `next`, with one `stateql-v<VERSION>` tag and fixed Changesets release group. The user performs the first interactive publication of reviewed tarballs, then configures trusted publishing for subsequent versions. Local bootstrap has no GitHub provenance. CI uses OIDC/provenance and cannot treat that bootstrap as a provenance-bearing release. Publication checks the entire set before mutation, publishes in dependency order, and only skips existing versions whose integrity matches. GitHub workflow/source revision equality remains mandatory. Registry installation acceptance and account access cannot be inferred from local checks; see [the handoff](RELEASING.md).

## D006 Review before commit

Every commit requires independent agent review and resolution of actionable findings. CI is complementary verification, not a substitute for the review. Future feature work uses branches and pull requests; the initial reviewed foundation is the bootstrap commit on `main`.

## D007 Planner prototype boundary

Generate TypeScript schema types and embedded SDL together. Keep canonical addresses and immutable resolved selections in core; schema coercion, AST construction, validation, and identity injection belong in the GraphQL package. Keep that package private until the runtime exercises its interface. The supported schema subset and item-projection type contract are explicit in `PLANNER.md`; unsupported features fail rather than silently approximate their behavior. Source/scope are explicit binding inputs until a runtime client owns them.

## D008 Shared storage before execution

Implement P3 in reviewable increments. P3.1 introduces an adapter-facing atomic commit store with explicit membership, canonical field paths, immutable consumer projections, and lifecycle ownership. A later coordinator decides response eligibility, missing-field acquisition, cancellation, and retries; a source decoder translates protocol responses into store changes. Do not interpret the store's explicit membership replacement as permission to replace membership from a narrow response. The store interfaces remain provisional and are documented in `STORE.md`.

## D009 Acquisition before concurrent refresh

P3.2 serializes reads per resource and recomputes missing fields after prior work. GraphQL decoding initially rejects partial errors, unsupported structures, and membership changes explicitly. This permits an executable cache acquisition slice without implying P3.3–P3.6 reconciliation and race semantics are finished. Source reads return decoded records to core; HTTP and response validation remain in the GraphQL package. The eventual concurrent scheduler must preserve current cache reuse and lifecycle behavior.

## D010 Selective refresh over the serialized coordinator

P3.3 adds field/branch invalidation and refresh using the same canonical selection and state address. GraphQL handle targets are inferred from the bound definition, including aliases. A source may declare broader fetched coverage within its selection; only requested field writes commit, with required ancestor structure. Successful nulls or changed object identity must still discard obsolete descendants. Invalidations arriving during a read are reapplied atomically with that older response, including before initial membership is known. This is protection for the current serialized scheduler, not completion of P3.6 concurrent generations, cancellation, or in-flight refresh deduplication.

## D011 Explicit keyed-list reconciliation

P3.4 uses `refreshList()` for membership/order replacement; no-argument `refresh()` and `invalidate()` remain field operations over the declared selection. Collection sources opt in, with GraphQL deriving that capability from the resource field. Narrow reads patch only matching identities, ignore newcomers, retain missing records, and flag shared membership as stale. Missing records keep requested fields stale and reject the refresh as incomplete after valid matching writes commit. Only explicit membership replacement clears the membership flag. A list refresh uses the caller's entire selection and rejects incomplete responses before changing membership. Other views may need `ensure()` to fill additional fields on newly admitted records. Unkeyed lists and nested object lists remain unsupported rather than being approximated with positional identity.

## D012 Planned stream, ordering, and offline capabilities

Add E1 stream cohesion, E2 revision-aware ordering, and E3 framework-independent offline recovery as explicit product goals, with contracts and acceptance criteria in `PLAN.md`. They remain future work after the initial comparison; protect the common validation/commit boundary in P3.6/P3.8. Stream adapters declare payload meaning and routing. Cross-transport ordering requires comparable authoritative revisions and distinguishes replacement values from dependent deltas; timestamps alone do not establish absolute consistency. Offline cache persistence and a durable command outbox are separate features. Composition syntax is not a journal; replay requires serializable commands, server idempotency, and explicit conflict policy. Evaluate reductions in application coordination against existing Apollo normalization/subscription/persistence capabilities without claiming those mechanisms are unique to StateQL.

## D013 Partial execution results and structural nulls

P3.5 maps GraphQL execution-error paths against the generated operation and schema before any commit. Successful requested fields commit alongside located failures; scalar failures retain cached values with shared errors, while failed object nulls clear descendants and carry errors. Omitted fields preserve values but remain stale/incomplete for acquisition. Resource/ancestor nulls become `records: null` with shared `resourceError` when failed, distinct from unknown (`undefined`) and empty (`[]`); a successful singleton identity replacement discards the previous record. Sources return portable field failures or an explicit null-resource result, keeping GraphQL outside core. Malformed/unlocatable errors and null list items without identity reject atomically. A failed explicit list refresh can patch known members but cannot replace existing array membership; an initial acquisition or recovery from null can establish identified records with field errors. Omissions during list refresh still reject before any commit. Serialized reads, handle attempt errors, and pending invalidation semantics remain in place until P3.6.

## D014 Concurrent reads with local generations and owned cancellation

P3.6 supersedes serialized forced execution with a scheduler per resource. Exact current requests share work; `ensure` waits for useful coverage and recomputes after supersession. New requested-field generations block older overlapping writes, while disjoint changes can commit. Structural nulls, changed identities, ancestor errors, and membership replacement protect wider subtrees; an unsafe older root replacement is rejected conservatively. Mark-only invalidation still lets older data populate but cannot become fresh from that response. Superseded forced reads reject explicitly, and handle errors track the latest invoked attempt.

Active interested handles jointly own work. Final-owner departure cancels immediately; disposed callers settle even when a source ignores cancellation. Core exposes a portable signal, while GraphQL bridges it to native AbortSignal and HTTP fetch. Retention timers and retries remain separate work. These are local ordering guarantees, not server revisions or a cross-transport consistency protocol. See [the detailed contract](CONCURRENCY.md).

## D015 Read retry policy belongs to shared acquisition

P3.7 adds an immutable client-level policy and injected scheduler. Each shared request has one bounded retry count and keeps its original generations and owners through backoff. GraphQL supplies two retries and native timers by default; portable core remains opt-in. Only explicitly classified transport failures retry. HTTP request construction, fully received JSON parsing, GraphQL decoding, and cache reconciliation stay outside transient network classification. Terminal transport errors preserve values and mark only generation-eligible requested fields; missing/null/empty resources retain their shape and surface handle errors. Client/owner cancellation and supersession prevent more attempts.

Per-consumer overrides would need a conflict rule for shared work and are deferred. Timeout, retention, polling, and write replay remain separate contracts. See [retry details](RETRIES.md).

## D016 Server-driven invalidation and data updates

The October 20 direction expands E1 into configurable invalidation-only and direct-data modes, with optional WebSocket/SSE delivery and client-only fallback. E4 tracks a separate server event companion with business-event/database-change input adapters, declared routing/projection, and delivery adapters. Invalidation hashes do not establish ordering; inactive resources, missed events, and reconnect require explicit token retention and revalidation. Publishing committed changes, authorization, authoritative revisions, and durable delivery need server contracts. Notify the user and discuss this design before E1 implementation; preserve the boundaries now without prematurely building server dependencies into core.

## D017 Vanilla consumers and provisional adapter ingress

P3.8 proves the transport boundary with a whole-resource source and an in-process event adapter. `AcquisitionClient.ingest(source, patch)` accepts fully validated, nonempty patches to known records with active owners and established membership. It shares reconciliation and the generation/commit/notification path with reads, records barriers per changed record/field, and cannot change membership. Invalid patches do not advance ordering. Adapters own decoding, scope binding, and listener cleanup; this is not a production stream protocol or server revision policy.

TypeScript is an implementation and optional consumer tooling choice. Ship ESM JavaScript plus declarations, support dynamic `createSchema(sdl)` with runtime schema validation, and retain strict explicit-model/generated-model overloads. No TypeScript runtime or code generation is required to consume the library. Runtime schema knowledge remains required; dynamic names do not imply compile-time schema guarantees. Validate actual installed tarballs with native JavaScript, compiled TypeScript, and checked JavaScript examples. See [the runnable contract](VANILLA.md).

## D018 Angular observation before owned query integration

P4.1 adds a private APF package built with ng-packagr in partial compilation mode, with Angular core and StateQL core peers. `stateqlSignal` adapts a portable reader to a readonly signal and owns only its subscription. Injection-scope destruction unsubscribes without disposing shared readers/clients. Reject construction inside reactive computations and destroyed scopes; preserve snapshot identity and close the read/subscribe gap. P4.2 remains responsible for providers, handle ownership, and reactive argument replacement. Validate installed tarballs with native ESM and Angular AOT template compilation.

## D019 Drafts and commands are separate from server state

The October 20 forms direction reinforces editor-local drafts, not another shared cache. Preserve baseline/draft/latest values and capture immutable submitted values plus edit generations on explicit Save. Typing neither publishes cache changes nor sends socket commands. Reconcile confirmed saves without losing newer edits, and distinguish failed refresh from failed or ambiguous command acknowledgement. Scope/record identity binds drafts and outcomes. Start with a small demo binding using the same policy for both clients; defer a library forms abstraction, optimistic overlays, persistence, and durable outbox until their contracts are exercised. See [the full forms contract and limits](FORMS.md).

## D020 Angular clients and query views have separate ownership

P4.2 uses a typed application InjectionToken and an environment provider factory, keeping GraphQL out of the Angular runtime package. The provider owns one client per providing injector. `injectStateQuery` tracks a pure parameter getter, opens fresh owned handles untracked in the chosen injection context, and releases replaced handles without disposing the provider's client. Descriptor identity gates state and commands before effect-driven replacement, so a new account cannot expose or refresh the previous binding. Disposed views stop parameter evaluation. Parameter/factory failures are separate from active snapshot transport errors.

The owned query and non-owning signal bridge share the same guarded subscription primitive. Core continues to own cache reuse, deduplication, cancellation and invalidation. No form draft writes or command transport are introduced. See [API, scheduling, and lifecycle rules](ANGULAR.md).

## D021 Continue the independent runtime as an experiment

P5's [recorded comparison](COMPARISON.md) demonstrates equal narrow response payloads, fewer authored read-selection declarations, mixed UI/adapter coordination counts and smaller representative consumer bundles at the cost of runtime schema/operation planning. Continue toward a three-package experimental alpha, not a claim of general superiority over Apollo. Requested/fetched/committed coverage, per-field freshness/errors and separate membership refresh are runtime contracts that a planner alone would not supply. A planner over an existing cache remains a fallback if those semantics do not earn their maintenance cost in real applications.

Track typed runtime projection, larger-workload measurements, safe plan reuse, retention and timeout contracts separately. No premature optimization or new runtime framework is justified by the small desktop timing sample. Preserve P6 and the E1/E2 boundary, including the promised user discussion before implementing streams. R1 must finish multi-package publishing and account configuration; completing P5 does not enable publication.

## D022 Consistent client/server configuration with injectable capabilities

The approved product direction uses the same recognizable setup sequence on client and server: create/inject infrastructure, register providers, choose global defaults, assign resource groups, then apply resource overrides. Reuse portable resolution/ownership primitives where semantics match without imposing identical role-specific interfaces or a NestJS dependency. Global means one runtime/application instance. Registration does not enable all capabilities; omitted settings inherit and explicit disable settings stop inheritance. Start with one primary group per resource and reject conflicting authority/identity/scope bindings. Groups configure resources without changing their state identity.

Custom and official adapters follow the same capability contracts, validation and lifecycle rules. Acquisition, transport, routing, checkpoint storage, retained replay and commands remain distinct. Shared connections may serve separate immutable bindings; disposing one binding never closes borrowed infrastructure or another owner's work. Keep default GraphQL setup simple, server dependencies out of browser builds, and extension interfaces provisional until exercised by working implementations. See [the full contract](../PLAN.md#consistent-client-and-server-adapter-configuration).

## D023 Recoverable optional end-to-end flow

Database/business changes may flow through resource-specific authorized projections to clients; reverse flow is a local draft, explicit command, validated server commit and authoritative acknowledgement/event. Developers choose paths and streaming-off, invalidation-only or data-sync modes per resource. Reconnect prioritizes active demand, including background consumers and pending commands; framework visibility is only a priority signal. Baselines and stream resume points must be coherent, with bounded replay/buffering and fresh-baseline fallback when history expires.

Use coordinated authoritative revisions by default, distinguish them from replay cursors, and track covered fields/membership without assuming a whole record is current. Vector clocks remain a possible advanced independent-writer extension. A replacement server instance must recover through shared history/checkpoints or an authoritative baseline; process-local sequence numbers cannot supply this guarantee. Redis persistence, live messaging and retained history are separate capabilities. Socket.IO integrations borrow existing client/server infrastructure and reuse its transport recovery while StateQL owns application-state reconciliation. Streaming-off mode remains supported throughout. E1.0 now reviews concrete protocol choices against this agreed direction before implementation.

## D024 Publish usable increments

Publish the standalone client foundation first, then complete client lifecycle/configuration, recoverable live state with a minimal server companion, optional infrastructure integrations, persisted reads, and finally opt-in durable commands. Stages may split into smaller releases when each provides a complete vertical slice. Server/client setup must use the same vocabulary, precedence and ownership rules, with paired examples and contract tests. Every release works without a future release or hosted service, keeps previous standalone use cases working, and documents experimental API migrations. No empty adapter/server packages, new runtime behavior, scope migration or publication enablement is introduced by this planning decision. See [release gates](../PLAN.md#usable-incremental-releases) and [tasks](TASKS.md).

## D028 Reviewed release PRs own version changes

Changesets maintains one bot-authored PR after package changes merge. Its generated commits contain synchronized versions, peers, changelogs, lockfile and installation examples. Review the generated current revision before merging; publication checks maintainer approval recorded before merge and successful CI on that revision. Ordinary main commits do not publish. Keep publication in `publish.yml` so existing npm trust and provenance remain valid, with an annotated tag at the exact release merge commit. Failed releases rerun at their original revision without moving tags or overwriting versions. The bot never approves or merges its own PR. User-requested generated version commits receive independent review in the release PR before merge; authored automation changes continue to require independent agent review before commit.
