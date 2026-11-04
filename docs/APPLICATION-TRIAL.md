# Existing Angular application trial

**B7b status: PASSED for the bounded library integration trial, November 4, 2026.** The public [Angular/GraphQL hotel application](https://github.com/WillSams/example-ts-angular-with-java/tree/3ebd6536c4fc3c47482089d747917beed6802873) serves as an isolated test harness for Tandrove using its real Spring/PostgreSQL backend and unchanged Angular 21.2.17. See the [initial report, source patch, hashes and receipts](trials/hotel/README.md). The [account/save follow-up](trials/hotel/ACCOUNT-RACES.md) adds an opt-in two-account fixture and eight real-server browser race checks. The [work-session follow-up](trials/hotel/WORK-SESSION.md) adds session-owned cross-route retention, 60 frontend tests, nine real-clock retention stages and a 25m10s session with 100 route/preview cycles, three account switches, background periods, offline recovery and three booking/cancellation flows. The unchanged backend fixture previously passed 18 tests. These results test library integration behavior. B7c performance/device work and B7d readiness remain open. No deployment or npm publication was needed.

The November 3 follow-ups exercised two additional parts of B7b.2b.4e. The [reservation membership trial](trials/hotel/RESERVATION-MEMBERSHIP.md) verified narrow field refresh and explicit list reconciliation across confirmed booking and cancellation. The [account switch trial](trials/hotel/ACCOUNT-SWITCHES.md) compared real server and rendered reservation rows across 100 alternating account selections. The [hotel acceptance record](trials/hotel/ACCEPTANCE.md) gives the technical conclusion and explicit coverage limits, including the absent room-edit command. On November 4 the user clarified that this is a library test harness. The earlier separate application-maintainer approval requirement was unnecessary and has been removed.

## Select a compatible feature

Record the application repository/revision, the feature, the test environment and the expected workload. Keep private source references private. Prefer one existing list/detail/edit workflow with two simultaneous consumers, route changes and account switching. Use an isolated application branch and a development/test backend with synthetic or approved test records. The purpose is to test Tandrove in an existing application, without taking ownership of that application's business operations. No separate application-maintainer signoff is required. Keep credentials, customer payloads, proprietary schema and raw browser profiles out of the public Tandrove repository; record sanitized observations and reproducible cases instead.

Preflight before changing the application:

- Use the [Angular compatibility matrix](ANGULAR.md#angular-compatibility): current source supports `^20.1.0 || ^21.0.0 || ^22.0.0`, built on 20.1.0's public lifecycle API. This broader range is pending a batched release and is available in reviewed local trial artifacts; older registry artifacts retain their original peers. RxJS 7.8.2 and GraphQL 16.14.2 remain the trial baselines. Match TypeScript and Node to the application's Angular version. Tandrove tooling requires Node >=22.14.0 and pnpm 10.18.2; Angular 22 has a higher Node requirement. Node 24 is the release CI baseline. Record actual versions. Do not upgrade an unrelated application just to force compatibility.
- Run schema generation/inspection with the SDL the application will actually supply. Validation examines the **whole supplied schema**, including unused types: custom scalars, interfaces/unions, OneOf inputs and custom directives reject. The current planner expects a query root named `Query`. Do not mask an incompatible production schema by silently replacing types with built-in scalars.
- Choose singleton resources or keyed top-level object lists with nested objects and built-in scalar/enum fields or scalar lists. Configure non-null scalar/enum identity fields without arguments. Nested object-list acquisition, unkeyed/null list entries, pagination merging and paths through list items are unsupported. If the feature needs them, record that incompatibility; a fake replacement feature does not establish real-app acceptance.
- Keep existing mutation/business services for explicit saves. Tandrove has no public mutation, form-draft, persistence, offline-write or production stream API. SSR hydration is not supported. See [supported boundaries](BASE-API-AUDIT.md).

## Install exact local artifacts

B4–B7a are implemented on main but absent from the published alpha.5 artifacts. A version string alone cannot identify this trial build. From a **clean, reviewed Tandrove commit**, use the normal checks and pack all three packages into a new directory; preserve its commit and SHA512 hashes. These are local trial artifacts, not release artifacts and not an npm publication candidate.

PowerShell, from the Tandrove repository root:

```powershell
$trialStatus = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $trialStatus) { throw 'Use a clean, reviewed Tandrove checkout.' }
$trialRevision = (git rev-parse HEAD).Trim()
$trialArtifacts = Join-Path (Get-Location) ".artifacts/application-trial/$trialRevision"
if (Test-Path -LiteralPath $trialArtifacts) { throw 'Preserve existing trial artifacts; use their recorded hashes.' }
pnpm check
if ($LASTEXITCODE -ne 0) { throw 'Tandrove checks failed.' }
New-Item -ItemType Directory -Path $trialArtifacts | Out-Null
pnpm --dir packages/core pack --pack-destination "$trialArtifacts"
if ($LASTEXITCODE -ne 0) { throw 'Core packing failed.' }
pnpm --dir packages/graphql pack --pack-destination "$trialArtifacts"
if ($LASTEXITCODE -ne 0) { throw 'GraphQL packing failed.' }
pnpm --dir packages/angular/dist exec npm pack --ignore-scripts --pack-destination "$trialArtifacts"
if ($LASTEXITCODE -ne 0) { throw 'Angular packing failed.' }
Get-ChildItem -LiteralPath $trialArtifacts -Filter '*.tgz' | Get-FileHash -Algorithm SHA512 | Format-List Path, Hash
```

Record `$trialRevision`, all three filenames/hashes, and the check outcome before installing. Angular must be packed from its generated `dist` directory; the source directory is not its publishable artifact. Do not call `release:bootstrap`, `release:publish`, change package versions or move release tags for this trial.

In the application's branch, install **all three absolute tarball paths in one command**, using its existing package manager. For an npm application:

```sh
npm install --save-exact /absolute/path/tandrove-core-VERSION.tgz /absolute/path/tandrove-graphql-VERSION.tgz /absolute/path/tandrove-angular-VERSION.tgz
npm ls @tandrove/core @tandrove/graphql @tandrove/angular
```

Replace the placeholders with the recorded artifacts, quoting paths with spaces; use the equivalent `pnpm add` or `yarn add` for that application's lockfile. Verify the lockfile resolves the three local tarballs, not the registry's same-version alpha.5 or workspace aliases. Verify one compatible core instance is shared. Keep a private copy of the lockfile and hashes with the trial record. Build the application with its usual production/AOT configuration before testing.

## Exercise the real workflow

Use generated schema types and one central definition with a narrower second consumer. Scope the client to the authenticated session, use distinct resource arguments for distinct tenants, and dispose/recreate the client on logout or authorization-context changes. Dynamic headers do not themselves partition cached data. Bind owned Angular queries to their intended component/route lifetime; `tandroveSignal()` alone does not own or dispose a handle.

Record expected versus observed requests, relevant snapshots and UI results for each scenario. Field refresh targets the selected field across the resource's existing records; it is not an implicit single-record mutation.

| Scenario                     | Required observation                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two consumers and navigation | Identical acquisition shares work. A narrower/extended view fetches only needed coverage. Navigate away from one owner while the other stays active; the survivor still updates. Repeat mount/unmount and tenant selection at least 100 times, recording actual count.                                                                                                                          |
| Selective refresh            | Change a test record through the existing backend workflow, then invalidate one field/branch. All interested consumers update; unrelated cached values and independent drafts remain intact. Inspect the emitted GraphQL selection including required identity/context fields.                                                                                                                  |
| List membership              | Add/remove/reorder a test record. Field refresh preserves existing membership/order and exposes mismatch; explicit `refreshList()` adopts membership. If freshness is configured, separately verify its documented membership-expiry behavior.                                                                                                                                                  |
| Partial availability         | Cause a located field failure, missing selected value or supported structural null using the test backend. Successful siblings remain usable, unavailable/error states render accurately, and explicit recovery does not restore obsolete sibling data.                                                                                                                                         |
| Network and deadlines        | Exercise transient failure, terminal authorization failure and a delayed read. Confirm bounded read retries/deadline behavior, readable prior data and recoverable UI errors. No automatic write retry occurs.                                                                                                                                                                                  |
| Account/logout races         | Delay account A's read, switch to B or log out, then allow A's response to finish. A must not overwrite B or appear after logout. Repeat while a read retry, polling cycle and save are pending; old draft/save completion must not target the new account.                                                                                                                                     |
| Policy behavior              | With streaming absent, test the chosen freshness, retention and optional polling settings. Reading a snapshot must not fetch. Poll registrations belong to their original handle; parameter replacement requires deliberate new registration.                                                                                                                                                   |
| Local drafts and Save        | Typing stays local. Pristine fields may follow accepted server data; dirty conflicts remain visible. Capture an immutable submitted payload, edit again while Save is pending, and retain later edits. Distinguish confirmed Save from failed refresh, and reset to the latest usable server value. Use [the forms contract](FORMS.md) as application guidance, not an imported library helper. |
| Final cleanup                | Destroy the final owning route/injector, dispose clients before owned provider infrastructure, and wait beyond configured timer windows. No departed owner issues reads or receives callbacks. Borrowed infrastructure remains usable by its owner. Reacquisition follows configured retention instead of reviving cancelled work.                                                              |
| Ordinary work session        | Keep the application in use for at least one representative work session, recording elapsed time, navigation/record counts, background/foreground transitions and network interruptions. Note responsiveness and retained references; quantitative memory/scale acceptance belongs to B7c.                                                                                                      |

The proposed cycle count and session length guide coverage; they are not measured performance budgets. Collect sanitized reproduction steps for failures. Separate library defects from application ownership mistakes and unsupported capabilities, but retain all three as integration findings. Each correctness fix receives its own tests and independent review. If the selected application lacks a scenario's business operation, document that coverage limit and identify what the executed checks actually establish. Do not count a database update or injected response as an application command, or add unrelated business features solely to make every row applicable.

## Trial report and exit decision

Complete this record after execution:

- Status: **NOT EXECUTED** / in progress / passed / blocked, with reason.
- Application/feature and test scope, with a safe public description and private source references where needed.
- Application and Tandrove commits; tarball filenames/SHA512; package manager/lockfile; Angular/GraphQL/Node/browser/OS/device versions.
- Schema preflight and identity setup; selected record counts, session scopes and configured policies.
- Application build/test results; scenario outcomes; actual duration and cycle counts; sanitized network/cleanup evidence.
- Findings with severity, reproducible steps, owner and linked reviewed fixes; unsupported requirements recorded explicitly.
- Independent technical review of the library integration evidence, its coverage limits and resolved correctness findings, plus B7c measurement and B7d readiness follow-ups.

B7b closes with executed evidence from a compatible existing application, resolved correctness blockers and independent technical review of the bounded test scope. A prepared protocol, artifact installation, synthetic benchmark or happy-path demonstration alone is insufficient. Closure does not certify the application's business operations or claim coverage for scenarios that were not exercised. Publication remains a separate decision.
