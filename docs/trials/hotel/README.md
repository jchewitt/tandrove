# Existing hotel application trial

Follow-up reports cover [save-listener ownership](SAVE-OWNERSHIP.md), [authenticated account/save races](ACCOUNT-RACES.md), [work-session/cross-route retention](WORK-SESSION.md), [reservation membership after writes](RESERVATION-MEMBERSHIP.md) and [100 account switches](ACCOUNT-SWITCHES.md). The findings below describe the initial trial. The follow-up reports record subsequent fixes, executed checks and remaining acceptance decisions.

November 2, 2026. **The room-read integration passed this bounded trial; B7b remains in progress.** No library runtime changes or npm publication were needed. The integration lives in an isolated worktree; the upstream application and active user projects were not modified.

## Revisions and environment

- Application: Will Sams's public [Angular/Spring Boot hotel application](https://github.com/WillSams/example-ts-angular-with-java/tree/3ebd6536c4fc3c47482089d747917beed6802873), revision `3ebd6536c4fc3c47482089d747917beed6802873`.
- Tandrove: reviewed main `0edc602e64e5b65f07ed74c3c5e4b17af9996e15`. All three actual tarballs were installed together with strict peers. They retain the workspace version `0.1.0-alpha.5` but differ from the published artifacts. [Artifact hashes](artifacts.json) identify this build; no registry release was made.
- Windows, portable Node 24.15.0/npm 11.12.1 for the application build/dev server and final parent test run, Angular/core/compiler 21.2.17, CLI/build 21.2.16, TypeScript 5.9.3, RxJS 7.8.2, GraphQL 16.14.2, Chrome 156. The initial `npm ci` used host Node 24.2.0 and warned about the unrelated `which` package's engine. Earlier parent tests, the reviewer's two independent test runs and generation check, and Tandrove's full `pnpm check` used host Node 24.2.0 (pnpm 10.18.2 for the library).
- Real Spring Boot 3.5.16 backend, Java 23.0.1, checksum-verified Gradle 9.8.2, dedicated PostgreSQL 15 container. The checkout omits its wrapper JAR, so the matching Gradle distribution was used directly. Test database and backend/frontend ports were isolated (`15439`, `18089`, `13009`); the schema, resolvers and business services were unchanged.

The [source patch](integration.patch) contains the app integration, generated schema, and seven regression tests. It excludes npm manifests/lockfiles because local tarball paths depend on the checkout layout; install the three recorded artifacts using the protocol in [APPLICATION-TRIAL.md](../../APPLICATION-TRIAL.md). The local application lockfile confirms one shared core and Angular 21.2.17 with no peer overrides or framework upgrade.

## Integration and ownership

The existing booking form's room selector now reads through one generated central room definition. A child rate preview selects only `id` and `daily_rate` from that definition and owns its own Angular query. Both share the same resource address and component-owned client. Removing the child releases its handle; navigating away disposes the booking client's cache and work. This deliberately tests component lifetime, not cross-route cache retention.

The unchanged SDL supplies the runtime schema and generated types. `Room.id` and `Reservation.id` are identities; only the room resource is acquired through Tandrove in this slice. The app's result envelope carries in-band `success/errors`, so an application transport adds those wrapper fields to the prepared AST, validates business success, and forwards standard GraphQL results to the normal decoder. It does not widen the room selection or manually merge cache state. The default HTTP transport supplies cancellation and retry classification.

Initial routed acquisition waits for login. The client captures its token, guards changed session bindings, and disposes on session change/destruction. The backend has one hardcoded account, so the unit-level token-change check is not evidence of a real multi-account trial. NgRx still owns reservation reads/commands and alerts; form dates and room selection remain local drafts. No stream, mutation engine, or form library was added.

Policies: one additional transient read attempt, initial/max retry delay 100ms, shared deadline 2000ms, inactive retention 500ms, freshness 30000ms with on-demand revalidation. Polling is not enabled. Leaving the component disposes the entire client rather than waiting for inactive eviction.

## Executed evidence

| Check                   | Observed result                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmodified baseline     | Production AOT build, 28 frontend tests and 14 backend tests passed. Real booking and cancellation succeeded before integration.                                                                                                                                                                                                                |
| Library/installation    | `pnpm check` passed 444 tests and packed consumers. All three tarballs installed with strict peers; application Angular remained 21.2.17.                                                                                                                                                                                                       |
| Integrated application  | Production AOT build, schema regeneration check, lint of changed application files, and 35 frontend tests passed. The independent reviewer also ran the 35 tests.                                                                                                                                                                               |
| Shared reads            | One full GraphQL request populated both selector and narrow preview. Destroying the preview left the selector functional.                                                                                                                                                                                                                       |
| Selective refresh       | Directly changed synthetic room_1 in the isolated database: rate 140→155, beds 2→3, fee 20→99. Rate-only invalidation updated both views to 155 while retaining cached beds 2/fee 20 and draft dates. Explicit catalog reload subsequently adopted beds 3/fee 99. This SQL change is a test mechanism, not an application room-update workflow. |
| Business failure        | Injected `success:false` retained cached values and drafts, displayed the error, disabled submission, and made one attempt. Explicit recovery restored usable state.                                                                                                                                                                            |
| Retry/auth/offline      | Injected HTTP 503 recovered after exactly one retry; 403 was terminal after one attempt. Browser offline mode made two bounded attempts, retained values, and recovered explicitly.                                                                                                                                                             |
| Deadline/navigation     | A 2600ms delayed response exceeded the 2000ms deadline and did not replace 155 with its late 999 value. Navigating away during a delayed read removed the last owner without another attempt.                                                                                                                                                   |
| Availability/membership | Angular tests cover omitted fields, unavailable labels and blocked submission; an added room stays excluded until `refreshList()`. Removing the selected room or returning a null catalog blocks submission while retaining the draft.                                                                                                          |
| Repeated lifecycle      | 100 route mount/unmount cycles and 100 preview destruction/recreation cycles completed in 28.872 seconds, with exactly 100 Tandrove room requests. Observed a further 750ms past the retention interval without an extra request.                                                                                                               |
| Freshness               | A separate 31-second active observation marked rates stale without issuing a request, as configured. Cached values remained visible.                                                                                                                                                                                                            |
| Existing writes         | Real booking charged 409 (2 nights × 155 + 99); a second overlapping booking was rejected while retaining dates; confirmation/cancellation removed the reservation. Exactly two create requests and one delete request occurred, with no automatic write retry.                                                                                 |

Sanitized machine-readable browser receipts are in [results.json](results.json). Browser fault responses are explicitly injected; normal room reads and booking operations used the real Spring/PostgreSQL application. The interaction window ran from approximately 21:22–21:35 UTC, including baseline work; the measured lifecycle and idle observations above have narrower recorded durations. This scripted engineering session is not the representative ordinary work session required by B7b.

The captured narrow request was:

```graphql
query TandroveRead {
  getAllRooms {
    __typename
    rooms {
      __typename
      daily_rate
      id
    }
    success
    errors
  }
}
```

## Findings and remaining gates

- **Integration fixes, resolved:** preserve the API's in-band business errors; gate first reads on login; present omitted fields as unavailable; surface stale membership; block booking for an unavailable/deleted selection. Regression tests cover these choices. No Tandrove runtime defect was demonstrated in this slice.
- **Generated-code lint friction:** the generated schema uses `{}` for empty argument types, which this app's recommended ESLint rules reject. A narrowly scoped `no-empty-object-type` override for generated files permits the intended type representation. Generated output still passes TypeScript/AOT and regeneration checks. Assess this setup friction in B7d.
- **Bundle cost:** baseline initial bundle 767.24kB became 768.73kB; the lazy booking chunk grew from 39.20kB (9.16kB estimated transfer) to 244.98kB (56.15kB estimated transfer). This includes the schema, GraphQL runtime and Tandrove alongside retained NgRx. Both builds have the same pre-existing 500kB initial warning and remain below the application's 1MB hard limit. These are build outputs, not measured user download/interaction timings or a comparison with Apollo.
- **Pre-existing command ownership gap, open:** the booking component subscribes to any future NgRx create-success after dispatch without destruction/command correlation. A failed save can leave a listener that navigates after a later save. This read-only migration preserves existing command code; pending-save/logout isolation is not accepted by this trial.
- **Coverage still open:** real account changes/logout races across reads/retries/polling/saves; a genuine room-update business workflow; representative long session and background/foreground use; selected resource retention across route lifetimes; Tandrove reservation membership after writes; physical lower-powered-device and memory/scale evidence; app-maintainer acceptance. The upstream author has not endorsed this integration.

This completes **B7b.2a**, the bounded room-read trial. B7b.2/B7b, B7c and B7d remain open. The next application slice should address command ownership and use a workflow/session model capable of exercising the remaining account/save requirements. Publishing these unchanged library packages would not close those coverage gaps.

## Reproduction

1. Create a fresh isolated checkout at the application revision above. Apply `integration.patch` from that checkout with `git apply --check` followed by `git apply`.
2. Follow the exact-artifact protocol, installing all three local tarballs plus `graphql@16.14.2` into `frontend` using npm with strict peers. Run `node scripts/generate-hotel.mjs --check`, `npm run build`, and `npm run test:ci` (set `CHROME_BIN` on Windows). Do not substitute the registry's same-version alpha.5 artifacts.
3. Run the unchanged backend against a dedicated seeded PostgreSQL database and configure a local frontend proxy for `/graphql` and `/development`. Use the app's development-only login. Start the frontend and open `/home` in an isolated browser session.
4. Establish the nine-room baseline; change only synthetic room_1's rate/beds/fee as described above. In the UI select room_1, enter dates 2027-07-01/2027-07-03, refresh rates, inspect both views/drafts/request, then reload the full catalog. Choose new future dates and update the scripts when reproducing after those dates.
5. The browser files are Playwright CLI `run-code --filename` functions, not application tests: [cycles](browser-cycles.js) and [booking](browser-booking.js) start on `/home`; [idle](browser-idle.js) starts on `/home` and leaves the form selected with dates; [faults](browser-faults.js) then exercises failures and returns home. Booking expects room_1 rate 155/fee 99 and no conflicting reservation. The functions fail on assertion errors and return the sanitized receipts above; inspect the CLI result, since CLI process status alone does not indicate assertion success.
6. Stop only the owned frontend/backend processes and dedicated database after testing. Browser response logs, authentication state and raw traces remain local and are not included here.

The recorded run ended with the owned browser/frontend/backend closed, the dedicated database container stopped, and no listeners remaining on its three trial ports. The isolated checkout, test database and evidence are retained for follow-up.
