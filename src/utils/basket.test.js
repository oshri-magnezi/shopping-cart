import { describe, expect, it } from 'vitest';
import { bestSplit, compareBaskets } from './basket.js';

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
    const lines = [line([10, null]), line([10, null]), line([6.6, 6.7])];

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
    const lines = [line([10, 10, 10, null, null, null]), line([10, 10, 10, 2, 2, 2])];

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

describe('online stores', () => {
  it('carries the online flag through to the row', () => {
    // The row decides what to say under the name: "delivery fee not included"
    // for an online store, the branch name for a shop.
    const chains = [chain('shop'), { ...chain('shop-online'), online: true }];
    const { rows } = compareBaskets([line([10, 9])], chains);
    expect(rows.find((row) => row.key === 'shop-online').online).toBe(true);
    expect(rows.find((row) => row.key === 'shop').online).toBe(false);
  });
});

describe('the typical price of a thinly stocked item', () => {
  it('is not taken from the one shop in the group that stocks it', () => {
    // Four chains carry both items; four carry one. Among those four, only
    // "keshet" has the snack, dear at 24.9 against 19.9 everywhere else. Priced
    // against itself it looked typical and ranked above "hazi", which is only
    // a little over on the palm hearts.
    const chains = ['a', 'b', 'c', 'd', 'shuf', 'shufOnline', 'keshet', 'hazi'].map(chain);
    const lines = [
      line([11.9, 11.9, 11.9, 10.7, 12.9, 11.9, null, 13.1]),
      line([19.9, 19.9, 19.9, 19.7, null, null, 24.9, null]),
    ];

    const { rows } = compareBaskets(lines, chains);
    const partialOrder = rows.filter((row) => row.foundCount === 1).map((row) => row.key);
    expect(partialOrder.indexOf('hazi')).toBeLessThan(partialOrder.indexOf('keshet'));
    expect(rows.find((row) => row.key === 'keshet').index).toBeCloseTo(24.9 / 19.9, 2);
  });
});

describe('bestSplit', () => {
  const stores = [chain('a'), chain('b'), chain('c')];
  const winner = { key: 'a' };
  const named = (name, prices, amount = 1) => ({ name, ...line(prices, amount) });

  it('offers the cheapest pair when it saves enough', () => {
    const lines = [
      named('חלב', [10, 30, 30]),
      named('לחם', [40, 12, 40]),
      named('ביצים', [20, 20, 9]),
    ];
    // Alone at "a": 70. a+b: 10+12+20 = 42. a+c: 10+40+9 = 59. b+c: 30+12+9 = 51.
    const split = bestSplit(lines, stores, winner);
    expect(split.total).toBe(42);
    expect(split.saving).toBe(28);
    expect(
      split.parts.map((part) => [part.chain.key, part.items.map((item) => item.name)]),
    ).toEqual([
      ['a', ['חלב', 'ביצים']],
      ['b', ['לחם']],
    ]);
    expect(split.parts[0].subtotal + split.parts[1].subtotal).toBe(42);
  });

  it('says nothing when the saving is not worth a second trip', () => {
    // 9.5 saved on 200: under both floors.
    expect(
      bestSplit([named('x', [100, 90.5, 500]), named('y', [100, 500, 500])], stores, winner),
    ).toBeNull();
    // 12 saved, but on a 400 basket that is 3%.
    expect(
      bestSplit([named('x', [200, 188, 900]), named('y', [200, 900, 900])], stores, winner),
    ).toBeNull();
  });

  it('multiplies by the amount bought', () => {
    const split = bestSplit([named('x', [10, 4, 99], 3), named('y', [10, 99, 99])], stores, winner);
    expect(split.saving).toBe(18);
    expect(split.parts[1].items[0].price).toBe(12);
  });

  it('counts only what the winner stocks, and needs the pair to carry all of it', () => {
    const lines = [
      named('x', [50, 20, null]),
      named('y', [50, null, null]),
      named('not at a', [null, 1, 1]),
    ];
    const split = bestSplit(lines, stores, winner);
    // "y" is only at "a", so a+b is the only pair; "not at a" is left out.
    expect(split.parts.flatMap((part) => part.items.map((item) => item.name)).sort()).toEqual([
      'x',
      'y',
    ]);
    expect(split.saving).toBe(30);
  });

  it('is not a split when one shop would get nothing', () => {
    // "b" is cheaper on everything: that is another shop, not two.
    expect(
      bestSplit([named('x', [50, 20, 60]), named('y', [50, 20, 60])], stores, winner),
    ).toBeNull();
  });

  it('needs a winner, two shops and two items', () => {
    expect(bestSplit([named('x', [50, 20, 60])], stores, winner)).toBeNull();
    expect(bestSplit([named('x', [50]), named('y', [50])], [chain('a')], winner)).toBeNull();
    expect(bestSplit([named('x', [50, 20, 60])], stores, null)).toBeNull();
  });
});
