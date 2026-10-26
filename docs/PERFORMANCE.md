# Base-client scale and lifecycle measurements

**B7c remains open.** The desktop baseline, request-version index and handle snapshot reuse measurements below are synthetic, not a production workload, real application trial or proof of memory safety. The optimizations reduce refresh cost, but large-list latency remains a readiness finding. The [application trial](APPLICATION-TRIAL.md) and [final API decision](BASE-API-AUDIT.md) remain separate gates.

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

### Remaining investigation

Timing and memory numbers are evidence, not automatically accepted budgets. Do not increase a budget to make a slow baseline pass. Establish application responsiveness and retained-memory budgets on the intended workload/device after profiling and rerunning any fixes.

**PERF-01 remains open.** The next focused slice is repeated store projection/equality work, which remains the largest of the profiled subtrees above. Reduce redundant work while preserving atomic cross-consumer reads, stable snapshot identity, fetching transitions and field freshness/error semantics. Continue measuring full and narrow reads at the same dimensions; the current 1,000-record browser times are still substantial before network or Angular rendering. Optimize compiled operation reuse only if profiling shows it materially addresses the observed cost; a fast preparation microbenchmark does not justify a plan cache by itself.

B7c closes only after the scale finding is resolved or bounded by an explicitly accepted supported workload, repeated lifecycle and memory results are assessed, and a physical lower-powered environment or an explicitly agreed alternative supplies the remaining evidence. B7d must review that evidence before declaring extension readiness. The existing release PR remains batched.
