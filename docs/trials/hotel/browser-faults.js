async function runHotelTrial(page) {
  const results = [];
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const button = (name) => page.getByRole('button', { name, exact: true });
  const rate = page.getByTestId('room-rate');
  const read = (request) =>
    request.url().endsWith('/graphql') &&
    request.postData()?.includes('TandroveRead');
  const refresh = () => button('Refresh room rates').click();
  const recover = async () => {
    await page.unrouteAll({ behavior: 'wait' });
    const response = page.waitForResponse((response) =>
      read(response.request()),
    );
    await button('Reload room catalog').click();
    await response;
    await page.locator('p[role="alert"]').waitFor({ state: 'hidden' });
    check(
      (await rate.textContent()).includes('$155.00'),
      'Recovery lost real rate',
    );
  };
  const cached = await page.locator('#roomId option:checked').textContent();
  let attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!read(route.request())) return route.continue();
    attempts++;
    await route.fulfill({
      json: {
        data: {
          getAllRooms: {
            __typename: 'RoomResult',
            success: false,
            errors: ['Trial catalog unavailable'],
            rooms: null,
          },
        },
      },
    });
  });
  await refresh();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Trial catalog unavailable' })
    .waitFor();
  check(attempts === 1, 'Business failure retried');
  check(
    (await page.locator('#roomId option:checked').textContent()) === cached,
    'Business failure erased cache',
  );
  check(
    (await page.getByLabel('Check-In Date').inputValue()) === '2027-07-01',
    'Business failure changed draft',
  );
  check(
    await button('Book Reservation').isDisabled(),
    'Business failure allowed submission',
  );
  results.push({
    scenario: 'business-error-retains-cache-and-draft',
    attempts,
  });
  await recover();

  attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!read(route.request())) return route.continue();
    attempts++;
    if (attempts === 1)
      return route.fulfill({ status: 503, body: 'Trial transient outage' });
    return route.continue();
  });
  await refresh();
  await page.waitForResponse(
    (response) => read(response.request()) && response.status() === 200,
  );
  await button('Refresh room rates').waitFor();
  check(attempts === 2, 'Transient read did not use exactly one retry');
  check(
    (await rate.textContent()).includes('$155.00'),
    'Transient retry lost cache',
  );
  results.push({ scenario: '503-recovers-with-one-retry', attempts });
  await recover();

  attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!read(route.request())) return route.continue();
    attempts++;
    return route.fulfill({ status: 403, body: 'Trial forbidden' });
  });
  await refresh();
  await page.getByRole('alert').filter({ hasText: '(403)' }).waitFor();
  check(attempts === 1, 'Authorization failure retried');
  check(
    (await rate.textContent()).includes('$155.00'),
    'Authorization failure erased cache',
  );
  results.push({ scenario: '403-terminal-and-recoverable', attempts });
  await recover();

  attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!read(route.request())) return route.continue();
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 2600));
    await route
      .fulfill({
        json: {
          data: {
            getAllRooms: {
              __typename: 'RoomResult',
              success: true,
              errors: null,
              rooms: [{ __typename: 'Room', id: 'room_1', daily_rate: 999 }],
            },
          },
        },
      })
      .catch(() => {});
  });
  await refresh();
  await page
    .getByRole('alert')
    .filter({ hasText: '2000ms deadline' })
    .waitFor();
  await page.unrouteAll({ behavior: 'wait' });
  check(
    (await rate.textContent()).includes('$155.00'),
    'Late response regressed cache',
  );
  check(attempts === 1, 'Deadline restarted acquisition');
  results.push({
    scenario: 'deadline-retains-cache-rejects-late-data',
    attempts,
  });
  await recover();

  let readCount = 0;
  const listener = (request) => {
    if (read(request)) readCount++;
  };
  page.on('request', listener);
  await page.context().setOffline(true);
  await refresh();
  await page
    .getByRole('alert')
    .filter({ hasText: 'network request failed' })
    .waitFor();
  await page.context().setOffline(false);
  page.off('request', listener);
  check(readCount === 2, 'Offline attempts not bounded to two');
  check((await rate.textContent()).includes('$155.00'), 'Offline erased cache');
  results.push({ scenario: 'offline-bounded-read-retry', attempts: readCount });
  await recover();

  attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!read(route.request())) return route.continue();
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue().catch(() => {});
  });
  await refresh();
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('heading', { name: 'Hotel Reservations' }).waitFor();
  await page.unrouteAll({ behavior: 'wait' });
  check(attempts === 1, 'Departed route retried');
  check(
    (await page.getByTestId('room-rate').count()) === 0,
    'Destroyed view remained',
  );
  results.push({ scenario: 'navigation-cancels-last-owner', attempts });
  return { passed: results, timestamp: new Date().toISOString() };
}
