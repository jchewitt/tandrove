# Tandrove Architecture and Proof of Concept Plan

Approved implementation direction · October 16, 2026 · End-to-end and incremental-release direction updated October 20, 2026

Implementation is tracked in [docs/TASKS.md](docs/TASKS.md). P1–P5 are complete, and the [comparison](docs/COMPARISON.md) supports continuing the independent runtime as an experiment. R1 published the standalone `@tandrove` core/GraphQL/Angular release set at `0.1.0-alpha.0`; registry integrity and installed-consumer acceptance passed. The `0.1.0-alpha.1` release passed trusted publishing, provenance and installed-consumer checks. Alpha.2 verified the complete bot-maintained release PR, reviewed merge, automatic tag and trusted publication flow. See the [release record](docs/RELEASING.md). Examples and future contracts below remain proposals unless their tasks are complete.

Tandrove uses composable data definitions to derive requests, address shared cached state, and target refreshes. Its proof of concept combines a framework-independent TypeScript runtime, a GraphQL source adapter, an Angular integration, and a small billing application. An equivalent Apollo implementation measures application wiring and correctness without assuming general feature parity.

Angular is the confirmed first UI. Plain TypeScript usage is part of the proof of concept. React, REST, WebSockets, and a possible Node server companion are later extensions; their requirements shape the boundaries now.

The product direction is an optional end-to-end state flow: database/business changes reach interested clients, and explicit client commands pass through server validation and committed storage before becoming authoritative shared state. Disconnections, server changes behind a load balancer, intermittent PWA use, and absent streams are normal operating conditions. The standalone client remains supported throughout this evolution; developers choose the authoritative path and synchronization mode per resource. See [consistent adapter configuration](#consistent-client-and-server-adapter-configuration) and [usable incremental releases](#usable-incremental-releases).

## Product hypothesis and evaluation

The central workflow is:

```ts
const invoices = client.watch(billing.invoices, variables);
await invoices.invalidate('accountId');
```

Tandrove retains the existing scoped invoice state, generates a request for accountId plus required context and identity fields, merges the successful response into that state, and updates affected consumers. Other values and their freshness remain unchanged. A consumer can derive a subset or extension of a central definition without introducing a new, independently managed cache key.

The proposed advantage is a unified workflow for selection, identity, and refresh. Caching, reactivity, retries, and GraphQL generation are supporting mechanisms. The project succeeds if ordinary application code no longer has to coordinate separate definitions for fetching a field, locating its cached value, and keeping consumers synchronized.

Apollo can merge fields from separate operations into the same normalized object and notify watchers. Its documented field invalidation workflow identifies queries to refetch. The comparison must include a narrow Apollo query that achieves the same network result, not just a full-query refetch. [Apollo caching](https://www.apollographql.com/docs/react/caching/overview), [Apollo refetching](https://www.apollographql.com/docs/react/data/refetching)

Relay generates refetch queries for declared fragments, and Genql generates GraphQL from JavaScript selections. These are relevant precedents. Tandrove's candidate distinction is runtime composition and field refresh through a stable state definition with fewer application-owned declarations. No ecosystem-wide uniqueness claim is assumed. [Relay refetchable fragments](https://relay.dev/docs/tutorial/refetchable-fragments/), [Genql](https://genql.dev/docs)

The product roadmap also targets three related problems: repeated application code for stream-to-cache updates, stale updates arriving across different transports, and framework-independent offline recovery. These are planned capabilities, not implemented guarantees. Their contracts and evaluation criteria appear in [Stream cohesion, ordering, and offline recovery](#stream-cohesion-ordering-and-offline-recovery). Prefer proving stream cohesion and ordering together before expanding into durable write replay.

## Scope of the first proof of concept

| Included                                                                | Deferred                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Central definitions, nested selections, reusable subsets and extensions | Arbitrary client-defined joins across endpoints            |
| Direct GraphQL name matching and one explicit alias example             | General data transformation and computed-field framework   |
| Argument-scoped shared state and typed field references                 | Global entity sharing across unrelated query paths         |
| Field and branch invalidation with generated narrow requests            | Complete GraphQL feature coverage                          |
| Identical-request deduplication, race protection, field freshness       | Aggressive batching of overlapping operations              |
| Basic read retry policy and field-specific errors                       | Optimistic mutation engine and offline queues              |
| Angular signals integration and vanilla TypeScript example              | React adapter and full RxJS integration package            |
| One save interaction followed by targeted invalidation                  | Automatic inference of mutation side effects               |
| Apollo baseline and request inspector                                   | Production developer-tools extension                       |
| Deterministic tests for lifecycle and reconciliation                    | Production REST, socket, SSR, or server companion packages |

Field polling follows the core comparison as B6. The [implemented contract](docs/POLLING.md) is pending a batched release; it was not required to prove the first selective-refresh workflow.

## Architecture boundaries

Tandrove is GraphQL-first in its public API and default setup. The default client bundles the GraphQL source and HTTP transport; application developers do not assemble adapters for ordinary GraphQL usage. Definitions deliberately follow GraphQL field, argument, and selection semantics.

One authoritative, schema-resolved selection structure drives both cache addressing and GraphQL generation. Invalidation selects nodes from that same structure. There is no separately maintained generic query language or key-to-GraphQL mapping model. Optional naming aliases resolve once into canonical field references used by both consumers of the structure.

The internal boundary sits where the planned selection becomes an executable backend operation, with a corresponding boundary for decoding results. The core can understand paths, fields, identities, and selections while leaving GraphQL document construction and protocol-specific response interpretation in the GraphQL module. This preserves the direct definition-to-query flow.

```text
Angular adapter       Plain TypeScript       React adapter later
       \                    |                    /
        Shared handles, snapshots, and subscriptions
                            |
                    Tandrove core runtime
     definitions / cache / freshness / planning / scheduling
                            |
                      Source adapter
          GraphQL initially; REST and event sources later
                            |
                Protocol-specific request or event
                            |
                       Transport
                HTTP initially; sockets later

Response or push event -> adapter decoding -> validated cache changes
                     -> core commit -> affected consumers
```

The core asks what fields need updating. The source adapter determines what operations the backend can support. The transport sends those operations. Framework adapters expose shared state using their framework's lifecycle and reactivity.

| Boundary        | Owns                                                                                                                              | Must not own                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Core            | Immutable definitions, canonical field addresses, cache records, freshness, request coordination, subscriber projections, commits | GraphQL ASTs, HTTP clients, Angular, React, RxJS, DOM globals |
| GraphQL source  | Schema metadata, path and argument resolution, operation construction, identity selections, response/error-path decoding          | UI signals, component lifetimes, an independent cache         |
| Transport       | Request execution, headers, cancellation, connection concerns                                                                     | Cache identity, field selection semantics, form state         |
| Angular adapter | DI, signals, reactive argument changes, automatic disposal                                                                        | Its own fetch or retry engine                                 |
| Server demo     | Billing schema, fixtures, deterministic delays/errors and mutations                                                               | Tandrove-specific requirements on an ordinary GraphQL server  |

Keep these as module boundaries even where they share a package. Avoid publishing a package for every interface before a second implementation demonstrates the need. Keep the source interface internal and provisional during the proof of concept. Do not weaken GraphQL's supported semantics to accommodate hypothetical REST limitations or build a public plugin framework before a real second source requires it.

### Consistent client and server adapter configuration

The client and optional server companion must have a recognizable setup pattern: create or inject infrastructure, register providers, establish defaults, define resource groups, and override individual resources. Share portable configuration-resolution, validation and ownership primitives where their semantics match. Keep role-specific interfaces for server authorization, client observation and transport execution rather than forcing identical methods. The same vocabulary, precedence, lifecycle rules, diagnostics and documentation structure should make moving between client and server familiar.

Separate provider registration from assignment. Register typed tokens with instances or synchronous/asynchronous factories, then reference those providers by capability. Plain JavaScript must work without a DI framework; Angular/NestJS integrations may obtain providers from their existing containers. NestJS's instance/factory/alias patterns are a reference, not a core dependency. [NestJS custom providers](https://docs.nestjs.com/fundamentals/custom-providers)

| Configuration level   | Meaning on both client and server                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Provider registration | Name a reusable implementation or factory; registration alone does not enable every capability.               |
| Global defaults       | Assign providers and policies for this runtime/application instance, not an unscoped process singleton.       |
| Resource group        | Give a named collection of resources common adapters and configuration without creating new state identities. |
| Resource override     | Replace an allowed setting/provider or explicitly disable an inherited capability.                            |

Resolve configuration as global defaults → resource group → resource override. Omitted values inherit; explicit disable values stop inheritance for that capability. Start with one primary configuration group per resource. Multiple-group composition, if later needed, must define precedence and reject unresolved conflicts. A configuration group is distinct from a transactional consistency group. Definition selection composition continues to use the existing immutable definition model.

Adapter bindings/configuration resolve before work starts and remain immutable for that binding. Identity, authorization scope and authoritative-source mappings cannot be silently changed by local consumer overrides. Incompatible bindings cannot share a state address. Consumer priority or selection does not create a competing retry/timeout policy for already-shared work; shared-policy conflict semantics must be specified before exposing such overrides. Persisted keys include scope/resource/schema context; a group name alone is not an isolation boundary.

Use capability-specific contracts for data acquisition/decoding, message transport, event routing, checkpoint storage, retained replay history, and command execution. A package may implement several capabilities over one shared connection, but snapshot storage, live messaging and replay are not interchangeable. Custom adapters use the same interfaces, validation and contract tests as official adapters; neither can bypass revision checks or mutate cached state through a privileged path. Validate unsupported combinations before starting work, including requesting replay from an adapter that cannot provide it.

Registered providers are reused according to explicit scope and reference ownership. Resource bindings may have different immutable options/namespaces while sharing infrastructure. One resource's disposal releases its interests/listeners, not another resource's work. Infrastructure created by Tandrove is closed by its owning runtime; injected application-owned connections remain application-owned. Async initialization failure cleans up only owned partial resources. Server globals may share connections but must preserve tenant/request authorization boundaries; SSR state remains request/session-isolated.

Keep advanced capabilities opt-in and separately importable. The default GraphQL client requires no registry boilerplate, Redis, socket server or server companion. Official adapter packages may expose separate client/server entry points; verify browser bundles cannot import server drivers or secrets. Publish integrations only with runnable behavior and compatibility tests, not empty extension shells. Establish a public contract through a working official implementation plus a custom/application-owned integration without core edits. Configuration syntax and package names beyond the initial release set remain provisional.

### Minimal contracts

B4 implements the portable registration/ownership subset through [provider scopes](docs/PROVIDERS.md): instances and sync/async factories, validated tokens, memoized initialization, explicit cleanup and shared infrastructure. Resolve providers during bootstrap, then construct ordinary synchronous clients. B5 adds [provider assignments and global/group/resource precedence](docs/CONFIGURATION.md), exercised by official GraphQL transports and custom bound sources, with shared-authority checks through cache eviction. B4/B5 are queued for a batched release and are absent from alpha.5.

The core exposes getSnapshot(), subscribe(listener), and dispose() on active handles. Snapshots are immutable, preserve their reference until relevant state changes, and contain data completeness, fetching state, and errors. Reading a snapshot has no network side effects. subscribe returns an unsubscribe function; dispose releases the handle's ownership and scheduled work.

A source adapter resolves a definition into canonical addresses, prepares an operation from a refresh intent, and decodes its result into cache changes. A prepared operation includes its request fingerprint, fetched-field coverage, commit-field coverage, and reconciliation metadata. The transport receives the prepared request and an AbortSignal; the core never needs to understand its wire representation.

Decoded changes distinguish field writes, structural nulls, membership replacements, deletions, and field failures. The core applies them through one commit path with scope and concurrency checks. A future event source uses that same path.

Adapter capabilities describe supported operations: selectable fields versus whole-resource reads, identity availability, and optional event/version support. Implement only the distinctions exercised by the GraphQL source and contract tests initially. Unsupported operations fail clearly; adapters must not silently change a narrow update into a destructive full replacement.

Only implement the GraphQL adapter and a deterministic fake adapter initially. Use the fake to demonstrate that the core can process a whole-resource response and a pushed patch without GraphQL-specific code. This tests the boundaries without building REST or WebSocket products prematurely.

## Definition composition and developer API

All layers use one immutable definition model. A definition describes a path, arguments, selections, source binding, and inherited policies. Binding it to argument values produces access to scoped state. Consumer selections project that state; they do not own separate copies.

| Layer                | Role                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| Client configuration | Source registration, transport, default freshness/retry policy, cache scope |
| Domain definition    | Shared paths, selections, mappings, identity conventions                    |
| Feature definition   | Reusable subset or extension for a workflow                                 |
| Consumer definition  | Local selection within the shared domain                                    |
| Operation selection  | Temporary target for invalidation or refresh                                |

Provisional API example; the first milestone will validate names and TypeScript inference before freezing syntax:

```ts
// schema is generated from the demo GraphQL schema.
const invoiceBase = schema.query.billing.invoices.pipe(
  select({ id: true, accountId: true, amount: true }),
);

const billing = { invoices: invoiceBase };

const paymentInvoices = billing.invoices.pipe(
  select({ id: true, accountId: true }),
  extend({ status: true }),
);

// Arguments are attached to the relevant path node, including ancestors.
const variables = {
  billing: { accountId: 'B1' },
  invoices: { status: 'OPEN' },
};

const handle = client.watch(paymentInvoices, variables);
const unsubscribe = handle.subscribe(() => render(handle.getSnapshot()));

await handle.invalidate('accountId');
await handle.invalidate(); // Refresh this handle's declared selection.

unsubscribe();
handle.dispose();
```

Typed field references are preferred for nested paths and reusable policies. A string shorthand such as accountId is type-checked against the definition. The familiar array path ['billing', 'invoices'] may be supported as a typed lookup into registered definitions, not as an unrelated second cache-key scheme.

Composition rules:

- select narrows a consumer view; extend unions compatible selections. Neither mutates the parent.
- A refresh selection is temporary and never edits the default query definition.
- Repeated identical selections are idempotent. Conflicting mappings or argument definitions produce errors rather than depending on merge order.
- Infrastructure bindings and shared execution policies follow global defaults, resource group, then resource overrides. Domain/feature/consumer definitions still compose selections; consumer-specific interests or operation modifiers may vary only where the shared-work contract explicitly permits it. They cannot silently override another owner's retry, identity or authority policy. Only explicitly supplied allowed settings override inherited values.
- Identity and source mappings cannot be silently overridden at a local form. A distinct binding is required if their semantics change.
- Direct field names map to GraphQL by default. An explicit alias changes the application-facing name while retaining the canonical source field address. The proof of concept includes one alias to test this.
- Extensions are validated against schema metadata. A consumer cannot invent a field merely because it exists in an untyped object.

Central registration is the default application convention. Strict enforcement of allowed extensions is deferred until real usage establishes which restrictions help.

### Type safety and setup

Proposed setup is one client provider, endpoint configuration, and one development-time schema-generation command. The generated output supplies selection/argument types and compact runtime metadata for operation generation. Avoid requiring handwritten copies of server interfaces or a separate key-to-query mapping.

Schema generation is optional for consumers. P3.8 supports native JavaScript using runtime SDL and identity configuration, alongside explicit/generated TypeScript schema models for stronger editor checks. Both use the same validated runtime. A schema-less mode remains outside the prototype: arbitrary GraphQL arguments, enum values, and variable types cannot be inferred from field names alone.

Generate valid operations using GraphQL tooling first. Values travel as variables. Validate generated documents against the demo schema in tests. Optimize serialization only if measurement shows it matters. Known unsupported features, including abstract types and advanced directives in the first prototype, must be rejected before transport. [GraphQL queries](https://graphql.org/learn/queries/)

## Identity and cache rules

Three identities have different jobs:

1. State address: source/client scope, canonical resource path, and all relevant ancestor and local arguments.
2. Field address: state address plus nested canonical field path, field arguments, and record identity where needed.
3. Request fingerprint: the generated operation and variables used for in-flight deduplication.

A narrower request changes the third identity without changing the existing state or field addresses. No developer-managed refresh key is required. Canonical serialization preserves nesting and value types, sorts object properties, and preserves list order. It distinguishes omitted inputs from explicit null where backend semantics require it.

Aliases resolve to their canonical fields. Client/account scope is explicit; logout or scope replacement disposes the old cache context and rejects its late responses. Credentials are not embedded in visible cache keys.

The initial store shares data among definitions resolving to the same canonical path and arguments. For lists, records are keyed within that scoped resource. The prototype does not automatically unify an invoice reached through a different root query. Global entity normalization would be a separate decision; the first README must explain this boundary.

### Field invalidation

invalidate(selection) marks the addressed fields stale and, by default, refreshes them when the handle is active. A watch handle is active from creation until disposal, even before a UI listener is attached. Existing values remain readable during refresh. An explicit refetch: 'none' option only marks stale; a refresh(selection) convenience can request immediately without first changing displayed freshness.

The returned promise settles after the requested refresh, rejecting on failure while retaining error state for subscribers. Mark-only invalidation resolves immediately. No-argument invalidation targets the handle's declared selection; broad domain invalidation across multiple argument sets is a later explicit API, never an accidental consequence of matching a string prefix.

After a successful response, only committed fields become fresh. Subscribers receive updates when their projected values or relevant loading/error/freshness metadata change. Adding fields to shared storage does not widen another consumer's declared result type.

A view may therefore contain fields observed at different times. Related fields that must be consistent should be refreshed as a group; Tandrove does not promise a transactional server snapshot from separate reads.

### Merge and failure behavior

An omitted field means no update. A successful explicit null means null. GraphQL errors can accompany partial data; response paths and schema nullability determine which fields failed or whether a structural null invalidates descendants. Do not treat an error-induced null as an ordinary successful refresh or retain children under a parent that has become null. [GraphQL response semantics](https://graphql.org/learn/response/)

Use field generations and request sequence numbers to prevent an earlier request from overwriting a newer write or clearing a later invalidation. An invalidation arriving during an older fetch remains pending until a sufficiently new request resolves. Structural changes also advance the affected subtree's generation. Local ordering prevents client races; it cannot establish cross-client server ordering without server revisions.

Deduplicate identical in-flight reads. Abort work when it has no owners, while preserving a shared request if another consumer still needs it. Include a configurable retention period for inactive cached state and explicit client disposal. These rules must work with injected clocks and fake transports.

### Collections and relationships

Selective list refreshes include record identity, such as id and typename when required by the identity policy. Never merge by array position. Identity conventions come from schema metadata or explicit configuration; GraphQL alone does not guarantee a usable identifier.

Refreshing an invoice field patches matching existing records and preserves list membership and ordering. Unknown returned records are not inserted as incomplete invoices. Missing records are not assumed deleted. Both cases flag membership as potentially stale for an explicit list refresh. A list refresh replaces membership/order and fetches the fields needed for its requested view.

A filtered list can stop returning an invoice precisely because the invalidated status changed. Without a server lookup for that invoice, a narrow list request cannot recover its new status. Keep that record's targeted field stale and report the refresh as incomplete rather than claiming success. The caller can request a list refresh; a future adapter can use an available item lookup without changing this contract.

If reliable item identity is unavailable, reject partial list merging with a useful explanation; permit an explicit whole-list refresh. Do not quietly discard unrelated cached fields. Nested objects with their own identity use that identity; unkeyed embedded objects follow their parent path and structural replacement rules.

Relationships initially follow server schema paths. Client-defined joins, pagination merging, and dependency inference are deferred. A domain may later declare related fields that should refresh together, since business dependencies cannot be inferred from GraphQL shape alone.

## Framework and transport expansion

### Angular first

Provide the shared client through DI. injectStateQuery binds a definition and reactive arguments, exposes data and status signals, and releases its handle on destruction. When arguments change, detach from the old address and attach to the new one; late old responses must not appear under the new selection.

The core subscription API is sufficient for both signals and Observables. Start with signals and demonstrate Angular's existing RxJS interop rather than implementing two state engines. A later RxJS adapter can wrap core subscriptions directly. [Angular interop](https://angular.dev/ecosystem/rxjs-interop)

The demo uses a read-only summary and an editable form. Form values are drafts. Bind fresh server values into pristine controls; preserve dirty controls and expose a conflict indication if their server baseline changes. Use a small explicit demo binding, not a new form framework. Saving performs one mutation, then targeted invalidation after success. Writes are not automatically retried.

The [forms contract](docs/FORMS.md) separates editor-owned baseline/draft/latest values from shared accepted server data and the immutable payload of a pending command. Typing cannot update peers or send writes by default. Explicit Save must preserve edits made while it is pending, distinguish confirmed success from a later refresh failure, and never apply an old outcome to a new scope/record. Reset uses the latest valid server value. Future socket delivery changes the transport, not these ownership rules; authoritative conflicts require server revisions/preconditions. P4.4/P4.5 will test these cases equally for Apollo and Tandrove.

### Plain JavaScript and React

The vanilla examples use the same client and subscribe/getSnapshot contract with explicit disposal. P3.8 verifies native JavaScript and compiled TypeScript consumers against installed package tarballs without a TypeScript runtime. See [examples and adapter limits](docs/VANILLA.md).

A later React adapter can use useSyncExternalStore with stable snapshots and subscription cleanup. This is why immutable snapshot identity and side-effect-free reads belong in the core contract now. SSR snapshots and hydration remain a later feature. [React external stores](https://react.dev/reference/react/useSyncExternalStore)

### REST

A REST source declares endpoint resolution and response field mappings where necessary. GraphQL's direct-name default remains convenient without pretending that an arbitrary REST URL can be derived from every state path.

The future REST source consumes the planned structured selection before GraphQL document generation. It need not generate a GraphQL string and parse it back into REST calls. Any endpoint mappings belong to that source, leaving the default GraphQL flow direct.

Distinguish requested fields, fetched fields, and committed fields. A whole-resource endpoint can return an entire invoice while Tandrove commits only the requested accountId update, preserving the selective-update contract. A configurable whole-resource commit policy may later accept all returned fields; it must also update their freshness and notify their consumers honestly.

Structural nulls, deletion responses, and incompatible identity changes require structural handling even during a narrow request. They cannot safely be hidden by a field mask. The adapter reports those conditions to the core. REST support offers selective state updates; network payload savings depend on server support for sparse fields or equivalent filtering.

### WebSockets and a Node companion

WebSocket is a transport, not a cache model. GraphQL subscriptions and a custom REST-plus-events protocol can both feed decoded changes into the core's commit path. Keep the event source separate from ordinary request execution so one connection can serve multiple field interests.

Future event envelopes need scoped resource/record identity, change kind, affected fields, and revision or sequence metadata where available. Support explicit patch and invalidate events; invalidation can trigger a normal read when an event carries no data. Reconnect must detect gaps or conservatively mark affected state stale and fetch a new baseline. Deduplicate replayed events, define deletion and list-membership events, and bound queued work.

The core can run in Node without an Angular or browser dependency. A server companion would be a separate package for publishing events and sharing generated definitions; it is not required for the GraphQL prototype. Server authorization remains server-owned. SSR use must create an isolated client per request/session rather than share a global cache between users. Persistent server caching and distributed coherence need their own later design.

Support official default transports and optional integrations with infrastructure developers already own. A Socket.IO adapter must bind an existing client connection or server namespace, use Tandrove-specific handlers without interfering with unrelated traffic, and follow the same provider/group/resource pattern on both sides. Socket.IO has its own protocol and is not wire-compatible with plain WebSockets. Its reconnection/recovery features should report into Tandrove rather than compete with a second transport reconnect loop. Transport recovery may fail; Tandrove still owns state-level baseline/replay reconciliation. [Socket.IO protocol](https://socket.io/docs/v4/), [connection recovery](https://socket.io/docs/v4/connection-state-recovery/)

## Stream cohesion, ordering, and offline recovery

Added October 19 and expanded October 20, 2026. P5 is complete; first publish the useful client foundation through R1, then deliver the capabilities below in independently usable releases. Full implementations are tracked as A1/A2 and E1–E4 in [the task list](docs/TASKS.md). These goals should reduce application-owned coordination, with explicit limits on what the client can infer.

### E1 Real-time stream cohesion

Problem: HTTP reads, subscription messages, and custom events often require separate application logic to locate shared state, merge updates, and keep views synchronized. The desired workflow is one reusable source binding into the same validation, ordering, commit, and notification path used by reads.

Apollo already supports subscriptions and caching. Its `subscribeToMore` documentation includes `updateQuery` for incorporating newly added list items; that does not mean every update to an existing normalized entity requires a reducer. Compare Tandrove against ordinary normalized entity updates as well as list insertion/removal and custom event envelopes. [Apollo subscriptions](https://www.apollographql.com/docs/react/data/subscriptions), [Apollo normalization](https://www.apollographql.com/docs/react/caching/overview)

Tandrove should decode and validate a declared event envelope into scoped canonical addresses, record identities, affected fields, and an explicit change kind. The adapter owns protocol parsing and any reusable envelope mapping. Core applies those changes and notifies interested consumers; UI components should not rewrite cached query trees. Stable addresses do not identify the meaning of arbitrary payloads automatically. With path-scoped storage, an entity-only event also needs a declared routing/invalidation policy for affected resource paths and argument sets; global entity fan-out is not implied.

Acceptance: an HTTP-loaded view and two consumers receive a field push with no component-level reducer; unrelated fields remain unchanged. List membership uses explicit insert/remove/replacement semantics or invalidation when filters cannot be evaluated safely. Duplicate events, reconnect gaps, malformed envelopes, source errors, scope changes, and final-owner cleanup are tested. A bounded reconnect policy resumes from a cursor or refreshes a baseline. No network operation or persisted event may cross an authorization scope. Use one real GraphQL subscription example and one fake custom event source before claiming transport independence.

Expanded direction from the user, October 20, 2026: support two configurable event modes over WebSockets or server-sent events (SSE). **Invalidation notices** carry scoped resource/field targets and version or opaque invalidation tokens; they mark cached data stale without forcing an immediate fetch. A page that later needs those fields reacquires them automatically. **Data updates** carry validated replacement values or explicitly supported deltas and update interested consumers through the common commit path. Applications may mix the modes by resource, or use ordinary client-triggered acquisition/invalidation with no stream or server companion.

An invalidation hash is a routing/equality token, not necessarily an ordered revision or proof that a cache is current. Define how notices for inactive/evicted resources are retained within bounded storage and how reconnect gaps trigger baseline validation. An offline client cannot learn about missed changes without replay, a revision handshake, or revalidation. Data updates require the E2 ordering contract, explicit deletion/list-membership semantics, and safe fallback to invalidation when an adapter cannot provide a complete update.

Active demand drives ingestion and recovery priority. Mounted views, background services and pending commands may all own interests; visibility is an optional framework-provided priority signal, not the sole definition of need. Aggregate interests per scoped resource/selection and reflect them in server subscriptions where supported. On recovery synchronize active/high-priority dependencies first. Inactive cached state may keep bounded invalidation/version metadata or be marked for revalidation on reuse; evicted state reacquires a baseline. Hiding one view must not suspend another owner. Never advance a resource's applied checkpoint merely because its updates were skipped; an expanded selection needs coverage-aware catch-up or a baseline.

Reconnect distinguishes delivery cursors from authoritative data revisions. The server may replay retained changes, send current replacement values for the selection, or require a baseline if history/coverage/epoch is incompatible. Revision numbers alone cannot reconstruct a diff: replay requires retained events, historical snapshots or sufficient change metadata. Establish the baseline and resume point coherently, buffering or replaying concurrent changes so the snapshot-to-stream handoff has no gap. Bound buffers and trigger resynchronization rather than silently dropping required predecessors. Retained history can expire; baseline fallback is a required successful path. [etcd historical watches and compaction](https://etcd.io/docs/v3.6/learning/api/)

The October 20 discussion establishes this direction. E1.0 still calls for a concrete protocol/defaults review and notification before implementation; do not repeat an open-ended vision discussion or treat these planned capabilities as implemented.

### E4 Adapter-based server event companion

Plan a separate optional server package that translates committed server changes into the same invalidation/data envelopes. Input adapters may consume explicit business-logic events, database change feeds, or another subscription system. Delivery adapters handle WebSocket, SSE, or another supported channel; database drivers and connection servers stay outside portable core.

Server bindings must declare how a change maps to scoped resource paths, arguments, record identities, and affected fields. Database rows alone cannot reliably identify computed GraphQL fields, filtered memberships, or authorization-dependent projections. Allow shared/generated definitions and reusable mapping hooks; use invalidation when the server cannot safely compute the affected projection.

Publish committed changes rather than rolled-back intermediate writes. Specify event identity, authoritative revision coverage, connection authorization, tenant routing, replay/gap behavior, and backpressure. Where losing an event between database commit and publication is unacceptable, evaluate a transactional outbox or durable change feed rather than promising atomic delivery from an ordinary callback. A database change does not authorize broadcasting its raw row to clients; subscriptions must enforce server-owned access rules.

Developers choose per resource whether an authorized database change projection may feed delivery directly or must pass through business logic. Reverse flow is local draft → explicit command → server authorization/validation → committed database change → acknowledgement/event → accepted client state. Immediate, debounced and Save-button submission are configurable policies; typing is not inherently a shared-state write. Online commands need operation identity, declared revision preconditions/conflict outcomes, and acknowledgement/event-echo correlation. Durable offline replay is a separate E3 capability.

Multi-instance operation must support reconnecting to a different process or physical server without session affinity for state correctness. Shared history/checkpoints or a recoverable authoritative baseline must be accessible to that instance; process-local counters are insufficient. Transport-specific load-balancer routing requirements may still apply. Plan injectable Redis integrations using the same global/group/resource bindings: shared snapshot/checkpoint storage, live event distribution and retained history are separate capabilities that may share infrastructure. Redis Pub/Sub is not retained replay; Streams and persistence settings have different delivery/durability contracts. Neither a shared cache nor a connection adapter automatically supplies transactional business ordering. [Redis delivery semantics](https://redis.io/docs/latest/develop/pubsub/), [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

Acceptance: a business event adapter and a deterministic database-change adapter both drive invalidation-only and direct-update examples without UI reducers. Tests cover inactive-page reacquisition, filtered-list changes, deletes, reconnect gaps, authorization/scope replacement, duplicate delivery, and HTTP fallback. The objective is consistent convergence under a documented revision/delivery contract, not unconditional instantaneous consistency across database, server, and every client.

### E2 Revision-aware ordering across transports

Problem: HTTP responses, poll results, stream messages, and mutation acknowledgements can arrive in a different order from the server changes they represent. Local request generations protect client work, but cannot establish server causality across independent channels.

Use an adapter contract for authoritative revisions or sequence numbers with a declared comparison domain and server epoch. These are data revisions, not package semantic versions. HTTP snapshots and stream messages must provide comparable revisions for an ordering guarantee across transports. Wall-clock timestamps are an optional policy with documented clock-skew and tie limits, never the default basis for an absolute-consistency claim. Opaque equality tokens can support conditional writes without necessarily supporting ordering.

Default to authoritative scalar revisions for a resource or consistency domain; allocation must be coordinated across its server instances. `User_123: v4` is a resource revision, not a vector clock. True vector clocks are an advanced future capability for independent concurrent writers, with explicit conflict reconciliation and metadata bounds. They detect causality/concurrency; they neither choose business-correct winners nor generate graph diffs automatically. Do not require them for ordinary single-authority deployments. [Dynamo versioning](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)

Track revision coverage at the affected field/subtree and list-membership level. A newer update to field B must not cause an older-but-still-needed update to field A to be discarded merely because the record has a higher watermark. Parent nulls, identity replacement, deletion tombstones, and membership replacement need structural revision rules to prevent stale resurrection. Related fields requiring an atomic server snapshot must declare a group; independent field freshness does not imply transaction consistency.

Distinguish absolute replacement values from dependent deltas. A replacement snapshot may supersede older values; an increment or patch requiring revision N cannot skip missing revisions safely. Use base revisions, bounded buffering, deduplication, and gap-triggered resynchronization. Equal revisions with different contents and incomparable epochs are protocol conflicts to report, not arbitrary last-arrival winners. Define explicit behavior for unversioned sources; do not let an unversioned response silently overwrite revision-protected state.

Acceptance: revision 12 arriving before revision 11 cannot be rolled back on overlapping fields, regardless of transport. Duplicate events are idempotent; independent fields can recover; missing delta predecessors trigger resynchronization; stale snapshots cannot resurrect deleted records. Reconnect and server-epoch changes require an authoritative baseline. Drops and conflicts expose diagnostics without spurious UI updates. The guarantee is no regression within the declared revision contract, not absolute distributed consistency. Server-side conditional writes remain necessary for write conflicts; version-based optimistic concurrency is an established pattern. [AWS concurrent-update guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html)

### E3 Framework-independent persistence and offline recovery

Problem: applications repeatedly build storage, restore, reconnect, and pending-write logic around their state library. The goal is a reusable persistence/recovery layer with the same scoped state model across Angular, plain JavaScript, and later React.

Separate cached-data persistence from a durable outgoing command queue. Apollo already documents cache persistence and rehydration through `apollo3-cache-persist`; compare equivalent capabilities instead of presenting persistence itself as new. [Apollo persistence](https://www.apollographql.com/docs/react/caching/advanced-topics#persisting-the-cache)

Composition methods or pipe syntax do not automatically form a serializable transition journal. Define explicit versioned data records for checkpoints, confirmed changes, and pending commands. Never serialize closures, subscriptions, framework objects, or transports. An asynchronous storage adapter keeps IndexedDB and browser APIs outside core. If a localStorage adapter is offered, give it an explicit size/serialization limit rather than assuming equivalent transactional capabilities.

First persist selected cached data with scope, schema/codec version, field presence/null distinctions, freshness, revisions, and membership metadata. Restore atomically, validate/migrate older schemas, handle quota/corruption/storage failures, and coordinate hydration with incoming reads/events so an old checkpoint cannot overwrite live state. Apply an explicit revalidation policy on reconnect. Persistence is opt-in by data policy; isolate users/tenants and clear or segregate persisted state and pending work when authorization changes.

Then add a separate opt-in outbox for commands explicitly declared replayable. Record operation ID, scoped target, payload, base revision/preconditions, dependencies, and delivery/acknowledgement state. Keep optimistic drafts distinct from confirmed server state. Safe retries after ambiguous acknowledgements need server-supported idempotency within its documented retention contract; client replay alone cannot promise exactly-once effects. Conflicts, expired credentials, unsupported schema changes, and expired idempotency windows require reconciliation or an explicit blocked state. Keep business-specific resolution pluggable. [Stripe idempotent-request contract](https://docs.stripe.com/api/idempotent_requests)

Acceptance: identical checkpoints restore correctly into plain TypeScript and Angular consumers; framework hydration stays adapter-owned. A crash between command delivery and acknowledgement cannot silently duplicate the server effect when replay uses the agreed idempotency contract. Duplicate stream echoes are reconciled, old checkpoints cannot overwrite newer events, user switching cannot replay another user's commands, and multi-tab ownership prevents competing replay workers. Document recovery limitations and preserve pending work when recovery fails.

### Product evaluation and priority

E1 and E2 together are the strongest near-term expansion hypothesis for applications combining live streams and requests. Measure application declarations/handlers, list-policy code, reconnect behavior, dropped stale updates, and correctness under reordered delivery against an equivalent Apollo setup. E3 could broaden appeal for PWAs and intermittently connected applications, but carries a larger storage and mutation-consistency scope; deliver persistence before durable writes. These capabilities are not individually unique. Desirability depends on demonstrably reducing coordination code while preserving predictable behavior, supported by working examples and failure tests. None is required to publish the first experimental release unless a later release decision explicitly adds it.

## Polling and retry policies

B6 implements field polling through the same planner and commit path:

```ts
const stop = invoices.poll({ target: 'status', everyMs: 10_000 });
// stop() or handle disposal releases this owner's polling interest.
```

Use explicit milliseconds. Group identical state-and-field polling interests; the fastest active requested cadence wins, returning to a slower cadence when the faster owner leaves. Keep distinct field groups separate initially rather than fetching all fields at the fastest interval. Do not overlap a poll with an equivalent pending read or create a queue of missed ticks. Stop when the last owner releases the interest. Optional browser visibility policy belongs outside the portable core.

Intervals inherit through global/group/resource defaults but require an explicit owner registration. The interval restarts after shared read/retry settlement; polling preserves ordinary field-refresh semantics without implicit list replacement. The [polling guide](docs/POLLING.md) defines disable behavior, scheduler failures, shared coverage and Angular binding lifetime. B6 is pending a batched release and is absent from alpha.5.

Proposed read defaults are two retries after the first attempt, exponential backoff with jitter, and a bounded timeout. Retry transient transport failures and configured retryable responses; do not automatically retry schema/validation errors, authorization failures, cancellations, or ordinary business errors. Global defaults are inherited and overridable. No automatic write retries without an explicit idempotency contract.

P3.7 implements client-level bounded attempts and injected retry scheduling. GraphQL defaults to two additional attempts for explicitly classified transient transport failures; portable core requires an injected scheduler to enable retries. Stage B adds opt-in shared request deadlines, field freshness expiry and inactive cache retention with inherited policies. Narrower retry overrides remain follow-on work. One deduplicated request has one immutable retry policy; introducing narrower retry overrides later requires a defined rule for conflicting owners. Bounded attempts alone do not bound how long an individual transport request can remain pending.

Polling and retry timers share a scheduler so a poll does not spawn another retry chain while its previous read is recovering. Field errors coexist with unaffected data. Advanced partial-error retry and combining unequal polling schedules are later optimizations.

## Workspace and implementation sequence

The TypeScript workspace and Node GraphQL fixture are implemented; dependencies are pinned and the library does not depend on the fixture server framework. The repository is now `jchewitt/tandrove`. On October 21 the user selected Tandrove and confirmed securing the `@tandrove` npm scope. The prepublication rename supersedes earlier StateQL package names and release artifacts; see D025 in the decisions log.

```text
stateql/
  packages/
    core/                 definitions, handles, cache, planner, scheduler
    graphql/              schema support, compiler, decoder, HTTP transport
    angular/              DI and signal integration
  apps/
    billing-api/          deterministic GraphQL fixture server
    billing-demo/         Tandrove and Apollo views of the same scenario
  examples/
    vanilla/              core plus GraphQL without Angular
  tests/
    contracts/            fake source, whole-resource and event ingress checks
    scenarios/            shared acceptance scenarios and browser checks
  docs/
    architecture.md
    api.md
    comparison.md
    decisions.md
```

The structure above describes module boundaries, not an exact directory manifest. See the README for current paths and the task list for implemented versus planned capabilities.

| Milestone                         | Work                                                                                                                                  | Completion evidence                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0. Settle the contract            | Review definition examples, identity rules, supported schema subset, schema generation, invalidation defaults, and benchmark workload | Small API examples and executable acceptance specifications ready to implement               |
| 1. Establish Apollo baseline      | Fixture server, central GraphQL fragments, two consumers, narrow refresh query, one save, errors and inspector                        | Same narrow network behavior and shared updates demonstrated using idiomatic Apollo          |
| 2. Build vertical Tandrove slice  | Core plus GraphQL adapter; central definition, subset/extension, scalar and nested invalidation, list identity, vanilla consumer      | Valid generated documents; same scoped cache enriched and updated; race and merge tests pass |
| 3. Integrate Angular              | Signal adapter, reactive arguments, cleanup, demo form and second consumer                                                            | Browser acceptance scenarios pass and no duplicate state engine exists in the adapter        |
| 4. Evaluate the hypothesis        | Compare declarations, coordination code, payloads, request counts, and correctness; test fake alternate source/event ingress          | Written continue, narrow, or stop decision with measurements and tradeoffs                   |
| 5. Add field polling if warranted | Shared polling interests and global/local retry policies                                                                              | Fake-clock tests prove deduplication, teardown, and retry/poll coordination                  |

Milestones 0 through 4 are complete through P5. The following delivery sequence governs future releases; the milestone table above records the original proof-of-concept progression.

## Usable incremental releases

Every release must deliver a complete, documented use case that works without installing a future milestone. Keep standalone HTTP/client operation usable when streaming is disabled, unavailable, or not installed. Future integrations extend the existing runtime rather than replace it with a second cache or impose a server deployment on client-only consumers. Experimental maturity does not mean a placeholder: each alpha needs working installed-package examples, tested limitations and a compatibility/migration policy.

These are capability gates and sequencing, not reserved version numbers or claims of shipped support. Split large stages into smaller releases only when each has its own usable vertical slice. A polling release need not wait for unrelated timeouts, for example. Every release maps to reviewed task chunks, regression checks and a changelog; public API evolution must be explicit even during alpha.

| Delivery stage                                     | Useful result at publication                                                                                                                                                                          | Task coverage and release evidence                                                                                                                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Standalone foundation alpha                     | Usable plain JavaScript/TypeScript GraphQL client and Angular integration: cached reads, selective refresh, composition, retry and ownership behavior. No stream/server/Redis installation required.  | R1 after completed P1–P5. Publish core/GraphQL/Angular as a compatible set; verify actual registry installs, runnable examples and documented supported subset. Local form policy remains a demo, not a published forms framework.                          |
| B. Client lifecycle and configuration              | Add usable polling/timed-cache features and the common provider/group/resource pattern in testable increments. Preserve the default setup and existing resource identities.                           | P6, P7 and A1. Fake-clock tests for stale time, retention and request deadlines; shared-owner policy tests; official plus custom-provider examples and previous-release consumer checks. No server dependency.                                              |
| C. Recoverable live state                          | Optional invalidation/data modes with authoritative ordering, active-demand synchronization, HTTP fallback and a working minimal server companion. Include a validated online command round trip.     | E1/E2 and the matching E4 vertical slice, using A1 patterns. Tunnel/reconnect, baseline-to-stream handoff, missing history, field/membership ordering and acknowledgement/event-echo tests. Both configured streaming and streaming-off examples must work. |
| D. Existing infrastructure and distributed servers | Integrate application-owned Socket.IO connections, multi-instance server operation and Redis capabilities through optional packages. Add REST acquisition as a separately releasable complete source. | A2 and remaining E4 work. Custom adapters require no core edits; reconnect to another instance, borrowed-connection cleanup, scoped replay and browser/server dependency isolation pass. Publish each integration when its own scenario is complete.        |
| E. Persisted reads                                 | Restore scoped cached state/checkpoints across PWA restarts and reconnect safely, with or without streaming.                                                                                          | E3.1–E3.3 plus applicable recovery/isolation tests. Exercise schema migration, corrupted/expired storage and restore-versus-live-update races. No implicit write replay.                                                                                    |
| F. Durable commands                                | Opt-in offline commands with explicit idempotency, preconditions, conflict and uncertain-acknowledgement handling.                                                                                    | E3.4–E3.7 and server command support. Crash/restart, duplicate delivery, expired idempotency windows, scope changes and multi-tab ownership tests; preserve unsaved drafts separately.                                                                      |

The core/GraphQL/Angular names selected for stage A are `@tandrove/core`, `@tandrove/graphql`, and `@tandrove/angular`, initially versioned `0.1.0-alpha.0` on `next`. R1 migrates imports, peers, generated code, fixtures and release checks together. Registry publication, installed-package verification and trusted-publisher configuration remain separate acceptance steps. Server/adapter package names are chosen only when implemented packages are ready.

Batch feature Changesets in an open release PR. A request to continue development does not automatically publish; choose a useful milestone or obtain an explicit publication request before merging the reviewed release PR.

Release acceptance always includes independent review before commit, `pnpm check`, relevant browser/transport recovery scenarios, clean installed-package examples, dependency-boundary checks, and passing hosted CI. Do not publish empty server/adapter packages in anticipation of later hosting functionality. Self-hosted server integration is optional; managed hosting is not a prerequisite or an assumed deliverable. Document the two sides together with parallel setup examples as soon as the server slice ships, including provider registration, groups, overrides, ownership, diagnostics and cleanup.

The long-term server/client product must demonstrate failure behavior as part of its feature, not postpone it to a later robustness release: tunnel disconnection, reconnect to another instance, HTTP response after newer push, replay gaps, duplicate events, server epoch change, inactive-resource return, and command acknowledgement loss. Whether this reduces developer coordination is measured against equivalent existing integrations; no ecosystem-wide uniqueness claim follows from the architecture alone.

## Alpha exit and stable release gates

Stage B is the target scope for the standalone client's alpha exit. Leaving alpha means a beta with a settled public API; declaring stable requires subsequent real-application validation. These gates do not change the current alpha-only publishing policy.

- [ ] Complete P7 timing/retention, A1's client-side configuration and provider ownership, and P6 polling as independently usable, reviewed slices. A1's server examples follow the server release.
- [ ] Review and freeze the intended beta surface: definitions and typed result projections, partial/missing/error states, resource policies, ownership/disposal and the supported custom-adapter contracts. Mark remaining internal contracts clearly; record migration notes for alpha changes.
- [ ] Pass deterministic lifecycle, overlapping-owner, cancellation, retry/deadline and scope-isolation scenarios, plus installed JavaScript/TypeScript/Angular consumers. Preserve default GraphQL setup and client-only operation.
- [ ] Exercise an application beyond the billing demo, including navigation, account switching, failures and long-running sessions. Record larger-schema/record-count, browser memory and lower-powered-device measurements; set evidence-backed acceptance budgets rather than claim scale from the small demo.
- [ ] Complete supported-feature/compatibility documentation, examples, diagnostics and migration policy; resolve critical correctness findings and independently review the beta candidate.
- [ ] Review changes to prerelease validation, Changesets mode and registry tags before enabling beta. Keep prereleases on `next` and test the same reviewed-release automation.

For stable, run a beta validation period driven by the real application's scenarios and issue evidence, resolve release-blocking defects without recurring API redesign, and publish a compatibility/deprecation policy. A separate reviewed change enables stable versions and `latest`; do not merely remove `-alpha` from a manifest. Stable standalone core/GraphQL/Angular can precede optional streaming, server, Redis, persistence, React and hosting releases. Track the concrete work in [Stage B slices and release gates](docs/TASKS.md#stage-b-reviewed-slices).

## Timing and policy contracts

P7 separates three concepts: freshness age of successfully committed field coverage, retention after the final active owner leaves, and the deadline of one shared acquisition request. Expiry preserves cached values; eviction releases inactive state; a deadline settles pending work and aborts the transport/retry wait. One duration must never substitute for another. Portable core receives scheduling capabilities; platform timers remain outside core.

The first slice implements only `requestTimeoutMs`: default disabled, positive integer milliseconds up to 2147483647, with `false` explicitly disabling an inherited value. Resolve defaults → one named group → resource binding. Capture policy values and scheduler methods; compare effective policy values for owners sharing a canonical address. Reject conflicts before attaching a view or starting I/O. Group names never become cache keys. The binding remains immutable while its cached scope exists. B3 ends it on inactive eviction, allowing the same address to acquire a new binding.

The deadline begins when a shared request starts execution, includes all attempts and retry backoff, and is not reset by joining owners. An `ensure()` that needs sequential requests does not gain one combined call-wide deadline. Timeout is terminal for that request; an explicit later `ensure()`/refresh starts a fresh budget. Generation checks protect newer data from timed-out older requests, and cached values remain readable with eligible field errors. Cleanup covers success, failure, timeout, supersession and final-owner/client disposal. Request deadlines are disabled by default to preserve the existing alpha behavior; enable them explicitly.

B2 implements opt-in `requestPolicy.freshness`: independently aged accepted fields/nulls and membership, on-demand or active revalidation, and zero-duration on-demand reuse without loops. Expired membership enables full-caller-selection reacquisition, while narrow-read mismatch still requires explicit list refresh. The portable monotonic clock and precise lifecycle/failure contract are documented in [FRESHNESS.md](docs/FRESHNESS.md). B3 implements opt-in `retentionMs`: disabled by default, zero for immediate final-owner eviction, and positive durations for an inactive reuse window. Reacquisition preserves freshness ages; whole-scope eviction releases cache metadata and permits policy rebinding. See [RETENTION.md](docs/RETENTION.md) for scheduler/failure and ownership rules. Do not expose accepted-but-ineffective configuration keys. B4 now implements optional provider registration, async factories and explicit ownership; capability assignment remains B5. These are not prerequisites of the timing features.

## Acceptance scenarios

| Scenario                                                | Required result                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Two identical consumers mount together                  | One initial read; both observe shared state                                               |
| Feature extends a base definition                       | Parent remains unchanged; compatible fields share underlying storage                      |
| Second consumer needs one additional field              | Existing fresh fields are reused; only missing fields plus identity/context are requested |
| Invalidate accountId                                    | Narrow generated operation; accountId changes, other values/freshness remain unchanged    |
| Invalidate nested user.name                             | Ancestor path and arguments retained; sibling fields preserved                            |
| Invalidate a branch                                     | Defined fields beneath the target refresh; unrelated branches remain untouched            |
| Same field name exists under another path               | No accidental invalidation through substring matching                                     |
| Arguments or client scope differ                        | Separate state; no cross-account values                                                   |
| Alias addresses accountId by another name               | One canonical field and correct response projection                                       |
| Invoices return in a different order                    | Fields merge by identity without reordering the existing list                             |
| New or missing list member appears during field refresh | No partial insertion or inferred deletion; membership flagged stale                       |
| Explicit null, missing field, and partial GraphQL error | Distinct outcomes; no false success or stale descendants under null parents               |
| Older full response arrives after a newer field refresh | Older data cannot overwrite the newer field                                               |
| Invalidation arrives during an earlier fetch            | Earlier completion cannot clear the newer invalidation                                    |
| Refresh fails and later succeeds                        | Last data remains usable; field error clears only after appropriate success               |
| One owner disposes during shared work                   | Other consumer's request survives; final disposal releases work                           |
| Angular arguments switch while loading                  | New view never displays a late response from the old arguments                            |
| Dirty form receives refreshed server data               | Draft is preserved; changed server baseline is visible                                    |
| Fake source returns a full payload for a narrow intent  | Commit coverage preserves unrelated fields                                                |
| Fake event source delivers a patch                      | Same core commit and notification path used without GraphQL dependencies                  |

Use focused unit tests for canonicalization, selection composition, valid operation generation, merge behavior, and scheduling. Use deterministic transport controls for races and fake clocks for retention/retry/polling. Run a small browser suite for user-visible sharing, refresh, form behavior, and cleanup. Type tests must catch invalid fields/arguments and preserve inferred subset types. Prefer these behavioral tests over implementation-mirroring tests.

## Comparison and decision criteria

Use identical fixture data, server delay, failure cases, and consumer requirements. Apollo receives sensible normalization policies and reusable fragments. Include both its standard broad refetch and the narrow-query version that meets Tandrove's payload goal. Keep dependency code, generated code, application declarations, and coordination glue separately accounted for.

Measure network operations and selected fields, payload bytes, application-owned query/mapping definitions, manual merge/update orchestration, and the steps required to add a new refreshable field. Report generation/planning time and browser bundle cost separately; do not claim performance superiority from a contrived loop benchmark or mock delay. Compare serializable outputs for the shared scenarios and explain any differences in scope.

Continue if Tandrove removes repeated narrow-query/key/update wiring, maintains typed composition, and passes the correctness scenarios without routine per-form special cases. A change to one refresh target should not require editing a separate GraphQL document, cache key, and mapping function.

Narrow the project to a compiler/planner layer over an existing cache if that delivers most of the benefit with less maintenance. Stop or redesign if ordinary Apollo helpers provide comparably simple behavior, or if Tandrove's configuration merely relocates the same complexity. A smaller public API is valuable only when its behavior is also predictable.

## Current decisions and next delivery

Confirmed direction: Angular first, framework-independent core, GraphQL first, stable shared state with selective invalidation, centralized definitions with reusable overrides, and an evidence-backed Apollo comparison. P5 recommends continuing the independent runtime as an experiment.

Preserve schema-informed definitions with optional generated types, path/argument-scoped sharing, identity-required selective list updates, active-handle refetch on invalidation, and editor-local drafts. The future product uses consistent client/server provider registration and global/group/resource configuration, with optional acquisition, transport, persistence and server integrations.

R1 is complete: alpha.0 was published locally, and alpha.1 passed the reviewed trusted-publishing workflow, provenance/signature checks and installed-consumer acceptance. B1–B6 implement standalone timing, provider configuration and polling; B7a adds typed partial snapshots through GraphQL and Angular. B4–B7a remain queued for a batched release. B7b's [bounded existing-application trial](docs/trials/hotel/ACCEPTANCE.md) is complete. The hotel application serves as a test harness for Tandrove, with explicit coverage limits and independent technical review. B7c–B7d retain performance/memory evidence and API/documentation readiness work before the planned extensions. The [scale measurements](docs/PERFORMANCE.md) identify PERF-01, large-list refresh latency still requiring follow-up. Intended-device evidence/budgets and the final readiness decision remain open. Completing these features does not automatically authorize beta or a publication.
