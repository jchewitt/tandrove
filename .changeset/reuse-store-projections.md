---
'@tandrove/core': patch
---

Prepare canonical field addresses and response paths once per store view, and reuse immutable projected data for request-loading changes. Compare loading state separately while preserving value-based equality for data commits and updating every view before notifying consumers.
