import {
  canonicalInput,
  freezeFields,
  snapshotInput,
  type FieldSegment,
  type InputObject,
  type InputValue,
  type ResolvedField,
} from './definition.js';
import { snapshotIdentity as identity } from './state-identity.js';
import type {
  FieldPath,
  FieldStatus,
  RecordIdentity,
  RecordSnapshot,
  StateChange,
  StateSnapshot,
  StateView,
} from './state-types.js';

interface Cell {
  readonly path: readonly string[];
  kind: 'missing' | 'value' | 'object';
  value?: InputValue;
  identity?: string;
  stale: boolean;
  error?: string;
}
interface StoredRecord {
  readonly identity: RecordIdentity;
  readonly cells: Map<string, Cell>;
}
interface Resource {
  membership: readonly string[] | null | undefined;
  membershipStale: boolean;
  resourceError: string | undefined;
  records: Map<string, StoredRecord>;
  readonly requests: Map<
    string,
    {
      readonly paths: readonly (readonly string[])[];
      readonly membership: boolean;
    }
  >;
  readonly views: Set<View>;
}

const prefix = (parent: readonly string[], child: readonly string[]) =>
  parent.length <= child.length &&
  parent.every((part, index) => part === child[index]);
const overlaps = (a: readonly string[], b: readonly string[]) =>
  prefix(a, b) || prefix(b, a);
const token = (field: FieldSegment) =>
  canonicalInput([field.name, field.arguments]);
const key = (path: readonly string[]) => canonicalInput(path);

function pathTokens(path: FieldPath): readonly string[] {
  if (!path.length) throw new Error('A field path is required.');
  return path.map((field) => {
    if (typeof field.name !== 'string' || !field.name)
      throw new Error('A field name is required.');
    const args = snapshotInput(field.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('Field arguments must be an object.');
    return token({ name: field.name, arguments: args as InputObject });
  });
}
function leafPaths(
  fields: readonly ResolvedField[],
  parent: readonly string[] = [],
): readonly (readonly string[])[] {
  return fields.flatMap((field) => {
    const path = [...parent, token(field)];
    return field.children.length ? leafPaths(field.children, path) : [path];
  });
}
function emptyResource(): Resource {
  return {
    membership: undefined,
    membershipStale: true,
    resourceError: undefined,
    records: new Map(),
    requests: new Map(),
    views: new Set(),
  };
}

export function validatedSelection(
  fields: readonly ResolvedField[],
): readonly ResolvedField[] {
  if (!fields.length) throw new Error('Selection must not be empty.');
  const selection = freezeFields(fields);
  const validate = (nodes: readonly ResolvedField[]): void => {
    for (const field of nodes) {
      pathTokens([field]);
      if (typeof field.responseName !== 'string' || !field.responseName)
        throw new Error('A response name is required.');
      validate(field.children);
    }
  };
  validate(selection);
  return selection;
}
function clearDescendants(record: StoredRecord, path: readonly string[]): void {
  for (const [id, cell] of record.cells)
    if (cell.path.length > path.length && prefix(path, cell.path))
      record.cells.delete(id);
}
function ensureParents(record: StoredRecord, path: readonly string[]): void {
  for (let length = 1; length < path.length; length++) {
    const parent = path.slice(0, length);
    const existing = record.cells.get(key(parent));
    if (existing?.kind !== 'object') {
      record.cells.set(key(parent), {
        path: parent,
        kind: 'object',
        stale: existing?.stale ?? false,
        ...(existing?.error === undefined ? {} : { error: existing.error }),
      });
    }
  }
}

interface ProjectionField {
  readonly cellKey: string;
  readonly responseName: string;
  readonly responsePath: readonly string[];
  readonly children: readonly ProjectionField[];
}

/** A view's immutable selection has the same addresses for every record/update. */
function projectionFields(
  fields: readonly ResolvedField[],
  canonical: readonly string[] = [],
  response: readonly string[] = [],
): readonly ProjectionField[] {
  return Object.freeze(
    fields.map((field) => {
      const path = [...canonical, token(field)];
      const responsePath = Object.freeze([...response, field.responseName]);
      return Object.freeze({
        cellKey: key(path),
        responseName: field.responseName,
        responsePath,
        children: projectionFields(field.children, path, responsePath),
      });
    }),
  );
}

function projectRecord(
  record: StoredRecord,
  selection: readonly ProjectionField[],
): RecordSnapshot {
  const statuses: FieldStatus[] = [];
  // A missing/null object hides values, but cannot hide a later failure beneath it.
  function descendantMetadata(fields: readonly ProjectionField[]): void {
    for (const field of fields) {
      const cell = record.cells.get(field.cellKey);
      if (cell?.stale || cell?.error !== undefined)
        statuses.push(
          Object.freeze({
            path: field.responsePath,
            present: false,
            stale: true,
            ...(cell.error === undefined ? {} : { error: cell.error }),
          }),
        );
      descendantMetadata(field.children);
    }
  }
  function project(
    fields: readonly ProjectionField[],
    inheritedError?: string,
  ): InputObject {
    const result: Record<string, InputValue> = Object.create(null) as Record<
      string,
      InputValue
    >;
    for (const field of fields) {
      const cell = record.cells.get(field.cellKey);
      const present = cell !== undefined && cell.kind !== 'missing';
      const stale = !present || cell!.stale;
      // Branch failures are materialized on existing descendants at commit time.
      // A later successful child write can therefore recover independently.
      const error = cell?.error ?? (present ? undefined : inheritedError);
      if (field.children.length && cell?.kind === 'object') {
        result[field.responseName] = project(field.children, error);
      } else {
        // A structural null is visible as null, never as old cached descendants.
        const compatible =
          present &&
          cell!.kind === 'value' &&
          (!field.children.length || cell!.value === null);
        if (compatible) result[field.responseName] = cell!.value!;
        statuses.push(
          Object.freeze({
            path: field.responsePath,
            present: compatible,
            stale: stale || !compatible,
            ...(error === undefined ? {} : { error }),
          }),
        );
        descendantMetadata(field.children);
      }
    }
    return Object.freeze(result);
  }
  const data = project(selection);
  return Object.freeze({
    identity: record.identity,
    data,
    fields: Object.freeze(statuses),
  });
}

class View implements StateView {
  private active = true;
  private readonly listeners = new Set<() => void>();
  private snapshot: StateSnapshot;
  private readonly projection: readonly ProjectionField[];
  // Fetching is compared separately so request bookkeeping never serializes data.
  private signature: string;
  readonly paths: readonly (readonly string[])[];
  constructor(
    readonly stateAddress: string,
    readonly selection: readonly ResolvedField[],
    private readonly resource: Resource,
  ) {
    this.paths = leafPaths(selection);
    this.projection = projectionFields(selection);
    const projection = this.compute();
    this.signature = canonicalInput(projection);
    this.snapshot = Object.freeze({ ...projection, fetching: this.fetching() });
  }
  private compute(): Omit<StateSnapshot, 'fetching'> {
    const records =
      this.resource.membership === null
        ? null
        : this.resource.membership?.map((id) =>
            projectRecord(this.resource.records.get(id)!, this.projection),
          );
    const statuses = records?.flatMap((record) => record.fields);
    return Object.freeze({
      records: records == null ? records : Object.freeze(records),
      resourceError: this.resource.resourceError,
      complete:
        records !== undefined &&
        this.resource.resourceError === undefined &&
        (records === null ||
          statuses!.every(
            (status) => status.present && status.error === undefined,
          )),
      membershipStale: this.resource.membershipStale,
      stale:
        this.resource.membershipStale ||
        records === undefined ||
        this.resource.resourceError !== undefined ||
        (statuses?.some(
          (status) => status.stale || status.error !== undefined,
        ) ??
          false),
    });
  }
  private fetching(): boolean {
    return [...this.resource.requests.values()].some(
      (request) =>
        request.membership ||
        request.paths.some((path) =>
          this.paths.some((selected) => overlaps(path, selected)),
        ),
    );
  }
  update(reproject: boolean): boolean {
    if (!this.active) return false;
    const projection = reproject ? this.compute() : this.snapshot;
    const signature = reproject ? canonicalInput(projection) : this.signature;
    const fetching = this.fetching();
    if (signature === this.signature && fetching === this.snapshot.fetching)
      return false;
    this.snapshot = Object.freeze({ ...projection, fetching });
    this.signature = signature;
    return true;
  }
  notify(errors: unknown[]): void {
    for (const listener of [...this.listeners]) {
      if (!this.active) break;
      if (!this.listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  getSnapshot(): StateSnapshot {
    return this.snapshot;
  }
  subscribe(listener: () => void): () => void {
    if (!this.active) throw new Error('View is disposed.');
    // Each subscription owns its registration even if callers reuse a callback.
    const registration = () => listener();
    this.listeners.add(registration);
    return () => {
      this.listeners.delete(registration);
    };
  }
  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.listeners.clear();
    this.resource.views.delete(this);
  }
}

/** Shared storage only: execution, generations, retry and reconciliation live above this boundary. */
export class StateStore {
  private readonly resources = new Map<string, Resource>();
  private disposed = false;
  private assertActive(): void {
    if (this.disposed) throw new Error('Store is disposed.');
  }
  private resource(address: string): Resource {
    this.assertActive();
    if (typeof address !== 'string' || !address)
      throw new Error('State address is required.');
    let resource = this.resources.get(address);
    if (!resource) {
      resource = emptyResource();
      this.resources.set(address, resource);
    }
    return resource;
  }
  watch(address: string, fields: readonly ResolvedField[]): StateView {
    const selection = validatedSelection(fields);
    const resource = this.resource(address);
    const view = new View(address, selection, resource);
    resource.views.add(view);
    return Object.freeze({
      stateAddress: address,
      selection,
      getSnapshot: () => view.getSnapshot(),
      subscribe: (listener: () => void) => view.subscribe(listener),
      dispose: () => view.dispose(),
    });
  }
  /** Coordinator structural guard; no snapshot mutation or resource creation. */
  matchesObject(
    address: string,
    record: RecordIdentity,
    path: FieldPath,
    objectIdentity?: RecordIdentity,
  ): boolean {
    this.assertActive();
    const cell = this.resources
      .get(address)
      ?.records.get(canonicalInput(identity(record)))
      ?.cells.get(key(pathTokens(path)));
    return (
      cell?.kind === 'object' &&
      cell.identity ===
        (objectIdentity === undefined
          ? undefined
          : canonicalInput(identity(objectIdentity)))
    );
  }
  /** Apply one validated batch atomically. Membership must precede writes to newly admitted records. */
  commit(address: string, changes: readonly StateChange[]): void {
    const resource = this.resource(address);
    // A failed batch must not publish some of its writes or mutate existing snapshots.
    const next: Resource = {
      ...resource,
      records: new Map(
        [...resource.records].map(([id, record]) => [
          id,
          {
            identity: record.identity,
            cells: new Map(
              [...record.cells].map(([path, cell]) => [path, { ...cell }]),
            ),
          },
        ]),
      ),
    };
    for (const change of changes) {
      if (change.kind === 'resource-null') {
        if (
          change.error !== undefined &&
          (typeof change.error !== 'string' || !change.error)
        )
          throw new Error('Resource error requires a message.');
        next.membership = null;
        next.membershipStale = change.error !== undefined;
        next.resourceError = change.error;
        next.records = new Map();
        continue;
      }
      if (change.kind === 'membership') {
        const members = change.records.map(identity);
        const ids = members.map(canonicalInput);
        if (new Set(ids).size !== ids.length)
          throw new Error('Duplicate record identity.');
        next.membership = ids;
        next.membershipStale = false;
        next.resourceError = undefined;
        next.records = new Map(
          members.map((member, index) => {
            const id = ids[index]!;
            return [
              id,
              next.records.get(id) ?? { identity: member, cells: new Map() },
            ];
          }),
        );
        continue;
      }
      if (change.kind === 'membership-stale') {
        next.membershipStale = true;
        continue;
      }
      const record = next.records.get(canonicalInput(identity(change.record)));
      if (!record)
        throw new Error('Cannot patch a record outside known membership.');
      const path = pathTokens(change.path);
      const id = key(path);
      if (change.kind === 'write' || change.kind === 'object') {
        ensureParents(record, path);
        if (change.kind === 'write') {
          const value = snapshotInput(change.value);
          clearDescendants(record, path);
          record.cells.set(id, { path, kind: 'value', value, stale: false });
        } else {
          const objectIdentity =
            change.identity === undefined
              ? undefined
              : canonicalInput(identity(change.identity));
          const previous = record.cells.get(id);
          if (
            previous?.kind !== 'object' ||
            previous.identity !== objectIdentity
          )
            clearDescendants(record, path);
          record.cells.set(id, {
            path,
            kind: 'object',
            stale: false,
            ...(objectIdentity === undefined
              ? {}
              : { identity: objectIdentity }),
          });
        }
      } else {
        if (change.kind !== 'stale' && change.kind !== 'error')
          throw new Error('Unknown state change.');
        if (
          change.kind === 'error' &&
          (typeof change.message !== 'string' || !change.message)
        )
          throw new Error('Field error requires a message.');
        if (
          change.kind === 'error' &&
          change.structuralNull !== undefined &&
          typeof change.structuralNull !== 'boolean'
        )
          throw new Error('Invalid structural null marker.');
        if (change.kind === 'error' && change.structuralNull) {
          ensureParents(record, path);
          clearDescendants(record, path);
          record.cells.set(id, {
            path,
            kind: 'value',
            value: null,
            stale: true,
            error: change.message,
          });
          continue;
        }
        const cell: Cell = record.cells.get(id) ?? {
          path,
          kind: 'missing',
          stale: true,
        };
        cell.stale = true;
        if (change.kind === 'error') cell.error = change.message;
        record.cells.set(id, cell);
        for (const descendant of record.cells.values()) {
          if (
            descendant.path.length > path.length &&
            prefix(path, descendant.path)
          ) {
            descendant.stale = true;
            if (change.kind === 'error') descendant.error = change.message;
          }
        }
      }
    }
    resource.membership = next.membership;
    resource.membershipStale = next.membershipStale;
    resource.resourceError = next.resourceError;
    resource.records = next.records;
    this.publish(resource, true);
  }
  /** Request bookkeeping only; this method neither executes nor cancels work. */
  setFetching(
    address: string,
    requestId: string,
    fields?: readonly ResolvedField[],
    membership = false,
  ): void {
    if (typeof requestId !== 'string' || !requestId)
      throw new Error('Request ID is required.');
    const resource = this.resource(address);
    if (fields === undefined) resource.requests.delete(requestId);
    else {
      const paths = leafPaths(validatedSelection(fields));
      resource.requests.set(requestId, { paths, membership });
    }
    this.publish(resource, false);
  }
  private publish(resource: Resource, reproject: boolean): void {
    // Update all projections before notifying so cross-consumer reads are consistent.
    const changed = [...resource.views].filter((view) =>
      view.update(reproject),
    );
    const errors: unknown[] = [];
    for (const view of changed) view.notify(errors);
    if (errors.length)
      throw new AggregateError(
        errors,
        'State was committed, but a subscriber failed.',
      );
  }
  /** Explicit inactive-cache eviction; automatic retention policy belongs to the coordinator. */
  evict(address: string): boolean {
    this.assertActive();
    const resource = this.resources.get(address);
    if (!resource) return false;
    if (resource.views.size || resource.requests.size)
      throw new Error('Cannot evict active state.');
    // Disposed views may outlive this cache. Keep their immutable snapshots, but
    // release the shared records they no longer own through their resource link.
    resource.records.clear();
    resource.membership = undefined;
    resource.resourceError = undefined;
    return this.resources.delete(address);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources.values()) {
      for (const view of [...resource.views]) view.dispose();
      resource.records.clear();
      resource.requests.clear();
      resource.membership = undefined;
      resource.resourceError = undefined;
    }
    this.resources.clear();
  }
}
