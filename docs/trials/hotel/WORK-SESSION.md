# Hotel work-session and cross-route retention trial

November 2, 2026 (America/Chicago). This follow-up uses the isolated application and exact local packages from the [account/save-race trial](ACCOUNT-RACES.md). It changes application ownership, not Tandrove's runtime/API, and requires no npm release. The timed workload is a scripted engineering session, not an upstream-maintainer endorsement or an ordinary-user study.

**Bounded engineering session: PASSED. B7b: IN PROGRESS.** The real-clock retention checks and a 25-minute scripted session passed. Final application acceptance and the broader performance/device/readiness gates remain open.

## Reviewed application change

Previously the booking component owned the entire room client. Leaving the route disposed that client immediately, so its 500ms retention setting could not exercise reuse across routes. A lazy session shell now owns the client across its child routes. AppComponent still recreates the root outlet for each authentication epoch, and RoomCatalog still disposes synchronously at the epoch boundary. Booking and preview components own their query handles, polling interests and local drafts.

The application chooses **5000ms inactive retention**, keeping **30s on-demand freshness**, one additional read retry with at most 100ms jitter, a 2000ms deadline, and explicit 500ms rate polling. This is an application policy change, not a change to the library default. An optional application-local clock token passes the existing public monotonic scheduler capability to deterministic tests; the actual browser uses native scheduling.

All **60 frontend tests** passed, including five actual-AppComponent/router regressions. The reviewer independently reran them. They verify shared session ownership, fresh reuse with blank new drafts, cancelled old expiry and renewed inactive windows, original freshness age across remount, route polling cleanup with the client still alive, and logout cleanup/identical-token epoch isolation. Production AOT, changed-file lint and schema regeneration passed.

The production initial bundle changed from **772.01 to 772.18 kB raw**. The existing 500kB warning remains; the 1MB hard limit passes. GraphQL stays outside the initial bundle, but the session's `/home` route now downloads the **199.56kB shared GraphQL/catalog chunk**. Previously that work was deferred to the first booking visit. The initial-bundle number alone does not describe this startup cost. The extra session-shell chunk is 470 bytes raw.

Apply [session-retention.patch](session-retention.patch) after the four previous patches. The [manifest](work-session-results.json) records its base/final application commits and SHA256. All five patches were applied in order to a fresh upstream worktree; source/tests/config match the reviewed application commit, with only the previously documented local ignores/npm-install files differing.

## Bounded retention protocol

[browser-retention.js](browser-retention.js) uses in-app links, counting Tandrove room operations separately from NgRx reservation reads. It covers initial two-consumer acquisition, fresh route reuse with blank drafts, cancellation of an old eviction deadline, a new inactive window, expiry/reacquisition, departed polling cleanup, a late read across route replacement, original freshness expiry during a short absence, logout isolation, and final network cleanup. It uses the actual 5s/30s browser policy rather than an accelerated clock.

The independent rerun under the production configuration passed nine recorded stages in **56.197 seconds**, with **eight room requests**. The freshness case crossed **31.197s** of original age while inactive for only **2.147s**; it revalidated once. The initial implementation run also passed. The [sanitized independent receipt](retention-results.json) preserves all nine stages; its total includes setup/refresh requests outside the individual stage deltas.

## Timed protocol and reproduction

Run the unchanged dedicated Spring/PostgreSQL account fixture described in [ACCOUNT-RACES.md](ACCOUNT-RACES.md), binding the backend to loopback with `SERVER_ADDRESS=127.0.0.1`. Start Angular with `--configuration production --hmr=false --live-reload=false --host 127.0.0.1 --port 13009` and the existing local proxy. This uses the CLI's production build configuration, not a deployed hosting environment. Use a clean isolated browser, the nine-room baseline, room_1 rate 155/fee 99, and no fixture reservations.

The scripts book December 1–3, 2027. Move those synthetic dates forward when needed, keeping the same two-night calculation; no production records are involved. Playwright CLI **0.1.23** is the observed version for this run.

For actual tab visibility, launch a dedicated native Chrome profile with [start-work-browser.ps1](start-work-browser.ps1), then attach Playwright CLI using its generated `browser.cdpEndpoint` configuration. The CLI attachment uses `noDefaults: true`; its ordinary launched-browser path enables focus emulation, which [forces the visibility API to report visible](https://developer.chrome.com/docs/devtools/rendering/apply-effects). A run using that path correctly stopped at its first hidden-state assertion after four rounds, with no writes. The native-profile attachment was separately checked for actual hidden/visible transitions. This does not simulate visibility events or claim operating-system sleep/suspension coverage. Keep the debugging port on loopback and close only this owned browser after the run.

The [PowerShell runner](run-work-session.ps1) invokes [start](browser-work-start.js), [step](browser-work-step.js), [status](browser-work-status.js) and [finish](browser-work-finish.js) through Playwright CLI. Supply the application path and a new evidence directory. It runs 50 sequential rounds on a 30-second schedule, with two route/preview/draft cycles per round. Longer activities may overrun a round; no overlapping steps are permitted. Completion requires at least 25 actual minutes measured by the browser's monotonic clock, not accelerated timers or accumulated waits.

The schedule includes three actual background/foreground cycles (at least 35s hidden each), three 15s offline intervals with bounded read failure and explicit recovery, three bounded polling periods, three real bookings/cancellations and three account switches. Backgrounding activates another owned tab and checks `document.visibilityState`; it does not dispatch synthetic visibility events. Hidden duration is measured before foreground refresh. Actual visibility transitions, phase-scoped console errors, unhandled exceptions, request counts and activity checkpoints are recorded. Successful completion requires exactly three creates/three deletes and no unexpected console error or unhandled exception.

The timed receipt's `offlineCycles.recoveryReads` is an expected value, not a separately measured/asserted delta. Its aggregate and per-round room-request counts are measured. The separate [recovery-count protocol](browser-recovery-counts.js) measures each restoration/refresh delta directly; it is a bounded follow-up, not extra timed-session duration. Neither receipt includes bearer headers or response payloads.

After the run, that literal was renamed `expectedRecoveryReads` in the reusable script, and the runner was pinned to the observed CLI version. The original receipt is unchanged. The manifest gives the executed source hashes, encodings and exact reverse substitutions; reconstructing those two files matches the original hashes. Use the same pinned CLI invocation for opening and running a session: a different npx installation may use a different CLI session namespace.

Before timing, both lazy routes are warmed, the app returns to an empty home list, and inactive retention expires. The same empty-home/expired-retention condition is sampled after each ten rounds. [Playwright CDP sessions](https://playwright.dev/docs/api/class-cdpsession) collect [DOM counters](https://chromedevtools.github.io/devtools-protocol/tot/Memory/#method-getDOMCounters) and [runtime metrics](https://chromedevtools.github.io/devtools-protocol/tot/Performance/#method-getMetrics) after explicit GC. These are intrusive diagnostics, not a leak-free guarantee, retained-object attribution or intended-device memory budget. Recorded route-opening times include automation and network work and are not a responsiveness benchmark.

The runner preserves each raw CLI log locally and parses its `Result` object; a zero process exit code alone is insufficient. It refuses to overwrite an evidence directory. On failure, [abort](browser-work-abort.js) logs out to stop owned work, restores connectivity and removes instrumentation. A write may already have committed: inspect and cancel only the run's synthetic booking before restarting. The first startup attempt exposed the CLI's missing global `performance` object; it stopped before timed activity or writes. The reviewed correction reads `performance.now()` inside the browser and cleans up partial startup. That failed preflight is not counted as a completed session.

## Executed work session

The [full sanitized receipt](work-session-run.json) records **1,510,052ms (25m10.052s)**, from November 3, 2026 at 00:35:18.759–01:00:28.811 UTC (November 2 locally). All 50 sequential rounds passed.

| Observation                  | Result                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route and preview activity   | 100 booking-route cycles, 100 preview destruction/recreation cycles, 100 draft-preservation checks; 236 instrumented navigations including extra scenarios.                     |
| Network                      | 86 Tandrove room requests, including six expected failed offline attempts; 121 separate NgRx reservation reads.                                                                 |
| Actual background periods    | 35.025s, 35.022s and 35.028s; zero hidden room reads; drafts survived foreground refresh.                                                                                       |
| Offline/recovery             | Three 15s holds after bounded two-attempt failures; no retry loops; explicit recovery preserved drafts. See the receipt-field limitation above.                                 |
| Polling                      | Six reads in each of three polling periods; zero subsequent reads in each departure observation.                                                                                |
| Inactive expiry and accounts | Three deliberate expiry/reacquisition checks and three account switches, each with exactly one new acquisition.                                                                 |
| Commands                     | Three actual creates and three normal cancellation deletes, across both accounts; no duplicate write requests.                                                                  |
| Errors and cleanup           | Zero unhandled browser errors; only six expected offline console errors. Final logout followed by 5.2s produced zero room reads. Database verification found zero reservations. |

There were 118 measured booking openings: 31–68ms, median 40ms and nearest-rank p95 49ms. These local automation/network-inclusive observations are not a responsiveness benchmark or an intended-device budget.

The six post-GC diagnostics are preserved without extrapolating a leak-free guarantee:

| Sample        | Documents | DOM nodes | JS listeners | Used JS heap (bytes) | Visible DOM elements |
| ------------- | --------: | --------: | -----------: | -------------------: | -------------------: |
| Warm baseline |         5 |       319 |           79 |           14,697,416 |                   65 |
| Round 10      |         5 |       320 |           80 |           16,326,104 |                   65 |
| Round 20      |         5 |       320 |           80 |           16,622,324 |                   65 |
| Round 30      |         4 |       202 |           41 |            9,269,332 |                   65 |
| Round 40      |         4 |       207 |           42 |            9,402,304 |                   68 |
| Round 50      |         4 |       202 |           41 |            9,513,496 |                   65 |

Every sample had zero visible forms. Although each sample was taken on the empty home list after inactive retention expired, round 40's DOM was not identical to the others. These whole-renderer counters include application/browser/automation effects; no heap-owner attribution was performed. They show no monotonic growth across this run, and do not establish a memory limit or resolve B7c.3.

## Independent follow-up and cleanup

The reviewer independently ran the separate recovery-count protocol after the timed session. All three cycles measured **two failed attempts plus one recovery request**, nine total requests after initial acquisition. Drafts survived, logout produced zero further reads, and there were no unhandled errors; the six console errors were the expected offline failures. The [receipt](recovery-results.json) is separate from the timed result. The reviewer also verified the signed-out UI, no remaining form, no timed runner and no remaining named test observers.

The native-browser launcher passed a runtime smoke check using profile/configuration paths containing spaces. Its listener belonged to the launched process, the generated configuration identified that exact browser WebSocket endpoint, and the pinned CLI attached successfully. Both owned browsers were closed through CDP. The frontend/backend sessions and dedicated PostgreSQL container were stopped. No listeners remained on 13009, 18089, 15439, 19439 or the launcher's smoke-test port 19440. The final database check found zero reservations. Isolated checkouts, profiles and raw evidence remain local for inspection.

## Scope of the decision

These checks address session ownership, cross-route retention and repeated scripted use. The 100 route/preview cycles and three account switches are separate counts; they do not establish 100 tenant selections. Tandrove owns the room-read cache, while reservation commands/lists still use the application's NgRx/backend flow.

B7b.2b.4e retains the existing joint application-maintainer and independent-review conclusion and remaining application-protocol coverage. A genuine room-update business workflow and applicable Tandrove membership-after-write coverage remain unproven here. The upstream maintainer has not endorsed this trial. Intended-device evidence, performance/memory budgets and the final API/extension-readiness decision remain separate B7c/B7d work. This trial does not trigger publication or close those gates.
