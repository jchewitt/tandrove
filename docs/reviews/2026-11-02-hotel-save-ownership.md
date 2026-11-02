# Hotel save ownership review

Independent reviewer: `/root/angular_compatibility_review`, November 2, 2026. The reviewer approved the application source and nine new regressions before commit and independently ran all 44 frontend tests in Chrome 156 using host Node 24.2.0. Parent validation also passed production AOT and changed-file lint; the application remains on Angular 21.2.17 and the original local Tandrove artifacts.

The review verified listener registration before dispatch, command-ID filtering of both terminal outcomes, component destruction cleanup, local duplicate-submit protection, isolated submitted fields, and edit-generation checks driven by actual input events. The change-back test ensures equality with submitted values does not erase later editing intent. Effect tests verify success, in-band business failure and HTTP failure preserve local correlation without adding metadata to the GraphQL input or retrying writes.

The [application patch](../trials/hotel/save-ownership.patch) applies after the initial integration at application revision `617a197d886a79140e648855b8e32524a5d6bf0e`. Its SHA256 is `8a66088d73a4b70d987d2703db9f89f65742015a8da8de72c2ea0f5fa537f670`. The exact-path Git whitespace attribute permits the unified patch's required blank context markers; other files retain normal checks.

This closes B7b.2b.1 only. Session-scoped NgRx state, account isolation, late authentication/read/save outcomes and browser validation remain separately tracked. The [follow-up report](../trials/hotel/SAVE-OWNERSHIP.md) does not present unit tests as new real-server account evidence. No library API, runtime, version or npm publication change is included.
