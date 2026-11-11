# Base-client scale and lifecycle measurements

**B7c remains open.** The desktop baseline and request-version, handle snapshot, store projection, validated-input and query-handle equality measurements below are synthetic, not a production workload, real application trial or proof of memory safety. The optimizations reduce refresh cost, but large-list latency remains a readiness finding. The [application trial](APPLICATION-TRIAL.md) and [final API decision](BASE-API-AUDIT.md) remain separate gates.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm measure:readiness
```

The command rebuilds core/GraphQL, runs a bounded Node subprocess, bundles the same public-API workload for Chromium, and writes `.artifacts/readiness/latest.json`. Browser bundle/metafile artifacts go to `output/playwright/readiness/`. Neither command publishes anything or overwrites the recorded baseline in `docs/measurements/`. Each Node run and browser profile has a five-minute limit; failure or timeout fails the command instead of producing a success report. Run it without concurrent builds, tests or other deliberate CPU load.

The report identifies the source commit, dirty state, runtime-source digest, harness-file hashes, browser-bundle hash, manifest versions and environment. Main contains unpublished B4–B7a changes while manifests still carry alpha.5; these measurements are not measurements of registry alpha.5. Reports collected before committing their harness or runtime candidate intentionally have `sourceDirty: true`. Use the hashes and reviewed source to identify what ran, not a claimed clean release tag.

## What is measured

- **Schema and operation planning:** 32, 128 and 512 fields on a generated object type, selecting 2, 8 or 24 fields. Schema construction, binding and full/narrow operation preparation are timed independently. Two warmups precede five individual samples. Fixture construction and post-call validation are outside each timer; these are warmed measurements, not cold startup.
- **Record refresh:** 100, 1,000 and 5,000 records in Node; 100 and 1,000 in Chromium. Eight selected integer fields, one wide subscriber and two narrow peers share the same address. Each pair refreshes all fields, then changes all fixture values and refreshes only `f0`. One warmup pair precedes three measured pairs in Node or five in Chromium. Order is fixed and results are not randomized comparative performance claims.
- **Refresh timing boundary:** wall time includes planning, in-process GraphQL execution, transport validity guards, decoding, shared commits and subscribed projections. Local GraphQL execution is timed separately; subtraction leaves a broad client/scheduling remainder, not an isolated cache or planner measurement. There is no HTTP, response JSON serialization or Angular rendering. Fixture changes, byte counting and post-read record assertions are outside timing. Bytes are UTF-8 response-body JSON, excluding headers and request bodies.
- **Correctness:** every refresh checks selected values, preserved siblings, shared consumer updates and stable membership/order. Unrelated subscriber snapshots retain identity and receive no notification on narrow refresh. Assertions fail the measurement if those contracts fail.
- **Browser lifecycle/heap:** a separate page lifetime holds one client and reacquires three scopes of 1,000 records, with two owners each and zero inactive retention. Three warmup batches precede five measured acquire/release batches. Reusing the same scopes verifies a new initial acquisition after eviction. Full GC precedes each baseline/active/released/disposed sample. Samples report the whole isolate's used/allocated JS heap, embedder heap and backing storage, plus harness-owned counters. Those counters are not internal store instrumentation. No historical handle, response or snapshot is retained by the harness between batches.
- **CPU sensitivity:** fresh browser contexts run at 1× and CDP 4× CPU throttling. This approximates reduced CPU availability on the same machine; it does not reproduce physical mobile hardware, limited RAM, network loss, battery behavior or another browser engine.

The raw report preserves all observations and min/median/max in milliseconds. Small sample counts do not support tail-percentile or statistical-confidence claims. GC and JIT can move observations; heap plateaus in this bounded test cannot establish that every lifecycle or application is leak-free.

## Acceptance and next investigation

### October 23 desktop baseline

The [raw baseline](measurements/b7-readiness-baseline.json) uses unchanged runtime source at `43a3766e61fe34c87f5f338663f7fd2b1af933b4`, Windows x64, Ryzen 9 7900X, roughly 32 GB RAM, Node 24.2.0 and Chromium 156.0.8078.4. It contains five planning samples, three Node refresh pairs and five browser refresh pairs per dimension/profile.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    56.05 |                            35.78 |
| Node                      |   1,000 |                 1,080.54 |                           418.94 |
| Node                      |   5,000 |                15,936.23 |                         3,621.83 |
| Chromium, 1×              |     100 |                    39.40 |                            23.10 |
| Chromium, 1×              |   1,000 |                   716.90 |                           274.10 |
| Chromium, 4× CPU throttle |     100 |                   190.20 |                           113.20 |
| Chromium, 4× CPU throttle |   1,000 |                 3,256.80 |                         1,267.40 |

**Finding PERF-01: large-list refresh latency blocks readiness.** The full 5,000-record Node refresh spends a median 12.21 ms in local GraphQL execution versus 15,936.23 ms overall. Separately, preparation of 24 selected fields in the 512-field schema takes a median 0.21 ms. These measurements justify profiling client work; they do not identify a particular internal function or establish a complexity class. Even the unthrottled 1,000-record browser scenario takes hundreds of milliseconds without network or UI rendering. A narrower response reduces work but does not make this workload ready for responsive application use.

Whole-isolate post-GC used heap at 1× was 2.87 MB at the warmed baseline, 30.54–30.56 MB while three scopes were active, 2.89–2.91 MB after releasing each batch and 2.82 MB after client disposal (decimal MB). At 4×, the corresponding ranges were 2.88 MB, 30.55–30.56 MB, 2.90–2.92 MB and 2.83 MB. Every released sample had zero harness-owned handles/subscriptions and zero in-flight fixture transport calls; 21 same-scope reacquisitions were verified per profile. This bounded run did not show accumulating retained data between batches. It does not establish an active-cache memory budget, internal timer counts, long-session behavior or a general absence of leaks.

### October 26 request-version index

The first PERF-01 slice replaces a flat collection of committed field-version stamps with maps keyed by canonical record identity and field path. A field conflict check now visits only that record's stamps. A conservative upper bound avoids scanning committed stamps when the request version cannot be older than any of them. Older disjoint responses cannot lower the bound. Root/membership replacement and disposal clear the index and bound together. Request intents, mark-only invalidation, context-only object markers and resource-wide retry/deduplication checks retain their existing semantics; these remain local generations, not authoritative server revisions.

The [full rerun](measurements/b7-version-index.json) uses the same three harness files, dimensions, sample counts, machine and software versions as the baseline. It records parent commit `0b6b22a8f51a6507fce517fc8fd9628a1040b8d3` with `sourceDirty: true` because the indexed runtime was measured before commit; its runtime digest identifies the candidate. Only `acquisition-versions.ts` changes in core/GraphQL runtime source. No tests, builds or other deliberate CPU workload ran alongside the measurements.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    49.22 |                            32.81 |
| Node                      |   1,000 |                   531.77 |                           370.53 |
| Node                      |   5,000 |                 2,716.69 |                         1,948.45 |
| Chromium, 1×              |     100 |                    33.20 |                            22.30 |
| Chromium, 1×              |   1,000 |                   334.60 |                           227.70 |
| Chromium, 4× CPU throttle |     100 |                   153.10 |                           102.90 |
| Chromium, 4× CPU throttle |   1,000 |                 2,071.30 |                         1,397.30 |

The 5,000-record Node full median falls from 15,936.23 to 2,716.69 ms (about 83%); its narrow median falls from 3,621.83 to 1,948.45 ms (about 46%). The unthrottled 1,000-record browser full median falls from 716.90 to 334.60 ms. However, the throttled 1,000-record narrow median rises from 1,267.40 to 1,397.30 ms in this run. These separate-session observations do not establish a universal speedup or resolve the responsiveness finding.

A [same-session attribution diagnostic](measurements/b7-version-index-ab.json) investigated that slower result. It runs the unchanged planning and refresh workloads in fresh Chromium contexts at 4×, in the order old → indexed → indexed → old. The old bundle substitutes only the previous `acquisition-versions.js`; the indexed bundle's hash matches the full rerun. Each context retains its own five measured pairs after one warmup pair, with no concurrent deliberate CPU load. At 1,000 records, old full medians were 4,658.10 and 4,583.60 ms versus indexed medians of 2,048.00 and 2,050.90 ms. Old narrow medians were 1,700.90 and 1,725.10 ms versus 1,397.90 and 1,403.40 ms. This supports improvement under the current session's conditions rather than a repeatable regression in this workload. It does not identify the cause of the difference between sessions or replace the formal observations above.

The [exact diagnostic script](measurements/b7-version-index-ab-script.txt) is archived as text to preserve the measured bytes and its reported SHA256. It is a one-off capture artifact. It ran as an `.mjs` file outside the repository, with the repository as working directory, `HEAD` at the recorded parent commit, the indexed source uncommitted, rebuilt candidate packages and `.artifacts/readiness/latest.json` from the full rerun. It reads the old module from that `HEAD`, verifies the candidate bundle and writes the diagnostic JSON alongside the script. Reproducing it requires restoring those inputs; running it against a later `HEAD` would not compare the same old implementation.

Post-GC used heap at 1× was 2.88 MB at the warmed baseline, 28.84–28.85 MB with three active scopes, 2.90–2.91 MB after release and 2.83 MB after disposal. At 4× it was 2.88 MB, 28.84–28.86 MB, 2.91–2.92 MB and 2.84 MB respectively. Released batches again had zero harness-owned handles/subscriptions and in-flight fixture transport calls, with 21 verified same-scope reacquisitions per profile. The active range is lower than the earlier roughly 30.55 MB observation; this is a whole-isolate observation, not isolated index allocation accounting or a general memory-safety claim.

Eight new public-behavior regression tests cover canonical composite identities and arguments, older disjoint commits, global deduplication/root guards, record-local null/replacement/error barriers, reentrant ingestion/disposal and root-reset reacquisition. The independent reviewer also compared 140,957 observations across 15,000 deterministic operations against the previous implementation without finding a behavior difference. Timing assertions are not added to machine-independent correctness tests.

### October 26 handle snapshot reuse

The next PERF-01 slice avoids rebuilding and serializing a query handle's wrapper when both its immutable store snapshot reference and handle error are unchanged. A changed view or error still takes the existing canonical equality path. Observed state and last-notified state remain separate: reading a peer before its callback must not consume that notification, and a reentrant A → B → A update can remain unnotified to consumers that never received B. The cached view reference advances even when the canonical value is unchanged. The change stays inside the acquisition handle; store projections and their equality checks are unchanged.

The [full rerun](measurements/b7-snapshot-cache.json) uses the same harness hashes, dimensions, sample counts, machine and software versions as the request-version index run. Its recorded parent is `b670a4e6a93ced4038c46e0ef61be279153e6a31`, with `sourceDirty: true` and the runtime digest identifying the candidate measured before commit. `acquisition.ts` is the only core/GraphQL runtime file changed from that parent. Measurements ran without concurrent deliberate builds, tests or probes.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    41.71 |                            28.91 |
| Node                      |   1,000 |                   436.28 |                           299.15 |
| Node                      |   5,000 |                 2,305.91 |                         1,575.38 |
| Chromium, 1×              |     100 |                    28.80 |                            19.10 |
| Chromium, 1×              |   1,000 |                   291.50 |                           191.10 |
| Chromium, 4× CPU throttle |     100 |                   133.40 |                            87.70 |
| Chromium, 4× CPU throttle |   1,000 |                 1,812.30 |                         1,178.30 |

Against the indexed runtime, the 5,000-record Node full/narrow medians improve by about 15%/19%; the unthrottled 1,000-record browser medians improve by about 13%/16%. These are observations from the unchanged synthetic workload, not general speedup guarantees or accepted responsiveness budgets. All selected-value, sibling-preservation, notification and membership assertions passed.

Post-GC whole-isolate used heap at 1× was 2.87 MB at baseline, 28.83–28.86 MB active, 2.90–2.92 MB released and 2.84 MB disposed. At 4× it was 2.87 MB, 28.83–28.84 MB, 2.89–2.91 MB and 2.82 MB respectively. Released batches again had zero harness-owned handles/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile. The bounded heap observations remain similar to the indexed run; they do not prove long-session memory safety or supply an active-cache budget.

Seven public-behavior regressions cover equivalent/unselected patches, peer reads before notification, reentrant A → B → A changes with read and unread peers, owner-only errors/reset, fetching-only transitions, disposal before notification and late responses after client cleanup. The independent reviewer also replayed 2,000 deterministic 40-action traces against the previous handle implementation, with 28,126 matching observations. Equality remains value-based when a reference changes; replacing it with reference-only notification rules would break the reentrant cases.

Separate Node CPU profiles before and after the fast path used the existing 1,000-record refresh workload with one warmup and three measured pairs. They include module startup, initial acquisition, fixture work and assertions, so their sampled inclusive times are attribution evidence rather than the wall-time benchmark above. Subtrees overlap and percentages must not be summed. `Handle.refreshSnapshot` fell from 1,230.88 sampled ms (27.81%) to 484.30 ms (12.97%). `View.update`, including projection and canonical equality, remained at 1,884.09 ms (42.57%) before and 1,912.48 ms (51.22%) after. This supports store projection/equality as the next target, without implying those profile differences are precise operation timings.

To repeat the attribution run at either source revision, rebuild its core/GraphQL packages, then run the existing workload with Node's CPU profiler (the output directory is created by the full measurement command):

```sh
node --cpu-prof --cpu-prof-dir=.artifacts/readiness --cpu-prof-name=snapshot-attribution.cpuprofile --input-type=module -e "import { runRefreshMeasurements } from './apps/billing-demo/bench/readiness-workload.mjs'; await runRefreshMeasurements({ recordCounts: [1000], warmup: 1, samples: 3 });"
```

### October 26 store projection reuse

This PERF-01 slice prepares canonical cell keys and frozen response paths once per immutable view selection. Records and subsequent updates reuse those descriptors, including nested aliases and argument-specific paths. The view compares projected data/status separately from `fetching`: request bookkeeping reuses the immutable projection and updates only a changed loading flag. Data commits still reproject and use canonical value equality. Every view updates before any callback; direct store callbacks retain their existing reentrant behavior, while acquisition handles keep their separate notification tracking. GraphQL operation planning and transactional commit cloning are unchanged.

The [full rerun](measurements/b7-store-projection.json) preserves the same harness hashes, dimensions, sample counts, machine and software versions as the handle snapshot run. Its parent is `3b08ab49d2790ed1b83c9ee885424e82bf529a76`; `sourceDirty: true` and the runtime digest identify the candidate measured before commit. Only `state-store.ts` changes in core/GraphQL runtime source. No deliberate tests, builds or probes ran concurrently with measurement.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    25.77 |                            11.21 |
| Node                      |   1,000 |                   264.84 |                           116.35 |
| Node                      |   5,000 |                 1,430.54 |                           663.32 |
| Chromium, 1×              |     100 |                    16.90 |                             7.40 |
| Chromium, 1×              |   1,000 |                   164.90 |                            68.90 |
| Chromium, 4× CPU throttle |     100 |                    77.80 |                            33.90 |
| Chromium, 4× CPU throttle |   1,000 |                 1,069.40 |                           455.20 |

Against the handle snapshot run, the 5,000-record Node full/narrow medians improve by about 38%/58%; unthrottled 1,000-record browser medians improve by about 43%/64%. All refresh correctness assertions passed, including preserved siblings and unaffected consumer notifications. These workload-specific observations do not establish universal speedups or acceptable application response times.

Post-GC whole-isolate used heap at 1× was 2.88 MB at baseline, 24.15–24.18 MB active, 2.90–2.93 MB released and 2.84 MB disposed. At 4× it was 2.88 MB, 24.15–24.16 MB, 2.90–2.91 MB and 2.83 MB respectively. The active range is lower than the prior roughly 28.84 MB observation. Released batches again had zero harness-owned handles/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile. These are bounded whole-isolate observations, not allocation accounting for a single cache or proof of long-session memory safety.

Seven new public store regressions cover loading-only/value-equal updates, request replacement and canonical argument/alias coverage, nested missing/null/error states, failed-batch atomicity, unknown/empty/null resources, reentrant commit/fetching/disposal and captured selection immutability. The independent reviewer also compared 600 deterministic 65-action traces against the previous store: 39,000 generated actions and 74,641 matching observations of snapshots, top-level reference changes, callbacks and failures. Inner record/path reference identity is not added as a public contract.

The same separate 1,000-record attribution profile described above puts `View.update` at 321.06 sampled inclusive ms (15.82%), down from 1,912.48 ms (51.22%) before this slice. Total sampled process time was 2,029.16 ms versus 3,733.97 ms. `canonicalInput` still accounts for 1,201.53 ms (59.21%) across multiple callers, including reconciliation and snapshot publication. These overlapping, process-wide samples include startup/fixture/assertion work; they identify repeated canonical copying/serialization as the next investigation, not precise per-operation timings or evidence to bypass validation.

### October 26 validated-input reuse

This PERF-01 slice reuses only null-prototype, deeply frozen, array-free object subgraphs allocated by `snapshotInput`. A private weak map records that provenance and lazily stores their canonical strings without allocating a separate metadata object per entry. Caller-owned values, including externally frozen objects and proxies around prior snapshots, still pass through validation and copying. Temporary copies made only for canonical serialization are not registered. No public trust marker, manually frozen projection shortcut or generic object-identity cache is introduced.

Arrays and objects containing arrays are not memoized: they still run through `Array.from` and native `JSON.stringify`, including inherited iteration and serialization hooks. Previously captured safe descendants may be reused inside those copies. `snapshotInput` promises immutable values, not distinct copy identities; arbitrary identity-sensitive custom hooks must not assume that each descendant is newly allocated. Canonical key ordering, finite JSON validation, omitted undefined object properties, rejected undefined array entries, cycle rejection and negative-zero normalization remain intact.

The [full rerun](measurements/b7-canonical-snapshots.json) uses the unchanged harness, dimensions, sample counts, machine and software versions. Parent `12810228fb262983beae28d6db2befe6de3ebafe`, `sourceDirty: true` and the runtime digest identify the measured candidate before commit. Only core `definition.ts` changes in core/GraphQL runtime source. No deliberate builds, tests or probes ran concurrently with measurement.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    18.11 |                             9.92 |
| Node                      |   1,000 |                   180.15 |                            98.47 |
| Node                      |   5,000 |                 1,145.74 |                           619.30 |
| Chromium, 1×              |     100 |                    13.50 |                             7.20 |
| Chromium, 1×              |   1,000 |                   121.80 |                            59.50 |
| Chromium, 4× CPU throttle |     100 |                    58.20 |                            30.00 |
| Chromium, 4× CPU throttle |   1,000 |                   769.60 |                           411.80 |

All 14 refresh medians improved relative to the store projection run. The 5,000-record Node full/narrow medians improve by about 20%/7%; unthrottled 1,000-record browser medians improve by about 26%/14%. These are workload-specific observations with small sample counts, not general performance guarantees or accepted budgets. All refresh and lifecycle correctness assertions passed.

A [same-session Node diagnostic](measurements/b7-canonical-node-ab.json) checks the largest dimension using fresh Node processes in baseline → candidate → candidate → baseline order. Each executes the unchanged complete planning/refresh workload, with one warmup and three measured refresh pairs per dimension. Only `definition.js` is substituted in the baseline bundle from the parent revision. At 5,000 records, baseline full medians were 1,474.76/1,453.45 ms versus candidate 1,035.77/1,110.66 ms; baseline narrow medians were 657.44/634.03 ms versus candidate 600.56/575.94 ms. All correctness assertions passed. Both variants are bundled identically as Node ESM for this diagnostic, unlike the formal unbundled Node run, so it corroborates improvement under the same session's conditions without replacing the formal report.

The [exact diagnostic script](measurements/b7-canonical-node-ab-script.txt) is archived without formatting to preserve its recorded SHA256. It ran as an `.mjs` file outside the repository with the repository as working directory, `HEAD` at the recorded parent, the candidate source uncommitted and packages rebuilt. It verifies the candidate's transpilation matches the built module and substitutes exactly one baseline module. Restoring those source/build inputs is required to reproduce the same comparison; a later `HEAD` would compare different code.

The memory tradeoff is explicit. At 1×, post-GC whole-isolate used heap was 3.93 MB at baseline, 22.02–22.05 MB active, 3.95–3.98 MB released and 3.89 MB disposed. At 4× it was 3.92 MB, 22.02–22.04 MB, 3.95–3.96 MB and 3.88 MB respectively. Active heap is about 2.1 MB lower than the prior run, but warmed/released/disposed usage is about 1.05 MB higher. Weak keys avoid strongly retaining snapshots; they do not promise that engine bookkeeping capacity returns immediately to the prior footprint. This report does not isolate that allocation or establish long-session boundedness. Released batches retain zero harness-owned handles/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile. The higher post-release footprint must be included in the remaining memory assessment before accepting a budget.

Eight public regressions cover normalized values and canonical addresses, invalid JSON, mutable/shallow-frozen callers, descriptors/proxies, cycles/shared descendants, failed and mixed copies, custom array iterators and later prototype hooks. The independent reviewer compared the final candidate against the previous implementation across 12,000 generated nested inputs and 23 edge factories, including captured/mixed forms: 24,025 comparisons matched normalized values, canonical strings, validation errors and deep freezing. Snapshot descendant reference identity is intentionally not an equality contract.

The separate Node attribution profile described above reports 1,612.96 sampled process ms versus 2,029.16 before. `canonicalInput` falls from 1,201.53 to 851.75 sampled inclusive ms (52.81% of the new total), and reconciliation falls from 422.40 to 187.45 ms. `Handle.refreshSnapshot` remains at 465.37 ms and `View.update` at 320.44 ms. Subtrees overlap and the process includes startup, fixtures and assertions; these are attribution clues, not additive or precise operation timings. Whole-view canonical equality remains the next target, with notification/reentrancy behavior preserved.

### November 2 query-handle equality reuse

This PERF-01 slice removes a second whole-snapshot canonical serialization in query handles. Each store view already computes a canonical string for its projection; a package-internal reader now exposes that string through a private weak lookup from the public frozen facade to its existing view. The lookup adds no public marker or registration API. Facades already retain the same view through method closures; the lookup is not keyed by historical snapshots.

Handles capture the projection string, fetching flag and a separately canonicalized error component. Last-observed and last-notified comparisons remain independent, preserving reads before callbacks and unseen reentrant A → B → A suppression. Last-notified state retains only strings/booleans, not an old snapshot graph. The existing unchanged-view/error fast path remains. Even an untyped custom `Error.message` still receives canonical validation rather than being silently accepted or compared only by reference. Store projection computation/equality, input validation, public `StateView`/package exports and source execution are unchanged.

A [fresh baseline](measurements/b7-view-equality-baseline.json) was captured before implementation on clean `dc39f44be4de1b824c7b57f1a2f18e720103a11c`. Its runtime digest matches the October 26 validated-input candidate, but its timings reflect this session's conditions. The [candidate rerun](measurements/b7-view-equality.json) records that same parent with `sourceDirty: true` and a new runtime digest. Only `acquisition.ts` and `state-store.ts` change in core/GraphQL runtime source. Both reports use the same unchanged harness hashes, sample counts, dimensions, package versions and machine/software environment. No deliberate builds, tests or probes ran concurrently with either measurement.

| Environment               | Records | Full refresh median (ms) | Single-field refresh median (ms) |
| ------------------------- | ------: | -----------------------: | -------------------------------: |
| Node                      |     100 |                    12.79 |                             5.90 |
| Node                      |   1,000 |                   129.07 |                            51.82 |
| Node                      |   5,000 |                   653.08 |                           279.30 |
| Chromium, 1×              |     100 |                     9.30 |                             3.50 |
| Chromium, 1×              |   1,000 |                    85.90 |                            30.20 |
| Chromium, 4× CPU throttle |     100 |                    41.00 |                            16.50 |
| Chromium, 4× CPU throttle |   1,000 |                   385.10 |                           148.10 |

All 14 candidate refresh medians improved against the fresh baseline. The 5,000-record Node full/narrow medians fell from 952.38/543.80 ms to 653.08/279.30 ms (about 31%/49%). Unthrottled 1,000-record Chromium fell from 117.00/60.00 ms to 85.90/30.20 ms (about 27%/50%); at 4× it fell from 536.50/278.80 ms to 385.10/148.10 ms. All refresh and lifecycle correctness assertions passed. These are bounded, small-sample observations, not universal speedups or accepted response-time budgets.

At 1×, post-GC whole-isolate used heap was 3.94 MB at baseline, 20.10–20.12 MB active, 3.96–3.99 MB released and 3.90 MB disposed. At 4× it was 3.94 MB, 20.11–20.12 MB, 3.97–3.99 MB and 3.90 MB respectively. Active usage is about 1.9 MB below the fresh baseline's roughly 22.02–22.05 MB. Warmed/released/disposed usage remains in a similar range, with small increases of several kilobytes; this slice does not resolve the earlier roughly 1.05 MB higher post-release footprint. Released batches again have zero harness-owned owners/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile. These observations neither isolate allocations nor establish long-session boundedness.

Five new public regressions cover reentrant stale-to-fresh cycles with early/unread peers, payload names that resemble metadata, valid and invalid untyped error messages, owner isolation, listener failures and unsubscription during reentrant publication. The reviewer independently passed 60 targeted tests and compared 1,200 deterministic 50-action traces: 60,000 actions and 391,164 matching observations of snapshots, outer-reference changes, callbacks and failures. The diagnostic drives previous/candidate handles through real current store facades; store behavioral logic is unchanged. It is tested-history equivalence evidence rather than a proof of every possible history.

Fresh before/after attribution profiles use the same separate 1,000-record workload described above. Total sampled process time fell from 1,607.03 to 1,170.17 ms. `Handle.refreshSnapshot` accounted for 462.37 sampled inclusive ms before and had no attributed samples afterward; this does not claim zero execution cost. `canonicalInput` fell from 870.22 to 371.41 ms, while `View.update` remained at 327.51/333.13 ms. Subtrees overlap and include startup, fixtures and assertions. The remaining store projection equality/copying path is the next focused investigation; these profiles do not justify bypassing input validation or accepting performance budgets.

### November 5 projection provenance experiment (rejected)

**This candidate was not adopted.** It constructed projected data through an internal factory and reused the existing private weak provenance only for fresh, canonical-order, array-free objects. Noncanonical aliases preserved their insertion order and used the previous path; arrays and their ancestors retained normal copying and prototype hooks. Public exports were unchanged. Independent correctness review passed, but the measured timing benefit did not justify additional retained heap and construction machinery.

The [fresh baseline](measurements/b7-projection-equality-baseline.json) ran on clean `5e0e13a1e547a66574a34690d6f74926db78aa4b`. The [experimental candidate](measurements/b7-projection-equality.json) records that parent, a dirty source tree and its runtime digest. Harness hashes, dimensions, sample counts and environment match. No deliberate builds/tests/probes ran concurrently with either measurement. All refresh and lifecycle assertions passed.

| Environment  | Records | Baseline full / narrow median (ms) | Candidate full / narrow median (ms) |
| ------------ | ------: | ---------------------------------: | ----------------------------------: |
| Node         |     100 |                       12.88 / 5.77 |                        12.57 / 5.29 |
| Node         |   1,000 |                     139.10 / 59.60 |                      127.14 / 50.82 |
| Node         |   5,000 |                    642.19 / 293.33 |                     636.43 / 273.37 |
| Chromium, 1× |     100 |                       11.00 / 4.90 |                         9.30 / 3.60 |
| Chromium, 1× |   1,000 |                     158.20 / 58.60 |                       85.40 / 31.10 |
| Chromium, 4× |     100 |                      65.60 / 36.80 |                       50.60 / 19.90 |
| Chromium, 4× |   1,000 |                    860.20 / 335.00 |                     408.70 / 152.80 |

The browser differences are much larger than the Node differences, and the fresh browser baseline is substantially slower than the prior session. These separate runs do not isolate the cause. Do not attribute a roughly 50% browser speedup to this candidate.

A [same-session Node diagnostic](measurements/b7-projection-node-ab.json) used fresh processes in baseline → candidate → candidate → baseline order with the unchanged complete planning/refresh workload and identically configured ESM bundles. Only the two changed modules were substituted from the parent. At 5,000 records, baseline full medians were 660.20/664.45 ms versus candidate 635.33/651.66 ms; narrow medians were 288.55/332.74 versus 280.29/276.23 ms. At 1,000 records, narrow medians were 51.01/51.44 versus 51.20/50.32 ms. Smaller dimensions were mixed. This corroborates a modest largest-list effect, not the browser result or a general speedup. Bundling differs from the formal Node report.

At 1×, whole-isolate post-GC baseline/active/released/disposed heap was approximately 3.94 / 20.10–20.12 / 3.96–3.99 / 3.90 MB before and 4.99 / 21.15–21.18 / 5.01–5.04 / 4.96 MB with the candidate. At 4× the candidate showed the same roughly 1.06 MB increase. Released samples had zero harness-owned owners/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile. This is a bounded whole-isolate observation, not allocation attribution or evidence of an accumulating leak. The increase would compound the previous provenance slice's unresolved footprint cost.

The candidate passed all 236 core tests. Independent review passed 37 targeted tests and compared 600 deterministic 65-action traces against the parent, with 39,000 actions and 74,641 matching observations including canonical projection strings, snapshots, references, notifications and failures. Three candidate regressions cover alias ordering/equality, array hooks and caller-owned wrappers. Correctness did not make this a worthwhile performance tradeoff. Runtime sources were restored, and no Changeset or release is needed for this investigation.

For reconstruction, apply the [archived candidate patch including tests](measurements/b7-projection-equality-candidate.patch) to the parent revision in an isolated checkout, install the pinned dependencies and rebuild core/GraphQL before running the unchanged measurement command. The [exact diagnostic script](measurements/b7-projection-node-ab-script.txt) must be copied unchanged to an `.mjs` file outside the repository and run with that checkout as working directory, `HEAD` at the parent and the candidate patch uncommitted. It checks transpilation, exact substitutions and stable source inputs, and records script/source hashes. Do not run it on later `HEAD` and describe that as the same comparison. See the [independent review](reviews/2026-11-05-projection-experiment.md).

### November 11 fixed-shape metadata copying

This B7c.2g slice avoids repeated property-descriptor inspection and key sorting when comparing store-owned projection metadata. A private copier builds the root, record and field-status metadata in canonical key order. Arbitrary payloads, paths, identities and errors still use the existing validating serialization copy. It introduces no retained cache, weak provenance entry or public API. The baseline attribution put substantially more time under projection equality than eager transactional cloning, so this slice leaves transaction cloning unchanged.

The specialized and generic paths share one ancestor set, including metadata arrays. If a custom iterator yields a parent record within its fields, the generic fallback rejects that cycle in the same traversal context. Iterated values use the specialized path only when they match the original metadata element at that index; reordered or injected values use generic validation. `Array.from`, frozen copied arrays and native `JSON.stringify` preserve iteration hooks, serialization receivers and property-key context. Field/resource errors are also copied generically because untyped changing getters can supply invalid values after the store's initial validation. No public snapshot key order changes.

The [fresh baseline](measurements/b7-metadata-baseline.json) ran on clean `7c40f90927534317984935f1773f86b6359f6e57`; the [candidate](measurements/b7-metadata-candidate.json) records that parent with dirty source and its runtime digest. Only `definition.ts` and `state-store.ts` change in core/GraphQL runtime source. Both reports use matching harness hashes, dimensions, sample counts, package versions and environment. No deliberate builds/tests/probes ran concurrently with measurement. All refresh and lifecycle assertions passed.

| Environment  | Records | Baseline full / narrow median (ms) | Candidate full / narrow median (ms) |
| ------------ | ------: | ---------------------------------: | ----------------------------------: |
| Node         |     100 |                       14.07 / 6.44 |                        11.65 / 4.77 |
| Node         |   1,000 |                     127.34 / 50.28 |                      115.52 / 41.00 |
| Node         |   5,000 |                    631.31 / 275.79 |                     572.89 / 231.73 |
| Chromium, 1× |     100 |                        8.80 / 3.60 |                         8.80 / 3.10 |
| Chromium, 1× |   1,000 |                      84.30 / 31.00 |                       82.20 / 27.80 |
| Chromium, 4× |     100 |                      39.40 / 15.60 |                       38.60 / 14.70 |
| Chromium, 4× |   1,000 |                    379.80 / 139.30 |                     375.00 / 136.60 |

Thirteen formal refresh medians decreased and one was equal. The 5,000-record Node medians decreased about 9% full and 16% narrow. Browser effects are smaller, particularly under throttling. Small samples and separate runs do not establish universal speedups, statistical confidence or accepted response-time budgets.

The [same-session Node diagnostic](measurements/b7-metadata-node-ab.json) ran fresh processes in baseline → candidate → candidate → baseline order using the unchanged complete planning/refresh workload. At 5,000 records, baseline full medians were 655.55/634.77 ms versus candidate 588.51/589.64 ms; narrow medians were 309.46/298.74 versus 226.49/227.83 ms. At 1,000 records, full medians were 127.95/122.46 versus 114.87/114.37 ms, and narrow medians were 50.12/48.20 versus 41.34/41.86 ms. This corroborates a Node benefit within the session. Both variants were identically bundled as ESM for this diagnostic, unlike the formal unbundled Node run, so it supplements rather than replaces that report.

At 1×, candidate post-GC whole-isolate heap was about 3.95 MB warmed, 20.11–20.14 MB active, 3.98–4.00 MB released and 3.92 MB disposed. At 4× it was 3.96 MB, 20.12–20.14 MB, 3.99–4.00 MB and 3.92 MB respectively. Corresponding baseline samples were roughly 15–19 KB lower. This is a small observed footprint increase, not an allocation explanation or a memory-safety guarantee. It does not resolve the earlier roughly 1 MB post-release footprint from validated-input reuse. Released samples again have zero harness-owned owners/subscriptions and in-flight fixture calls, with 21 verified reacquisitions per profile.

Five regressions cover canonical aliases and partial/null/error states, reordered/injected iterator values, shared ancestor detection, native serialization hook context, and untyped changing error getters. All 238 core tests passed. Independent review passed 39 targeted tests, compared 39,000 generated actions with 74,641 matching observations including canonical signatures, and matched eight hook cases against the parent. See the [review record](reviews/2026-11-11-metadata-copy.md).

To reproduce the diagnostic, preserve the [exact script](measurements/b7-metadata-node-ab-script.txt) as an `.mjs` file outside the repository. Run from an isolated checkout with `HEAD` at the parent above, the two candidate runtime files applied and core/GraphQL rebuilt with pinned dependencies. The script checks candidate transpilation, substitutes exactly the two baseline modules, verifies stable source inputs and records source/script/bundle hashes. Running it on a later `HEAD` compares different inputs. A core patch Changeset is batched with the existing release work; this measurement does not authorize publication.

### Remaining investigation

Timing and memory numbers are evidence, not automatically accepted budgets. Do not increase a budget to make a slow baseline pass. Establish application responsiveness and retained-memory budgets on the intended workload/device after profiling and rerunning any fixes.

**PERF-01 remains open.** B7c.2h will profile the remaining costs after metadata copying and select the next focused change only from that evidence. Preserve exact value equality, partial/null/error states, canonical ordering and reentrant publication; independently review and repeat the same dimensions before accepting a change. Attribute the higher post-release footprint from the earlier validated-input optimization before accepting memory budgets. The November 11 improvement does not close large-list responsiveness or readiness. Optimize compiled operation reuse only if profiling supports it.

B7c closes only after the scale finding is resolved or bounded by an explicitly accepted supported workload, repeated lifecycle and memory results are assessed, and a physical lower-powered environment or an explicitly agreed alternative supplies the remaining evidence. B7d must review that evidence before declaring extension readiness. The existing release PR remains batched.
