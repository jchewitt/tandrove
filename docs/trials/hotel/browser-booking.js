async function runHotelTrial(page) {
  const commands = [];
  const listener = (request) => {
    const body = request.postData();
    if (request.url().endsWith('/graphql') && body?.includes('mutation'))
      commands.push(body.includes('createReservation') ? 'create' : 'delete');
  };
  page.on('request', listener);
  const fill = async () => {
    await page.getByRole('link', { name: '+ Book a Room' }).click();
    await page.getByLabel('Room', { exact: true }).selectOption('room_1');
    await page.getByLabel('Check-In Date').fill('2027-07-01');
    await page.getByLabel('Check-Out Date').fill('2027-07-03');
    await page
      .getByRole('button', { name: 'Book Reservation', exact: true })
      .click();
  };
  await fill();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Reservation created successfully' })
    .waitFor();
  await page.getByRole('cell', { name: '$409.00', exact: true }).waitFor();
  await fill();
  await page
    .getByRole('alert')
    .filter({
      hasText: 'Reservation dates overlap with an existing reservation',
    })
    .waitFor();
  if ((await page.getByLabel('Check-In Date').inputValue()) !== '2027-07-01')
    throw new Error('Failed booking erased draft');
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Yes, Cancel Reservation', exact: true })
    .click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Reservation cancelled successfully' })
    .waitFor();
  await page
    .getByRole('cell', {
      name: 'No reservations found. Book a room to get started!',
    })
    .waitFor();
  page.off('request', listener);
  if (commands.join(',') !== 'create,create,delete')
    throw new Error('Unexpected mutation retry/count: ' + commands);
  return {
    passed: true,
    scenarios: [
      'booking-confirmed-by-real-server',
      'overlap-rejected-draft-retained',
      'cancel-confirmation-and-list-update',
    ],
    mutationRequests: commands,
    timestamp: new Date().toISOString(),
  };
}
