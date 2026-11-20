# P5 comparison and scope decision

Naming update, October 21, 2026: StateQL was renamed to **Tandrove** before publication. The measurements and terminology below preserve the original October 20 baseline; they have not been relabeled or rerun. The current harness uses Tandrove package imports, filenames and report labels and writes new results separately from the recorded baseline.

October 20, 2026. **Continue StateQL as an independent experimental runtime**, scoped to selection-derived field refresh and explicit field/membership reconciliation. The experiment supports a simpler declaration workflow, not a claim that Apollo cannot share narrow results or that StateQL is a general replacement. The next delivery is release preparation for a clearly labeled alpha; polling and real streams remain separate milestones.

## Reproduce the evidence

For the later Angular comparison with two subscribers, loopback HTTP and lists of 100 and 1,000 invoices, see the [matched large-list benchmark](PERFORMANCE-APOLLO.md).

From a clean install, run:

```sh
pnpm install --frozen-lockfile
pnpm compare
```

The command builds the three library packages and writes `.artifacts/comparison/latest.json`, four browser bundles with dependency metafiles, and actual package archives. It does not publish anything. The [recorded result](measurements/p5-baseline.json) uses the P4 implementation at `093fa869d719512aa78ab6d9d05993f5487d0d20` with this P5 measurement harness; `sourceDirty: true` records the uncommitted harness, not a clean tagged release. Run again at a later commit to produce fresh evidence; the command does not overwrite the recorded baseline.

Recorded environment: Windows x64, AMD Ryzen 9 7900X, Node 24.2.0, esbuild 0.28.1, Apollo Client 4.3.4, apollo-angular 14.2.0, GraphQL 16.14.2, Angular 21.2.25. This is one small two-record billing fixture on a developer machine. It is not a production load, browser-rendering, memory, mobile-device, or large-schema benchmark.

## Application-owned declarations and coordination

The harness extracts named TypeScript declarations with the TypeScript parser. Counts are nonblank lines, including internal comments, after CRLF normalization. Read-panel counts include class members only, excluding decorators, imports and templates: Apollo uses inline HTML whereas StateQL uses external HTML. These are reproducible descriptions of this implementation, not complexity scores or a total-lines contest.

| Measured category                                            |   Apollo |  StateQL |
| ------------------------------------------------------------ | -------: | -------: |
| Read documents/fragments or selection definitions            | 49 lines | 12 lines |
| Read-panel class members, including presentation helpers     | 44 lines | 60 lines |
| Form source adapter, including field availability projection | 83 lines | 55 lines |

Apollo's read declarations are two operations (`BILLING_INVOICES`, `INVOICE_ACCOUNTS`) and two reused fragments. StateQL has one central selection plus a derived feature selection. `invalidate('accountId')` generates the narrow operation without a separately authored document. Both require the same three composite identity policies: Billing uses `tenantId`; Invoice and User use `tenantId` plus `id`. StateQL moves that input into schema generation; it does not eliminate identity configuration.

Apollo's hand-authored result/variable types add 35 lines in this baseline. That is a baseline choice, not an inherent Apollo cost: code generation could provide them. StateQL's generated schema module is 54 lines / 1,824 UTF-8 bytes, including types, embedded SDL and identity configuration; its generator script is 29 lines. Generated types are erased, while SDL/schema construction has runtime cost included below. The common `TenantId` type and save mutation are not charged only to Apollo.

Coordination savings are mixed. StateQL's owned-query helper handles subscription/replacement cleanup, but its read panel is longer because snapshots expose generic values and detailed field/resource errors. `text`, `amount` and `userName` narrow values that Apollo's typed result can access directly. The form source adapter is shorter for StateQL, but the draft state machine, command transport and editor are shared: 234 lines of draft policy, 66 of save transport, 105 of editor TypeScript, 69 of editor HTML, and 23 of the two-editor wrapper. Neither client removes that policy.

Setup is not free on either side. The report lists Apollo's 11-line cache factory, StateQL's 18-line client provider, the 26-line Apollo service and the shared 31-line bootstrap separately. They have different responsibilities and must not be added as interchangeable totals. The app controllers also expose different list-refresh/reset controls and are excluded from the declaration comparison. The named source files and declarations in the JSON make those boundaries inspectable.

## Network result

The harness executes each client's emitted operation against a fresh instance of the same GraphQL fixture, advances server data once, and performs a narrow account-ID refresh. Assertions verify the new account ID and preservation of the old amount and user name. This deterministic scenario also runs in the normal test suite. The browser suite separately verifies watcher propagation, isolation and forms behavior over HTTP.

| Client  | Full response | Narrow response | Operations |
| ------- | ------------: | --------------: | ---------: |
| Apollo  |     453 bytes |       235 bytes |          2 |
| StateQL |     453 bytes |       235 bytes |          2 |

These are UTF-8 JSON response-body bytes, excluding HTTP headers and request bodies. Actual emitted documents and variables are retained in the report. The harness uses an in-process Apollo link and StateQL transport with no artificial delay; it does not measure network latency. Both achieve the same narrow network result. A different request document does not imply a second Apollo normalized entity.

## Package and browser cost

The browser rows are independent, minified ESM consumer entry points with ES2022 target, production mode, no source maps/legal comments and gzip level 9. They export usable client/query APIs so the bundler cannot discard them. They are not the demo bundle, which contains both clients. GraphQL, RxJS and other retained dependencies are included. Angular framework imports are external in the Angular rows; their download cost is excluded on both sides.

| Consumer entry                                                   | Minified bytes | Gzip bytes |
| ---------------------------------------------------------------- | -------------: | ---------: |
| Apollo core + HTTP client + fixture documents/cache              |        203,745 |     61,049 |
| StateQL core + GraphQL/HTTP + fixture definitions/schema         |        172,401 |     45,143 |
| Apollo Angular APIs + Angular HttpLink + fixture documents/cache |        213,198 |     62,771 |
| StateQL Angular APIs + GraphQL/HTTP + fixture definitions/schema |        175,503 |     46,219 |

StateQL is smaller in these entries. This does not isolate only the field-refresh feature: Apollo ships a much broader runtime, the exported surfaces differ, and application tree shaking can change the result. Apollo's Angular entry uses its Angular HttpLink, not an extra core HttpLink. Angular AOT linking and actual application templates are not represented by these esbuild API bundles. Use the emitted metafiles to inspect dependencies; do not treat these bytes as a promise for every application.

Separately, actual StateQL package archives measure distribution cost, without dependencies:

| Package     | Archive bytes | Sum of packed input file bytes | Files |
| ----------- | ------------: | -----------------------------: | ----: |
| core        |        20,617 |                         84,933 |    29 |
| graphql     |        14,500 |                         54,645 |    27 |
| angular APF |         7,828 |                         30,776 |     7 |

Those sums include declarations/docs and, where shipped, maps. Manifest rewriting during packing can slightly change unpacked bytes; the script labels this as input-file size. Versions are still `0.0.0`, private/readiness settings are unchanged, and these are local measurement artifacts, not releasable npm packages. The browser totals above are the dependency-inclusive comparison; an installed `node_modules` size comparison is not claimed.

## Planning overhead

Each action receives 100 warmup calls, then nine batches of 200 calls. Values below are the median of batch means, with the minimum and maximum batch means. They are not individual-call percentiles. Imports, initial module evaluation, network, cache commit/projection and UI rendering are outside the timed region. Schema initialization is repeated after warmup, not a measurement of cold application startup.

| Action                                                      | Median µs/call | Batch-mean range µs |
| ----------------------------------------------------------- | -------------: | ------------------: |
| StateQL runtime schema construction                         |          131.1 |         105.2–187.2 |
| StateQL bind definition                                     |            6.9 |             6.3–8.2 |
| StateQL prepare full operation                              |          109.0 |         104.6–128.3 |
| StateQL prepare account-ID operation                        |           83.9 |           80.9–85.8 |
| Apollo cached transform + print predeclared full document   |           26.4 |           25.2–32.4 |
| Apollo cached transform + print predeclared narrow document |           16.6 |           16.2–18.4 |

The operations do different work. StateQL constructs, validates, prints and freezes a new operation; Apollo already has an authored document, uses a cached transform, and prints it. This shows the cost of StateQL's convenience, not a runtime speed ratio. Apollo's actual transport can additionally cache document printing; these rows must not be interpreted as its per-request overhead. StateQL currently validates during source creation and prepares again during execution, so a single `prepare` timing is not the complete watch/refresh lifecycle. There is no operation-plan cache yet. No latency threshold is inferred from this small desktop run.

## Correctness boundaries and decision

Both implementations demonstrate shared narrow updates, scoped tenants, isolated drafts, conflicts, save/recovery and lifecycle cleanup. They do not have identical semantics:

- StateQL field refresh preserves list membership/order and exposes `membershipStale`; explicit `refreshList()` adopts membership. Apollo's baseline incoming list adopts returned order. Neither behavior is universally preferable.
- StateQL owns requested/fetched/committed field coverage, per-field freshness/errors, local request generations and cancellation interests. Those are runtime semantics beyond GraphQL string generation.
- Apollo shares normalized entities across paths according to its identity policies. StateQL shares within the canonical resource path/arguments; it does not offer equivalent global entity normalization.
- At this comparison baseline, StateQL supported a limited schema subset: nested object lists, abstract types, general directive support, pagination, retention timers, request timeouts, authoritative cross-transport revisions and durable offline writes were not implemented. Subsequent B1–B3 work adds opt-in [request deadlines](DEADLINES.md), [freshness expiry](FRESHNESS.md) and [inactive retention](RETENTION.md); it does not rerun these measurements. See [planner limits](PLANNER.md), [acquisition](ACQUISITION.md) and [concurrency](CONCURRENCY.md) for current constraints.
- Local request generations do not establish server truth across transports. The in-process push example does not establish production WebSocket/SSE/reconnect correctness. Form reconciliation has no server revision/CAS guarantee.

A planner over an existing cache remains a credible alternative: it could remove the extra Apollo narrow document. It would still need metadata and coordination to preserve StateQL's field freshness, commit coverage and separate membership semantics. The evidence is enough to continue the independent runtime as a bounded experiment, while retaining that fallback if the extra semantics do not justify maintenance cost in real usage. There is no demonstrated need to redesign the execution boundary.

Before broader adoption, prioritize typed runtime result projection, representative larger-schema/list measurements, plan reuse without stale argument/identity bugs, and retention/timeout lifecycle contracts. Record these as follow-up work, not completed optimizations. P6 polling is supported by this continue decision; E1 streaming still requires the promised user discussion. R1 can now prepare a three-package alpha with explicit compatibility/support limits and complete the multi-package publishing pipeline before registry publication.
