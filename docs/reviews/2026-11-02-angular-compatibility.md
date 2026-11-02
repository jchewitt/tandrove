# Angular public-API compatibility floor

Independent reviewer: `/root/angular_compatibility_review`, November 2, 2026. The reviewer audited the API floor, reviewed the implementation and subsequent fixes, and approved the final code before commit.

The original `^21.2.25` peer matched the initial build/test baseline without evidence that this patch was necessary. Angular 20.1.0 publicly exposes `DestroyRef.destroyed`; 20.0.0 lacks it and later 20.0 patches mark it internal. The reviewer independently verified the official source tags and public feature [#61849](https://github.com/angular/angular/pull/61849). No later API requirement was found in the adapter. The supported range becomes `^20.1.0 || ^21.0.0 || ^22.0.0`, built with compiler-cli/ng-packagr 20.1.0 and TypeScript 5.8.3. No private Angular API fallback or lifecycle behavior change is introduced.

Angular-local imports use extensionless Bundler resolution for the older declaration bundler. Package checks and release guards follow ng-packagr 20's generated `index.d.ts` entrypoint; public package imports remain unchanged. The packed-consumer check installs exact versions with strict peer resolution and tests actual tarballs outside the workspace. A small test import bridge lets the same behavioral tests exercise workspace builds and installed public packages. The reviewer caught and verified the fix for an initial workspace self-import resolution failure.

Validation completed:

- `pnpm check`: formatting, build/codegen/type checks, **444 tests**, and isolated JavaScript/TypeScript/Angular package consumers.
- Seven Angular targets: 20.1.0, 20.3.34, 21.0.0, 21.2.17, 21.2.25, 22.0.0 and 22.2.4. Each passed native ESM observation, strict AOT/template declarations and **25 behavioral tests in each of Zone-based and zoneless modes**. The minimum is checked in the normal package suite; a dedicated CI matrix covers all seven. Angular 22 checks used Node 24.15.0, satisfying its higher engine floor; baseline checks also passed on Node 24.2.0.
- The new component regression exercises a component-owned `DestroyRef`, rendered updates, query replacement, destruction and rejection before subscribing to an already-destroyed scope. Existing environment-injector tests alone would not establish this API boundary.
- The reviewer independently passed **92 tests** (25 per change-detection mode plus 42 release/workspace tests), inspected the matrix evidence and checked peer/build/CI alignment.
- **25 Chromium browser scenarios passed**. Keeping the demo on Angular 21 while building the library on 20 required host Angular path aliases. The first browser run exposed duplicate Angular instances from dev-server prebundling; disabling prebundling only for the private workspace demo resolved it. The reviewer inspected the fix, documentation and successful rerun.

This completes B7b.1a. Broader peers are queued through a Changeset; published alpha artifacts retain their original metadata. The external hotel application's runtime trial, B7 performance/readiness work, and publication remain separate. Hosted CI and merge evidence belong to the feature PR.
