import { canonicalInput, type ResolvedField } from './definition.js';
import { leafPaths, pathPrefix } from './acquisition-coverage.js';
import type { FieldPath, StateChange } from './state-types.js';
import type { StateStore } from './state-store.js';

const overlaps = (a: FieldPath, b: FieldPath) =>
  pathPrefix(a, b) || pathPrefix(b, a);
interface Stamp {
  readonly path: FieldPath;
  readonly version: number;
}
type FieldChange = Extract<StateChange, { readonly path: FieldPath }>;

/** Local request/invalidations only. These numbers do not describe server revisions. */
export class AcquisitionVersions {
  private clock = 0;
  private rootIntent = 0;
  private rootCommit = 0;
  private readonly intents = new Map<string, Stamp>();
  private readonly invalidations = new Map<string, Stamp>();
  private readonly structures = new Map<string, Map<string, Stamp>>();
  // An upper bound, not an overlap decision: older disjoint responses can commit
  // after newer ones. Only versions at/above this bound may skip structure scans.
  private structureVersion = 0;
  dispose(): void {
    this.intents.clear();
    this.invalidations.clear();
    this.structures.clear();
    this.structureVersion = 0;
    this.clock = this.rootIntent = this.rootCommit = 0;
  }

  advance(paths: readonly FieldPath[], root = false): number {
    const version = ++this.clock;
    for (const path of paths)
      this.intents.set(canonicalInput(path), { path, version });
    if (root) this.rootIntent = version;
    return version;
  }
  invalidate(paths: readonly FieldPath[]): void {
    const version = ++this.clock;
    for (const path of paths)
      this.invalidations.set(canonicalInput(path), { path, version });
  }
  pending(version: number): readonly FieldPath[] {
    return [...this.invalidations.values()]
      .filter((stamp) => stamp.version > version)
      .map((stamp) => stamp.path);
  }
  current(version: number, fields: readonly ResolvedField[]): boolean {
    return (
      version >= this.rootIntent &&
      version >= this.rootCommit &&
      leafPaths(fields).every(
        (path) =>
          !this.newerIntent(version, path) &&
          ![...this.invalidations.values()].some(
            (stamp) => stamp.version > version && overlaps(stamp.path, path),
          ) &&
          !this.newerStructure(version, path),
      )
    );
  }
  private newerIntent(version: number, path: FieldPath): boolean {
    return [...this.intents.values()].some(
      (stamp) => stamp.version > version && overlaps(stamp.path, path),
    );
  }
  /** Currency/root checks must still account for commits in every record. */
  private newerStructure(version: number, path?: FieldPath): boolean {
    if (version >= this.structureVersion) return false;
    for (const record of this.structures.values())
      for (const stamp of record.values())
        if (
          stamp.version > version &&
          (path === undefined || overlaps(stamp.path, path))
        )
          return true;
    return false;
  }
  private newerField(version: number, field: FieldChange): boolean {
    if (this.newerIntent(version, field.path)) return true;
    if (version >= this.structureVersion) return false;
    const record = this.structures.get(canonicalInput(field.record));
    if (record)
      for (const stamp of record.values())
        if (stamp.version > version && overlaps(stamp.path, field.path))
          return true;
    return false;
  }

  /** Validate/reconcile first, then discard obsolete changes before publishing once. */
  filter(
    version: number,
    changes: readonly StateChange[],
    store: StateStore,
    address: string,
  ): {
    readonly changes: readonly StateChange[];
    readonly superseded: boolean;
  } {
    if (version < this.rootIntent || version < this.rootCommit)
      return { changes: [], superseded: true };
    const root = changes.some(
      (change) =>
        change.kind === 'membership' || change.kind === 'resource-null',
    );
    if (
      root &&
      ([...this.intents.values()].some((stamp) => stamp.version > version) ||
        this.newerStructure(version))
    )
      return { changes: [], superseded: true };

    const blocked = changes.filter(
      (change): change is FieldChange =>
        change.kind === 'object' &&
        !store.matchesObject(
          address,
          change.record,
          change.path,
          change.identity,
        ) &&
        this.newerField(version, change),
    );
    let superseded = false;
    const eligible = changes.filter((change) => {
      if (!('path' in change)) return true;
      const excluded =
        blocked.some(
          (parent) =>
            canonicalInput(parent.record) === canonicalInput(change.record) &&
            pathPrefix(parent.path, change.path),
        ) ||
        (change.kind !== 'object' && this.newerField(version, change));
      if (excluded) superseded = true;
      return !excluded;
    });
    // A context-only object marker must not clear newer branch error metadata
    // when all of this response's descendant changes have been excluded.
    return {
      superseded,
      changes: eligible.filter(
        (change) =>
          change.kind !== 'object' ||
          eligible.some(
            (child) =>
              'path' in child &&
              canonicalInput(child.record) === canonicalInput(change.record) &&
              child.path.length > change.path.length &&
              pathPrefix(change.path, child.path),
          ),
      ),
    };
  }

  /** Reserve structural barriers before commit notifies reentrant consumers. */
  committed(
    version: number,
    changes: readonly StateChange[],
    store: StateStore,
    address: string,
  ): void {
    for (const change of changes) {
      if (change.kind === 'membership' || change.kind === 'resource-null') {
        this.rootCommit = version;
        this.structures.clear();
        this.structureVersion = 0;
      } else if (
        change.kind === 'write' ||
        change.kind === 'error' ||
        (change.kind === 'object' &&
          !store.matchesObject(
            address,
            change.record,
            change.path,
            change.identity,
          ))
      ) {
        const record = canonicalInput(change.record);
        let stamps = this.structures.get(record);
        if (!stamps) {
          stamps = new Map();
          this.structures.set(record, stamps);
        }
        stamps.set(canonicalInput(change.path), { path: change.path, version });
        this.structureVersion = Math.max(this.structureVersion, version);
      }
    }
  }
}
