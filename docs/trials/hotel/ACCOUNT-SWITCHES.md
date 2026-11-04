# Account isolation over 100 UI switches

This trial uses the reservation view and authenticated fixture from the [membership check](RESERVATION-MEMBERSHIP.md). It creates one confirmed booking for A and another for B through the hotel's ordinary UI. The observer first acquires A's row, then alternates B and A by clicking the account buttons 100 times. Each selection must produce one successful login and one new reservation acquisition. The protocol checks that the server returned exactly that account's fixture and compares its ID, room and charge with the rendered row. The 100 selections exclude fixture logins, initial acquisition and cleanup.

The [browser protocol](browser-reservation-switches.js) also samples the account label and reservation rows after DOM mutation batches. It checks the complete sequence of rendered accounts and rejects any sample that displays a foreign reservation or a reservation without its account label. This measures DOM states observed during ordinary switches. The [earlier race checks](ACCOUNT-RACES.md) cover delayed responses and writes.

Use the two synthetic accounts, empty dedicated database, exact local packages and production Angular configuration described in the [membership trial](RESERVATION-MEMBERSHIP.md). From the Tandrove checkout, install the shared fixture into an isolated pinned Playwright CLI session, then run the switch protocol. The March 2028 booking dates must be in the future. The receipt includes the ordered accounts and the individual server/rendered IDs. Raw authentication details stay outside the receipt.

```powershell
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance open about:blank --browser=chrome
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance run-code --filename docs/trials/hotel/browser-reservation-fixture.js
npx --yes --package @playwright/cli@0.1.23 playwright-cli -s=hotel-acceptance run-code --filename docs/trials/hotel/browser-reservation-switches.js
```

The primary run passed all 100 switches, 50 to each account. Account A owned reservation 21 and B owned reservation 22. The initial acquisition showed A's ID and room. On each of the 100 switches, the rendered ID, room and charge matched the corresponding server row. The browser observed 101 rendered account states in the expected order, with zero mismatches in 302 DOM samples. Exactly two creates and two cleanup deletes were issued. The signed-out observation produced zero further reservation reads and the final database count was zero.

The independent reviewer repeated all 100 switches with fresh reservations 23 and 24. Both runs recorded exactly 100 switch logins, 101 observer reads including initial acquisition, zero unhandled page errors and zero account/row mismatches in 302 DOM samples per run. The [two receipts](account-switch-results.json) preserve each switch's server and rendered ID. See the [independent review](../../reviews/2026-11-03-reservation-switches.md).

The two engineering checks under B7b.2b.4e are complete. The [November 4 technical conclusion](ACCEPTANCE.md) closes the bounded library trial without a separate application-maintainer approval requirement. The room-edit command path remains a coverage limit. The November 2 room rate change used a direct update in the isolated database. The hotel's GraphQL business commands cover booking creation and cancellation.
