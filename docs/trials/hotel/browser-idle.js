async function runHotelTrial(page) {
  await page.getByRole('link', { name: '+ Book a Room' }).click();
  await page.getByLabel('Room', { exact: true }).selectOption('room_1');
  await page.getByTestId('room-rate').filter({ hasText: '$155.00' }).waitFor();
  let reads = 0;
  const listener = (request) => {
    if (
      request.url().endsWith('/graphql') &&
      request.postData()?.includes('TandroveRead')
    )
      reads++;
  };
  page.on('request', listener);
  await page.waitForTimeout(31000);
  if (reads !== 0) throw new Error('On-demand freshness unexpectedly fetched');
  await page.getByText('Rates need refresh.', { exact: false }).waitFor();
  await page.getByLabel('Check-In Date').fill('2027-07-01');
  await page.getByLabel('Check-Out Date').fill('2027-07-03');
  page.off('request', listener);
  return {
    passed: true,
    observationMs: 31000,
    requestsAfterExpiry: reads,
    mode: 'on-demand',
    cachedRate: 155,
  };
}
