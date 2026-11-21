import { describe, expect, it } from 'vitest';
import { historyKey, priceOn, stepPoints, trendOf } from './trend.js';

const today = 20_400;
const series = [
  [today - 50, 8],
  [today - 20, 7],
  [today - 3, 6.5],
];

describe('price trends', () => {
  it('files a per-kilo price apart from a per-item one', () => {
    expect(historyKey('7290000000011', 0)).toBe('7290000000011');
    expect(historyKey('7290000000011', 1)).toBe('7290000000011k');
    expect(historyKey('', 0)).toBe('');
  });

  it('reads the price on any day, before the first change too', () => {
    expect(priceOn(series, today - 100)).toBe(8);
    expect(priceOn(series, today - 20)).toBe(7);
    expect(priceOn(series, today)).toBe(6.5);
  });

  it('measures the last month', () => {
    expect(trendOf(series, today)).toEqual({ change: -1.5, from: 8, to: 6.5, days: 30 });
  });

  it('says nothing about a change too small to matter', () => {
    expect(
      trendOf(
        [
          [today - 5, 10],
          [today - 1, 10.05],
        ],
        today,
      ),
    ).toBeNull();
    // 0.20 on a 40-shekel product is half a percent.
    expect(
      trendOf(
        [
          [today - 5, 40],
          [today - 1, 40.2],
        ],
        today,
      ),
    ).toBeNull();
  });

  it('says nothing without a history', () => {
    expect(trendOf(undefined, today)).toBeNull();
    expect(trendOf([[today, 5]], today)).toBeNull();
  });

  it('draws the window from where it opened to today', () => {
    expect(stepPoints(series, today, 30)).toEqual([
      [today - 30, 8],
      [today - 20, 7],
      [today - 3, 6.5],
      [today, 6.5],
    ]);
  });
});
