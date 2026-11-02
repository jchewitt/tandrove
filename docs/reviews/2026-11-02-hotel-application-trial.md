# Public hotel application trial review

Independent reviewer: `/root/angular_compatibility_review`, November 2, 2026. The reviewer audited the unchanged application and reviewed the integration and fixes before commit. The [trial report](../trials/hotel/README.md) identifies exact revisions, artifact hashes, source patch, executed checks and remaining gaps.

The reviewer identified the API's in-band business error envelope and asynchronous login race before integration. The application transport now requests/checks business status without manually merging state, captures session credentials, and forwards normal GraphQL decoding. Login gates routed acquisition; a booking component owns its client and child views own separate handles. Existing NgRx write services remain outside Tandrove.

Review findings resolved before commit:

- Missing smoking/price values must render unavailable rather than imply valid data. Component regressions verify unavailable labels and prevent submitting partial data.
- Added-only membership drift must direct the user to explicit catalog reload. A regression proves selective refresh preserves membership and reload adopts it; removed selected rooms and null catalogs cannot submit a booking while drafts remain local.
- Successful mocked envelopes need the ancestor `RoomResult` typename required by the generated query/decoder. Corrected fixtures exercise actual installed-library decoding.
- Generated empty-argument types need a narrowly scoped ESLint exception in this application. Generated schema output still passes its regeneration and AOT checks.

The reviewer independently ran the **35 frontend tests** twice, including the final availability/session changes, and verified schema regeneration. They inspected the browser receipts: six fault/recovery cases, exactly 100 room requests over 100 route cycles and 100 preview remounts, real create/overlap/delete with exactly three write requests, and 31 seconds of on-demand expiry without fetching. Parent validation additionally passed baseline 28 frontend/14 backend tests, final production AOT, changed-file lint and Tandrove's full 444-test/package-consumer check.

Evidence limits are retained: a component-owned client is disposed on route exit, so the 750ms tail proves no post-destruction read during that observation, not cross-route retention reuse. The navigation scenario verifies no extra attempt/view survival; it does not separately instrument the browser's abort event. This scripted session does not establish ordinary long-session behavior. The backend has one hardcoded user, no room-update business endpoint, and an existing uncorrelated NgRx save-success subscription; multi-account and pending-save acceptance remain open.

No Tandrove package/runtime change, version bump or publication was needed. B7b.2a completes this bounded trial; B7b.2/B7b and performance/final-readiness gates remain open. Hosted CI and final merge evidence belong to the documentation PR.
