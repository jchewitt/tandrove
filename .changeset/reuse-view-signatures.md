---
'@tandrove/core': patch
---

Reuse the store's canonical projection comparison in query handles instead of serializing whole snapshots again. Preserve value-based equality, separate read and notification tracking, loading transitions and owner-specific error validation.
