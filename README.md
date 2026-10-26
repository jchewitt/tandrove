# Tandrove

[![CI](https://github.com/jchewitt/tandrove/actions/workflows/ci.yml/badge.svg)](https://github.com/jchewitt/tandrove/actions/workflows/ci.yml)

GraphQL-first state management built around composable definitions and selective field refresh.

**Status: experimental alpha published and trusted publishing verified.** Typed definitions generate GraphQL requests and feed a shared record store with stable consumer snapshots. The client reuses cached fields, fetches missing selections over HTTP, supports field/branch invalidation, reconciles keyed-list membership with `refreshList()`, and retains successful fields from partial GraphQL responses with explicit error/null state. Concurrent reads share identical work, protect newer fields from late responses, and cancel when their last interested owner leaves. Bounded retries recover classified transient transport failures. Tandrove's Angular package provides client DI, readonly signals and owned queries with reactive argument replacement. Both demo modes demonstrate isolated form drafts, conflict resolution and explicit saves; the published alpha remains experimental and is not production-ready.

The [P5 comparison](docs/COMPARISON.md) found equal network payloads to a narrow Apollo query. Tandrove derives that query from the central definition, removing a separate authored document. Representative consumer bundles were smaller, but runtime operation generation costs more than printing predeclared documents, and some UI code was longer at that baseline because snapshots exposed generic values. B7a on main adds typed snapshot data without rerunning or changing the historical comparison. The decision is to continue the independent runtime as a bounded experiment around field freshness and explicit membership semantics, with no overall speed or Apollo feature-parity claim. Run `pnpm compare` for the reproducible measurements and limitations.

With a schema-generated invoice definition and client:

```ts
const invoices = client.watch(billing.invoices.bind(variables, scope));
await invoices.ready;
await invoices.invalidate('accountId');
```

The generated request fetches the selected field plus necessary identity/context fields, updates existing shared invoice state, and preserves unrelated cached fields. Central definitions, feature extensions, and consumer selections use one model. GraphQL generation and framework bindings remain separate from the shared-state runtime. See the [supported subset and reconciliation limits](docs/ACQUISITION.md).

## Start contributing

Use Node 24 (CI also checks Node 22.14+) and pnpm 10.18.2. Install pnpm if needed with `npm install --global pnpm@10.18.2`.

```sh
git clone https://github.com/jchewitt/tandrove.git
cd tandrove
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` verifies formatting, strict TypeScript contracts and Angular templates, tooling and API/Apollo/Tandrove integration tests, production builds, and the actual packed library artifact installed into an isolated ESM/TypeScript consumer. Build products and package-check artifacts are ignored by Git.

The library ships JavaScript with optional TypeScript declarations. Plain JavaScript consumers can use runtime GraphQL SDL without generated types or a TypeScript loader. After building, run `pnpm demo:vanilla`, `pnpm demo:typescript`, or `pnpm demo:adapters`. The [vanilla guide](docs/VANILLA.md) explains the examples, editor checks, and the limits of the simulated event adapter.

The [Angular foundation](docs/ANGULAR.md) observes shared snapshots as readonly signals and is checked as an installed APF package with an Angular template consumer. The [forms contract](docs/FORMS.md) keeps local drafts and pending saves separate from server state; both demo modes implement that policy with Angular reactive forms.

Base-readiness validation is tracked in the [application trial](docs/APPLICATION-TRIAL.md), [scale/lifecycle measurements](docs/PERFORMANCE.md) and [API audit](docs/BASE-API-AUDIT.md). Run `pnpm measure:readiness` for the synthetic Node/Chromium harness. The initial baseline identifies large-list refresh latency requiring further work; these measurements do not establish production readiness.

## Run the billing experiment

```sh
pnpm demo
```

Open http://127.0.0.1:4200 for Apollo or http://127.0.0.1:4200/?client=tandrove for Tandrove. The navigation links switch between them with a fresh client cache. Click **Change server data**, then **Refresh account IDs**: both views update while amounts and names stay cached. **Refetch full query** (Apollo) or **Refresh all fields** (Tandrove) updates those remaining fields. Tandrove has a separate **Refresh list membership** control for adopting server order. Expand a request in the inspector to see the actual document, variables, and response size. Ports 4100 and 4200 must be free.

The [demo guide](docs/DEMO.md) explains tenant isolation, forms, save outcomes, failure/recovery, delay, order changes, and the limits of the comparison. The fixture contains synthetic data and local development controls; it is not a production server.

Run the browser regression suite with the demo stopped:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

## Workspace

Run `pnpm demo:planner` after `pnpm check` to inspect generated full and narrow requests. The [planner guide](docs/PLANNER.md) covers schema generation, composition, addresses, and current limitations.

Run `pnpm demo:store` to see shared Tandrove records update two differently selected consumers. The [store guide](docs/STORE.md) explains this first runtime chunk and the execution work still ahead.

Run `pnpm demo:acquire` for actual Tandrove HTTP requests against an isolated fixture, including shared loading, missing-field fetching, account ID invalidation that preserves cached amounts, and explicit list refresh that adopts server order. The [acquisition guide](docs/ACQUISITION.md) documents the API and supported response subset.

| Location                 | Current role                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- |
| `packages/core`          | Shared records, projections, observation, canonical addresses and selections |
| `packages/graphql`       | Schema tooling, operation planner, decoder and HTTP acquisition client       |
| `packages/angular`       | APF package, client DI, signals and reactive query ownership                 |
| `apps/billing-api`       | Local GraphQL billing fixture and deterministic controls                     |
| `apps/billing-demo`      | Apollo and Tandrove views with independent consumers and a shared inspector  |
| `examples/query-planner` | Runnable plain TypeScript operation planning example                         |
| `examples/vanilla`       | JavaScript/TypeScript consumers and fake whole-resource/event adapters       |
| `scripts`, `tests`       | Package/release checks and Angular browser scenarios                         |

Core has no runtime, UI-framework, GraphQL, or platform dependency. The package versions in this checkout are `@tandrove/core`, `@tandrove/graphql` and `@tandrove/angular`, all at `1.0.0-alpha.6`. Publication and npm account setup are tracked in the [release guide](docs/RELEASING.md). Install matching alpha versions together; see the [GraphQL quick start](packages/graphql/README.md) and [Angular integration](docs/ANGULAR.md).

## Plan and delivery

Stage B is underway: the client has opt-in [shared request deadlines and timeout policies](docs/DEADLINES.md), [field and membership freshness expiry](docs/FRESHNESS.md), and [inactive-cache retention](docs/RETENTION.md). This checkout adds [provider registration and ownership](docs/PROVIDERS.md), [global/group/resource assignment](docs/CONFIGURATION.md), and [shared field polling](docs/POLLING.md), pending a batched release and absent from alpha.5. Run `pnpm demo:polling` after building for the JavaScript polling example. The [reviewed task slices](docs/TASKS.md#stage-b-reviewed-slices) and [alpha-exit checklist](PLAN.md#alpha-exit-and-stable-release-gates) track the remaining beta-validation work.

Planned follow-on goals include server-driven invalidation notices and direct state updates, an optional server companion with event/database adapters, revision-aware ordering across transports, and framework-independent persistence/offline recovery. These are roadmap commitments to investigate and validate, not implemented features; see [their contracts, priorities, and limits](PLAN.md#stream-cohesion-ordering-and-offline-recovery).

B7a adds [inferred snapshot data](docs/TYPED-SNAPSHOTS.md) through GraphQL and Angular, also pending a batched release. Selected fields retain their scalar types while remaining safely optional for partial/error states. The remaining base-client work is a real application trial, performance/memory measurements, and final API/documentation readiness review; findings may require further fixes before extensions.

The [incremental release plan](PLAN.md#usable-incremental-releases) keeps every publication independently usable, starting with the standalone client. The planned server companion will share the client's provider-registration vocabulary and global/resource-group/resource-override pattern, with optional integrations such as Socket.IO and Redis. Server/streaming integrations remain planned; installing the foundation will not require them or a hosted service. Recovery after interrupted connections and server-instance changes is part of the future synchronization release's acceptance criteria.

- [Architecture and proof-of-concept plan](PLAN.md)
- [Task breakdown and acceptance criteria](docs/TASKS.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Contribution and review process](CONTRIBUTING.md)
- [npm release process](docs/RELEASING.md)

GitHub Actions checks Linux and Windows. Changesets maintains a release PR with synchronized versions and changelogs; keep it open to batch features until a useful release milestone is chosen. Its reviewed merge triggers tagging and npm trusted publishing with provenance; ordinary merges do not publish. See [release review and recovery](docs/RELEASING.md#subsequent-reviewed-releases). No registry token is stored in this repository.

## License

Licensed under the [MIT License](LICENSE).
