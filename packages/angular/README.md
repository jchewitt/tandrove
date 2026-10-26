# Tandrove Angular integration

Experimental Angular Package Format library. `provideTandroveClient(token, create)` owns a typed client at an environment injector's lifetime. `injectStateQuery(parameters, open, { injector? })` owns a query handle, replaces it when reactive arguments change, and exposes readonly state without showing the old snapshot under new parameters.

For externally owned readers, `tandroveSignal(reader, { destroyRef? })` provides readonly signal observation only. It unsubscribes on destruction without disposing the reader or shared client. Owned queries additionally dispose their handles; neither query view disposes the shared client.

The adapter observes the shared core runtime without duplicating fetching, retries, caching, or invalidation. Construct it once outside reactive computations. Form edits remain separate local drafts; observing server state never sends a write.

## Install and compatibility

Installation example for `1.0.0-alpha.6` in an Angular 21 application:

```sh
npm install @tandrove/core@1.0.0-alpha.6 @tandrove/angular@1.0.0-alpha.6
```

Add `@tandrove/graphql@1.0.0-alpha.6` and `graphql@^16.14.2` for GraphQL applications. Angular core `^21.2.25` and exactly matching Tandrove core are peers; the tested baseline is Angular 21.2.25 with RxJS 7.8.2. Older Angular majors are not supported. The package contains ESM JavaScript, optional declaration files and partial compilation metadata; Angular's build processes that metadata normally. It is built through ng-packagr and published from the generated `dist` directory.

The alpha API and extension interfaces may change with documented migrations. Demo form helpers are not exported: form drafts stay local and a save command remains application-owned. No socket, server, persistence or timer package is required. See [release status](https://github.com/jchewitt/tandrove/blob/main/docs/RELEASING.md) before installing a version not yet published.

See the [Angular guide](https://github.com/jchewitt/tandrove/blob/main/docs/ANGULAR.md) and [forms contract](https://github.com/jchewitt/tandrove/blob/main/docs/FORMS.md).

B6 adds synchronous `query.poll({ target?, everyMs? })` on ready owned queries. It delegates to core and returns a stop function; binding replacement and injector destruction release the original handle's interests. Registration does not transfer to a new tenant. See [the polling contract](https://github.com/jchewitt/tandrove/blob/main/docs/POLLING.md). B6 is pending a batched release and is absent from alpha.5.

B7a carries inferred selected data through owned-query signals and templates. Fields remain readonly and optional, and nested structural errors may produce nulls. Existing target-only queries and generic helpers remain supported. See [typed snapshots and migration](https://github.com/jchewitt/tandrove/blob/main/docs/TYPED-SNAPSHOTS.md). B7a is pending a batched release and is absent from alpha.5.
