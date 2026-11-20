import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, version as esbuildVersion } from 'esbuild';
import { BillingFixture } from '../../billing-api/src/fixture.js';
import { createBillingServer } from '../../billing-api/src/server.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bench = fileURLToPath(new URL('.', import.meta.url));
const pairs = 32;
const warmups = 4;
const rowCounts = [100, 1000];
const clients = ['apollo', 'tandrove'];

class ListFixture extends BillingFixture {
  prepare(count) {
    // Prepare both authoritative states outside the measured requests.
    this.snapshots = [1, 2].map((revision) => ({
      A: Array.from({ length: count }, (_, index) => {
        const n = index + 1;
        return {
          id: `INV-${n}`,
          tenantId: 'A',
          accountId: `A-ledger-${n}-v${revision}`,
          amountCents: 12000 + n * 500 + (revision - 1) * 1000,
          status: n % 2 ? 'OPEN' : 'PAID',
          user: {
            id: `USER-${n}`,
            tenantId: 'A',
            name: revision === 1 ? `Ada ${n}` : `Ada ${n} v2`,
          },
        };
      }),
      B: [],
    }));
    this.reads = 0;
  }

  snapshot() {
    assert.ok(this.reads < 2, 'Unexpected additional GraphQL request');
    return this.snapshots[this.reads++];
  }
}

const fixture = new ListFixture();
const { server } = createBillingServer(fixture);
const browserBundle = await build({
  entryPoints: [join(bench, 'matched-view.ts')],
  tsconfig: join(bench, '../tsconfig.app.json'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  define: {
    ngDevMode: 'false',
    'process.env.NODE_ENV': '"production"',
  },
});
const bundle = browserBundle.outputFiles[0];
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const manifest = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const demo = manifest('apps/billing-demo/package.json');
const report = {
  measuredAt: new Date().toISOString(),
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: Boolean(git('status', '--porcelain')),
  harnessSha256: Object.fromEntries(
    ['matched.mjs', 'matched-view.ts'].map((name) => [
      name,
      sha256(readFileSync(join(bench, name))),
    ]),
  ),
  browserBundleSha256: sha256(bundle.contents),
  environment: {
    node: process.version,
    os: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    esbuild: esbuildVersion,
    playwright: manifest('package.json').devDependencies['@playwright/test'],
    versions: {
      ...Object.fromEntries(
        ['@angular/core', '@apollo/client', 'apollo-angular', 'graphql'].map(
          (key) => [key, demo.dependencies[key]],
        ),
      ),
      ...Object.fromEntries(
        ['angular', 'core', 'graphql'].map((key) => [
          `@tandrove/${key}`,
          manifest(`packages/${key}/package.json`).version,
        ]),
      ),
    },
  },
  settings: {
    pairs,
    warmupPairs: warmups,
    rowCounts,
    subscribers: 2,
    schedule:
      'One browser page, fresh Angular application and empty client cache per sample. Interleaved pairs alternate client order.',
    workload:
      'One initial list read, then one accountId refresh changing that field on every row. Both Angular views render every row.',
    timing:
      'Browser performance.now from action to both Angular DOM updates. Excludes app startup, template compilation during startup, verification and teardown. DOM updates precede screen paint.',
    server:
      'Loopback HTTP billing fixture with GraphQL validation and execution; no artificial network delay, response compression or CPU throttle.',
    statistics:
      'Median of the two central observations and nearest-rank p95 across 32 measured samples per client and size.',
  },
  samples: [],
  summary: [],
};
const selectFields = [
  [
    '__typename',
    'accountId',
    'amountCents',
    'billing',
    'id',
    'invoices',
    'name',
    'status',
    'tenantId',
    'user',
  ],
  ['__typename', 'accountId', 'billing', 'id', 'invoices', 'tenantId'],
];
const browser = await chromium.launch({ headless: true });
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  report.environment.chromium = browser.version();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  // Serve only the HTML from Playwright, then remove interception before timing real HTTP.
  await page.route('**/__matched', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><matched-root></matched-root></body></html>',
    }),
  );
  await page.goto(origin + '/__matched');
  await page.unroute('**/__matched');
  await page.addScriptTag({ content: bundle.text });

  async function trial(client, rowCount) {
    const reset = await fetch(origin + '/__fixture/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });
    assert.equal(reset.status, 200);
    await reset.text();
    fixture.prepare(rowCount);
    const timing = await page.evaluate(
      async (input) => {
        const { fullMs, narrowMs, fullRows, narrowRows } =
          await globalThis.runMatchedTrial(input);
        // Walk all rendered cells after both clocks stop; only timings cross the automation bridge.
        for (const [phase, views] of [fullRows, narrowRows].entries()) {
          if (views.length !== 2)
            throw Error('Expected two rendered subscribers');
          for (const rows of views) {
            if (rows.length !== input.rowCount)
              throw Error('Unexpected list membership');
            for (const [index, row] of rows.entries()) {
              const n = index + 1;
              const expected = `INV-${n}|A-ledger-${n}-v${phase + 1}|${12000 + n * 500}|${n % 2 ? 'OPEN' : 'PAID'}|Ada ${n}`;
              if (row !== expected)
                throw Error(`Rendered row mismatch: ${row} vs ${expected}`);
            }
          }
        }
        return { fullMs, narrowMs };
      },
      { client, rowCount, endpoint: '/graphql' },
    );
    assert.deepEqual(failures, []);
    for (const value of Object.values(timing))
      assert.ok(Number.isFinite(value) && value > 0);
    const response = await fetch(origin + '/__fixture/requests');
    assert.equal(response.status, 200);
    const { count, records } = await response.json();
    assert.equal(count, 2);
    assert.equal(records.length, 2);
    for (const [index, record] of records.entries()) {
      assert.deepEqual(record.errors, []);
      assert.deepEqual(record.fields.toSorted(), selectFields[index]);
    }
    return {
      client,
      rowCount,
      ...timing,
      responseBytes: records.map((r) => r.responseBytes),
    };
  }

  for (const rowCount of rowCounts) {
    console.log(
      `Running ${warmups} warmup and ${pairs} measured pairs at ${rowCount} rows.`,
    );
    for (let pair = -warmups; pair < pairs; pair++) {
      const order = pair % 2 === 0 ? clients : clients.toReversed();
      const results = [];
      for (const client of order) results.push(await trial(client, rowCount));
      assert.deepEqual(results[0].responseBytes, results[1].responseBytes);
      if (pair >= 0) {
        report.samples.push(
          ...results.map((result, position) => ({
            pair: pair + 1,
            position: position + 1,
            ...result,
          })),
        );
      }
    }
    for (const client of clients) {
      const samples = report.samples.filter(
        (s) => s.rowCount === rowCount && s.client === client,
      );
      const stats = (key) => {
        const sorted = samples.map((s) => s[key]).sort((a, b) => a - b);
        return {
          medianMs: (sorted[pairs / 2 - 1] + sorted[pairs / 2]) / 2,
          p95Ms: sorted[Math.ceil(pairs * 0.95) - 1],
        };
      };
      report.summary.push({
        rowCount,
        client,
        samples: samples.length,
        full: stats('fullMs'),
        narrow: stats('narrowMs'),
        responseBytes: samples[0].responseBytes,
      });
    }
  }
} finally {
  await browser.close();
  if (server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}
const output = join(root, '.artifacts/matched');
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, 'latest.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report.summary, null, 2));
console.log(
  'Raw samples and provenance saved to .artifacts/matched/latest.json.',
);
