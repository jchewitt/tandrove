async function installReservationTrial(page) {
  // Each protocol installs this function once in the CLI Page object, then consumes it.
  page.withReservationTrial = async (run) => {
    delete page.withReservationTrial;
    const writer = await page.context().newPage();
    const origin = 'http://127.0.0.1:13009';
    const accounts = { A: 'example-user', B: 'trial-user-b' };
    const reads = [],
      writes = [],
      pageErrors = [],
      owned = [];
    const assert = (ok, message) => {
      if (!ok) throw new Error(message);
    };
    const read = (request) => {
      if (!request.url().endsWith('/graphql')) return;
      const query = request.postDataJSON()?.query ?? '';
      if (
        /\bTandroveRead\b/.test(query) &&
        query.includes('getAllReservations')
      )
        reads.push(query);
    };
    const write = (request) => {
      if (!request.url().endsWith('/graphql')) return;
      const query = request.postDataJSON()?.query ?? '';
      if (query.includes('createReservation')) writes.push('create');
      if (query.includes('deleteReservation')) writes.push('delete');
    };
    const error = (err) => pageErrors.push(err.name);
    const signedIn = (tab, label) =>
      tab.getByText('Signed in: ' + accounts[label], { exact: true });
    const choose = async (tab, label) => {
      await tab
        .getByRole('button', { name: 'Account ' + label, exact: true })
        .click();
      await signedIn(tab, label).waitFor();
    };
    const ready = () =>
      page
        .getByTestId('reservation-state')
        .filter({ hasText: /^Ready$/ })
        .waitFor();
    const openObserver = async () => {
      await page.goto(origin + '/trial/reservation-membership?trialAccounts=1');
      await signedIn(page, 'A').waitFor();
      await ready();
    };
    const rows = () =>
      page
        .getByTestId('reservation-row')
        .evaluateAll((nodes) =>
          nodes.map((node) =>
            Array.from(node.querySelectorAll('td'), (cell) =>
              cell.textContent.trim(),
            ),
          ),
        );
    const membership = () => page.getByTestId('membership-stale').innerText();
    const loadWriterList = async (action) => {
      const [response] = await Promise.all([
        writer.waitForResponse(
          (res) =>
            res.url().endsWith('/graphql') &&
            res.request().postData()?.includes('getAllReservations'),
        ),
        action(),
      ]);
      const list = (await response.json()).data?.getAllReservations;
      assert(
        response.ok() &&
          list?.success === true &&
          Array.isArray(list.reservations),
        'Reservation list failed',
      );
      const ids = list.reservations.map((row) => String(row.id));
      await writer.waitForFunction((expected) => {
        const body = document.querySelector('#reservations-panel tbody');
        if (!body) return false;
        const actual = Array.from(
          body.querySelectorAll('tr td:first-child:not([colspan])'),
          (cell) => cell.textContent.trim(),
        );
        return JSON.stringify(actual) === JSON.stringify(expected);
      }, ids);
    };
    const openWriter = async (label) => {
      await loadWriterList(() => writer.goto(origin + '/home?trialAccounts=1'));
      await signedIn(writer, 'A').waitFor();
      if (label !== 'A') await loadWriterList(() => choose(writer, label));
    };
    const requireEmpty = async (label) => {
      await openWriter(label);
      await writer
        .getByRole('cell', {
          name: 'No reservations found. Book a room to get started!',
          exact: true,
        })
        .waitFor();
    };
    const matchOwned = (item) => {
      let row = writer.locator('#reservations-panel tbody tr');
      for (const text of [
        item.room,
        item.start,
        item.end,
        ...(item.id ? [item.id] : []),
      ])
        row = row.filter({
          has: writer.getByRole('cell', { name: text, exact: true }),
        });
      return row;
    };
    const commandResult = async (name, click) => {
      const [response] = await Promise.all([
        writer.waitForResponse(
          (res) =>
            res.url().endsWith('/graphql') &&
            (res.request().postDataJSON()?.query ?? '').includes(name),
        ),
        click(),
      ]);
      const payload = await response.json();
      assert(
        response.ok() &&
          !payload.errors?.length &&
          payload.data?.[name]?.success === true,
        'Server did not confirm ' + name,
      );
    };
    const book = async (label, room, start, end) => {
      await openWriter(label);
      const item = { label, room, start, end };
      assert(
        (await matchOwned(item).count()) === 0,
        'Fixture booking already exists',
      );
      await writer.getByRole('link', { name: '+ Book a Room' }).click();
      await writer.getByLabel('Room', { exact: true }).selectOption(room);
      await writer.getByLabel('Check-In Date').fill(start);
      await writer.getByLabel('Check-Out Date').fill(end);
      owned.push(item); // Recover by this pre-checked tuple if delivery fails after commit.
      await commandResult('createReservation', () =>
        writer
          .getByRole('button', { name: 'Book Reservation', exact: true })
          .click(),
      );
      const row = matchOwned(item);
      await row.waitFor();
      item.id = (await row.getByRole('cell').first().innerText()).trim();
      assert(/^\d+$/.test(item.id), 'Expected the real reservation ID');
      return item;
    };
    const cancel = async (item, cleanup = false) => {
      await openWriter(item.label);
      const row = matchOwned(item);
      if (cleanup && (await row.count()) === 0) return;
      await row.getByRole('button', { name: 'Cancel', exact: true }).click();
      await commandResult('deleteReservation', () =>
        writer
          .getByRole('button', { name: 'Yes, Cancel Reservation', exact: true })
          .click(),
      );
      await row.waitFor({ state: 'detached' });
      owned.splice(owned.indexOf(item), 1);
    };
    page.on('request', read);
    writer.on('request', write);
    page.on('pageerror', error);
    writer.on('pageerror', error);
    let outcome;
    const failures = [];
    const collect = (error) =>
      failures.push(error instanceof Error ? error.message : String(error));
    try {
      outcome = await run({
        page,
        assert,
        choose,
        ready,
        openObserver,
        rows,
        membership,
        requireEmpty,
        book,
        cancel,
        reads,
      });
    } catch (error) {
      collect(error);
    } finally {
      try {
        for (const item of [...owned].reverse())
          await cancel(item, true).catch(collect);
        if (
          await page
            .getByRole('button', { name: 'Log out', exact: true })
            .count()
        ) {
          const before = reads.length;
          await page
            .getByRole('button', { name: 'Log out', exact: true })
            .click();
          await page
            .getByText('Signed out. Choose an account to continue.', {
              exact: true,
            })
            .waitFor();
          await page.waitForTimeout(5200);
          assert(
            reads.length === before,
            'Logout started another reservation read',
          );
        }
      } catch (error) {
        collect(error);
      } finally {
        page.off('request', read);
        writer.off('request', write);
        page.off('pageerror', error);
        writer.off('pageerror', error);
        await writer.close().catch(collect);
      }
    }
    if (pageErrors.length)
      failures.push('Unhandled page error: ' + pageErrors.join(', '));
    if (failures.length) throw new Error(failures.join(' | '));
    return {
      passed: true,
      ...outcome,
      reservationReads: reads.length,
      writes,
      pageErrors,
      timestamp: new Date().toISOString(),
    };
  };
  return { installed: true };
}
