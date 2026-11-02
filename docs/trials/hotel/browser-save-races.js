async function runSaveRaceTrial(page) {
  const results = [],
    gates = [],
    commands = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const listener = (request) => {
    const body = request.postData();
    if (request.url().endsWith('/graphql') && body?.includes('mutation'))
      commands.push(body.includes('createReservation') ? 'create' : 'delete');
  };
  page.on('request', listener);
  const switchTo = async (label, account) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByText(`Signed in: ${account}`, { exact: true }).waitFor();
  };
  const emptyList = () =>
    page
      .getByRole('cell', {
        name: 'No reservations found. Book a room to get started!',
        exact: true,
      })
      .waitFor();
  const fill = async (room, checkin, checkout) => {
    await page.getByLabel('Room', { exact: true }).selectOption(room);
    await page.getByLabel('Check-In Date').fill(checkin);
    await page.getByLabel('Check-Out Date').fill(checkout);
  };
  const hold = async (operation) => {
    let used = false,
      release,
      readyResolve,
      readyReject,
      doneResolve;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    const done = new Promise((resolve) => {
      doneResolve = resolve;
    });
    const handler = async (route) => {
      if (used || !route.request().postData()?.includes(operation))
        return route.fallback();
      used = true;
      try {
        const response = await route.fetch();
        const json = await response.json();
        assert(
          json.data?.[operation]?.success === true,
          `Real server rejected ${operation}`,
        );
        readyResolve();
        await waiting;
        await route.fulfill({ response, json }).catch(() => undefined);
      } catch (error) {
        readyReject(error);
      } finally {
        doneResolve();
      }
    };
    await page.route('**/graphql', handler);
    const gate = {
      ready: () =>
        Promise.race([
          ready,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`No ${operation} response`)),
              5000,
            ),
          ),
        ]),
      close: async () => {
        release();
        if (used) await done;
        await page.unroute('**/graphql', handler);
      },
    };
    gates.push(gate);
    return gate;
  };
  try {
    await page.goto('http://127.0.0.1:13009/home?trialAccounts=1');
    await page.getByText('Signed in: example-user', { exact: true }).waitFor();
    await emptyList();
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await fill('room_2', '2027-09-11', '2027-09-13');
    const edited = await hold('createReservation');
    await page
      .getByRole('button', { name: 'Book Reservation', exact: true })
      .click();
    await edited.ready();
    assert(
      await page
        .getByRole('button', { name: 'Book Reservation', exact: true })
        .isDisabled(),
      'Pending command can be submitted twice',
    );
    await page.getByLabel('Check-Out Date').fill('2027-09-14');
    await edited.close();
    await page
      .getByText(
        'Reservation saved. Later edits remain an unsent booking draft.',
        { exact: true },
      )
      .waitFor();
    assert(
      (await page.getByLabel('Check-Out Date').inputValue()) === '2027-09-14',
      'Success erased later edit',
    );
    await page.getByRole('link', { name: '← Back' }).click();
    await page.getByRole('cell', { name: '2027-09-13', exact: true }).waitFor();
    assert(
      (await page
        .getByRole('cell', { name: '2027-09-14', exact: true })
        .count()) === 0,
      'Later edit was silently submitted',
    );
    results.push(
      'pending-save-ack-preserves-unsent-edits-and-submitted-values',
    );

    await page.getByRole('link', { name: '+ Book a Room' }).click();
    const privateRead = await hold('getAllReservations');
    await page.getByRole('link', { name: '← Back' }).click();
    await privateRead.ready();
    await switchTo('Account B', 'trial-user-b');
    await emptyList();
    await privateRead.close();
    await page.waitForTimeout(150);
    await emptyList();
    assert(
      (await page
        .getByRole('cell', { name: '2027-09-13', exact: true })
        .count()) === 0,
      'Late A reservation list reached B',
    );
    results.push('late-private-reservation-read-cannot-overwrite-new-account');

    await switchTo('Account A', 'example-user');
    await page.getByRole('cell', { name: '2027-09-13', exact: true }).waitFor();
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await fill('room_3', '2027-09-21', '2027-09-23');
    const switched = await hold('createReservation');
    await page
      .getByRole('button', { name: 'Book Reservation', exact: true })
      .click();
    await switched.ready();
    await switchTo('Account B', 'trial-user-b');
    await fill('room_4', '2027-10-21', '2027-10-23');
    await switched.close();
    await page.waitForTimeout(150);
    assert(
      page.url().endsWith('/reservations/new'),
      'Old save navigated B away',
    );
    assert(
      (await page.getByLabel('Check-Out Date').inputValue()) === '2027-10-23',
      'Old save altered B draft',
    );
    assert(
      (await page.getByRole('alert').count()) === 0,
      'Old save leaked an alert into B',
    );
    await page.getByRole('link', { name: '← Back' }).click();
    await emptyList();
    await switchTo('Account A', 'example-user');
    await page.getByRole('cell', { name: '2027-09-23', exact: true }).waitFor();
    results.push(
      'committed-old-account-save-does-not-update-new-account-and-reconciles-on-return',
    );

    await switchTo('Account B', 'trial-user-b');
    await emptyList();
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await fill('room_4', '2027-10-21', '2027-10-23');
    const logout = await hold('createReservation');
    await page
      .getByRole('button', { name: 'Book Reservation', exact: true })
      .click();
    await logout.ready();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await logout.close();
    await page.waitForTimeout(150);
    await page
      .getByText('Signed out. Choose an account to continue.', { exact: true })
      .waitFor();
    assert(
      (await page.getByRole('alert').count()) === 0,
      'Late acknowledgement leaked an alert after logout',
    );
    assert(
      (await page.getByLabel('Room', { exact: true }).count()) === 0,
      'Late acknowledgement recreated the form',
    );
    await switchTo('Account B', 'trial-user-b');
    await page.getByRole('link', { name: '← Back' }).click();
    await page.getByRole('cell', { name: '2027-10-23', exact: true }).waitFor();
    assert(
      (await page
        .getByRole('button', { name: 'Cancel', exact: true })
        .count()) === 1,
      'B sees another account reservation',
    );
    results.push(
      'logout-after-server-commit-hides-late-ack-and-reconciles-without-replay',
    );

    // Remove only reservations created by this isolated run, through normal commands.
    const cancelAll = async (expected) => {
      for (let left = expected; left > 0; left--) {
        assert(
          (await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .count()) === left,
          'Unexpected reservation count during cleanup',
        );
        await page
          .getByRole('button', { name: 'Cancel', exact: true })
          .first()
          .click();
        await page
          .getByRole('button', { name: 'Yes, Cancel Reservation', exact: true })
          .click();
        await page.waitForFunction(
          (count) => document.querySelectorAll('tbody button').length === count,
          left - 1,
        );
      }
      await emptyList();
    };
    await cancelAll(1);
    await switchTo('Account A', 'example-user');
    await page.getByRole('cell', { name: '2027-09-23', exact: true }).waitFor();
    await cancelAll(2);
    assert(
      commands.join(',') === 'create,create,create,delete,delete,delete',
      'Commands were retried or duplicated: ' + commands.join(','),
    );
    return {
      passed: true,
      scenarios: results,
      mutationRequests: commands,
      timestamp: new Date().toISOString(),
    };
  } finally {
    for (const gate of gates) await gate.close();
    page.off('request', listener);
  }
}
