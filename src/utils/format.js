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
export function formatCurrency(amount, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
