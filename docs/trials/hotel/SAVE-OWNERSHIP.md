# Hotel save ownership follow-up

November 2, 2026. B7b.2b.1 fixes the application issue identified in the [first trial](README.md). It changes the isolated hotel's NgRx/form integration, not Tandrove's runtime or public API. No package publication is required.

See the [independent review and patch hash](../../reviews/2026-11-02-hotel-save-ownership.md).

The previous component dispatched a create action and then subscribed to the next success from any command. A failed save left that listener active; another save, a replacement component, or navigation could trigger an obsolete callback.

Each create now carries a unique local `commandId` echoed by its effect on success, business failure and HTTP failure. That ID stays outside the GraphQL input: it is local correlation, not server idempotency. The editor subscribes before dispatch, filters for its own ID, settles on either terminal result, and releases the subscription on component destruction. Only its matching pending operation can clear the local submission guard. Duplicate clicks cannot issue a second command while it remains pending.

Save captures a separate frozen copy of the submitted flat fields and their edit generation. Controls remain editable. If a user edits while saving, success preserves the newer draft, displays that it is an unsent booking draft, and does not navigate away. An edit followed by changing back still advances the generation. Failure preserves the draft and permits a new-ID retry. This create-only form does not pretend that later edits changed the already-created reservation.

## Validation and boundaries

- All **44 frontend tests** pass: the previous 35 plus six component ownership scenarios and three effect result scenarios. Coverage includes synchronous completion inside dispatch, unrelated IDs, duplicate submission, failure/retry, destruction, immutable submitted values, later edits, and change-back editing.
- Production Angular AOT and lint of the changed application files pass. Tandrove's unchanged package validation is recorded with the review/PR.
- The first trial's real booking browser evidence is historical; this slice's new behavior is exercised by the Angular/effect tests. Real account/save race browser checks are a separate next slice.
- Session/authorization changes and the global NgRx cache still need their own boundary. The local ID fix alone does not prevent old-account data or alerts from entering a different session. Cancelling a request does not establish whether a server-side write committed.

Apply [save-ownership.patch](save-ownership.patch) after [integration.patch](integration.patch), or to the isolated application revision `617a197d886a79140e648855b8e32524a5d6bf0e`. It contains only application source/tests; the same reviewed local Tandrove tarballs and Angular version are retained. Run `npm run test:ci`, `npm run build` and changed-file lint in `frontend`.
