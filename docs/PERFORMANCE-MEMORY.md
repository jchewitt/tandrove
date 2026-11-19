# Repeated cache eviction and retained browser heap

On November 19, 2026, a single Tandrove client completed 200 measured acquire/release cycles in desktop Chromium after three warmups. Every measured cycle reacquired previously evicted scopes and released its handles. Whole-isolate heap rose most between cycles 1 and 10, and more slowly thereafter. A separate historical comparison traced over 99% of the previously observed 1.05 MB increase after client disposal to the shallow size of an additional JavaScript `WeakMap` backing table. [Cycle receipt](measurements/b7-session-memory.json), [historical comparison](measurements/b7-session-attribution.json)

## One client across 200 cycles

The existing lifecycle fixture ran in one unthrottled page on a Ryzen 9 7900X desktop with Chromium 156.0.8078.4. Each cycle used the same three scope names, each with 1,000 records, eight selected fields and two subscribed handles. The fixture checks that a scope begins with unknown data, fetches exactly once for both owners and returns the expected values. Retention was zero. Each checkpoint sampled whole-isolate heap after full GC, first with six active owners, then after releasing them. The runner recorded checkpoints at cycle 1 and every tenth cycle through 200. It sampled once more after client disposal. The retained fixture/controller was accessible through the page during that final measurement. The runtime and exact browser bundle matched the [formal baseline](measurements/b7-post-metadata-baseline.json).

| Checkpoint after release | Used heap (bytes) |
| ------------------------ | ----------------: |
| Three warmups            |         3,769,064 |
| Cycle 1                  |         3,774,532 |
| Cycle 10                 |         4,838,392 |
| Cycle 50                 |         4,951,032 |
| Cycle 100                |         4,986,500 |
| Cycle 150                |         5,009,680 |
| Cycle 200                |         5,022,964 |
| After client disposal    |         4,937,820 |

The first five equally spaced released checkpoints (cycles 10–50) had median usage of 4,881,232 bytes. The last five (160–200) had a median of 5,022,964 bytes, an increase of 141,732 bytes. From cycle 100 to 200, released usage grew by 36,464 bytes. Active usage at cycle 200 was 21,272,116 bytes. This was 83.1 seconds of intensive synthetic cycling. The results characterize growth over these cycles; longer wall-clock sessions, distinct scope creation patterns and other devices can have different retention behavior.

The client made 609 acquisitions including warmups. The first three served new scopes and 606 verified reacquisition after eviction. Each released or disposed sample recorded zero active scopes, owners, subscriptions and in-flight fixture calls. The page recorded zero unhandled errors. These are fixture ownership counts and whole-isolate heap samples. They support the observed cleanup behavior without assigning all remaining heap to library objects.

## Historical footprint attribution

The October 26 validated-input change added weak provenance for reusable snapshots. To attribute the footprint observed then, a second script reconstructed both historical browser bundles and required their SHA256 hashes to match the recorded measurements. The only changed core/GraphQL runtime file between the reconstructed revisions was `definition.ts`. Each run used a fresh browser, the earlier planning and refresh warmup history, a page reload, three lifecycle warmups and five measured batches. Full GC preceded the original baseline, active, released and disposed checkpoint measurements. After the disposed reading, a CDP heap snapshot identified the shallow byte size of each distinct target of a `WeakMap` internal `table` edge. The receipt keeps those aggregates, the checkpoint readings and fixture counts. [October baseline](measurements/b7-store-projection.json), [October candidate](measurements/b7-canonical-snapshots.json), [attribution receipt](measurements/b7-session-attribution.json)

| Run order | Validated-input reuse | Disposed heap (bytes) | Unique WeakMap tables | Table bytes |
| --------- | --------------------- | --------------------: | --------------------: | ----------: |
| 1         | Before                |             2,843,272 |                     2 |         104 |
| 2         | After                 |             3,894,568 |                     3 |   1,048,700 |
| 3         | After                 |             3,895,120 |                     3 |   1,048,700 |
| 4         | Before                |             2,843,524 |                     2 |         104 |

Both after runs contained one additional 1,048,596-byte backing table. The paired differences in total used heap were 1,051,296 and 1,051,596 bytes. This explains the historical difference under the reproduced Chromium configuration. A table's shallow size measures its own storage capacity. Live snapshot counts, retained user records, and the source of each change in the separate 200-cycle trace were outside this attribution. All four runs finished with 24 requests, 21 verified reacquisitions and zero active owners/subscriptions or in-flight calls.

## Reproduction

Use an isolated checkout with core/GraphQL source matching the recorded [November baseline](measurements/b7-post-metadata-baseline.json), the pinned dependencies, and the matching Playwright Chromium binary. The memory scripts read the physical build artifacts. Run `pnpm measure:readiness` to build packages and write `output/playwright/readiness/workload.js`. From that checkout, copy the exact [session runner](measurements/b7-session-runner.txt) and [historical runner](measurements/b7-session-attribution-runner.txt) to `.mjs` files outside the repository. Supply an unused receipt filename for each command. If reconstructing on the original revision, also supply the November baseline report from this documentation revision.

```sh
node /path/to/retention-session.mjs /path/to/b7-post-metadata-baseline.json /path/to/new-session.json
node /path/to/retention-attribution.mjs /path/to/new-attribution.json
```

The session runner verifies the current runtime source digest, harness hash, browser bundle hash and Chromium version against the supplied formal report. The historical runner obtains sources from Git commits `12810228fb262983beae28d6db2befe6de3ebafe` and `c0d58c53f1cbe0c56378533aff3216180d9c73b1`. It substitutes them in the pinned build, checks both resulting bundle hashes and checks Chrome's version before measuring. Physical device validation and application responsiveness/memory budgets remain part of the base-readiness decision.
