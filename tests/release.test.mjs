import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publishReleaseSet,
  readRegistryVersion,
  readInstallableRegistryVersion,
  validateDependencies,
  validatePackedPackage,
  validatePreparedRelease,
  validateRegistryPackage,
  validateRelease,
  validateWorkflowRevision,
  verifyRegistryAvailability,
} from '../scripts/release-policy.mjs';

const version = '0.1.0-alpha.0';
const names = ['core', 'graphql', 'angular'].map((part) => '@tandrove/' + part);
function candidate() {
  return {
    manifests: names.map((name, index) => ({
      name,
      version,
      license: 'MIT',
      repository: { url: 'git+https://github.com/jchewitt/tandrove.git' },
      publishConfig: {
        tag: 'next',
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
      ...(index === 1 ? { dependencies: { [names[0]]: 'workspace:*' } } : {}),
      ...(index === 2 ? { peerDependencies: { [names[0]]: version } } : {}),
    })),
    config: {
      ready: true,
      distTag: 'next',
      packages: ['core', 'graphql', 'angular'].map((part, index) => ({
        packageName: names[index],
        packageDirectory: 'packages/' + part,
        publishDirectory: 'packages/' + part + (index === 2 ? '/dist' : ''),
      })),
    },
    tag: 'tandrove-v' + version,
  };
}

test('provenance revision must match the code being published', () => {
  assert.doesNotThrow(() =>
    validateWorkflowRevision({ head: 'same', workflowSha: 'same' }),
  );
  assert.throws(() =>
    validateWorkflowRevision({ head: 'older-tag', workflowSha: 'main' }),
  );
  assert.throws(() =>
    validateWorkflowRevision({ head: 'tag', workflowSha: undefined }),
  );
});
test('accepts an enabled synchronized alpha release in dependency order', () => {
  assert.equal(validateRelease(candidate()).version, version);
});
for (const [name, change] of [
  ['unready scaffold', (c) => (c.config.ready = false)],
  ['private package', (c) => (c.manifests[1].private = true)],
  ['different scope', (c) => (c.manifests[0].name = '@jchewitt/stateql-core')],
  [
    'superseded scope',
    (c) => (c.manifests[0].name = '@launch-echo/stateql-core'),
  ],
  ['superseded release tag', (c) => (c.tag = 'stateql-v' + version)],
  ['bootstrap version', (c) => (c.manifests[0].version = '0.0.0')],
  ['stable release', (c) => (c.manifests[0].version = '1.0.0')],
  ['unapproved beta', (c) => (c.manifests[0].version = '0.1.0-beta.0')],
  ['invalid semver', (c) => (c.manifests[0].version = '0.1.0-alpha.01')],
  ['mismatched tag', (c) => (c.tag = 'tandrove-v0.2.0-alpha.0')],
  ['missing tag', (c) => (c.tag = undefined)],
  ['latest distribution tag', (c) => (c.config.distTag = 'latest')],
  [
    'private registry',
    (c) => (c.manifests[1].publishConfig.registry = 'https://example.org/'),
  ],
  [
    'wrong source repository',
    (c) => (c.manifests[2].repository.url = 'https://example.org/'),
  ],
  ['wrong package order', (c) => c.config.packages.reverse()],
  ['incomplete release', (c) => c.manifests.pop()],
  [
    'Angular source directory',
    (c) => (c.config.packages[2].publishDirectory = 'packages/angular'),
  ],
  ['different versions', (c) => (c.manifests[2].version = '0.1.0-alpha.1')],
  [
    'incompatible peer',
    (c) => (c.manifests[2].peerDependencies[names[0]] = '0.0.0'),
  ],
]) {
  test('rejects ' + name, () => {
    const value = candidate();
    change(value);
    assert.throws(() => validateRelease(value));
  });
}

test('packed dependencies require resolved exact versions', () => {
  const { manifests } = candidate();
  assert.throws(() => validateDependencies(manifests, version));
  manifests[1].dependencies[names[0]] = version;
  assert.doesNotThrow(() => validateDependencies(manifests, version));
  for (const obsolete of [
    '@jchewitt/stateql-core',
    '@launch-echo/stateql-core',
  ]) {
    manifests[1].dependencies[obsolete] = version;
    assert.throws(() => validateDependencies(manifests, version));
    delete manifests[1].dependencies[obsolete];
  }
});

function packedAngular() {
  const c = candidate();
  return {
    manifest: {
      ...c.manifests[2],
      exports: {
        '.': {
          default: './fesm2022/tandrove-angular.mjs',
          types: './index.d.ts',
        },
      },
    },
    entry: c.config.packages[2],
    version,
    files: [
      'package.json',
      'README.md',
      'LICENSE',
      'fesm2022/tandrove-angular.mjs',
      'index.d.ts',
    ],
  };
}
test('Angular publication validates generated APF metadata and shipping files', () => {
  assert.doesNotThrow(() => validatePackedPackage(packedAngular()));
  for (const mutate of [
    (c) => (c.manifest.scripts = { build: 'ng-packagr' }),
    (c) =>
      (c.manifest.exports['.'].default =
        './dist/fesm2022/tandrove-angular.mjs'),
    (c) => c.files.pop(),
    (c) => c.files.push('src/public-api.ts'),
    (c) => c.files.push('types/../secret'),
    (c) => (c.manifest.version = '0.0.0'),
  ]) {
    const value = packedAngular();
    mutate(value);
    assert.throws(() => validatePackedPackage(value));
  }
});

const artifacts = names.map((name) => ({
  name,
  version,
  filename: name.slice(1).replace('/', '-') + '-' + version + '.tgz',
  integrity: 'sha512-' + 'a'.repeat(86) + '==',
}));
function metadata(artifact) {
  return {
    name: artifact.name,
    version: artifact.version,
    dist: {
      integrity: artifact.integrity,
      attestations: {
        url: 'https://registry.npmjs.org/-/npm/v1/attestations/example',
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  };
}

test('prepared release rejects wrong source, swapped packages, altered version and unsafe filenames', () => {
  const c = candidate();
  const release = { ...c, head: 'reviewed', version };
  const prepared = {
    head: 'reviewed',
    tag: c.tag,
    version,
    artifacts: structuredClone(artifacts),
  };
  assert.doesNotThrow(() => validatePreparedRelease(prepared, release));
  for (const mutate of [
    (p) => (p.head = 'unreviewed'),
    (p) => (p.tag = 'wrong'),
    (p) => p.artifacts.reverse(),
    (p) => (p.artifacts[0].filename = '../outside.tgz'),
    (p) => (p.artifacts[0].integrity = 'sha1-weak'),
    (p) => (p.artifacts[0].version = '0.1.0-alpha.1'),
  ]) {
    const value = structuredClone(prepared);
    mutate(value);
    assert.throws(() => validatePreparedRelease(value, release));
  }
});

test('registry HTTP 404 is absence; network, authentication, throttling and server errors abort', async () => {
  assert.equal(
    await readRegistryVersion(
      names[0],
      version,
      async () => new Response('', { status: 404 }),
    ),
    null,
  );
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      readRegistryVersion(
        names[0],
        version,
        async () => new Response('', { status }),
      ),
    );
  await assert.rejects(
    readRegistryVersion(names[0], version, async () => {
      throw new Error('network');
    }),
  );
  await assert.rejects(
    readRegistryVersion(
      names[0],
      version,
      async () => new Response('broken JSON'),
    ),
  );
});

test('registry verification uses the install index and waits for indexed versions and tags', async () => {
  const index = { name: names[0], versions: {}, 'dist-tags': {} };
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://registry.npmjs.org/%40tandrove%2Fcore');
    assert.equal(options.headers.accept, 'application/vnd.npm.install-v1+json');
    return Response.json(index);
  };
  assert.equal(
    await readInstallableRegistryVersion(names[0], version, fetcher),
    null,
  );
  index.versions[version] = metadata(artifacts[0]);
  assert.deepEqual(
    await readInstallableRegistryVersion(names[0], version, fetcher),
    metadata(artifacts[0]),
  );
  assert.equal(
    await readInstallableRegistryVersion(names[0], 'next', fetcher),
    null,
  );
  index['dist-tags'].next = version;
  assert.deepEqual(
    await readInstallableRegistryVersion(names[0], 'next', fetcher),
    metadata(artifacts[0]),
  );
  for (const broken of [
    {},
    { ...index, name: 'other' },
    { ...index, versions: null },
    { ...index, 'dist-tags': [] },
    { ...index, 'dist-tags': { next: null } },
    { ...index, versions: { [version]: null } },
  ]) {
    await assert.rejects(
      readInstallableRegistryVersion(names[0], 'next', async () =>
        Response.json(broken),
      ),
      /Malformed/,
    );
  }
});

test('registry checks exact name/version/integrity and CI provenance presence', () => {
  assert.doesNotThrow(() =>
    validateRegistryPackage(metadata(artifacts[0]), artifacts[0], true),
  );
  for (const mutate of [
    (m) => (m.name = names[1]),
    (m) => (m.version = '0.1.0-alpha.1'),
    (m) => (m.dist.integrity = 'different'),
    (m) => delete m.dist.attestations,
  ]) {
    const value = metadata(artifacts[0]);
    mutate(value);
    assert.throws(() => validateRegistryPackage(value, artifacts[0], true));
  }
  const bootstrap = metadata(artifacts[0]);
  delete bootstrap.dist.attestations;
  assert.doesNotThrow(() =>
    validateRegistryPackage(bootstrap, artifacts[0], false),
  );
});

test('preflights complete set, resumes exact published subset, publishes in order and verifies every result', async () => {
  const events = [];
  const published = new Map([[names[0], metadata(artifacts[0])]]);
  await publishReleaseSet({
    artifacts,
    requireProvenance: true,
    lookup: async (artifact, selector) => {
      events.push(['read', artifact.name, selector ?? version]);
      return published.get(artifact.name) ?? null;
    },
    publish: async (artifact) => {
      events.push(['publish', artifact.name]);
      published.set(artifact.name, metadata(artifact));
    },
  });
  assert.deepEqual(
    events.filter(([event]) => event === 'publish'),
    [
      ['publish', names[1]],
      ['publish', names[2]],
    ],
  );
  assert.equal(
    events.findIndex(([event]) => event === 'publish'),
    4,
  );
  for (const name of names) {
    assert.ok(
      events
        .slice(-6)
        .some(
          ([event, readName, selector]) =>
            event === 'read' && readName === name && selector === 'next',
        ),
    );
  }
});

test('bad existing contents or unknown lookup failures stop before any package is published', async () => {
  for (const failure of ['mismatch', 'network', 'newer-next']) {
    let writes = 0;
    await assert.rejects(
      publishReleaseSet({
        artifacts,
        lookup: async (artifact, selector) => {
          if (artifact.name !== names[2]) return null;
          if (failure === 'network') throw new Error('connection lost');
          const value = metadata(artifact);
          if (failure === 'mismatch' || selector === 'next')
            value.dist.integrity = 'wrong';
          return value;
        },
        publish: async () => {
          writes++;
        },
      }),
    );
    assert.equal(writes, 0);
  }
});

test('ambiguous publish failure stops immediately and retry inspects registry before continuing', async () => {
  const published = new Map();
  let calls = 0;
  const lookup = async (artifact) => published.get(artifact.name) ?? null;
  await assert.rejects(
    publishReleaseSet({
      artifacts,
      lookup,
      publish: async (artifact) => {
        calls++;
        published.set(artifact.name, metadata(artifact));
        throw new Error('response lost after registry accepted package');
      },
    }),
  );
  assert.equal(calls, 1);
  await publishReleaseSet({
    artifacts,
    lookup,
    publish: async (artifact) => {
      calls++;
      published.set(artifact.name, metadata(artifact));
    },
  });
  assert.equal(calls, 3);
});

test('verification is read-only and fails absent packages or changed next tags', async () => {
  let writes = 0;
  for (const missing of [true, false])
    await assert.rejects(
      publishReleaseSet({
        artifacts,
        verifyOnly: true,
        lookup: async (artifact, selector) => {
          if (missing) return null;
          const value = metadata(artifact);
          if (selector === 'next') value.version = '0.1.0-alpha.1';
          return value;
        },
        publish: async () => {
          writes++;
        },
      }),
    );
  assert.equal(writes, 0);
});

test('accepted uploads are not repeated while version and tag visibility catch up', async () => {
  let clock = 0;
  let uploaded = false;
  let writes = 0;
  const pending = [];
  await publishReleaseSet({
    artifacts,
    requireProvenance: true,
    lookup: async (artifact, selector) => {
      if (!uploaded || clock < 10 || (selector === 'next' && clock < 20))
        return null;
      return metadata(artifact);
    },
    publish: async () => {
      writes++;
      uploaded = true;
    },
    availability: {
      timeoutMs: 30,
      intervalMs: 10,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      onPending: (names) => pending.push(names),
    },
  });
  assert.equal(writes, 3);
  assert.equal(clock, 20);
  assert.equal(pending.length, 2);
});

test('verification waits read-only with one bounded deadline for the complete set', async () => {
  let clock = 0;
  let writes = 0;
  await assert.rejects(
    publishReleaseSet({
      artifacts,
      verifyOnly: true,
      lookup: async () => null,
      publish: async () => {
        writes++;
      },
      availability: {
        timeoutMs: 25,
        intervalMs: 10,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    }),
    /do not republish/,
  );
  assert.equal(clock, 25);
  assert.equal(writes, 0);
});

test('already published direct versions are not uploaded again when the install index lags', async () => {
  let clock = 0;
  let writes = 0;
  await publishReleaseSet({
    artifacts,
    requireProvenance: true,
    lookup: async (artifact) => metadata(artifact),
    availabilityLookup: async (artifact) =>
      clock < 10 ? null : metadata(artifact),
    publish: async () => {
      writes++;
    },
    availability: {
      timeoutMs: 20,
      intervalMs: 10,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
  });
  assert.equal(writes, 0);
  assert.equal(clock, 10);
});

test('availability waiting fails immediately on conflicting metadata, missing provenance or lookup errors', async () => {
  for (const failure of ['integrity', 'tag', 'provenance', 'network']) {
    let waits = 0;
    await assert.rejects(
      verifyRegistryAvailability({
        artifacts,
        requireProvenance: true,
        timeoutMs: 20,
        lookup: async (artifact, selector) => {
          if (failure === 'network') throw new Error('network failed');
          const result = metadata(artifact);
          if (failure === 'integrity') result.dist.integrity = 'wrong';
          if (failure === 'tag' && selector === 'next')
            result.version = '0.1.0-alpha.2';
          if (failure === 'provenance') delete result.dist.attestations;
          return result;
        },
        sleep: async () => {
          waits++;
        },
      }),
    );
    assert.equal(waits, 0);
  }
});
