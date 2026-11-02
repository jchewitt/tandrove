import semver from 'semver';

export const registry = 'https://registry.npmjs.org/';
const names = ['core', 'graphql', 'angular'].map((part) => `@tandrove/${part}`);

/** npm provenance uses the workflow revision, so checkout must match it. */
export function validateWorkflowRevision({ head, workflowSha }) {
  if (!workflowSha || head !== workflowSha)
    throw new Error(
      'Release tag must match the exact workflow dispatch commit.',
    );
}

/** Validate the complete, dependency-ordered release set before any mutation. */
export function validateRelease({ manifests, config, tag }) {
  if (config.ready !== true)
    throw new Error('Packages are not marked ready for release.');
  if (
    config.distTag !== 'next' ||
    config.packages?.length !== names.length ||
    manifests.length !== names.length
  )
    throw new Error('Release requires the complete three-package next set.');
  const version = manifests[0].version;
  const prerelease = semver.prerelease(version);
  if (
    !semver.valid(version) ||
    !semver.gte(version, '0.1.0-0') ||
    prerelease?.length !== 2 ||
    prerelease[0] !== 'alpha' ||
    typeof prerelease[1] !== 'number'
  )
    throw new Error('Only alpha.N prereleases at or above 0.1.0 are enabled.');
  if (tag !== `tandrove-v${version}`)
    throw new Error(
      `Set RELEASE_TAG to tandrove-v${version} in this terminal session; the release tag must exactly match the package version.`,
    );
  for (const [index, manifest] of manifests.entries()) {
    const entry = config.packages[index];
    const part = ['core', 'graphql', 'angular'][index];
    if (
      entry.packageName !== names[index] ||
      entry.packageDirectory !== `packages/${part}` ||
      entry.publishDirectory !==
        `packages/${part}${part === 'angular' ? '/dist' : ''}`
    )
      throw new Error(
        'Release package names, directories and order must match the approved set.',
      );
    validateManifest(manifest, names[index], version);
  }
  validateDependencies(manifests, version, true);
  return { version, tag };
}

export function validateManifest(manifest, name, version) {
  if (manifest.private) throw new Error('Private packages cannot be released.');
  if (manifest.name !== name || manifest.version !== version)
    throw new Error(
      'Package name/version does not match the release configuration.',
    );
  if (
    manifest.publishConfig?.tag !== 'next' ||
    manifest.publishConfig?.access !== 'public' ||
    manifest.publishConfig?.registry !== registry
  )
    throw new Error(
      'Releases must target the public npm registry and next tag.',
    );
  if (
    manifest.license !== 'MIT' ||
    manifest.repository?.url !== 'git+https://github.com/jchewitt/tandrove.git'
  )
    throw new Error(
      'Published packages require the MIT license and source repository metadata.',
    );
}

export function validatePreparedRelease(prepared, release) {
  if (
    prepared.head !== release.head ||
    prepared.tag !== release.tag ||
    prepared.version !== release.version
  )
    throw new Error(
      'Prepared artifacts belong to a different source commit or release.',
    );
  if (prepared.artifacts?.length !== release.config.packages.length)
    throw new Error(
      'Prepared artifacts must contain the complete release set.',
    );
  for (const [index, artifact] of prepared.artifacts.entries()) {
    const name = release.config.packages[index].packageName;
    const filename =
      name.slice(1).replace('/', '-') + '-' + release.version + '.tgz';
    if (
      artifact.name !== name ||
      artifact.version !== release.version ||
      artifact.filename !== filename ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(artifact.integrity)
    )
      throw new Error(
        'Prepared artifact name, path, version or SHA512 is invalid.',
      );
  }
}

export function validateDependencies(manifests, version, workspace = false) {
  const graphqlCore = manifests[1].dependencies?.[names[0]];
  if (graphqlCore !== version && !(workspace && graphqlCore === 'workspace:*'))
    throw new Error('GraphQL must depend on the exact released core version.');
  if (manifests[2].peerDependencies?.[names[0]] !== version)
    throw new Error(
      'Angular must peer-depend on the exact released core version.',
    );
  for (const manifest of manifests)
    for (const [name, range] of Object.entries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    })) {
      if (
        name.startsWith('@jchewitt/stateql-') ||
        name.startsWith('@launch-echo/stateql-')
      )
        throw new Error('Old-scope dependencies cannot be published.');
      if (!workspace && range.startsWith('workspace:'))
        throw new Error('Workspace dependency ranges cannot be published.');
    }
}

/** Check the actual tarball, including Angular's generated APF entrypoints. */
export function validatePackedPackage({ manifest, files, entry, version }) {
  validateManifest(manifest, entry.packageName, version);
  const angular = entry.packageName === names[2];
  const required = angular
    ? ['fesm2022/tandrove-angular.mjs', 'index.d.ts']
    : ['dist/index.js', 'dist/index.d.ts'];
  if (entry.packageName === names[1])
    required.push('dist/codegen.js', 'dist/codegen.d.ts');
  for (const path of ['package.json', 'README.md', 'LICENSE', ...required])
    if (!files.includes(path)) throw new Error(`Missing packed file: ${path}`);
  const allowed = angular
    ? /^(fesm2022\/|index\.d\.ts(?:\.map)?$|package\.json$|README\.md$|LICENSE$)/
    : /^(dist\/|package\.json$|README\.md$|LICENSE$)/;
  if (
    files.some((path) => !allowed.test(path) || path.split('/').includes('..'))
  )
    throw new Error('Unexpected file in published package.');
  if (angular) {
    if (
      manifest.exports?.['.']?.default !== './fesm2022/tandrove-angular.mjs' ||
      manifest.exports?.['.']?.types !== './index.d.ts' ||
      manifest.scripts ||
      manifest.devDependencies
    )
      throw new Error('Angular must publish its generated APF manifest.');
  } else if (
    manifest.exports?.['.']?.import !== './dist/index.js' ||
    manifest.exports?.['.']?.types !== './dist/index.d.ts'
  )
    throw new Error(
      'Packed entrypoints must match the JavaScript/declaration build.',
    );
}

/** Publication preflight uses direct endpoints to detect already accepted versions. */
export async function readRegistryVersion(name, version, fetcher = fetch) {
  const response = await fetcher(
    `${registry}${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: { accept: 'application/json' },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Registry preflight failed (${response.status}) for ${name}@${version}.`,
    );
  return response.json();
}

/** Installation acceptance additionally requires the npm install index. */
export async function readInstallableRegistryVersion(
  name,
  version,
  fetcher = fetch,
) {
  const response = await fetcher(`${registry}${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: 'application/vnd.npm.install-v1+json',
      'cache-control': 'no-cache',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Registry preflight failed (${response.status}) for ${name}@${version}.`,
    );
  const index = await response.json();
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (
    index?.name !== name ||
    !object(index.versions) ||
    !object(index['dist-tags'])
  )
    throw new Error(`Malformed registry installation index for ${name}.`);
  const selected = Object.hasOwn(index['dist-tags'], version)
    ? index['dist-tags'][version]
    : version;
  if (typeof selected !== 'string')
    throw new Error(`Malformed registry tag for ${name}.`);
  if (!Object.hasOwn(index.versions, selected)) return null;
  const metadata = index.versions[selected];
  if (!object(metadata))
    throw new Error(`Malformed registry version for ${name}.`);
  return metadata;
}

export function validateRegistryPackage(metadata, artifact, requireProvenance) {
  if (
    metadata.name !== artifact.name ||
    metadata.version !== artifact.version ||
    metadata.dist?.integrity !== artifact.integrity
  )
    throw new Error(
      `Registry contents differ from the prepared artifact: ${artifact.name}@${artifact.version}.`,
    );
  if (
    requireProvenance &&
    (metadata.dist?.attestations?.provenance?.predicateType !==
      'https://slsa.dev/provenance/v1' ||
      !metadata.dist?.attestations?.url?.startsWith(registry))
  )
    throw new Error(
      `Registry provenance is missing for ${artifact.name}; local bootstrap versions cannot resume through CI.`,
    );
}

/** Inspect every package before publishing any, then verify every result. */
export async function publishReleaseSet({
  artifacts,
  lookup,
  publish,
  requireProvenance = false,
  verifyOnly = false,
  availability = {},
  availabilityLookup = lookup,
}) {
  if (verifyOnly) {
    await verifyRegistryAvailability({
      artifacts,
      lookup: availabilityLookup,
      requireProvenance,
      ...availability,
    });
    return;
  }
  const existing = [];
  for (const artifact of artifacts) {
    const metadata = await lookup(artifact);
    if (metadata) {
      validateRegistryPackage(metadata, artifact, requireProvenance);
      const tagged = await lookup(artifact, 'next');
      if (!tagged)
        throw new Error(
          'Published package has no next tag; inspect registry tags before resuming.',
        );
      validateRegistryPackage(tagged, artifact, requireProvenance);
    }
    existing.push(metadata);
  }
  if (!verifyOnly)
    for (const [index, artifact] of artifacts.entries())
      if (!existing[index]) await publish(artifact);
  await verifyRegistryAvailability({
    artifacts,
    lookup: availabilityLookup,
    requireProvenance,
    ...availability,
  });
}

/** Retry only registry absence, never publication or conflicting metadata. */
export async function verifyRegistryAvailability({
  artifacts,
  lookup,
  requireProvenance = false,
  timeoutMs = 0,
  intervalMs = 30_000,
  now = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onPending = () => {},
}) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  )
    throw new Error(
      'Registry wait requires a nonnegative timeout and positive interval.',
    );
  const deadline = now() + timeoutMs;
  for (;;) {
    const pending = [];
    for (const artifact of artifacts) {
      const current = await lookup(artifact);
      if (!current) {
        pending.push(artifact.name);
        continue;
      }
      validateRegistryPackage(current, artifact, requireProvenance);
      const tagged = await lookup(artifact, 'next');
      if (!tagged) {
        pending.push(artifact.name + ' (next tag)');
        continue;
      }
      validateRegistryPackage(tagged, artifact, requireProvenance);
    }
    if (pending.length === 0) return;
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new Error(
        `Registry availability still pending: ${pending.join(', ')}. Uploads may already be accepted. Keep the prepared artifacts and run release:verify with the same RELEASE_TAG; do not republish while processing is pending.`,
      );
    onPending(pending);
    await sleep(Math.min(intervalMs, remaining));
  }
}
