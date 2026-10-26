---
'@tandrove/core': patch
---

Reuse internally validated, immutable array-free input snapshots and their canonical strings to reduce repeated identity and argument processing. Caller-owned inputs remain validated on every call. Arrays continue through iteration and native serialization rather than being memoized.
