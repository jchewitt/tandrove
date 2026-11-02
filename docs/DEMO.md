# Billing comparison demo

The app includes the completed P1 Apollo baseline and P4.3 Tandrove views against the same ordinary GraphQL schema. The API and demo are private workspace applications, not published npm libraries. P4.4/P4.5 add a shared forms policy and browser coverage for both modes.

## Start and inspect

Use Node 24 and pnpm 10.18.2. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open http://127.0.0.1:4200 for Apollo or http://127.0.0.1:4200/?client=tandrove for Tandrove. Navigation links reload the application with a fresh client cache; server fixtures and the request log persist until reset. The dev command builds the workspace libraries before starting Angular, including on a clean checkout. The Angular dev server proxies GraphQL and fixture-control requests to http://127.0.0.1:4100. Stop both with Ctrl+C. These ports must be available; browser tests also use them and start their own servers.

1. Both panels independently call Apollo Angular `watchQuery` with the same reusable document. One initial HTTP request feeds both subscriptions.
2. **Change server data** advances account IDs, amounts, and user names in the current tenant. It leaves Apollo's cache alone.
3. **Refresh account IDs** sends `InvoiceAccounts`, selecting account IDs and required identity/context fields. Both consumers update; amounts and names retain their previous values.
4. **Refetch full query** refetches active `BillingInvoices` watchers. Amounts and names catch up.
5. Expand inspector rows to see the actual GraphQL document, variables, unique field names, error messages, and UTF-8 response-body byte count. Count includes accepted GraphQL operations, including in-flight operations; rows show the last 100 completed operations in completion order. Fixture controls and inspection requests are excluded. This is network evidence, not a performance benchmark.

## Apollo scenarios

| Control                 | Observable behavior                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant A / B            | Both tenants reuse invoice/user IDs. Cache keys include immutable `tenantId` plus `id`; the mutable `accountId` is never the tenant identity. Switching replaces each subscription and clears its displayed old view. |
| Reverse server order    | The next list response follows server order. Apollo merges entity fields by composite identity, preserving each invoice's correct amount/name.                                                                        |
| Fail next request       | The next accepted GraphQL operation returns HTTP 503 once. A failed narrow refresh leaves cached values intact; retry manually to recover. No automatic retry policy is added to this baseline.                       |
| Delay responses 1s      | Read data is captured before the delay. Switching tenants while an A refresh is pending cannot populate B's view with A's data. Same-tenant response ordering remains a later comparison scenario.                    |
| Unmount / mount monitor | Disposes/recreates that component's own subscription. The other watcher remains active; remount uses the shared cache.                                                                                                |
| Reset experiment        | Resets fixtures, delay/failure settings, server request log, and Apollo cache; active queries reload.                                                                                                                 |

## Tandrove views

In Tandrove mode, the workspace uses `billingInvoices` from `src/data/tandrove-definitions.ts`. The monitor derives a smaller view using `billingInvoices.select({ accountId: true }).extend({ status: true })`. This leaves the central definition unchanged. Both bind the same tenant argument and scope, so they address one shared resource. Identity fields come from generated schema metadata. There is no handwritten narrow GraphQL document or separate cache key.

`provideBillingClient` supplies the environment-owned client. Each `TandrovePanel` uses `injectStateQuery` with reactive tenant arguments and owns only its handle. Two mounted views share the initial read; mounting the monitor later reuses cached fields. A focused integration test also mounts the smaller feature first and verifies that adding the workspace fetches only its missing fields. Changing tenants hides the previous projection and replaces the handle. Unmounting the monitor releases its owner while the workspace continues to function.

| Control                 | Tandrove behavior                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change server data      | Changes fixture values without touching shared client state.                                                                                                                              |
| Refresh account IDs     | Calls the workspace's `invalidate('accountId')`; the generated request contains that field plus identity/context. Both views update while amounts and names stay cached.                  |
| Refresh all fields      | Calls `invalidate()` on the central definition, retaining existing list membership/order.                                                                                                 |
| Reverse server order    | Changes server order only. A narrow field refresh still patches records by identity in cached order.                                                                                      |
| Refresh list membership | Calls `refreshList()` using the workspace's full selection, adopting server membership/order and refreshing selected values.                                                              |
| Fail next request       | A failed read preserves cached values and exposes errors. Both comparison modes use manual retry; the library's default bounded retry policy is disabled only in this demo configuration. |
| Delay responses 1s      | Makes tenant replacement observable. Old requests cannot populate the new tenant's view.                                                                                                  |
| Unmount / mount monitor | Destroys/recreates an owned query; the other view stays active and cached data is reused.                                                                                                 |
| Reset experiment        | Resets the shared fixture then reloads the app, discarding all tenant caches and owners. Starts again at tenant A.                                                                        |

The same inspector displays actual `TandroveRead` documents and response sizes. The app bundles both clients for this lab; its total bundle is not a standalone package-size comparison. Requests/logs from another open tab can affect counts because the fixture is shared. Use one tab and reset before comparing modes. The Tandrove panel handles unavailable/incomplete data and field errors without treating missing values as zero or null. Readonly snapshots remain separate from form drafts; both modes have two independent editors below the read panels.

## Boundaries and comparison

### Network result (October 20)

With fresh tenant-A fixtures, an initial full read followed by one server advance and an account-ID refresh produced:

| Client                                                      | Initial response | Narrow response | Total operations |
| ----------------------------------------------------------- | ---------------: | --------------: | ---------------: |
| Apollo, broad document then `InvoiceAccounts`               |        453 bytes |       235 bytes |                2 |
| Tandrove, central definition then `invalidate('accountId')` |        453 bytes |       235 bytes |                2 |

These are UTF-8 GraphQL JSON response-body bytes from the local inspector, excluding HTTP headers and request bodies, reproduced by the automated P5 harness. They are a small fixture observation, not a latency or throughput benchmark. Both clients achieve the same narrow network result. Tandrove removes the separately maintained narrow query and derives refresh targets from the central definition; schema metadata and its runtime still have costs. See the [completed P5 comparison](COMPARISON.md) for declarations, coordination, generated code, package cost, planning overhead and the decision to continue as an experiment. The shared form policy is needed with either client.

### Try the editors

Below the read panels, type in **Editor one**: neither Editor two nor the shared panels change. Change server data and refresh account IDs: pristine Editor two follows, while Editor one retains its edit and shows a conflict. **Use server value** discards the draft in favor of the latest valid value; **Keep my draft** rebases it for a deliberate Save.

**Save draft** sends one identity-only mutation followed by a targeted refresh. Typing can continue while it is pending. A failed follow-up read displays **Saved; refresh failed** and offers a read-only retry. Known rejection preserves the draft; an uncertain acknowledgement requires a successful explicit refresh and deliberate reconciliation before another write. Empty input is invalid; use **Set null** to clear the field explicitly.

Changing tenant or the editor's invoice selection discards that editor's draft. **Remove INV-1 on server**, then refresh its editor, demonstrates preserved drafts with an unavailable target and disabled Save. Reset restores the fixture. The browser suite uses deterministic response gates to exercise edits, target switches and editor disposal during both mutation and follow-up-read stages.

Central documents and fragments live in `apps/billing-demo/src/data/operations.ts`; cache identity policies live in `cache.ts`. `BillingService` coordinates Apollo operations. `FixtureService` and `RequestInspector` are shared by both modes and own development fixture controls and network evidence. Each `InvoicePanel` owns its watch subscription and cleanup. There is no second application cache or custom merge engine.

Apollo already supports the important narrow-fetch/shared-update behavior. This implementation explicitly maintains a broad document and a narrow document. Tandrove's hypothesis is that one typed definition can derive these operations and refresh targets without that repeated application wiring. This milestone makes no claim that Tandrove is superior or that Apollo lacks normalized updates.

Apollo's default list semantics also adopt incoming membership/order. Tandrove field-refresh semantics preserve membership/order and flag unknown or missing records for a broad refresh. No custom Apollo policy has been added to conceal that difference; the P5 comparison explicitly records it. Read scenarios cover fixed membership and reordering, and forms also exercise removed-record availability; this is not pagination or comprehensive membership parity coverage.

The schema and fixture are isolated from Apollo. The HTTP server binds loopback only, uses synthetic data, limits JSON bodies to 64 KiB, bounds retained request records to 100, and has no CORS support. Fixture controls are unauthenticated development tools; do not expose the server or dev proxy publicly.

## Tests and implementation notes

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

The API suite checks tenant separation, save/null, reset, deterministic request/field failures, error paths, filtering, and malformed requests. The Apollo suite checks document validation, deduplication, independent watcher updates, narrow field coverage, preserved siblings, response size, reordering, tenant isolation, failure recovery, save, delayed scope changes, and owner teardown. Tandrove demo tests exercise the actual central/feature definitions, request coverage, shared addresses, cached siblings, missing-field acquisition, and explicit list refresh. Browser scenarios exercise both Angular modes, the inspector, shared updates, error recovery, monitor remounting, tenant replacement, reset, and mobile width. The same form scenarios run for both modes, including conflicts, edits during save, uncertain acknowledgements, read-only recovery, record removal, and disposal during a post-save read. CI runs the normal suite on Linux/Windows and Chromium scenarios on Linux.

The demo uses Angular 21 with TypeScript 5.9, while the reusable Angular adapter builds on its public-API minimum, Angular 20.1/TypeScript 5.8. The demo's `@angular/*` TypeScript paths resolve linked workspace libraries to the application's Angular version. Dev-server prebundling is disabled for this cross-version workspace demo so prebundled dependencies and inlined imports do not create two Angular instances; normal installed packages resolve the host's peer. Apollo Angular 14 supports the demo combination. Application source and templates stay strict. Only the demo's external declaration checking uses `skipLibCheck`: Apollo Client 4.3.4's incremental-handler declarations conflict with `exactOptionalPropertyTypes`. The portable core retains full declaration checking. Incremental delivery is outside this demo.

Apollo operation result interfaces remain handwritten for the fixed baseline and validated with real schema/response tests. Tandrove uses schema-generated definitions; `pnpm generate:billing` updates the planner example and demo from the same API schema, and `pnpm generate:check` verifies both outputs. No Changeset is needed because this milestone changes private demo applications and tooling, not the public core package.

References: [Apollo Angular setup](https://the-guild.dev/graphql/apollo-angular/docs/get-started), [Apollo normalized caching](https://www.apollographql.com/docs/react/caching/overview), [Angular version compatibility](https://angular.dev/reference/versions).
