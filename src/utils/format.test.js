import { describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyParts, formatFreshness } from './format.js';

/**
 * The price label answers one question — are these today's prices? — and
 * should answer it without the shopper doing date arithmetic.
 */
describe('formatFreshness', () => {
  // Noon local time, so a few hours either way stay on the same calendar day.
  const now = new Date(2026, 8, 28, 12, 0).getTime();
  const at = (day, hour, minute) => new Date(2026, 8, day, hour, minute).toISOString();

  it('says today for this morning, in both languages', () => {
    expect(formatFreshness(at(28, 4, 31), 'he-IL', now)).toBe('היום, 04:31');
    expect(formatFreshness(at(28, 4, 31), 'en-US', now)).toMatch(/^today, 0?4:31/i);
  });

  it('says yesterday for yesterday', () => {
    expect(formatFreshness(at(27, 4, 31), 'he-IL', now)).toBe('אתמול, 04:31');
  });

  it('counts calendar days, not 24-hour spans', () => {
    // 23:50 yesterday is less than a day ago, and still yesterday.
    expect(formatFreshness(at(27, 23, 50), 'he-IL', now)).toMatch(/^אתמול/);
  });

  it('falls back to a plain date once it is older than that', () => {
    const old = formatFreshness(at(23, 5, 11), 'he-IL', now);
    expect(old).not.toMatch(/היום|אתמול/);
    expect(old).toMatch(/2026/);
  });

  it('returns nothing for a date it cannot read', () => {
    expect(formatFreshness('not a date', 'he-IL', now)).toBe('');
  });
});

/** The sign is split out so it can be drawn quieter; the text must not change. */
describe('formatCurrencyParts', () => {
  it.each(['he-IL', 'en-US'])('joins back to exactly formatCurrency (%s)', (locale) => {
    for (const amount of [0, 8.5, 58.96, 1234.5]) {
      const parts = formatCurrencyParts(amount, locale);
      expect(parts.map((part) => part.text).join('')).toBe(formatCurrency(amount, locale));
      expect(parts.filter((part) => part.sign).map((part) => part.text)).toEqual(['₪']);
    }
  });
});
