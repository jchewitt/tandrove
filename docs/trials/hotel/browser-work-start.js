async function startHotelWorkSession(page) {
  if (page.__hotelWork)
    throw new Error('A session is already running on this browser page');
  const now = () => page.evaluate(() => performance.now());
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.goto('http://127.0.0.1:13009/home?trialAccounts=1');
  await page.getByText('Signed in: example-user', { exact: true }).waitFor();
  await page
    .getByRole('cell', {
      name: 'No reservations found. Book a room to get started!',
      exact: true,
    })
    .waitFor();
  const state = {
    started: 0,
    startedMono: 0,
    round: 0,
    cycles: 0,
    previews: 0,
    drafts: 0,
    navigations: 0,
    account: 'example-user',
    roomReads: 0,
    reservationReads: 0,
    creates: 0,
    deletes: 0,
    checkpoints: [],
    samples: [],
    visibilityCycles: [],
    offlineCycles: [],
    pollCycles: [],
    bookings: [],
    accountSwitches: [],
    expiryCases: [],
    errors: [],
    consoleErrors: [],
    phase: 'work',
    openLatenciesMs: [],
  };
  const listener = (request) => {
    if (!request.url().endsWith('/graphql')) return;
    const body = request.postData() ?? '';
    if (body.includes('TandroveRead')) state.roomReads++;
    else if (body.includes('createReservation')) state.creates++;
    else if (body.includes('deleteReservation')) state.deletes++;
    else if (body.includes('getAllReservations')) state.reservationReads++;
  };
  const pageError = (error) => {
    state.errors.push({
      name: error.name,
      atWallMs: Date.now() - state.started,
    });
  };
  const consoleError = (message) => {
    if (message.type() === 'error')
      state.consoleErrors.push({
        text: message.text().slice(0, 300),
        phase: state.phase,
        atWallMs: Date.now() - state.started,
      });
  };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Performance.enable');
    const sample = async (label) => {
      // Diagnostic samples at the same empty-home state, after retention expires.
      // GC and browser instrumentation affect the sample; these are not a memory budget.
      await cdp.send('HeapProfiler.collectGarbage');
      const counters = await cdp.send('Memory.getDOMCounters');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const heap = metrics.find(
        (metric) => metric.name === 'JSHeapUsedSize',
      )?.value;
      const dom = await page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        forms: document.querySelectorAll('form').length,
      }));
      state.samples.push({
        label,
        atMs: state.started ? Math.round((await now()) - state.startedMono) : 0,
        ...counters,
        jsHeapUsedBytes: heap,
        visibleDom: dom,
      });
    };
    const book = async () => {
      const start = await now();
      await page.getByRole('link', { name: '+ Book a Room' }).click();
      state.navigations++;
      await page.getByLabel('Room', { exact: true }).selectOption('room_1');
      await page
        .getByTestId('room-rate')
        .filter({ hasText: '$155.00' })
        .waitFor();
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === 'Refresh room rates',
          )?.disabled,
      );
      assert(
        (await page.locator('#roomId option').count()) === 10,
        'Room membership changed unexpectedly',
      );
      state.openLatenciesMs.push(Math.round((await now()) - start));
    };
    const home = async () => {
      await page.getByRole('link', { name: '← Back' }).click();
      state.navigations++;
      await page
        .getByRole('heading', { name: 'Hotel Reservations', exact: true })
        .waitFor();
    };
    const fill = async () => {
      await page.getByLabel('Check-In Date').fill('2027-12-01');
      await page.getByLabel('Check-Out Date').fill('2027-12-03');
    };
    const draftIntact = async () => {
      assert(
        (await page.getByLabel('Check-In Date').inputValue()) === '2027-12-01',
        'Check-in draft was lost',
      );
      assert(
        (await page.getByLabel('Check-Out Date').inputValue()) === '2027-12-03',
        'Checkout draft was lost',
      );
    };
    const refresh = async () => {
      const response = page.waitForResponse(
        (response) =>
          response.request().postData()?.includes('TandroveRead') &&
          response.ok(),
      );
      await page
        .getByRole('button', { name: 'Refresh room rates', exact: true })
        .click();
      await response;
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === 'Refresh room rates',
          )?.disabled,
      );
    };
    // Warm both lazy routes, then compare future samples at the same expired-cache home state.
    await book();
    await home();
    await page.waitForTimeout(5200);
    await sample('warm-baseline');
    state.navigations = 0;
    state.openLatenciesMs = [];
    state.started = Date.now();
    state.startedMono = await now();
    await page.evaluate(() => {
      const events = [];
      const listener = () =>
        events.push({ at: Date.now(), state: document.visibilityState });
      document.addEventListener('visibilitychange', listener);
      window.__hotelWorkVisibility = { events, listener };
    });
    page.on('request', listener);
    page.on('pageerror', pageError);
    page.on('console', consoleError);
    const receipt = async () => ({
      ...state,
      elapsedMs: Math.round((await now()) - state.startedMono),
      startedAt: new Date(state.started).toISOString(),
    });
    const step = async () => {
      assert(state.round < 50, 'All 50 rounds have already run');
      const round = state.round + 1;
      const before = {
        rooms: state.roomReads,
        creates: state.creates,
        deletes: state.deletes,
      };
      for (let cycle = 0; cycle < 2; cycle++) {
        await book();
        assert(
          (await page.getByLabel('Check-In Date').inputValue()) === '',
          'New route retained an old draft',
        );
        assert(
          (await page.getByLabel('Check-Out Date').inputValue()) === '',
          'New route retained an old checkout',
        );
        await fill();
        state.drafts++;
        await page
          .getByRole('button', { name: 'Hide rate preview', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Show rate preview', exact: true })
          .click();
        await page
          .getByTestId('room-rate')
          .filter({ hasText: '$155.00' })
          .waitFor();
        await draftIntact();
        state.previews++;
        await home();
        state.cycles++;
      }
      if ([2, 18, 34].includes(round)) {
        const reads = state.roomReads;
        await page.waitForTimeout(5200);
        await book();
        assert(
          state.roomReads === reads + 1,
          'Expired resource did not reacquire exactly once',
        );
        state.expiryCases.push({ round, roomReads: state.roomReads - reads });
        await home();
      }
      if ([5, 21, 37].includes(round)) {
        await book();
        await fill();
        const reads = state.roomReads;
        const other = await page.context().newPage();
        let hiddenAt;
        try {
          await other.goto('about:blank');
          await other.bringToFront();
          await page.waitForFunction(
            () => document.visibilityState === 'hidden',
          );
          hiddenAt = await now();
          await page.waitForTimeout(35000);
          assert(
            (await page.evaluate(() => document.visibilityState)) === 'hidden',
            'Work page did not remain hidden',
          );
        } finally {
          await other.close();
          await page.bringToFront();
        }
        await page.waitForFunction(
          () => document.visibilityState === 'visible',
        );
        const hiddenMs = Math.round((await now()) - hiddenAt);
        assert(
          state.roomReads === reads,
          'On-demand hidden page fetched without an explicit owner request',
        );
        await draftIntact();
        await refresh();
        await draftIntact();
        state.visibilityCycles.push({
          round,
          hiddenMs,
          hiddenRoomReads: 0,
        });
        await home();
      }
      if ([8, 24, 40].includes(round)) {
        await book();
        await fill();
        const creates = state.creates,
          deletes = state.deletes;
        await page
          .getByRole('button', { name: 'Book Reservation', exact: true })
          .click();
        state.navigations++;
        await page
          .getByRole('cell', { name: '$409.00', exact: true })
          .waitFor();
        assert(state.creates === creates + 1, 'Save was retried or duplicated');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page
          .getByRole('button', { name: 'Yes, Cancel Reservation', exact: true })
          .click();
        await page
          .getByRole('cell', {
            name: 'No reservations found. Book a room to get started!',
            exact: true,
          })
          .waitFor();
        assert(
          state.deletes === deletes + 1,
          'Delete was retried or duplicated',
        );
        state.bookings.push({
          round,
          account: state.account,
          creates: 1,
          deletes: 1,
        });
      }
      if ([10, 26, 42].includes(round)) {
        state.account =
          state.account === 'example-user' ? 'trial-user-b' : 'example-user';
        await page
          .getByRole('button', {
            name: state.account === 'example-user' ? 'Account A' : 'Account B',
            exact: true,
          })
          .click();
        await page
          .getByText(`Signed in: ${state.account}`, { exact: true })
          .waitFor();
        const reads = state.roomReads;
        await book();
        assert(
          state.roomReads === reads + 1,
          'New account reused the old session cache',
        );
        state.accountSwitches.push({
          round,
          account: state.account,
          roomReads: 1,
        });
        await home();
      }
      if ([12, 28, 44].includes(round)) {
        await book();
        await fill();
        const reads = state.roomReads;
        try {
          state.phase = 'offline';
          await page.context().setOffline(true);
          await page
            .getByRole('button', { name: 'Refresh room rates', exact: true })
            .click();
          await page.getByRole('alert').waitFor();
          assert(
            state.roomReads === reads + 2,
            'Offline read did not use its bounded two attempts',
          );
          assert(
            await page
              .getByRole('button', { name: 'Book Reservation', exact: true })
              .isDisabled(),
            'Unavailable catalog allowed save',
          );
          await draftIntact();
          await page.waitForTimeout(15000);
          assert(
            state.roomReads === reads + 2,
            'Offline state started a retry loop',
          );
        } finally {
          await page.context().setOffline(false);
          state.phase = 'work';
        }
        await refresh();
        await draftIntact();
        await page.getByRole('alert').waitFor({ state: 'detached' });
        state.offlineCycles.push({
          round,
          failedAttempts: 2,
          expectedRecoveryReads: 1,
        });
        await home();
      }
      if ([16, 32, 48].includes(round)) {
        await book();
        const reads = state.roomReads;
        await page
          .getByRole('button', { name: 'Start rate polling', exact: true })
          .click();
        await page.waitForTimeout(3100);
        await page
          .getByRole('button', { name: 'Stop rate polling', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            ![...document.querySelectorAll('button')].find(
              (button) => button.textContent.trim() === 'Refresh room rates',
            )?.disabled,
        );
        const ticks = state.roomReads - reads;
        assert(
          ticks >= 2 && ticks <= 8,
          `Unexpected bounded poll count ${ticks}`,
        );
        await home();
        const stopped = state.roomReads;
        await page.waitForTimeout(800);
        assert(
          state.roomReads === stopped,
          'Departed poll issued another request',
        );
        state.pollCycles.push({ round, ticks, afterDepartureReads: 0 });
      }
      if ([10, 20, 30, 40, 50].includes(round)) {
        await page.waitForTimeout(5200);
        await sample(`round-${round}`);
      }
      assert(state.errors.length === 0, 'Unhandled browser error');
      state.round = round;
      const checkpoint = {
        round,
        atMs: Math.round((await now()) - state.startedMono),
        roomReads: state.roomReads - before.rooms,
        creates: state.creates - before.creates,
        deletes: state.deletes - before.deletes,
        cycles: state.cycles,
      };
      state.checkpoints.push(checkpoint);
      return {
        passed: true,
        ...checkpoint,
        elapsedMs: Math.round((await now()) - state.startedMono),
      };
    };
    const finish = async () => {
      assert(
        state.round === 50 && state.cycles === 100 && state.previews === 100,
        'Workload incomplete',
      );
      assert(
        Math.round((await now()) - state.startedMono) >= 25 * 60 * 1000,
        'Session has not reached 25 actual minutes',
      );
      for (const values of [
        state.visibilityCycles,
        state.offlineCycles,
        state.pollCycles,
        state.bookings,
        state.accountSwitches,
      ])
        assert(values.length === 3, 'Missing work-session scenario');
      assert(
        state.creates === 3 && state.deletes === 3,
        'Unexpected write counts',
      );
      const before = state.roomReads;
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await page.waitForTimeout(5200);
      assert(
        state.roomReads === before,
        'Session cleanup issued another room read',
      );
      assert(
        state.errors.length === 0,
        'Unhandled browser error during final cleanup',
      );
      assert(
        state.consoleErrors.every(
          (error) =>
            error.phase === 'offline' &&
            error.text.includes('ERR_INTERNET_DISCONNECTED'),
        ),
        'Unexpected browser console error',
      );
      const visibilityEvents = await page.evaluate(() => {
        const value = window.__hotelWorkVisibility;
        document.removeEventListener('visibilitychange', value.listener);
        delete window.__hotelWorkVisibility;
        return value.events;
      });
      assert(
        visibilityEvents.filter((event) => event.state === 'hidden').length >=
          3,
        'Actual hidden transitions missing',
      );
      assert(
        visibilityEvents.filter((event) => event.state === 'visible').length >=
          3,
        'Actual visible transitions missing',
      );
      page.off('request', listener);
      page.off('pageerror', pageError);
      page.off('console', consoleError);
      await cdp.detach();
      delete page.__hotelWork;
      return {
        passed: true,
        ...(await receipt()),
        visibilityEvents,
        finalCleanupRoomReads: 0,
        timestamp: new Date().toISOString(),
      };
    };
    let busy = false;
    let failed = false;
    const abort = async () => {
      assert(!busy, 'Cannot abort during an active step or finish');
      busy = true;
      try {
        await page
          .getByRole('button', { name: 'Log out', exact: true })
          .click();
        await page.context().setOffline(false);
        page.off('request', listener);
        page.off('pageerror', pageError);
        page.off('console', consoleError);
        await page.evaluate(() => {
          const value = window.__hotelWorkVisibility;
          if (value)
            document.removeEventListener('visibilitychange', value.listener);
          delete window.__hotelWorkVisibility;
        });
        await cdp.detach();
        delete page.__hotelWork;
        return { passed: false, aborted: true, ...(await receipt()) };
      } finally {
        busy = false;
      }
    };
    page.__hotelWork = {
      step: async () => {
        assert(
          !busy && !failed,
          'Session already running or failed; abort before restarting',
        );
        busy = true;
        try {
          return await step();
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          busy = false;
        }
      },
      finish: async () => {
        assert(!busy && !failed, 'Cannot finish a running/failed session');
        busy = true;
        try {
          return await finish();
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          busy = false;
        }
      },
      receipt,
      abort,
    };
    return {
      started: true,
      startedAt: new Date(state.started).toISOString(),
      plannedRounds: 50,
      minimumElapsedMs: 1500000,
      baseline: state.samples[0],
    };
  } catch (error) {
    // Startup may fail before the public runner state exists. Close owned work
    // and instrumentation here instead of relying on the later abort command.
    await page
      .getByRole('button', { name: 'Log out', exact: true })
      .click()
      .catch(() => undefined);
    await page.context().setOffline(false);
    page.off('request', listener);
    page.off('pageerror', pageError);
    page.off('console', consoleError);
    await page
      .evaluate(() => {
        const value = window.__hotelWorkVisibility;
        if (value)
          document.removeEventListener('visibilitychange', value.listener);
        delete window.__hotelWorkVisibility;
      })
      .catch(() => undefined);
    await cdp.detach().catch(() => undefined);
    delete page.__hotelWork;
    throw error;
  }
}
