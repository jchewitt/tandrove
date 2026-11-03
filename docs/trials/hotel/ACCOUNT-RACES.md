# Hotel account and save races

November 2, 2026. This completes B7b.2b.2–3 after the [save-listener fix](SAVE-OWNERSHIP.md). These are changes to the isolated hotel's authentication, NgRx commands and UI ownership. Tandrove's packages, public API and installed artifacts are unchanged; no release was needed. B7b remains open.

The subsequent [work-session and cross-route retention report](WORK-SESSION.md) records the next ownership change, updated application retention policy, and additional evidence. Results and open items below describe this account/save-race slice.

## Workable slices

1. **Authenticated fixture:** `account-fixture.patch` adds the explicit `trial-accounts` Spring profile and a second synthetic account. Reservation ownership is taken from the verified security principal, never from client GraphQL input. Lists, individual reads and deletion are owner-filtered. Room availability remains global so different accounts cannot double-book the same room. The original authorization/OPTIONS matcher accidentally treated `/**` as permitted for every method; it now permits only `HttpMethod.OPTIONS`. A B token is rejected when the fixture profile is disabled. Outside the profile the original single-account/shared reservation behavior is preserved. This fixture is not a production identity system or a Tandrove server implementation.
2. **Session ownership:** `session-ownership.patch` assigns a new local epoch at every login start/logout, including identical-token re-login. It cancels superseded logins, synchronously disposes the old Tandrove client, clears the NgRx cache/UI state, and recreates routed components by epoch. Requests capture their bearer and epoch; results cannot enter another session. Read actions are checked before `switchMap` so a stale action cannot cancel a current request. Modal/alert intents also carry their originating component's epoch. A stale confirmation cannot consume a new account's pending delete. Command IDs remain local correlation only.
3. **Browser evidence:** the two CLI functions below hold actual backend responses across UI actions. They do not mock a successful write. For saves, the server has reported success before the acknowledgement is delayed. Aborting delivery does not undo the committed reservation; returning to its account reloads it without replaying the command.

Each code slice received its own independent review before commit. Review found and fixed the disabled-profile B-token hole, stale-read cancellation and stale-confirmation ownership. See the [review record](../../reviews/2026-11-02-hotel-account-races.md).

## Executed checks

| Check               | Observed outcome                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Late login          | A's held token response cannot replace a subsequently authenticated B session.                                                                                                                                               |
| Late room read      | A's held response with an injected rate of 999 cannot replace B's authoritative 155 rate. A's booking draft does not survive in B. Rooms are shared catalog data; reservation checks below cover private data.               |
| Poll switch         | The outgoing account's 500ms rate poll is held while changing accounts. The replacement form starts without a poll registration; no further room requests occur over 1200ms after its initial load.                          |
| Retry/logout        | One injected 503 leads to one real retry. Logging out with its response pending removes the form; releasing it does not restore the UI. A separate frontend test fixes jitter and checks logout during retry backoff.        |
| Edits during Save   | The server receives checkout September 13. Editing it to September 14 while acknowledgement is pending preserves September 14 as an unsent draft and suppresses navigation. The authoritative list still shows September 13. |
| Late private read   | A's reservation list is held; B loads its empty list. Releasing A's response does not populate B's cache/UI.                                                                                                                 |
| Save/account switch | A's write commits, then B starts a separate draft. A's late acknowledgement does not navigate, alert, alter B's draft or add a reservation to B. Returning to A retrieves its committed booking.                             |
| Save/logout         | B's write commits before logout. The late acknowledgement does not restore the form or alert. Re-login retrieves B's booking with no replay.                                                                                 |

The save run issued exactly **three creates and three deletes**, all through existing application commands; normal cancellation removed its three synthetic reservations. Neither race run retries writes. The console's only error was the deliberately injected HTTP 503.

Validation: **55 frontend tests**, **18 backend tests**, production Angular AOT, regenerated-schema check and changed-file lint passed. The reviewer independently reran all 55 frontend tests and the backend suite/fixed account scenarios. The application stays on Angular 21.2.17, TypeScript 5.9.3 and the same three [exact local tarballs](artifacts.json). Parent validation uses Node 24.15.0; the reviewer used Node 24.2.0. Both browser runs used Chrome 156 on Windows. Existing read policies remain one retry with 100ms maximum jitter, 2000ms deadline, 30s on-demand freshness and 500ms retention. The new rate-poll button explicitly registers a 500ms interest, owned by its booking query and removed on destruction/session disposal.

## Reproduction and receipts

The [manifest and sanitized receipts](account-race-results.json) record patch SHA256 values, base/final application commits, browser scenario counts and timestamps. Apply patches in order to the [original upstream revision](README.md):

1. `integration.patch`
2. `save-ownership.patch`
3. `account-fixture.patch`
4. `session-ownership.patch`

A fresh upstream worktree accepted all four patches in order. Its source/tests/config match the final reviewed application commit; only local artifact ignores and the separately installed npm manifests differ. Run `git apply --check` before applying each patch. Keep the original patches unchanged. Install the exact local packages as described in the first trial and run frontend build/tests/schema check. Run backend tests and `bootJar`; the fixture has HTTP tests for anonymous/invalid bearer rejection, actual logins, per-owner list/read/delete access, cross-account overlap and disabled-profile B rejection.

Use only a dedicated test database. Start the backend with `SPRING_PROFILES_ACTIVE=trial-accounts`, its existing `PG_URL`/`PG_USER`/`PG_PASSWD` variables, `RESERVATION_PORT=18089` and `ALLOWED_ORIGINS=http://127.0.0.1:13009`. Start Angular on 13009 with a proxy for `/graphql` and `/development` to 18089. Open `/home?trialAccounts=1` to expose the fixture controls. A is `example-user`, B is `trial-user-b`; both use the upstream development password `example-user`. These are synthetic fixture credentials, not production accounts. Keep real credentials and raw browser/network logs out of Git.

Use the original nine-room baseline with room_1 rate 155 and no reservations for either fixture account. Run [browser-account-reads.js](browser-account-reads.js), then [browser-save-races.js](browser-save-races.js), using Playwright CLI `run-code --filename`. Both start by loading the local `/home?trialAccounts=1` URL. The save script uses future dates in September/October 2027; adjust them when they cease to be future dates. Inspect the CLI's `Result`/`Error` output, since process exit code alone does not establish success. An interrupted run may leave a committed test booking; inspect it before rerunning and use the normal account cancellation flow to remove it.

## Remaining acceptance

This is a small real application with an added opt-in development account model. It establishes the specific ownership/race behavior above, not production multi-tenant acceptance, token refresh, offline writes, idempotency or streaming. Tandrove still owns the room-read cache; reservation writes/lists remain NgRx and the existing backend. Cancelled-request tests are complemented by reducer/listener tests that explicitly deliver stale actions.

B7b.2b.4 still needs a representative work session, background/foreground and cross-route retention evidence, and final application/readiness review. A genuine room-update business workflow, Tandrove reservation membership after writes, physical-device/memory/scale evidence and maintainer acceptance remain open as applicable to the broader gates. The upstream maintainer has not endorsed this trial.

After the independent rerun, the database contained zero reservations. The owned browser, frontend/backend sessions and dedicated database container were stopped, with no listeners left on ports 13009, 18089 or 15439. The isolated checkouts and local evidence remain available for follow-up.
