import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { angularTarget } from './angular-compatibility.mjs';
import { checkAngularPackage } from './check-angular-package.mjs';

assert.equal(
  process.argv.length,
  3,
  'Specify one Angular version from the matrix.',
);
const target = angularTarget(process.argv[2]);
const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const artifacts = join(
  root,
  '.artifacts',
  'angular-compatibility',
  randomUUID(),
);
mkdirSync(artifacts, { recursive: true });
const manager = process.env.npm_execpath;
assert.ok(manager, 'Run this check using pnpm check:angular VERSION.');
const npm = (args, cwd) =>
  execFileSync(process.execPath, [manager, 'exec', 'npm', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

const [core] = JSON.parse(
  npm(
    ['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts],
    join(root, 'packages/core'),
  ),
);
// pnpm replaces the GraphQL package's workspace core dependency when packing.
const output = execFileSync(
  process.execPath,
  [manager, 'pack', '--json', '--pack-destination', artifacts],
  { cwd: join(root, 'packages/graphql'), encoding: 'utf8' },
);
const jsonStart = output.search(/^\{/m);
assert.ok(jsonStart >= 0, 'pnpm pack must return package metadata.');
const graphql = JSON.parse(output.slice(jsonStart));
checkAngularPackage({
  root,
  artifacts,
  coreTarball: join(artifacts, core.filename),
  graphqlTarball: graphql.filename,
  npm,
  target,
});
