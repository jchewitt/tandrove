async function runAccountReadTrial(page) {
  const results = [];
  const gates = [];
  const reads = [];
  const listener = (request) => {
    if (
      request.url().endsWith('/graphql') &&
      request.postData()?.includes('getAllRooms')
    )
      reads.push(request.postData());
  };
  page.on('request', listener);
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const signedIn = (account) =>
    page.getByText(`Signed in: ${account}`, { exact: true }).waitFor();
  const switchTo = async (label, account) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await signedIn(account);
  };
  const loaded = async () => {
    await page
      .getByRole('button', { name: 'Refresh room rates', exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('select#roomId') &&
        document.querySelectorAll('select#roomId option').length > 1,
    );
    await page.getByLabel('Room', { exact: true }).selectOption('room_1');
  };
  // The real server handles each gated request before delivery is withheld.
  const hold = async (pattern, matches, change) => {
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
      if (used || !matches(route.request())) return route.fallback();
      used = true;
      try {
        const response = await route.fetch();
        const json = await response.json();
        if (change) change(json);
        readyResolve();
        await waiting;
        // Aborting an old browser request is expected at a session boundary.
        await route.fulfill({ response, json }).catch(() => undefined);
      } catch (error) {
        readyReject(error);
      } finally {
        doneResolve();
      }
    };
    await page.route(pattern, handler);
    const gate = {
      ready: () =>
        Promise.race([
          ready,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Response gate did not open')),
              5000,
            ),
          ),
        ]),
      close: async () => {
        release();
        if (used) await done;
        await page.unroute(pattern, handler);
      },
    };
    gates.push(gate);
    return gate;
  };
  try {
    await page.goto('http://127.0.0.1:13009/home?trialAccounts=1');
    await signedIn('example-user');
    const login = await hold('**/development/token', (request) =>
      request.postData()?.includes('username=example-user'),
    );
    await page.getByRole('button', { name: 'Account A', exact: true }).click();
    await login.ready();
    await switchTo('Account B', 'trial-user-b');
    await login.close();
    await page.waitForTimeout(100);
    assert(
      (await page.getByTestId('session-account').textContent()).includes(
        'trial-user-b',
      ),
      'Late A login replaced B',
    );
    results.push('late-login-cannot-replace-new-account');

    await switchTo('Account A', 'example-user');
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await loaded();
    await page.getByLabel('Check-In Date').fill('2027-09-01');
    await page.getByLabel('Check-Out Date').fill('2027-09-03');
    const oldRead = await hold(
      '**/graphql',
      (request) => request.postData()?.includes('getAllRooms'),
      (json) => {
        for (const room of json.data.getAllRooms.rooms) room.daily_rate = 999;
      },
    );
    await page
      .getByRole('button', { name: 'Refresh room rates', exact: true })
      .click();
    await oldRead.ready();
    await switchTo('Account B', 'trial-user-b');
    await loaded();
    await oldRead.close();
    await page.waitForTimeout(100);
    assert(
      !(await page.getByLabel('Room', { exact: true }).textContent()).includes(
        '$999',
      ),
      'Late A read reached B',
    );
    assert(
      (await page.getByLabel('Room', { exact: true }).textContent()).includes(
        '$155/night',
      ),
      'B did not load the authoritative room rate',
    );
    assert(
      (await page.getByLabel('Check-In Date').inputValue()) === '',
      'A draft survived in B',
    );
    assert(
      (await page.getByLabel('Check-Out Date').inputValue()) === '',
      'A checkout survived in B',
    );
    results.push('late-room-read-and-draft-isolated-across-accounts');

    const poll = await hold('**/graphql', (request) =>
      request.postData()?.includes('getAllRooms'),
    );
    await page
      .getByRole('button', { name: 'Start rate polling', exact: true })
      .click();
    await poll.ready();
    await switchTo('Account A', 'example-user');
    await loaded();
    await poll.close();
    const count = reads.length;
    await page.waitForTimeout(1200);
    assert(reads.length === count, 'Old polling continued in the new account');
    await page
      .getByRole('button', { name: 'Start rate polling', exact: true })
      .waitFor();
    results.push('pending-poll-cancelled-and-registration-not-inherited');

    // First attempt is a deliberate 503; hold the real retry's successful response.
    let attempts = 0,
      retryReady,
      retryRelease,
      retryDone;
    const ready = new Promise((resolve) => {
      retryReady = resolve;
    });
    const waiting = new Promise((resolve) => {
      retryRelease = resolve;
    });
    const done = new Promise((resolve) => {
      retryDone = resolve;
    });
    const retryHandler = async (route) => {
      if (!route.request().postData()?.includes('getAllRooms') || attempts >= 2)
        return route.fallback();
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 503,
          body: 'Injected temporary failure',
        });
      try {
        const response = await route.fetch();
        retryReady();
        await waiting;
        await route.fulfill({ response }).catch(() => undefined);
      } finally {
        retryDone();
      }
    };
    await page.route('**/graphql', retryHandler);
    try {
      await page
        .getByRole('button', { name: 'Refresh room rates', exact: true })
        .click();
      await Promise.race([
        ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('No bounded retry')), 5000),
        ),
      ]);
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await page
        .getByText('Signed out. Choose an account to continue.', {
          exact: true,
        })
        .waitFor();
      retryRelease();
      await done;
      await page.waitForTimeout(300);
      assert(
        (await page.getByLabel('Room', { exact: true }).count()) === 0,
        'Retry resurrected logged-out UI',
      );
      assert(attempts === 2, 'Unexpected retry count');
      await switchTo('Account B', 'trial-user-b');
      await loaded();
      results.push('pending-retry-cancelled-on-logout-without-resurrecting-ui');
    } finally {
      retryRelease();
      await page.unroute('**/graphql', retryHandler);
    }
    await page.getByRole('link', { name: '← Back' }).click();
    return {
      passed: true,
      scenarios: results,
      roomRequests: reads.length,
      timestamp: new Date().toISOString(),
    };
  } finally {
    for (const gate of gates) await gate.close();
    page.off('request', listener);
  }
}
