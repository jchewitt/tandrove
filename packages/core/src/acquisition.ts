import {
  canonicalInput,
  narrowFields,
  selectFieldPath,
  type InputObject,
  type ResolvedField,
} from './definition.js';
import { StateStore, validatedSelection } from './state-store.js';
import { leafPaths } from './acquisition-coverage.js';
import { AcquisitionScheduler } from './acquisition-scheduler.js';
import { ReadRetrier, type AcquisitionClientOptions } from './read-retry.js';
import { ReadDeadline } from './read-deadline.js';
import { validatePollInterval, type PollOptions } from './polling.js';
import {
  ResourceConfiguration,
  type ResourceOptions,
} from './resource-configuration.js';
import {
  isAcquisitionSource,
  acquisitionAuthority,
} from './acquisition-provider.js';
import {
  Cancellation,
  cancellable,
  type CancellationSignal,
} from './cancellation.js';
import type {
  FieldPath,
  RecordIdentity,
  StateSnapshot,
  StateView,
} from './state-types.js';

export type AcquiredField =
  | {
      readonly kind: 'write';
      readonly path: FieldPath;
      readonly value: import('./definition.js').InputValue;
    }
  | {
      readonly kind: 'object';
      readonly path: FieldPath;
      readonly identity?: RecordIdentity;
    }
  | {
      readonly kind: 'error';
      readonly path: FieldPath;
      readonly message: string;
      /** An object became null; discard descendants rather than retaining its old shape. */
      readonly structuralNull?: boolean;
    };
export interface AcquiredRecord {
  readonly identity: RecordIdentity;
  readonly fields: readonly AcquiredField[];
}
export interface AcquiredNull {
  readonly kind: 'null';
  readonly error?: string;
}
export type AcquisitionResult = readonly AcquiredRecord[] | AcquiredNull;
/** Provisional decoded in-process event; membership must already exist. */
export interface AcquiredPatch {
  readonly selection: readonly ResolvedField[];
  readonly records: readonly AcquiredRecord[];
}
export interface AcquisitionContext {
  readonly signal: CancellationSignal;
}
export interface AcquisitionResource {
  readonly stateAddress: string;
  readonly selection: readonly ResolvedField[];
  /** Opts into identity-based list reconciliation and explicit membership refresh. */
  readonly collection?: boolean;
}
export interface AcquisitionCapabilities {
  readonly acquisition: AcquisitionSource;
}
export type AcquisitionResourceOptions =
  ResourceOptions<AcquisitionCapabilities>;
/** Provisional source boundary: decode protocol responses before returning records. */
export interface AcquisitionSource extends AcquisitionResource {
  /** Shared backend identity for equivalent source wrappers. Defaults to this source object. */
  readonly authority?: object;
  /** Optional broader read coverage (for example, a whole-resource backend).
   * Must contain the requested fields and remain inside this source's selection.
   * Extra fetched values are validated but never committed as ordinary field writes. */
  fetchSelection?(
    requested: readonly ResolvedField[],
  ): readonly ResolvedField[];
  /** Optional wire-request identity; commit coverage is also included in deduplication. */
  fingerprint?(selection: readonly ResolvedField[]): string;
  read(
    selection: readonly ResolvedField[],
    context: AcquisitionContext,
  ): Promise<AcquisitionResult>;
}
export interface InvalidateOptions {
  readonly refetch?: 'active' | 'none';
}
export type QuerySnapshot<Result = InputObject> = StateSnapshot<Result> & {
  readonly error: string | undefined;
};
export type QueryHandle<
  Target extends string = string,
  Result = InputObject,
> = QueryHandleOf<Target, QuerySnapshot<Result>>;
interface QueryHandleOf<Target extends string, Snapshot> extends Omit<
  StateView,
  'getSnapshot'
> {
  getSnapshot(): Snapshot;
  /** Settles after this handle's automatic first acquisition. */
  readonly ready: Promise<void>;
  /** Reuses fresh fields; requests only missing/stale/error fields. Also retries a failed acquisition. */
  ensure(): Promise<void>;
  /** Marks the selected fields stale immediately. Active handles refetch by default. */
  invalidate(target?: Target, options?: InvalidateOptions): Promise<void>;
  /** Forces a selected read without first marking cached values stale. */
  refresh(target?: Target): Promise<void>;
  /** Replace list membership/order using this handle's entire declared selection. */
  refreshList(): Promise<void>;
  /** Register owner-bound selective polling; stopping releases future scheduling. */
  poll(options?: PollOptions<Target>): () => void;
}
class Handle {
  active = true;
  readonly lifetime = new Cancellation();
  attempt = 0;
  error: string | undefined;
  revalidate = (): void => {};
  freshnessError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.publish();
  }
  private snapshot: QuerySnapshot;
  private viewSnapshot: StateSnapshot;
  private signature: string;
  private notifiedSignature: string;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  constructor(
    readonly view: StateView,
    private readonly onListenerError: (error: unknown) => void,
  ) {
    this.viewSnapshot = view.getSnapshot();
    this.snapshot = Object.freeze({ ...this.viewSnapshot, error: undefined });
    this.signature = canonicalInput(this.snapshot);
    this.notifiedSignature = this.signature;
    this.unsubscribe = view.subscribe(() => this.publish());
  }
  publish(): void {
    if (!this.active) return;
    this.refreshSnapshot();
    if (this.signature === this.notifiedSignature) return;
    this.notifiedSignature = this.signature;
    for (const listener of [...this.listeners])
      if (this.active && this.listeners.has(listener)) {
        try {
          listener();
        } catch (error) {
          this.onListenerError(error);
        }
      }
  }
  private refreshSnapshot(): void {
    if (!this.active) return;
    const viewSnapshot = this.view.getSnapshot();
    if (
      viewSnapshot === this.viewSnapshot &&
      this.error === this.snapshot.error
    )
      return;
    this.viewSnapshot = viewSnapshot;
    // Views are immutable and retain identity until their projection changes.
    // Changed references still need value equality: reentrant updates can return
    // to an equivalent state before this handle is read or notified.
    const snapshot = Object.freeze({
      ...viewSnapshot,
      error: this.error,
    });
    const signature = canonicalInput(snapshot);
    if (signature === this.signature) return;
    this.signature = signature;
    this.snapshot = snapshot;
  }
  getSnapshot(): QuerySnapshot {
    this.refreshSnapshot();
    return this.snapshot;
  }
  subscribe(listener: () => void): () => void {
    if (!this.active) throw new Error('Query handle is disposed.');
    const registration = () => listener();
    this.listeners.add(registration);
    return () => {
      this.listeners.delete(registration);
    };
  }
  dispose(): void {
    if (!this.active) return;
    this.refreshSnapshot();
    this.active = false;
    this.lifetime.abort('Query handle is disposed.');
    this.unsubscribe();
    this.listeners.clear();
    this.view.dispose();
  }
}

/** Shared acquisition with concurrent, generation-checked reads. */
export class AcquisitionClient {
  private readonly store = new StateStore();
  private readonly scopes = new Map<string, AcquisitionScheduler>();
  private readonly initializing = new Set<string>();
  private disposed = false;
  private readonly retry: ReadRetrier;
  private readonly configuration: ResourceConfiguration<AcquisitionCapabilities>;
  private readonly deadlineScheduler: AcquisitionClientOptions['deadlineScheduler'];
  private readonly freshnessScheduler: AcquisitionClientOptions['freshnessScheduler'];
  private readonly retentionScheduler: AcquisitionClientOptions['retentionScheduler'];
  private readonly pollingScheduler: AcquisitionClientOptions['pollingScheduler'];
  private readonly onRetentionError: AcquisitionClientOptions['onRetentionError'];
  constructor(private readonly options: AcquisitionClientOptions = {}) {
    this.retry = new ReadRetrier(options);
    this.configuration = new ResourceConfiguration(options, {
      acquisition: isAcquisitionSource,
    });
    const scheduler = options.deadlineScheduler ?? options.scheduler;
    this.deadlineScheduler = scheduler
      ? { wait: scheduler.wait.bind(scheduler) }
      : undefined;
    const clock = options.freshnessScheduler;
    this.freshnessScheduler = clock
      ? { now: clock.now.bind(clock), wait: clock.wait.bind(clock) }
      : undefined;
    const retentionClock =
      options.retentionScheduler ?? options.freshnessScheduler;
    this.retentionScheduler = retentionClock
      ? {
          now: retentionClock.now.bind(retentionClock),
          wait: retentionClock.wait.bind(retentionClock),
        }
      : undefined;
    this.onRetentionError = options.onRetentionError;
    const pollingClock = options.pollingScheduler ?? options.freshnessScheduler;
    this.pollingScheduler = pollingClock
      ? {
          now: pollingClock.now.bind(pollingClock),
          wait: pollingClock.wait.bind(pollingClock),
        }
      : undefined;
  }
  /** Adapter-facing local patch ingress, not a server revision or stream protocol. */
  ingest(source: AcquisitionSource, patch: AcquiredPatch): void {
    if (this.disposed) throw new Error('Client is disposed.');
    const scope = this.scopes.get(source.stateAddress);
    if (!scope) throw new Error('Patch requires an existing active resource.');
    this.assertAuthority(scope, acquisitionAuthority(source));
    if (scope.collection !== (source.collection === true))
      throw new Error(
        'Sources sharing an address must agree on collection semantics.',
      );
    const selection = validatedSelection(
      narrowFields(validatedSelection(source.selection), patch.selection),
    );
    if (!selection.length)
      throw new Error('Patch selection must not be empty.');
    scope.ingest(selection, patch.records);
  }
  watch(
    resource: AcquisitionResource | AcquisitionSource,
    options: AcquisitionResourceOptions = {},
  ): QueryHandle {
    if (this.disposed) throw new Error('Client is disposed.');
    const address = resource.stateAddress;
    const requestedCollection = resource.collection;
    if (
      typeof address !== 'string' ||
      !address.length ||
      (requestedCollection !== undefined &&
        typeof requestedCollection !== 'boolean')
    )
      throw new Error(
        'Resource requires a nonempty stateAddress and an optional boolean collection.',
      );
    const selection = validatedSelection(resource.selection);
    if (this.initializing.has(address))
      throw new Error(
        'Resource initialization is already in progress for this state address.',
      );
    const collection = requestedCollection === true;
    const resolved = this.configuration.resolve(options);
    const policy = resolved.requestPolicy;
    const assigned = resolved.providers.acquisition;
    if (assigned === false)
      throw new Error('Acquisition is disabled for this resource.');
    const source = assigned ?? resource;
    if (!isAcquisitionSource(source))
      throw new Error('Resource requires an acquisition source.');
    if (
      source.stateAddress !== address ||
      (source.collection === true) !== collection
    )
      throw new Error(
        'Assigned acquisition source must match the resource address and collection semantics.',
      );
    const sourceSelection = validatedSelection(source.selection);
    narrowFields(sourceSelection, selection);
    const authority = acquisitionAuthority(source);
    const captured: AcquisitionSource = {
      stateAddress: address,
      selection: sourceSelection,
      collection,
      read: source.read.bind(source),
      ...(source.fetchSelection
        ? { fetchSelection: source.fetchSelection.bind(source) }
        : {}),
      ...(source.fingerprint
        ? { fingerprint: source.fingerprint.bind(source) }
        : {}),
    };
    this.scopes.get(address)?.expireInactive();
    if (this.disposed) throw new Error('Client is disposed.');
    let scope = this.scopes.get(address);
    if (scope) this.assertAuthority(scope, authority);
    if (scope && scope.retentionMs !== policy.retentionMs)
      throw new Error(
        'Sources sharing a state address must use the same effective retentionMs policy.',
      );
    if (scope && scope.requestTimeoutMs !== policy.requestTimeoutMs)
      throw new Error(
        'Sources sharing a state address must use the same effective requestTimeoutMs policy.',
      );
    if (
      scope &&
      canonicalInput(scope.freshnessPolicy) !== canonicalInput(policy.freshness)
    )
      throw new Error(
        'Sources sharing a state address must use the same effective freshness policy.',
      );
    if (scope && scope.collection !== collection)
      throw new Error(
        'Sources sharing an address must agree on collection semantics.',
      );
    if (!scope) {
      this.initializing.add(address);
      try {
        scope = new AcquisitionScheduler(
          this.store,
          address,
          selection,
          collection,
          this.retry,
          new ReadDeadline(policy.requestTimeoutMs, this.deadlineScheduler),
          policy.freshness,
          this.freshnessScheduler,
          {
            durationMs: policy.retentionMs,
            scheduler: this.retentionScheduler,
            evict: (retired) => {
              if (this.scopes.get(address) !== retired || retired.hasOwners)
                return;
              this.scopes.delete(address);
              retired.dispose();
              this.store.evict(address);
            },
            report: (error) => this.onRetentionError?.(error, address),
          },
          authority,
          this.pollingScheduler,
        );
        this.scopes.set(address, scope);
      } finally {
        this.initializing.delete(address);
      }
    }
    const view = this.store.watch(address, selection);
    const current = scope;
    const handle = new Handle(view, (error) => {
      // Observer failure must never become a transport failure or trigger a retry.
      try {
        this.options.onListenerError?.(error);
      } catch {
        /* Reporting cannot disrupt acquisition. */
      }
    });
    const enqueue = (
      requested?: readonly ResolvedField[],
      replaceMembership = false,
      polling = false,
      interested = () => true,
    ): Promise<void> => {
      if (this.disposed || !handle.active)
        return Promise.reject(new Error('Query handle is disposed.'));
      const reservedAttempt = polling ? undefined : ++handle.attempt;
      const execute = async (): Promise<void> => {
        if (!interested()) return;
        const attempt = reservedAttempt ?? ++handle.attempt;
        if (this.disposed || !handle.active)
          throw (
            handle.lifetime.signal.reason ??
            new Error('Query handle is disposed.')
          );
        if (handle.attempt === attempt) {
          handle.error = undefined;
          handle.publish();
        }
        try {
          await cancellable(
            current.run(
              handle,
              captured,
              requested,
              replaceMembership,
              polling,
            ),
            handle.lifetime.signal,
          );
        } catch (error) {
          if (handle.active && !this.disposed && handle.attempt === attempt) {
            handle.error =
              error instanceof Error ? error.message : String(error);
            handle.publish();
          }
          throw error;
        }
      };
      // Ticks already dispatch asynchronously. Reserve their error order only once
      // an interest actually executes, so a stopped tick cannot hide a manual error.
      return polling ? execute() : Promise.resolve().then(execute);
    };
    const ensure = (): Promise<void> => enqueue();
    handle.revalidate = () => {
      void ensure().catch(() => {});
    };
    current.attach(handle);
    const targetFields = (target?: string): readonly ResolvedField[] => {
      if (this.disposed || !handle.active)
        throw new Error('Query handle is disposed.');
      return target === undefined
        ? selection
        : selectFieldPath(selection, target.split('.'));
    };
    const refresh = (target?: string): Promise<void> => {
      try {
        return enqueue(targetFields(target));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const refreshList = (): Promise<void> => {
      try {
        const fields = targetFields();
        if (!collection)
          throw new Error('refreshList requires a collection source.');
        return enqueue(fields, true);
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const invalidate = (
      target?: string,
      options: InvalidateOptions = {},
    ): Promise<void> => {
      try {
        const fields = targetFields(target);
        if (
          options.refetch !== undefined &&
          options.refetch !== 'active' &&
          options.refetch !== 'none'
        )
          throw new Error('Unknown refetch policy.');
        const paths = leafPaths(fields);
        // Reserve queue order before notifying listeners, which may enqueue work.
        const task =
          options.refetch === 'none' ? Promise.resolve() : enqueue(fields);
        current.invalidate(paths);
        return task;
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const ready = ensure();
    const poll = (options: PollOptions = {}): (() => void) => {
      if (
        !options ||
        typeof options !== 'object' ||
        Array.isArray(options) ||
        Object.keys(options).some(
          (key) => key !== 'target' && key !== 'everyMs',
        )
      )
        throw new Error('Polling options support only target and everyMs.');
      const fields = targetFields(options.target);
      const interval =
        options.everyMs === undefined
          ? policy.polling.everyMs
          : options.everyMs;
      validatePollInterval(interval);
      if (interval === false) return () => {};
      return current.polling.add(
        handle,
        fields,
        interval,
        (interested) => enqueue(fields, false, true, interested),
        (error) => handle.freshnessError(error),
      );
    };
    // Automatic acquisition errors remain observable through ready/snapshot without unhandled rejections.
    void ready.catch(() => {});
    return Object.freeze({
      stateAddress: address,
      selection,
      ready,
      ensure,
      invalidate,
      refresh,
      refreshList,
      poll,
      getSnapshot: () => handle.getSnapshot(),
      subscribe: (listener: () => void) => handle.subscribe(listener),
      dispose: () => {
        if (!handle.active) return;
        handle.dispose();
        current.detach(handle);
      },
    });
  }
  private assertAuthority(
    scope: AcquisitionScheduler,
    authority: object,
  ): void {
    if (scope.authority !== authority)
      throw new Error(
        'Sources sharing a state address must use the same authority. Use a distinct source/scope address for a different backend or authorization context.',
      );
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const scope of this.scopes.values()) scope.dispose();
    this.scopes.clear();
    this.store.dispose();
  }
}
