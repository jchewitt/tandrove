import {
  assertNotInReactiveContext,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type EffectRef,
} from '@angular/core';
import type { InputObject, QueryHandle, Unsubscribe } from '@tandrove/core';
import { observeReader } from './observe-reader';
import type {
  StateQuery,
  StateQueryOptions,
  StateQueryState,
} from './query-types';

type Parameters<P> =
  | { readonly kind: 'value'; readonly value: P }
  | { readonly kind: 'error'; readonly error: unknown };
const pending = Object.freeze({ status: 'pending' });
const disposed = Object.freeze({ status: 'disposed' });

/** Own a query handle selected by reactive parameters, without owning its client. */
export function injectStateQuery<
  P,
  Target extends string,
  Result = InputObject,
>(
  parameters: () => P,
  open: (parameters: P) => QueryHandle<Target, Result>,
  options: StateQueryOptions = {},
): StateQuery<Target, Result> {
  assertNotInReactiveContext(injectStateQuery);
  const injector = options.injector ?? inject(Injector);
  const lifetime = injector.get(DestroyRef);
  if (lifetime.destroyed) throw new Error('Tandrove query scope is destroyed.');
  // Each reactive evaluation has a descriptor. Do not gate by P equality alone:
  // an intervening observed transition must not expose an obsolete binding.
  const requested = computed<Parameters<P>>(() => {
    try {
      return { kind: 'value', value: parameters() };
    } catch (error) {
      return { kind: 'error', error };
    }
  });
  const stopped = signal(false);
  const published = signal<{
    readonly binding: Parameters<P> | undefined;
    readonly state: StateQueryState<Result>;
  }>({
    binding: undefined,
    state: pending,
  });
  let binding: Parameters<P> | undefined;
  let handle: QueryHandle<Target, Result> | undefined;
  let unsubscribe: Unsubscribe | undefined;
  let watcher: EffectRef | undefined;
  let unregister: Unsubscribe | undefined;
  const state = computed<StateQueryState<Result>>(() => {
    if (stopped()) return disposed;
    const target = requested();
    if (target.kind === 'error')
      return Object.freeze({ status: 'error', error: target.error });
    const current = published();
    return current.binding === target ? current.state : pending;
  });
  const release = () => {
    const oldSubscription = unsubscribe;
    const oldHandle = handle;
    unsubscribe = undefined;
    handle = undefined;
    try {
      oldSubscription?.();
    } finally {
      oldHandle?.dispose();
    }
  };
  const dispose = () =>
    untracked(() => {
      if (stopped()) return;
      stopped.set(true);
      watcher?.destroy();
      unregister?.();
      release();
      binding = undefined;
      published.set({ binding: undefined, state: disposed });
    });
  const replace = (target: Parameters<P>) => {
    if (stopped() || binding === target) return;
    binding = target;
    release();
    if (stopped()) return;
    if (target.kind === 'error') {
      published.set({
        binding: target,
        state: Object.freeze({ status: 'error', error: target.error }),
      });
      return;
    }
    try {
      const next = runInInjectionContext(injector, () => open(target.value));
      if (stopped() || requested() !== target) {
        next.dispose();
        return;
      }
      handle = next;
      const accept = (snapshot: ReturnType<typeof next.getSnapshot>) =>
        untracked(() => {
          const previous = published();
          if (
            previous.binding === target &&
            previous.state.status === 'active' &&
            previous.state.snapshot === snapshot
          )
            return;
          if (!stopped() && handle === next && requested() === target)
            published.set({
              binding: target,
              state: Object.freeze({
                status: 'active',
                stateAddress: next.stateAddress,
                snapshot,
              }),
            });
        });
      const stop = observeReader(next, accept);
      if (stopped() || handle !== next || requested() !== target) {
        stop();
        if (handle === next) release();
      } else unsubscribe = stop;
    } catch (error) {
      release();
      if (!stopped())
        published.set({
          binding: target,
          state: Object.freeze({ status: 'error', error }),
        });
    }
  };
  const withCurrentBinding = <T>(
    run: (current: QueryHandle<Target, Result>) => T,
  ): T =>
    untracked(() => {
      if (stopped()) throw new Error('Tandrove query is disposed.');
      if (!handle || binding !== requested())
        throw new Error('Tandrove query has no current binding.');
      return run(handle);
    });
  const command = (
    run: (current: QueryHandle<Target, Result>) => Promise<void>,
  ): Promise<void> => {
    try {
      return withCurrentBinding(run);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  try {
    unregister = lifetime.onDestroy(dispose);
    watcher = effect(
      () => {
        const target = requested();
        untracked(() => replace(target));
      },
      { injector, manualCleanup: true },
    );
    untracked(() => replace(requested()));
  } catch (error) {
    dispose();
    throw error;
  }
  return Object.freeze<StateQuery<Target, Result>>({
    state,
    ensure: () => command((current) => current.ensure()),
    invalidate: (target, options) =>
      command((current) => current.invalidate(target, options)),
    refresh: (target) => command((current) => current.refresh(target)),
    refreshList: () => command((current) => current.refreshList()),
    poll: (options) => withCurrentBinding((current) => current.poll(options)),
    dispose,
  });
}
