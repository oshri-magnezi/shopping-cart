export function formatDateTime(timestamp, locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

/**
 * How fresh something is, the way a person says it: "today, 04:31",
 * "yesterday, 04:31", and a plain date only once it is older than that.
 *
 * The price label used to read "prices from 28 Sep 2026, 04:31" every single
 * morning, which makes the shopper do the arithmetic to learn the one thing
 * they wanted — whether these are today's prices. "Today" and "yesterday" come
 * from Intl.RelativeTimeFormat, so they are correct in both languages without
 * a string of our own.
 *
 * Days are compared by the calendar in the viewer's time zone, not by 24-hour
 * spans: a catalogue built at 04:31 is "today" all day, not only until 04:31
 * tomorrow.
 */
export function formatFreshness(timestamp, locale, now = Date.now()) {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return '';

  const startOfDay = (value) => {
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  };
  const daysAgo = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(then);

  if (daysAgo === 0 || daysAgo === 1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-daysAgo, 'day');
    return `${day}, ${time}`;
  }
  return formatDateTime(timestamp, locale);
}

/**
 * Weights read in whichever unit a shopper would say out loud at the counter:
 * grams below a kilo, kilos at or above it.
 */
export function formatWeight(kg, t) {
  if (kg >= 1) {
    // 1.5 reads better than 1.500, and 1 better than 1.0.
    return t('unit.kg', { n: String(Math.round(kg * 100) / 100) });
  }
  return t('unit.grams', { n: String(Math.round(kg * 1000)) });
}

// Prices are always in shekels; only the digit/symbol layout follows the locale.
function currencyFormat(amount, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(amount, locale) {
  return currencyFormat(amount, locale).format(amount);
}

/**
 * The same text as formatCurrency, split into the amount and the sign, so the
 * sign can be drawn quieter than the digits. Each part is `{ text, sign }`.
 */
export function formatCurrencyParts(amount, locale) {
  return currencyFormat(amount, locale)
    .formatToParts(amount)
    .map((part) => ({ text: part.value, sign: part.type === 'currency' }));
}
