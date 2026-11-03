async function abortHotelWorkSession(page) {
  if (!page.__hotelWork) throw new Error('No active work session');
  return await page.__hotelWork.abort();
}
