# Experimental npm releases

## Current release status

Alpha.5 added B3 [inactive retention](RETENTION.md) and passed [publication run 39811333394](https://github.com/jchewitt/tandrove/actions/runs/39811333394) on its third attempt after two GitHub API failures before publication. All three exact registry artifacts, installed consumers, signatures and provenance matched tagged commit `dd85771d92d0174ee501223a928e758dc873f1a0`. Alpha.3 added shared deadlines and alpha.4 added [freshness expiry](FRESHNESS.md). This checkout adds B4 [providers](PROVIDERS.md), B5 [resource configuration](CONFIGURATION.md), B6 [polling](POLLING.md) and B7a [typed snapshots](TYPED-SNAPSHOTS.md), pending a batched release through their Changesets; these APIs are absent from alpha.5.

Per the October 22 user direction, merge independently reviewed feature PRs and accumulate Changesets in the open bot release PR. Do not publish every small change or automatically merge that PR after a request to continue development. Choose a useful release milestone or obtain an explicit publication request first. Existing automation already supports this: feature merges update the candidate, while the reviewed release-PR merge triggers publication.

The first complete bot-maintained release, **0.1.0-alpha.2**, passed [automatic publication run 39666554993](https://github.com/jchewitt/tandrove/actions/runs/39666554993) on October 21. [Release PR #29](https://github.com/jchewitt/tandrove/pull/29) was generated and refreshed by the bot, independently reviewed, approved on its final revision, and merged after all four CI checks passed. Its merge automatically created the annotated `tandrove-v0.1.0-alpha.2` tag at `13e1fa93d419f1f7020c36b51e43e3e942dd8c7b` and published all three packages to `next`. Exact artifacts, registry-installed JavaScript/TypeScript/Angular consumers, signatures and provenance attestations passed on the first workflow attempt. All three provenance statements identify that merge commit and `publish.yml` run. No manual publish dispatch or npm login was needed.

[Implementation PR #28](https://github.com/jchewitt/tandrove/pull/28) passed independent review and hosted CI. Its ordinary merge correctly skipped publication while creating the release PR. A second bot run reused that PR; its refreshed signed commit required fresh CI and approval. GitHub's separate approval-required PR event has no jobs; the explicitly dispatched CI provides the four required checks. Repository Actions permissions allow PR creation, with default workflow permissions still read-only. Use the [reviewed release process](#subsequent-reviewed-releases) below for future versions.

All three `0.1.0-alpha.0` packages were published locally and passed exact-artifact verification and isolated npm installation checks on October 21. They have no CI provenance. The first trusted release, `0.1.0-alpha.1` (tag `tandrove-v0.1.0-alpha.1`), is published and verified through [GitHub Actions run 39658759688](https://github.com/jchewitt/tandrove/actions/runs/39658759688). Attempt 1 published all three with provenance but encountered install-index propagation lag; attempt 2 verified identical artifacts without republishing and passed all registry consumers and signature/attestation checks. The bootstrap instructions below document the completed alpha.0 process; do not run them again for alpha.1.

Publication preflight checks direct version endpoints to detect accepted versions. Post-publication and read-only verification wait up to 20 minutes for the npm installation index, checking every 30 seconds without repeating uploads. Registry consumer installs revalidate cached metadata with `--prefer-online`. A missing or wrong `RELEASE_TAG` reports the expected value. Set it in each terminal session. Registry installation checks also run `npm audit signatures` against locked isolated installs to validate registry signatures and available provenance attestations. The CI publication path separately requires provenance metadata for every Tandrove package.

Tandrove is the library previously developed as StateQL. The user secured the `@tandrove` scope before any package publication. The GitHub repository is now `jchewitt/tandrove`, including repository metadata and trusted-publisher settings. The older `stateql-v0.1.0-alpha.0` tag and its saved tarballs are superseded preparation artifacts: do not publish them. Use only the new `tandrove-v0.1.0-alpha.0` release set below.

The first release candidate is **0.1.0-alpha.0** for `@tandrove/core`, `@tandrove/graphql` and `@tandrove/angular`, published in that order to **next**. These are functioning standalone libraries; server companions, streaming and hosting are not prerequisites. Publication and npm account setup remain separate from preparing and reviewing the candidate.

All three packages ship ESM JavaScript and optional TypeScript declarations. Core has no framework/platform dependencies. GraphQL requires GraphQL 16.14.2 or a compatible 16.x release. The next batched Angular release widens its peer range to `^20.1.0 || ^21.0.0 || ^22.0.0`; existing registry releases retain `^21.2.25`. Matching Tandrove core alpha versions remain required. Angular is built on 20.1.0 and its installed-package matrix tests supported-major boundaries in Zone/zoneless modes with AOT compilation. Node tooling requires Node >=22.14.0; Angular 22 consumers require Angular's newer Node baseline. Release CI uses Node 24 and pnpm 10.18.2. See the [GraphQL subset](PLANNER.md#supported-boundary), [JavaScript examples](VANILLA.md), [Angular integration](ANGULAR.md) and [comparison](COMPARISON.md).

The alpha supports shared caching, generated GraphQL reads, field/branch invalidation, explicit list refresh, local request race protection, bounded read retries, shared deadlines and Angular observation/query ownership. B2 adds opt-in freshness timers and revalidation, and B3 adds inactive-cache retention. Snapshot payloads are immutable JSON projections. Low-level source/ingest interfaces remain provisional. Forms draft helpers belong to the demo, not the public library. Interval polling is implemented on main and pending a batched release. Real socket delivery, server revisions, persistence, offline writes, React and production REST/server adapters remain planned. Alpha changes may break APIs; each release must document changes and migration requirements. Keep dependent Tandrove packages on the same tested alpha.

Follow the [usable incremental release gates](../PLAN.md#usable-incremental-releases). Publish integrations only with runnable behavior and installed-consumer acceptance, while preserving standalone client usage.

## First publication: account-owner handoff

No new clone is required when using the prepared checkout. From another computer, clone `https://github.com/jchewitt/tandrove.git`, fetch tags, check out `tandrove-v0.1.0-alpha.0`, install with `pnpm install --frozen-lockfile`, and prepare the artifacts as below. Use Node 24 and pnpm 10.18.2.

1. Sign in to npm with an account authorized to publish public packages in `@tandrove`. If this is an organization scope, its owner must grant that access. Enable account 2FA. Scope selection alone does not prove ownership.
2. In your own terminal, run `npm login --registry=https://registry.npmjs.org/` and `npm whoami --registry=https://registry.npmjs.org/`. Complete npm's browser/2FA prompts; never put credentials in Git or chat.
3. Use the reviewed tagged checkout and prepare the release. PowerShell commands from the repository root:

   ```powershell
   $env:RELEASE_TAG = 'tandrove-v0.1.0-alpha.0'
   pnpm release:prepare
   ```

   This runs release preflight and the full checks, then writes tarballs and their source revision/SHA512 manifest to `.artifacts/release/tandrove-v0.1.0-alpha.0/`. Preparation does not publish. If the handoff already prepared this directory at the same clean commit, use those artifacts.

4. Publish the reviewed artifacts interactively:

   ```powershell
   pnpm release:bootstrap
   pnpm release:verify
   pnpm pack:check --registry
   ```

   Bootstrap checks every existing registry version before publishing any missing package, then publishes core, GraphQL and Angular in dependency order with public access and the `next` tag. Complete any npm 2FA prompts. This is the step that makes the packages public. It publishes the saved tarballs; Angular uses its built APF output, never the source workspace directory.

5. Return the command outcomes. `release:verify` checks registry versions/integrity; `pack:check --registry` installs the exact alpha versions from the public registry in isolated JavaScript, TypeScript and Angular consumers, without substituting local tarballs. Until both checks pass, R1 registry acceptance remains open.

The first local publication does **not** have GitHub build provenance. Do not describe it as OIDC-published or attempt to republish the same version through CI. Later versions use the trusted workflow and provenance. Never publish a `0.0.0` scaffold just to create package settings.

npm also supports [staged publishing](https://docs.npmjs.com/staged-publishing/) for new packages, with a public `0.0.0-stage` placeholder and separate approval. This release uses direct first publication of the tested alpha; staging is not a hidden step in these scripts. See [npm's public scoped-package instructions](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

## Trusted publishing after bootstrap

In npm's Settings → Trusted Publisher for **each** of the three packages, choose GitHub Actions and enter:

| Setting              | Value                                |
| -------------------- | ------------------------------------ |
| Organization or user | `jchewitt`                           |
| Repository           | `tandrove`                           |
| Workflow filename    | `publish.yml`                        |
| Environment name     | `npm`                                |
| Allowed action       | Direct publishing with `npm publish` |

The GitHub environment `npm` has been created in `jchewitt/tandrove`. A required reviewer can be configured by the repository owner if desired. No npm token secret is needed. The default stage-only permission in newer npm settings is insufficient for this direct-publish workflow.

Configure trust when the next reviewed alpha is ready: npm currently requires a newly configured publisher to complete its first successful publish within **two days**, or it must be recreated. Do not manufacture or republish an existing version merely to validate trust. Check these settings against [npm's current trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/) when setting them up. The workflow's npm 11.6.2 and Node 24 exceed the documented minimum versions.

## Subsequent reviewed releases

1. Add a Changeset with package changes and merge the reviewed feature PR. Keep prerelease mode `alpha` active. **Maintain release PR** runs on `main` and maintains one `changeset-release/main` PR, using `pnpm version:release` to generate matching versions, changelogs, exact internal peers, the lockfile and installation examples. No npm publication occurs in this workflow.
2. GitHub repository Settings → Actions → General must allow GitHub Actions to create pull requests (the setting is named “Allow GitHub Actions to create and approve pull requests”). The workflow never approves or merges its own PR. It uses the repository's temporary token, not a PAT or npm token. Because token-created events do not reliably start ordinary CI, it explicitly dispatches `ci.yml` on the generated branch.
3. Review the generated release PR and its exact current revision. All three Linux/Windows verification jobs and Angular browser scenarios must pass. Obtain independent code review and a GitHub approval from an owner, member or collaborator before merging. An updated bot commit requires fresh approval. Unresolved maintainer change requests block publication. Stable versions and `latest` require a separate policy change.
4. Merge that reviewed PR into `main`. **Publish experimental Tandrove** detects the package version change, verifies the merged bot PR, current-head approval, required CI checks and the version-file allowlist, then creates the annotated `tandrove-v<VERSION>` tag on the exact merged commit. Existing tags must already identify that commit; they are never moved. Manifests are already committed to `main` when publishing starts; publication does not create a follow-up version commit.
5. The same `publish.yml` workflow installs locked dependencies, runs `release:prepare`, publishes the saved tarballs with OIDC/provenance, verifies registry integrity, and runs `pnpm pack:check --registry` for clean installed consumers. The trusted publisher remains `jchewitt/tandrove`, `publish.yml`, environment `npm`. Check all three packages before announcing the release.

Ordinary pushes without package version changes skip publication. Direct version changes outside the bot release PR fail the automatic gate. The gate is independent of branch protection: merging an unapproved release PR does not authorize publication. It cannot undo a premature merge; configure branch rules separately if merge-time enforcement is wanted. Approving after the merge does not satisfy the gate.

For a failed release, prefer rerunning the original workflow so its source revision stays fixed, even if `main` advances. Manual dispatch remains available for a reviewed tag that already points to the current `main` commit; it is a maintainer recovery path, not the normal versioning flow. It preserves the original tag, exact-source, artifact and registry checks. Never create or move a tag merely to bypass a rejected automatic release.

The guard requires a clean checkout, a version-matching tag contained in `origin/main`, and, in GitHub Actions, a checked-out commit equal to the workflow's `GITHUB_SHA`. This ties provenance to the actual source. Core/GraphQL ship their compiled modules; Angular ships `packages/angular/dist` with partial compilation and matching core peer metadata.

## Failure handling

A network error can follow a successful publish. Preserve the prepared artifacts and run verification before retrying. Direct publication preflight treats only an explicit 404 as absent; installation acceptance also treats a missing version or tag in a valid installation index as pending. Authentication/network failures and malformed indexes stop the operation. Existing versions must match the expected SHA512 integrity, and `next` must resolve to that version and integrity. The CI path additionally requires registry provenance metadata. That metadata check is not cryptographic attestation verification; after CI publication, inspect npm provenance for the source revision and run `npm audit signatures` in a clean installed consumer. An incompatible existing version stops the entire preflight before any further package is published. Never overwrite/delete a version or silently accept different contents.

If some packages succeeded, rerun the same publication command against the same reviewed artifacts. Verified existing packages are skipped; missing ones are published in order. A moved `next` tag stops resumption without changing registry tags. CI uploads artifacts from each attempt for inspection. A CI rerun rebuilds the reviewed source; differing bytes stop publication at the integrity check. There is no automatic cross-run artifact restore. Bootstrap versions without provenance cannot be resumed as CI releases. A content mismatch requires investigation and usually a new reviewed prerelease, not forcing publication. Registry verification does not prove account permissions for missing packages; npm may reject publication and leave a partial set to resume.

Record the actual publication, provenance and clean-install results in release notes. Do not mark registry verification complete based only on local tarball tests.
