import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import {
  angularBuildTarget,
  angularPeerRange,
} from './angular-compatibility.mjs';

export function checkAngularPackage({
  root,
  artifacts,
  coreTarball,
  graphqlTarball,
  npm,
  registry = false,
  target = angularBuildTarget,
}) {
  const output = join(root, 'packages/angular/dist');
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, '__stale-build-probe.js'),
    'export const obsolete = true;\n',
  );
  execFileSync(process.execPath, [join(root, 'scripts/build-angular.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  const [packed] = JSON.parse(
    npm(
      ['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts],
      output,
    ),
  );
  const files = packed.files.map(({ path }) => path);
  for (const file of [
    'fesm2022/tandrove-angular.mjs',
    'index.d.ts',
    'package.json',
    'LICENSE',
    'README.md',
  ])
    assert.ok(files.includes(file), `Missing Angular package file: ${file}`);
  assert.ok(
    files.every((file) =>
      /^(fesm2022\/|index\.d\.ts(?:\.map)?$|package\.json$|LICENSE$|README\.md$)/.test(
        file,
      ),
    ),
  );
  const manifest = JSON.parse(
    readFileSync(join(output, 'package.json'), 'utf8'),
  );
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.exports['.'].types, './index.d.ts');
  assert.equal(
    manifest.exports['.'].default,
    './fesm2022/tandrove-angular.mjs',
  );
  assert.equal(manifest.typings, 'index.d.ts');
  assert.equal(manifest.module, 'fesm2022/tandrove-angular.mjs');
  assert.equal(manifest.main, undefined);
  assert.equal(manifest.types, undefined);
  assert.equal(manifest.dependencies['@tandrove/core'], undefined);
  assert.equal(
    manifest.peerDependencies['@tandrove/core'],
    JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'))
      .version,
  );
  assert.equal(manifest.peerDependencies['@angular/core'], angularPeerRange);
  assert.equal(
    readFileSync(join(output, 'LICENSE'), 'utf8'),
    readFileSync(join(root, 'LICENSE'), 'utf8'),
  );

  const tempRoot = realpathSync(tmpdir());
  const consumer = realpathSync(
    mkdtempSync(join(tempRoot, 'tandrove-angular-consumer-')),
  );
  try {
    const outside = relative(root, consumer);
    assert.ok(outside.startsWith('..') || isAbsolute(outside));
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    npm(
      [
        'install',
        '--strict-peer-deps',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        registry ? '--package-lock' : '--no-package-lock',
        ...(registry ? ['--prefer-online'] : []),
        '--registry=https://registry.npmjs.org/',
        registry ? `@tandrove/core@${manifest.version}` : coreTarball,
        registry ? `@tandrove/graphql@${manifest.version}` : graphqlTarball,
        registry
          ? `@tandrove/angular@${manifest.version}`
          : join(artifacts, packed.filename),
        ...[
          'core',
          'compiler',
          'compiler-cli',
          'common',
          'platform-browser',
          'platform-browser-dynamic',
          'platform-server',
        ].map((name) => `@angular/${name}@${target.angular}`),
        'graphql@16.14.2',
        'rxjs@7.8.2',
        'zone.js@0.15.1',
        'tslib@2.8.1',
        `typescript@${target.typescript}`,
      ],
      consumer,
    );
    const installed = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@tandrove/angular/package.json'),
        'utf8',
      ),
    );
    assert.equal(installed.name, '@tandrove/angular');
    assert.equal(installed.version, manifest.version);
    assert.deepEqual(installed.exports, manifest.exports);
    assert.deepEqual(installed.peerDependencies, manifest.peerDependencies);
    const installedCore = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@tandrove/core/package.json'),
        'utf8',
      ),
    );
    assert.equal(installedCore.name, '@tandrove/core');
    assert.equal(installedCore.version, manifest.version);
    for (const [name, version] of [
      ['@angular/core', target.angular],
      ['@angular/compiler-cli', target.angular],
      ['typescript', target.typescript],
    ])
      assert.equal(
        JSON.parse(
          readFileSync(
            join(consumer, 'node_modules', name, 'package.json'),
            'utf8',
          ),
        ).version,
        version,
      );
    const fixtureRoot = join(root, 'tests/fixtures/angular-consumer');
    for (const file of [
      'consumer.mjs',
      'owned-query.mjs',
      'consumer.ts',
      'tsconfig.json',
    ])
      writeFileSync(
        join(consumer, file),
        readFileSync(join(fixtureRoot, file)),
      );
    execFileSync(process.execPath, [join(consumer, 'consumer.mjs')], {
      cwd: consumer,
      stdio: 'inherit',
    });
    // Reuse the real behavioral suite against installed packages, not source
    // aliases. Both modes are explicit rather than relying on a major's default.
    writeFileSync(
      join(consumer, 'adapter.mjs'),
      "export * from '@tandrove/angular';\n",
    );
    for (const file of [
      'test-environment.mjs',
      'signal.test.mjs',
      'query.test.mjs',
    ])
      writeFileSync(
        join(consumer, file),
        readFileSync(join(root, 'packages/angular/test', file)),
      );
    for (const mode of ['zone', 'zoneless']) {
      const env = { ...process.env, TANDROVE_TEST_CHANGE_DETECTION: mode };
      execFileSync(process.execPath, [join(consumer, 'owned-query.mjs')], {
        cwd: consumer,
        stdio: 'inherit',
        env,
      });
      execFileSync(
        process.execPath,
        ['--test', 'signal.test.mjs', 'query.test.mjs'],
        { cwd: consumer, stdio: 'inherit', env },
      );
    }
    execFileSync(
      process.execPath,
      [
        join(
          consumer,
          'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js',
        ),
        '-p',
        'tsconfig.json',
      ],
      { cwd: consumer, stdio: 'inherit' },
    );
    assert.match(
      readFileSync(join(consumer, 'dist/consumer.js'), 'utf8'),
      /ɵɵdefineComponent/,
    );
    console.log(
      `${registry ? 'Public registry' : 'Tarball'} Angular ${target.angular} / TypeScript ${target.typescript}: APF, Zone/zoneless lifecycle, native ESM and AOT consumer passed: @tandrove/angular ${manifest.version}`,
    );
    if (registry)
      console.log(
        npm(
          ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
          consumer,
        ),
      );
  } finally {
    assert.equal(dirname(consumer), tempRoot);
    assert.ok(basename(consumer).startsWith('tandrove-angular-consumer-'));
    rmSync(consumer, { recursive: true, force: true });
  }
}
