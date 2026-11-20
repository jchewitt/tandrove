# Matched Apollo Angular and Tandrove large-list benchmark

At 1,000 rows Apollo completed the initial read sooner in all 64 measured pairs. Tandrove completed the subsequent account ID refresh sooner in all 64. Initial acquisition is the next target for PERF-01. Profile the path from the first watch to both populated lists, then rerun both operations to check that any improvement preserves selective refresh performance.

Each cell gives the latency in milliseconds for run 1 / run 2. Runs used separate Chromium processes on the same Ryzen 9 7900X desktop. The p95 is the 31st sorted observation of 32 per client and size in each run. [Run 1](measurements/b7-apollo-angular-1.json) · [Run 2](measurements/b7-apollo-angular-2.json)

| Rows | Operation          | Apollo median | Tandrove median |      Apollo p95 |    Tandrove p95 |
| ---: | ------------------ | ------------: | --------------: | --------------: | --------------: |
|  100 | Initial read       |   8.35 / 8.10 |     8.90 / 9.05 |   10.10 / 10.00 |   11.80 / 11.00 |
|  100 | Account ID refresh | 10.55 / 10.65 |     6.50 / 6.40 |   11.80 / 12.10 |     7.50 / 7.00 |
| 1000 | Initial read       | 72.60 / 72.10 | 120.45 / 121.60 |   86.60 / 87.60 | 133.40 / 131.90 |
| 1000 | Account ID refresh | 96.30 / 94.50 |   59.75 / 60.95 | 108.00 / 113.80 |   70.20 / 64.40 |

Both clients made one request for the initial read and one for the refresh in every trial. At 100 rows the JSON response bodies were 19,441 and 8,357 bytes respectively. At 1,000 rows they were 198,470 and 84,859 bytes. These results apply to this desktop, the workspace runtime at the revision identified in the raw reports, and a refresh that changes the selected field on every row.

## Workload

Two independent Angular subscribers render all invoices in identical keyed lists. The first measurement starts when both watches open against an empty client cache. The second starts when one consumer requests fresh account IDs for the entire list. Apollo executes the demo’s narrow GraphQL document and shares the result through its normalized cache. Tandrove calls `invalidate('accountId')` on the existing handle. The fixture changes every account ID and also changes server-side amounts and user names, so the check can detect a full refetch or an incorrect cache merge.

The browser timer stops when Angular updates both lists in the DOM. Every trial checks every rendered invoice in both subscribers, including membership, order and the preserved amount, status and user name. The server checks cover request count, selected field names, errors and matching response-body sizes. The timing includes the loopback HTTP request, GraphQL execution, client processing and Angular DOM updates. Application bootstrap, bundle loading, verification, layout and screen paint are outside the timing target.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm measure:apollo
```

The command writes raw paired observations, median and p95 latencies, dependency versions and harness fingerprints to `.artifacts/matched/latest.json`. Copy that file before running a second comparison. Each run starts a fresh Chromium process. Within a run, each list size gets four warmup pairs followed by 32 measured pairs with alternating client order. Each sample starts a new Angular application and client cache on the same page. The bundle uses production runtime settings and a JIT-compiled Angular template. The comparison uses headless desktop Chromium with an unthrottled CPU.
