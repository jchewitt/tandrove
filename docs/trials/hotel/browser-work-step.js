async function stepHotelWorkSession(page) {
  if (!page.__hotelWork) throw new Error('Run browser-work-start.js first');
  return await page.__hotelWork.step();
}
