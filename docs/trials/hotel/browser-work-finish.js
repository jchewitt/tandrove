async function finishHotelWorkSession(page) {
  if (!page.__hotelWork) throw new Error('No active work session');
  return await page.__hotelWork.finish();
}
