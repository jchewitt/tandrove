# Angular integration

The experimental `@tandrove/angular` package provides readonly observation, environment-owned client providers, and reactive query ownership. Tandrove billing views sit beside the Apollo baseline; see [the demo guide](DEMO.md). Demo-owned form drafts and explicit saves use the same editing policy for both clients; these helpers are not exported by the library.

The installation example targets `0.1.0-alpha.5`, tested with Angular 21.2.25 and RxJS 7.8.2. Use matching Tandrove versions in an Angular 21 application:

```sh
npm install @tandrove/core@0.1.0-alpha.5 @tandrove/graphql@0.1.0-alpha.5 @tandrove/angular@0.1.0-alpha.5 graphql@^16.14.2
```

The current source supports Angular core `^20.1.0 || ^21.0.0 || ^22.0.0`, with an exact Tandrove core peer during alpha. This wider range is pending a batched release; the registry installation above retains its published `^21.2.25` peer. Use reviewed local tarballs for the compatibility/application trial. See [release status](RELEASING.md) before installing a version that has not yet been published.

## Angular compatibility

The minimum is **20.1.0**, where `DestroyRef.destroyed` became public. The adapter uses it to reject observation in already-destroyed component scopes and to clean up reentrant construction. Angular 20.0.0 lacks it; later 20.0 patches mark it internal. Supporting those versions would rely on an internal API, not the documented contract. See Angular's [20.1.0 changelog](https://github.com/angular/angular/blob/20.1.0/CHANGELOG.md) and [public API change](https://github.com/angular/angular/pull/61849).

Build the package with Angular/compiler-cli 20.1.0, ng-packagr 20.1.0 and TypeScript 5.8.3 in partial compilation mode. The billing demo remains on Angular 21. The peer range is based on required public APIs and verified consumer behavior, rather than the demo's patch version. Do not extend it to an untested future major.

CI installs real tarballs in isolated consumers, without peer overrides, at these boundaries:

| Angular | TypeScript | Purpose                                  |
| ------- | ---------- | ---------------------------------------- |
| 20.1.0  | 5.8.3      | Minimum public-API and build version     |
| 20.3.34 | 5.9.3      | Current Angular 20 patch                 |
| 21.0.0  | 5.9.3      | Angular 21 lower bound                   |
| 21.2.17 | 5.9.3      | External application trial version       |
| 21.2.25 | 5.9.3      | Billing demo/current Angular 21 baseline |
| 22.0.0  | 6.0.3      | Angular 22 lower bound                   |
| 22.2.4  | 6.0.3      | Current Angular 22 patch                 |

Each target runs native ESM observation, the Angular behavioral suite in both Zone-based and zoneless modes, component-owned destruction/rejection, provider and query replacement, GraphQL selective refresh, and strict AOT template/declaration checks. Run `pnpm check:angular VERSION` with a version from `scripts/angular-compatibility.mjs`. Angular 22 checks require a Node version supported by Angular 22 (CI uses Node 24's current patch); compatibility does not override Angular's own Node/TypeScript requirements. There is no SSR hydration claim.

## Shared client and owned queries

Declare one typed Angular token for a client configuration. The adapter does not import GraphQL; the application assembles the default GraphQL experience:

```ts
import { inject, InjectionToken, signal } from '@angular/core';
import { createGraphQLClient, type GraphQLClient } from '@tandrove/graphql';
import { injectStateQuery, provideTandroveClient } from '@tandrove/angular';

export const BILLING_CLIENT = new InjectionToken<GraphQLClient>(
  'Billing Tandrove',
);

// Add to application or route environment providers.
export const billingProvider = provideTandroveClient(BILLING_CLIENT, () =>
  createGraphQLClient({ endpoint: 'http://localhost:4100/graphql' }),
);

// During component/service construction; invoices is a central definition.
const client = inject(BILLING_CLIENT);
const tenant = signal('A');
const query = injectStateQuery(
  () =>
    invoices.bind(
      { billing: { tenantId: tenant() } },
      { source: 'billing-api', scope: 'session-A' },
    ),
  (definition) => client.watch(definition),
);
```

`provideTandroveClient(token, create)` creates a client lazily, once per providing environment injector. Descendants share it unless they explicitly override that token. The providing injector disposes it once on destruction. The factory must create a client owned by that injector, not borrow a globally shared instance whose lifetime belongs elsewhere. The typed token determines the factory's required type. Existing applications may use their own Angular providers instead if they manage client ownership themselves.

`injectStateQuery(parameters, open, { injector? })` owns a fresh query handle returned by `open` for each binding. Both callbacks are synchronous. The parameter getter is pure and reads the signals that should select the query; use immutable parameter values. Only those dependencies trigger replacement. It reevaluates a binding when its tracked dependencies invalidate, without deep-equality, debounce, or canonical-address comparison. Core still decides cache reuse and request deduplication. Do not read unrelated signals in the parameter getter.

The handle factory runs untracked in the supplied/current injection context on both initial creation and later replacements. It may call `inject`, or capture a previously injected client. It must return a newly owned handle, never a handle also owned by another query view. Incidental factory reads do not become query parameters. The initial binding opens synchronously and core starts acquisition automatically; subsequent replacements run on Angular's effect schedule. The factory's identity and captured nonreactive variables are not tracked.

The readonly `query.state()` is a discriminated union:

| Status     | Meaning                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`  | Reactive parameters changed and the replacement has not bound yet. No old snapshot or address is exposed.                                                      |
| `active`   | A current handle exists; `stateAddress` and `snapshot` belong to that binding. Its snapshot may still be fetching, incomplete, stale, or carry a read error.   |
| `error`    | Parameter evaluation, opening, or subscription setup failed. `error` is the original unknown value, distinct from a transport error inside an active snapshot. |
| `disposed` | The query view has stopped and exposes no snapshot.                                                                                                            |

An argument change hides the previous snapshot synchronously when state is read, before the effect runs. Reading state never opens a handle or starts transport work. Replacement unsubscribes/disposes the old handle; late responses cannot surface under the new binding. Other core owners can keep shared requests alive. Parameter/factory failures can recover on a later parameter change; they do not automatically retry a failing factory.

`ensure()`, `invalidate(target?, options?)`, `refresh(target?)`, and `refreshList()` forward to the current handle. GraphQL alias/target types remain inferred. Commands reject while the binding is pending/failed or disposed, rather than accidentally acting on old parameters. An already-started command remains tied to its original handle and rejects on that handle's cancellation; it does not migrate to a new account. Use `ensure()` to await acquisition for the initial/current binding; there is no single lifetime-wide `ready` promise.

Destroying the current injection scope, or calling `query.dispose()`, stops its effect and releases its subscription and handle exactly once. The provider's shared client remains alive until the provider scope ends. A manually disposed view stops evaluating parameters. Use the component injector for component lifetime; a root service naturally lives longer. Passing an explicit injector enables creation outside an injection context, using that injector's lifetime. Construct once outside reactive computations.

B6 adds synchronous `query.poll({ target?, everyMs? })` on a ready owned query. It returns an idempotent stop function and throws for pending, replaced-but-not-yet-rebound, or disposed bindings. Polling belongs to the current handle: replacement and injector destruction release its interests, and a new binding requires a new registration. The adapter delegates scheduling to core. See [the polling contract](POLLING.md); this API is pending a batched release and is absent from alpha.5.

## Observe an externally owned reader

```ts
import { tandroveSignal } from '@tandrove/angular';

// During component/service construction, with a reader owned by the caller:
const snapshot = tandroveSignal(queryHandle);
// snapshot() returns the current immutable snapshot.
```

`tandroveSignal(reader, options?)` accepts core's portable `StoreReader<T>` and returns a readonly Angular `Signal<T>`. The reader supplies stable immutable snapshots. The adapter reads synchronously, subscribes, and rechecks to close a possible read/subscribe gap. It adds no fetching, caching, polling, retries, invalidation, or writable state API.

By default, it uses the current Angular injection context's `DestroyRef`. An explicit `{ destroyRef }` allows use outside an injection context. Construct the bridge once per intended lifetime, outside `computed` or effects; reactive-context construction is rejected to avoid accumulating subscriptions. An already-destroyed scope also rejects.

Destroying that scope unsubscribes and leaves the signal at its last observed snapshot. It does **not** dispose the reader, query handle, or client. The caller retains ownership of those resources. A service created in the application injector naturally observes for that application's lifetime, not for each consuming component's lifetime. The readonly signal prevents assigning a different snapshot through the adapter; it does not deep-freeze arbitrary third-party reader values. Tandrove's own snapshots already enforce immutability.

The package has Angular core and Tandrove core peers so the host supplies the shared runtime. It imports no GraphQL or forms implementation. The compatibility matrix above covers the supported majors and their lower bounds. TypeScript declarations preserve the source snapshot type; the runtime remains JavaScript. ng-packagr 20 generates the declaration entrypoint at `index.d.ts`; consumers continue importing from `@tandrove/angular`.

## Packaging and verification

Build with `pnpm build` or `pnpm --filter @tandrove/angular build` after building core. The build uses ng-packagr with Angular partial compilation and produces the Angular Package Format under `packages/angular/dist`. The workspace package points to that output; the build removes those workspace-only paths from the generated package manifest, retaining ng-packagr's exports, module and declaration entries.

Pack the generated `dist` directory, not the source package directory. The initial alpha is prepared for the three-package publication workflow; account setup and actual registry publication are tracked in [releasing](RELEASING.md).

`pnpm check` runs lifecycle/type tests and packs the real APF output. The package check installs it and core into a temporary consumer outside the workspace, verifies native ESM observation/destruction, and compiles a standalone Angular component and its template with `ngc`. It checks declarations, package contents, peers, license, and removal of stale build output. There are no decorated library declarations yet; the partial compiler setting is in place for later DI APIs.

Installed package checks also exercise providers, argument changes, command gating, and handle/client lifetime separation with Angular's real effect scheduler. Node tests use Angular's server testing environment solely as a test harness; SSR hydration is not implemented. Test-only platform and GraphQL dependencies do not become runtime dependencies of the Angular package.

The build follows [Angular's package format](https://angular.dev/tools/libraries/angular-package-format) and its [library compilation guidance](https://angular.dev/tools/libraries/creating-libraries). Lifetime cleanup uses the public [DestroyRef API](https://angular.dev/api/core/DestroyRef).

B7a preserves inferred selected data through `injectStateQuery()` and `tandroveSignal()`. On an active owned query, `state.snapshot.records?.[0]?.data` exposes readonly optional fields, aliases and nested structural nulls. `StateQuery<Target, Result>` and `StateQueryState<Result>` accept a result model while existing target-only APIs remain generic. See [typed snapshots and migration](TYPED-SNAPSHOTS.md); this is pending a batched release and is absent from alpha.5.

## Forms boundary

The signal exposes server snapshots. Editable controls hold separate local drafts; reading a signal never implies sending a command. The [forms contract](FORMS.md) specifies pristine-field refresh, conflict detection, explicit saves, edits during save, and future stream acknowledgements. P4.4 implements those behaviors in the demo. The Angular library exposes observations and owned queries; it does not own form drafts or send writes.

## Optional infrastructure providers

B4's portable [provider scope](PROVIDERS.md) can resolve asynchronous infrastructure during application bootstrap. Pass ready dependencies to the existing synchronous `provideTandroveClient()` factory; do not return a promise from it. Angular owns that client, and the application awaits provider-scope disposal after disposing its consumers. A dedicated async framework lifecycle bridge remains separate work. B4 is pending a batched release and is absent from alpha.5.
