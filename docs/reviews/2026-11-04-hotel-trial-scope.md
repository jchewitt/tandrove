# Hotel library trial scope correction

November 4, 2026. Documentation-only correction following the user's clarification that the isolated hotel application exists to test Tandrove. The earlier separate application-maintainer handoff was unnecessary.

## Candidate scope

- Replace the application-maintainer approval requirement with independent technical review of the executed library integration evidence.
- Close B7b and its remaining parent tasks for the bounded tested scope, linking the existing reports and receipts.
- Preserve the absent room-edit-command coverage limit, create-only draft limits, synthetic accounts, finite DOM samples and scripted desktop-session scope. The SQL room change establishes selective refresh, not a business-command path.
- Leave B7c performance/memory/device work, B7d readiness and publication decisions open. No runtime, package version, trial application or receipt changes.

## Independent review and validation

The independent `trial_scope_correction_review` agent audited the linked reports and machine-readable receipts, then reviewed the candidate diff. The evidence supports bounded B7b closure with no unresolved correctness blocker identified in those records. The review requested removal of stale approval-gate wording from the membership and account-switch reports. Those corrections, the account-race historical pointer and the task overview were re-reviewed with no further actionable findings.

`pnpm check` passed on Node 24.2.0, covering formatting, builds, generated-schema consistency, type checking, tests and isolated installed JavaScript/TypeScript/Angular consumers. The packed Angular 20.1.0 checks passed APF, Zone/zoneless lifecycle, native ESM and AOT acceptance. Final documentation formatting and diff checks passed. The existing hotel runtime scenarios were not rerun for this documentation-only correction. Hosted CI remains required before merge, and publication stays batched.
