async function runHotelTrial(page) {
  const started = Date.now();
  let reads = 0;
  const listener = (request) => {
    if (
      request.url().endsWith('/graphql') &&
      request.postData()?.includes('TandroveRead')
    )
      reads++;
  };
  page.on('request', listener);
  for (let index = 0; index < 100; index++) {
    const acquired = page.waitForResponse(
      (response) =>
        response.request().postData()?.includes('TandroveRead') &&
        response.ok(),
    );
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await acquired;
    await page.getByLabel('Room', { exact: true }).selectOption('room_1');
    await page
      .getByTestId('room-rate')
      .filter({ hasText: '$155.00' })
      .waitFor();
    if ((await page.locator('#roomId option').count()) !== 10)
      throw new Error('Lost room records');
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
    await page.getByRole('link', { name: '← Back' }).click();
    await page
      .getByRole('heading', { name: 'Hotel Reservations', exact: true })
      .waitFor();
    if (reads !== index + 1)
      throw new Error(`Unexpected reads: ${reads} at cycle ${index + 1}`);
  }
  // Observe beyond the configured 500ms inactive retention window.
  await page.waitForTimeout(750);
  page.off('request', listener);
  if (reads !== 100) throw new Error('A departed owner issued another read');
  return {
    passed: true,
    navigationCycles: 100,
    previewDestructionCycles: 100,
    roomReads: reads,
    elapsedMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  };
}
