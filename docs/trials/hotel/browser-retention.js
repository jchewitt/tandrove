async function runRetentionTrial(page) {
  let reads = 0;
  const stages = [];
  const started = Date.now();
  const listener = (request) => {
    if (request.postData()?.includes('TandroveRead')) reads++;
  };
  page.on('request', listener);
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const book = async () => {
    await page.getByRole('link', { name: '+ Book a Room' }).click();
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
  };
  const home = async () => {
    await page.getByRole('link', { name: '← Back' }).click();
    await page
      .getByRole('heading', { name: 'Hotel Reservations', exact: true })
      .waitFor();
    return Date.now();
  };
  const record = (name, before, expected, extra = {}) => {
    assert(
      reads - before === expected,
      `${name}: expected ${expected} room reads; observed ${reads - before}`,
    );
    stages.push({
      name,
      roomReads: reads - before,
      elapsedMs: Date.now() - started,
      ...extra,
    });
  };
  try {
    await page.goto('http://127.0.0.1:13009/home?trialAccounts=1');
    await page.getByText('Signed in: example-user', { exact: true }).waitFor();
    await book();
    record('initial-two-consumer-acquisition', 0, 1);
    await page.getByLabel('Check-In Date').fill('2027-11-01');
    await page.getByLabel('Check-Out Date').fill('2027-11-03');
    let before = reads;
    const firstDeparture = await home();
    await page.waitForTimeout(600);
    await book();
    const firstAbsenceMs = Date.now() - firstDeparture;
    assert(firstAbsenceMs < 5000, 'Fast-return case exceeded retention window');
    assert(
      (await page.getByLabel('Check-In Date').inputValue()) === '',
      'Retained room cache retained the old draft',
    );
    assert(
      (await page.getByLabel('Check-Out Date').inputValue()) === '',
      'Retained room cache retained the old checkout',
    );
    record('fresh-route-reuse-with-blank-draft', before, 0, {
      inactiveMs: firstAbsenceMs,
    });

    // Stay active beyond the first departure's deadline, then start another window.
    await page.waitForTimeout(Math.max(0, firstDeparture + 5200 - Date.now()));
    const secondDeparture = await home();
    await page.waitForTimeout(1000);
    await book();
    assert(
      Date.now() - secondDeparture < 5000,
      'Second quick return exceeded its new window',
    );
    record('old-expiry-cancelled-and-new-window-started', before, 0);

    before = reads;
    await home();
    await page.waitForTimeout(5200);
    await book();
    record('inactive-expiry-reacquires', before, 1);

    const polled = page.waitForResponse(
      (response) =>
        response.request().postData()?.includes('TandroveRead') &&
        response.ok(),
    );
    await page
      .getByRole('button', { name: 'Start rate polling', exact: true })
      .click();
    await polled;
    await home();
    before = reads;
    await page.waitForTimeout(1000);
    await book();
    await page
      .getByRole('button', { name: 'Start rate polling', exact: true })
      .waitFor();
    await page.waitForTimeout(700);
    record('route-departure-stops-poll-with-client-retained', before, 0);

    let used = false,
      release,
      readyResolve,
      doneResolve;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    const ready = new Promise((resolve) => {
      readyResolve = resolve;
    });
    const done = new Promise((resolve) => {
      doneResolve = resolve;
    });
    const handler = async (route) => {
      if (used || !route.request().postData()?.includes('TandroveRead'))
        return route.fallback();
      used = true;
      try {
        const response = await route.fetch();
        const json = await response.json();
        for (const room of json.data.getAllRooms.rooms) room.daily_rate = 999;
        readyResolve();
        await waiting;
        await route.fulfill({ response, json }).catch(() => undefined);
      } finally {
        doneResolve();
      }
    };
    await page.route('**/graphql', handler);
    try {
      await page
        .getByRole('button', { name: 'Refresh room rates', exact: true })
        .click();
      await Promise.race([
        ready,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Pending read gate did not open')),
            5000,
          ),
        ),
      ]);
      before = reads;
      const left = await home();
      await book();
      assert(
        Date.now() - left < 5000,
        'Pending-read return missed the retention window',
      );
      release();
      await done;
      await page.waitForTimeout(100);
      assert(
        !(
          await page.getByLabel('Room', { exact: true }).textContent()
        ).includes('$999'),
        'Departed query resurrected its late result',
      );
      record('pending-read-cancelled-and-fresh-owner-isolated', before, 1);
    } finally {
      release();
      await page.unroute('**/graphql', handler);
    }

    const refreshed = page.waitForResponse(
      (response) =>
        response.request().postData()?.includes('TandroveRead') &&
        response.ok(),
    );
    await page
      .getByRole('button', { name: 'Reload room catalog', exact: true })
      .click();
    await refreshed;
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === 'Refresh room rates',
        )?.disabled,
    );
    const acceptedAt = Date.now();
    before = reads;
    await page.waitForTimeout(29000);
    const departedAt = await home();
    await page.waitForTimeout(2100);
    await book();
    const ageMs = Date.now() - acceptedAt,
      inactiveMs = Date.now() - departedAt;
    assert(
      ageMs > 30000 && inactiveMs < 5000,
      'Freshness/retention boundary was not crossed as intended',
    );
    record('retention-does-not-renew-original-freshness', before, 1, {
      ageMs,
      inactiveMs,
    });

    await home();
    before = reads;
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForTimeout(5200);
    assert(reads === before, 'Logged-out session issued room reads');
    await page.getByRole('button', { name: 'Account A', exact: true }).click();
    await page.getByText('Signed in: example-user', { exact: true }).waitFor();
    await book();
    record('logout-ends-retained-session-cache', before, 1);
    await home();
    before = reads;
    await page.waitForTimeout(5200);
    record('final-route-cleanup-has-no-network', before, 0);
    return {
      passed: true,
      stages,
      roomReads: reads,
      elapsedMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  } finally {
    page.off('request', listener);
  }
}
