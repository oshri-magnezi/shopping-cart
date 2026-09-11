import { describe, expect, it } from 'vitest';
import { compareBaskets } from './basket.js';

const chain = (key) => ({ key, displayName: key, storeName: '' });

// Each line is one basket item; `prices[i]` is what chain i charges, or null.
const line = (prices, amount = 1) => ({
  amount,
  prices: prices.map((price) => (price === null ? null : { price, name: 'x' })),
});

describe('compareBaskets', () => {
  it('judges a chain on everything it stocks, not on the shared remainder', () => {
    // Only the third item is stocked everywhere. Under the old intersection
    // model that single item decided the winner outright; here the two items
    // "a" is cheap on still count.
    const chains = [chain('a'), chain('b')];
    const lines = [
      line([10, null]),
      line([10, null]),
      line([6.6, 6.7]),
    ];

    const { winner, maxFound } = compareBaskets(lines, chains);
    expect(maxFound).toBe(3);
    expect(winner.key).toBe('a');
    expect(winner.foundCount).toBe(3);
  });

  it('does not let a chain win on a fraction of the list', () => {
    // "cheap" is far cheaper but stocks one item out of three. It cannot take
    // the headline, because it has not answered the question.
    const chains = [chain('full'), chain('cheap')];
    const lines = [line([10, 1]), line([10, null]), line([10, null])];

    const { winner, maxFound, rows } = compareBaskets(lines, chains);
    expect(maxFound).toBe(3);
    expect(winner.key).toBe('full');
    expect(rows.find((row) => row.key === 'cheap').foundCount).toBe(1);
  });

  it('weights the index by money, not by item count', () => {
    // Chain "a" is 50% over on a ₪2 item and 10% under on a ₪100 one. Counting
    // percentages equally would call it dearer; counting shekels does not.
    const chains = [chain('a'), chain('b')];
    const lines = [line([3, 2]), line([90, 100])];

    const { rows } = compareBaskets(lines, chains);
    const a = rows.find((row) => row.key === 'a');
    expect(a.index).toBeLessThan(1);
  });

  it('takes the reference from the median, so one bad match cannot move it', () => {
    // A mis-matched product at ten times the price would drag a mean far off.
    const chains = [chain('a'), chain('b'), chain('c')];
    const lines = [line([10, 10, 100])];

    const { rows } = compareBaskets(lines, chains);
    expect(rows.find((row) => row.key === 'a').index).toBe(1);
    expect(rows.find((row) => row.key === 'c').index).toBe(10);
  });

  it('measures the saving only over what both chains stock', () => {
    const chains = [chain('a'), chain('b')];
    // Both cover two items, but not the same two. Subtracting totals would
    // compare a bag of rice against a bottle of oil.
    const lines = [line([5, null]), line([null, 50]), line([10, 12])];

    const { savings } = compareBaskets(lines, chains);
    expect(savings).toBe(2);
  });

  it('multiplies by the amount, so weight and quantity count', () => {
    const chains = [chain('a'), chain('b')];
    const lines = [line([10, 12], 3)];

    const { rows, savings } = compareBaskets(lines, chains);
    expect(rows.find((row) => row.key === 'a').total).toBe(30);
    expect(savings).toBe(6);
  });

  it('prices each coverage group against its own peers', () => {
    // Three chains carry both items; three carry only the second, and carry it
    // cheaply. Drawn from everybody, that cheap crowd would pull the reference
    // for the second line down and make the full-coverage chains look dearer
    // on a line they had no choice but to include.
    const chains = ['f1', 'f2', 'f3', 'p1', 'p2', 'p3'].map(chain);
    const lines = [
      line([10, 10, 10, null, null, null]),
      line([10, 10, 10, 2, 2, 2]),
    ];

    const { rows, maxFound } = compareBaskets(lines, chains);
    expect(maxFound).toBe(2);
    // Each full-coverage chain is exactly typical among the other full ones.
    for (const key of ['f1', 'f2', 'f3']) {
      expect(rows.find((row) => row.key === key).index).toBe(1);
    }
    // And each partial chain is exactly typical among the other partials,
    // rather than looking eighty per cent cheap against a mixed field.
    for (const key of ['p1', 'p2', 'p3']) {
      expect(rows.find((row) => row.key === key).index).toBe(1);
    }
  });

  it('falls back to the whole field when a group is too small to have a median', () => {
    // Two chains cannot produce a typical price: one is always cheaper and the
    // other dearer by the same amount, whatever they charge.
    const chains = ['a', 'b'].map(chain);
    const { rows } = compareBaskets([line([8, 12])], chains);
    expect(rows.find((row) => row.key === 'a').index).toBe(0.8);
    expect(rows.find((row) => row.key === 'b').index).toBe(1.2);
  });

  it('reports no winner when nothing was found anywhere', () => {
    const { winner, maxFound } = compareBaskets([line([null, null])], [chain('a'), chain('b')]);
    expect(maxFound).toBe(0);
    expect(winner).toBeNull();
  });
});

describe('ordering', () => {
  it('puts coverage ahead of price', () => {
    // "partial" is by far the cheapest and stocks one item of two. It ranks
    // last, because it is answering a different question.
    const chains = [chain('dear'), chain('cheap'), chain('partial')];
    const lines = [line([12, 9, 1]), line([12, 9, null])];

    const { rows } = compareBaskets(lines, chains);
    expect(rows.map((row) => row.key)).toEqual(['cheap', 'dear', 'partial']);
  });

  it('breaks a coverage tie by price rather than by input order', () => {
    const chains = [chain('dear'), chain('cheap')];
    const { rows } = compareBaskets([line([12, 9])], chains);
    expect(rows.map((row) => row.key)).toEqual(['cheap', 'dear']);
  });
});
