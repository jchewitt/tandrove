async function inspectHotelWorkSession(page) {
  if (!page.__hotelWork) throw new Error('No active work session');
  return { passed: true, ...(await page.__hotelWork.receipt()) };
}
