# Reservation membership after booking and cancellation

The hotel now has a lazy read-only view at `/trial/reservation-membership?trialAccounts=1`. It observes one installed Tandrove handle for `getAllReservations.reservations` in the existing authenticated session. The normal hotel UI calls the existing create and delete commands in a second tab. The two tabs use the same synthetic account, and the observer stays mounted across both writes. Each button operates on the same handle. Charge refresh selects `id` and `total_charge` plus GraphQL type and envelope metadata. List refresh also selects `room_id`.

| Action in the observing tab                         | Server members | Visible cached members | Outcome                                                                 |
| --------------------------------------------------- | -------------- | ---------------------- | ----------------------------------------------------------------------- |
| Initial load after the first booking                | First          | First                  | Ready                                                                   |
| Refresh charges after a second booking              | First, second  | First                  | Membership flagged stale                                                |
| Refresh the list                                    | First, second  | First, second          | Both rows and charges match the server in order                         |
| Refresh charges after cancelling the second booking | First          | First, second          | Incomplete field refresh is visible. Both cached rows keep their values |
| Refresh the list again                              | First          | First                  | Membership is current and the view is ready                             |

The [browser check](browser-reservation-membership.js) verifies the generated selections, authoritative responses, displayed values, membership indicator and mutation counts. Each successful run issues five observer reads, two creates and two deletes including cleanup of the first booking. The [shared fixture](browser-reservation-fixture.js) uses normal account, booking and cancellation controls. It identifies its own records before cleanup, checks logout for 5.2 seconds and reports setup or cleanup failures. The existing account fixture requires a dedicated database. See the [account trial](ACCOUNT-RACES.md) for service setup.

The application patch applies after the five patches in the [work-session trial](WORK-SESSION.md). Its base is `d3e66b190da1a04f5bf6679e79d0626b8ca9efa9`, its reviewed result is `6439dbc143e63956124f5222f11b9f0d575db62d`, and its SHA256 is `50978d7aa2de9b9b892b869c27095763d6237524ddd55e27aa993b8273c251cc`. Applying it to the prior reproduction worktree reproduced the source and tests. Install the [original local tarballs](artifacts.json). The unchanged backend uses the `trial-accounts` profile. The Angular production build passed with an initial size of 772.45 kB and a 2.94 kB lazy observer chunk. The previous initial size was 772.18 kB. The shared session chunk increased from 199.56 to 203.02 kB. All 62 frontend tests, changed-file lint and schema generation passed.

With the same loopback frontend and backend running and the database empty, open an isolated browser session. From the Tandrove checkout run the fixture and scenario consecutively in that session. Check for a passing CLI Result object. The fixture uses dates in February 2028, which must be future dates when reproducing.

```powershell
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance open about:blank --browser=chrome
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance run-code --filename docs/trials/hotel/browser-reservation-fixture.js
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance run-code --filename docs/trials/hotel/browser-reservation-membership.js
```

This covers membership after real application writes. The separate room-edit business workflow and the application-maintainer acceptance decision remain open.

Both the primary execution and independent rerun passed. The [two receipts](reservation-membership-results.json) preserve the actual server IDs, cached IDs, queries and command counts for each run. The independent run used reservations 19 and 20, confirmed the missing-record alert on cancellation and verified zero remaining reservations, no observer rows after logout and no remaining trial listeners. See the [independent review](../../reviews/2026-11-03-reservation-membership.md).
