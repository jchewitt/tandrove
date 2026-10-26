---
'@tandrove/core': patch
---

Index committed request-version barriers by canonical record identity and field path, avoiding repeated scans of unrelated records during field refresh. A conservative version upper bound skips unnecessary barrier scans while preserving resource-wide intent, invalidation, structural replacement and membership race protection. No public API or authoritative server-version semantics change.
