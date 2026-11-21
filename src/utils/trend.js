/**
 * Price trends from the nightly price history (bot/src/price-history.js).
 *
 * The history keeps, per barcode, the cheapest price in the city on each day
 * it changed: `[[day, price], ...]`, days counted since 1970 in Israel. Only
 * products whose price actually moved are in it, so a product missing from
 * the history has simply held its price.
 */

/** The key the history files a product under: a per-kilo price is its own. */
export const historyKey = (code, unit) => (code ? (unit === 1 ? `${code}k` : code) : '');

/** The price on a given day: the last change on or before it. */
export function priceOn(series, day) {
  let price = series[0][1];
  for (const [when, value] of series) {
    if (when > day) break;
    price = value;
  }
  return price;
}

// Smaller than this is rounding, not a change anyone would act on.
const MIN_CHANGE = 0.1;
const MIN_SHARE = 0.02;

/**
 * How the price moved over the last `days`, or null when it did not move
 * enough to be worth a line: `{ change, from, to, days }`, change negative
 * when it fell.
 */
export function trendOf(series, today, days = 30) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const from = priceOn(series, today - days);
  const to = priceOn(series, today);
  const change = Math.round((to - from) * 100) / 100;
  if (Math.abs(change) < MIN_CHANGE || Math.abs(change) / from < MIN_SHARE) return null;
  return { change, from, to, days };
}

/**
 * The series as points for a small step chart, over the last `days`: the
 * price the window opened at, every change inside it, and today.
 */
export function stepPoints(series, today, days = 60) {
  const start = today - days;
  const points = [[start, priceOn(series, start)]];
  for (const [day, price] of series) if (day > start && day <= today) points.push([day, price]);
  points.push([today, priceOn(series, today)]);
  return points;
}
