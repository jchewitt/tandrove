async function measureHotelRecoveryReads(page) {
  if (page.__hotelWork)
    throw new Error('Do not interrupt an active timed work session');
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitUntilSettled = () =>
    page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === 'Refresh room rates',
        )?.disabled,
    );
  let roomReads = 0;
  let phase = 'work';
  let loggedOut = false;
  const errors = [];
  const consoleErrors = [];
  const cycles = [];
  const observe = (request) => {
    if (
      request.url().endsWith('/graphql') &&
      request.postData()?.includes('TandroveRead')
    )
      roomReads++;
  };
  const pageError = (error) => errors.push({ name: error.name });
  const consoleError = (message) => {
    if (message.type() === 'error')
      consoleErrors.push({ phase, text: message.text().slice(0, 300) });
  };
  try {
    await page.goto('http://127.0.0.1:13009/home?trialAccounts=1');
    await page.getByText('Signed in: example-user', { exact: true }).waitFor();
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await page.getByLabel('Room', { exact: true }).selectOption('room_1');
    await page
      .getByTestId('room-rate')
      .filter({ hasText: '$155.00' })
      .waitFor();
    await page.getByLabel('Check-In Date').fill('2027-12-01');
    await page.getByLabel('Check-Out Date').fill('2027-12-03');
    await waitUntilSettled();
    page.on('request', observe);
    page.on('pageerror', pageError);
    page.on('console', consoleError);
    const startedMono = await page.evaluate(() => performance.now());
    // A separate bounded measurement, not additional timed-session evidence.
    // Initial acquisition is complete before these counters begin.
    for (let cycle = 1; cycle <= 3; cycle++) {
      const beforeFailure = roomReads;
      phase = 'offline';
      await page.context().setOffline(true);
      await page
        .getByRole('button', { name: 'Refresh room rates', exact: true })
        .click();
      await page.getByRole('alert').waitFor();
      await page.waitForTimeout(500);
      const failedAttempts = roomReads - beforeFailure;
      assert(failedAttempts === 2, 'Expected two bounded offline attempts');
      assert(
        await page
          .getByRole('button', { name: 'Book Reservation', exact: true })
          .isDisabled(),
        'Unavailable catalog allowed save',
      );
      // Measure across restoration and explicit refresh, so an unexpected
      // automatic online read also contributes to the observed delta.
      const beforeRecovery = roomReads;
      await page.context().setOffline(false);
      phase = 'work';
      const response = page.waitForResponse(
        (value) =>
          value.url().endsWith('/graphql') &&
          value.request().postData()?.includes('TandroveRead') &&
          value.ok(),
      );
      await page
        .getByRole('button', { name: 'Refresh room rates', exact: true })
        .click();
      await response;
      await waitUntilSettled();
      await page.getByRole('alert').waitFor({ state: 'detached' });
      const recoveryReads = roomReads - beforeRecovery;
      assert(recoveryReads === 1, 'Explicit recovery did not issue one read');
      assert(
        (await page.getByLabel('Check-In Date').inputValue()) ===
          '2027-12-01' &&
          (await page.getByLabel('Check-Out Date').inputValue()) ===
            '2027-12-03',
        'Recovery changed the local draft',
      );
      cycles.push({ cycle, failedAttempts, recoveryReads });
    }
    const beforeCleanup = roomReads;
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    loggedOut = true;
    await page.waitForTimeout(5200);
    const cleanupRoomReads = roomReads - beforeCleanup;
    assert(cleanupRoomReads === 0, 'Logout cleanup issued another read');
    assert(errors.length === 0, 'Unhandled browser error');
    assert(
      consoleErrors.every(
        (error) =>
          error.phase === 'offline' &&
          error.text.includes('ERR_INTERNET_DISCONNECTED'),
      ),
      'Unexpected browser console error',
    );
    return {
      passed: true,
      cycles,
      measuredRoomReads: roomReads,
      cleanupRoomReads,
      errors,
      consoleErrors,
      elapsedMs: Math.round(
        (await page.evaluate(() => performance.now())) - startedMono,
      ),
      timestamp: new Date().toISOString(),
    };
  } finally {
    try {
      const logout = page.getByRole('button', { name: 'Log out', exact: true });
      if (!loggedOut && (await logout.count())) await logout.click();
    } finally {
      try {
        await page.context().setOffline(false);
      } finally {
        page.off('request', observe);
        page.off('pageerror', pageError);
        page.off('console', consoleError);
      }
    }
  }
}
