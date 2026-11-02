# Tandrove Angular integration

Experimental Angular Package Format library. `provideTandroveClient(token, create)` owns a typed client at an environment injector's lifetime. `injectStateQuery(parameters, open, { injector? })` owns a query handle, replaces it when reactive arguments change, and exposes readonly state without showing the old snapshot under new parameters.

For externally owned readers, `tandroveSignal(reader, { destroyRef? })` provides readonly signal observation only. It unsubscribes on destruction without disposing the reader or shared client. Owned queries additionally dispose their handles; neither query view disposes the shared client.

The adapter observes the shared core runtime without duplicating fetching, retries, caching, or invalidation. Construct it once outside reactive computations. Form edits remain separate local drafts; observing server state never sends a write.

## Install and compatibility

Installation example for `0.1.0-alpha.5` in an Angular 21 application:

```sh
npm install @tandrove/core@0.1.0-alpha.5 @tandrove/angular@0.1.0-alpha.5
```

Add `@tandrove/graphql@0.1.0-alpha.5` and `graphql@^16.14.2` for GraphQL applications. Angular core `^20.1.0 || ^21.0.0 || ^22.0.0` and exactly matching Tandrove core are peers. Angular 20.1.0 is the minimum public-API version for `DestroyRef.destroyed`; earlier versions are unsupported. The package is built with Angular 20.1.0/TypeScript 5.8.3 through ng-packagr in partial compilation mode. Installed-package AOT and Zone/zoneless checks cover the minimum and later supported majors; see [the compatibility matrix](https://github.com/jchewitt/tandrove/blob/main/docs/ANGULAR.md#angular-compatibility). It contains ESM JavaScript and optional declarations, and is published from the generated `dist` directory. Previously published artifacts retain their original peer ranges; see [release status](https://github.com/jchewitt/tandrove/blob/main/docs/RELEASING.md).

The alpha API and extension interfaces may change with documented migrations. Demo form helpers are not exported: form drafts stay local and a save command remains application-owned. No socket, server, persistence or timer package is required. See [release status](https://github.com/jchewitt/tandrove/blob/main/docs/RELEASING.md) before installing a version not yet published.

See the [Angular guide](https://github.com/jchewitt/tandrove/blob/main/docs/ANGULAR.md) and [forms contract](https://github.com/jchewitt/tandrove/blob/main/docs/FORMS.md).

B6 adds synchronous `query.poll({ target?, everyMs? })` on ready owned queries. It delegates to core and returns a stop function; binding replacement and injector destruction release the original handle's interests. Registration does not transfer to a new tenant. See [the polling contract](https://github.com/jchewitt/tandrove/blob/main/docs/POLLING.md). B6 is pending a batched release and is absent from alpha.5.

B7a carries inferred selected data through owned-query signals and templates. Fields remain readonly and optional, and nested structural errors may produce nulls. Existing target-only queries and generic helpers remain supported. See [typed snapshots and migration](https://github.com/jchewitt/tandrove/blob/main/docs/TYPED-SNAPSHOTS.md). B7a is pending a batched release and is absent from alpha.5.
