import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import {
  angularBuildTarget,
  angularCompatibilityTargets,
  angularPeerRange,
} from '../scripts/angular-compatibility.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));

test('Angular build floor and CI targets stay aligned with the supported peer contract', () => {
  const manifest = json('packages/angular/package.json');
  assert.equal(manifest.peerDependencies['@angular/core'], angularPeerRange);
  for (const name of ['core', 'compiler', 'compiler-cli'])
    assert.equal(
      manifest.devDependencies[`@angular/${name}`],
      angularBuildTarget.angular,
    );
  assert.equal(
    manifest.devDependencies.typescript,
    angularBuildTarget.typescript,
  );
  const workflow = parse(read('.github/workflows/ci.yml'));
  assert.deepEqual(
    workflow.jobs['angular-compatibility'].strategy.matrix.angular,
    angularCompatibilityTargets.map(({ angular }) => angular),
  );
});

test('root is private and the runtime foundation has no framework or platform dependencies', () => {
  assert.equal(json('package.json').private, true);
  const manifest = json('packages/core/package.json');
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.peerDependencies ?? {}, {});
  const compiler = json('tsconfig.base.json').compilerOptions;
  assert.deepEqual(compiler.lib, ['ES2022']);
  assert.deepEqual(compiler.types, []);
});

test('source packages route publishing through reviewed artifacts', () => {
  for (const part of ['core', 'graphql', 'angular'])
    assert.equal(
      json(`packages/${part}/package.json`).scripts.prepublishOnly,
      'node ../../scripts/publish-from-artifacts-only.mjs',
    );
});

test('published entrypoints match the declaration build and explicit package allowlist', () => {
  const manifest = json('packages/core/package.json');
  assert.equal(manifest.exports['.'].types, './dist/index.d.ts');
  assert.equal(manifest.exports['.'].import, './dist/index.js');
  assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE']);
  assert.equal(manifest.license, 'MIT');
  assert.equal(
    manifest.repository.url,
    'git+https://github.com/jchewitt/tandrove.git',
  );
});

test('release packages share scope, alpha version, repository metadata and compatible core edges', () => {
  const core = json('packages/core/package.json');
  for (const name of ['core', 'graphql', 'angular']) {
    const manifest = json(`packages/${name}/package.json`);
    assert.equal(manifest.name, `@tandrove/${name}`);
    assert.equal(manifest.version, core.version);
    assert.match(manifest.version, /^0\.[1-9]\d*\.\d+-alpha\.\d+$/);
    assert.notEqual(manifest.private, true);
    assert.equal(manifest.license, 'MIT');
    assert.equal(
      manifest.repository.url,
      'git+https://github.com/jchewitt/tandrove.git',
    );
    assert.equal(manifest.repository.directory, `packages/${name}`);
    assert.deepEqual(manifest.publishConfig, {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
      tag: 'next',
    });
  }
  assert.equal(
    json('packages/graphql/package.json').dependencies[core.name],
    'workspace:*',
  );
  assert.equal(
    json('packages/angular/package.json').peerDependencies[core.name],
    core.version,
  );
  assert.deepEqual(json('.changeset/config.json').fixed, [
    [core.name, '@tandrove/graphql', '@tandrove/angular'],
  ]);
});

test('workflows parse, pin actions, and never run privileged pull-request code', () => {
  for (const name of readdirSync(new URL('.github/workflows/', root))) {
    const workflow = parse(read(`.github/workflows/${name}`));
    assert.ok(workflow.on);
    assert.equal(workflow.on.pull_request_target, undefined);
    assert.equal(workflow.permissions.contents, 'read');
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
      }
    }
  }
});

test('publishing requires the main release plan and npm environment', () => {
  const release = parse(read('.github/workflows/publish.yml'));
  assert.deepEqual(release.on.push.branches, ['main']);
  assert.ok(release.on.workflow_dispatch);
  assert.equal(release.jobs.plan.if, "github.ref == 'refs/heads/main'");
  assert.equal(release.jobs.publish.needs, 'plan');
  assert.equal(release.jobs.publish.if, "needs.plan.outputs.publish == 'true'");
  assert.equal(release.jobs.publish.environment, 'npm');
  assert.equal(release.jobs.publish.permissions['id-token'], 'write');
  assert.equal(typeof json('release.config.json').ready, 'boolean');
});
