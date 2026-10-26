---
'@tandrove/core': patch
---

Reuse handle snapshots without rebuilding and serializing their contents when the immutable state view and handle error are unchanged. Preserve value-based equality and notification tracking when state changes, including reentrant updates and reads before another consumer's notification.
