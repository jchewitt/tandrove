import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  enableProdMode,
  inject,
  runInInjectionContext,
  signal,
  type Signal,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { injectStateQuery } from '@tandrove/angular';
import { Apollo, provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { firstValueFrom } from 'rxjs';
import { createBillingCache } from '../src/data/cache.js';
import {
  BILLING_INVOICES,
  INVOICE_ACCOUNTS,
  type Invoice,
} from '../src/data/operations.js';
import {
  billingInvoices,
  billingScope,
} from '../src/data/tandrove-definitions.js';
import {
  BILLING_CLIENT,
  provideBillingClient,
} from '../src/tandrove-client.js';

interface Row {
  readonly id: string;
  readonly text: string;
}

interface Watcher {
  readonly rows: Signal<readonly Row[]>;
  readonly narrow: () => Promise<unknown>;
}

// Both adapters feed the same keyed Angular list and render all selected values.
function row(
  id: unknown,
  account: unknown,
  amount: unknown,
  status: unknown,
  name: unknown,
): Row {
  return {
    id: String(id),
    text: [id, account, amount, status, name].join('|'),
  };
}

function watchApollo(): Watcher {
  const apollo = inject(Apollo);
  const invoices = signal<readonly Invoice[]>([]);
  const variables = { tenantId: 'A' } as const;
  const subscription = apollo
    .watchQuery({ query: BILLING_INVOICES, variables })
    .valueChanges.subscribe((result) => {
      if (result.error) throw result.error;
      if (result.dataState === 'complete' && result.data)
        invoices.set(result.data.billing.invoices);
    });
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  return {
    rows: computed(() =>
      invoices().map((i) =>
        row(i.id, i.accountId, i.amountCents, i.status, i.user.name),
      ),
    ),
    narrow: () =>
      firstValueFrom(
        apollo.query({
          query: INVOICE_ACCOUNTS,
          variables,
          fetchPolicy: 'network-only',
        }),
      ),
  };
}

function watchTandrove(): Watcher {
  const client = inject(BILLING_CLIENT);
  const query = injectStateQuery(
    () => 'A' as const,
    (tenantId) =>
      client.watch(
        billingInvoices.bind({ billing: { tenantId } }, billingScope),
      ),
  );
  return {
    rows: computed(() => {
      const state = query.state();
      if (state.status === 'error') throw state.error;
      if (state.status !== 'active') return [];
      const snapshot = state.snapshot;
      if (snapshot.error || snapshot.resourceError)
        throw new Error(snapshot.error ?? snapshot.resourceError);
      return (
        snapshot.records?.map(({ identity, data }) =>
          row(
            identity['id'],
            data.accountId,
            data.amountCents,
            data.status,
            data.user?.name,
          ),
        ) ?? []
      );
    }),
    narrow: () => query.invalidate('accountId'),
  };
}

@Component({
  selector: 'matched-root',
  template: `
    @for (watcher of watchers(); track watcher) {
      <section>
        @for (row of watcher.rows(); track row.id) {
          <div>{{ row.text }}</div>
        }
      </section>
    }
  `,
})
class MatchedView {
  readonly watchers = signal<readonly Watcher[]>([]);
}

function measureRender(
  host: Element,
  count: number,
  revision: number,
  start: () => void | Promise<unknown>,
): Promise<number> {
  const expectedAccount = `A-ledger-1-v${revision}`;
  return new Promise<number>((resolve, reject) => {
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const observer = new MutationObserver(() => {
      const end = performance.now();
      const panels = host.children;
      if (
        panels.length === 2 &&
        Array.from(panels).every(
          (panel) =>
            panel.childElementCount === count &&
            panel.firstElementChild?.textContent?.split('|')[1] ===
              expectedAccount,
        )
      ) {
        cleanup();
        resolve(end - begin);
      }
    });
    observer.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            `Timed out waiting for ${count} rows at revision ${revision}`,
          ),
        ),
      20000,
    );
    const begin = performance.now();
    try {
      Promise.resolve(start()).catch(fail);
    } catch (error) {
      fail(error);
    }
  });
}

// Capture every rendered value after stopping each timer for the server fixture's assertions.
function capture(host: Element): string[][] {
  return Array.from(host.children, (panel) =>
    Array.from(panel.children, (child) => child.textContent ?? ''),
  );
}

enableProdMode();

async function runMatchedTrial({
  client,
  rowCount,
  endpoint,
}: {
  client: 'apollo' | 'tandrove';
  rowCount: number;
  endpoint: string;
}) {
  document.querySelector('matched-root')?.remove();
  const host = document.body.appendChild(
    document.createElement('matched-root'),
  );
  const app = await bootstrapApplication(MatchedView, {
    providers:
      client === 'apollo'
        ? [
            provideHttpClient(),
            provideApollo(() => ({
              cache: createBillingCache(),
              link: inject(HttpLink).create({ uri: endpoint }),
            })),
          ]
        : [provideBillingClient(new URL(endpoint, location.href).href)],
  });
  try {
    const view: MatchedView = app.components[0]!.instance;
    // Construct both clients before timing, then start with two cold independent watches.
    if (client === 'apollo') {
      const instance = app.injector.get(Apollo).client;
      app.onDestroy(() => instance.stop());
    } else app.injector.get(BILLING_CLIENT);
    await app.whenStable();
    const openWatcher = client === 'apollo' ? watchApollo : watchTandrove;
    const fullMs = await measureRender(host, rowCount, 1, () => {
      view.watchers.set(
        runInInjectionContext(app.injector, () => [
          openWatcher(),
          openWatcher(),
        ]),
      );
    });
    const fullRows = capture(host);
    const narrowMs = await measureRender(host, rowCount, 2, () =>
      view.watchers()[0]!.narrow(),
    );
    return { fullMs, narrowMs, fullRows, narrowRows: capture(host) };
  } finally {
    try {
      app.destroy();
    } finally {
      host.remove();
    }
  }
}

Object.assign(globalThis, { runMatchedTrial });
