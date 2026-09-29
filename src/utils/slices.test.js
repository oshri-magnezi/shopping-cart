import { describe, expect, it } from 'vitest';
import { inSlices } from './slices.js';
import { buildIndex, buildIndexInSlices } from './catalogIndex.js';
import { buildSuggestionPool, buildSuggestionPoolInSlices, suggest } from './suggest.js';

// A clock that moves a millisecond each time it is read, so the budget runs
// out on a schedule the test controls.
const ticking = () => {
  let t = 0;
  return () => (t += 1);
};

describe('inSlices', () => {
  it('covers every row exactly once, in order', async () => {
    const seen = [];
    await inSlices(
      1_000,
      (from, to) => {
        for (let i = from; i < to; i += 1) seen.push(i);
      },
      async () => {},
      { chunk: 64 },
    );
    expect(seen).toEqual(Array.from({ length: 1_000 }, (_, i) => i));
  });

  it('breathes inside a long run once the budget is spent', async () => {
    let breaths = 0;
    await inSlices(
      2_000,
      () => {},
      async () => {
        breaths += 1;
      },
      { chunk: 100, budgetMs: 2, now: ticking() },
    );
    // 20 chunks, a breath every other one on this clock.
    expect(breaths).toBe(10);
  });

  it('does not breathe while the budget lasts', async () => {
    let breaths = 0;
    await inSlices(
      2_000,
      () => {},
      async () => {
        breaths += 1;
      },
      { chunk: 100, budgetMs: 1_000, now: ticking() },
    );
    expect(breaths).toBe(0);
  });
});

// One large chain, broken into many slices, must build exactly what the
// one-go build does — the slicing may only change where the work pauses.
describe('sliced builds on a large chain', () => {
  const names = ['חלב 3% 1 ליטר', 'לחם אחיד', 'ביצים L', 'גבינה צהובה 200 גרם', 'שמן זית 750 מל'];
  const catalog = {
    chains: [
      {
        key: 'big',
        displayName: 'big',
        products: Array.from({ length: 3_000 }, (_, i) => [
          `${names[i % names.length]} ${i}`,
          1 + (i % 50),
          String(7290000000000 + i),
        ]),
      },
      {
        key: 'big-online',
        displayName: 'big online',
        products: [['חלב 3% 1 ליטר 0', 0.5, '7290000000000']],
      },
    ],
  };
  const everyChunk = { chunk: 97, budgetMs: 0 };

  it('builds the same comparison index', async () => {
    const atOnce = buildIndex(catalog);
    const sliced = await buildIndexInSlices(catalog, async () => {}, everyChunk);
    sliced.forEach((chain, i) => {
      expect(chain.vocabulary).toEqual(atOnce[i].vocabulary);
      expect([...chain.byToken.entries()]).toEqual([...atOnce[i].byToken.entries()]);
      expect([...chain.byCode.entries()]).toEqual([...atOnce[i].byCode.entries()]);
    });
  });

  it('builds the same suggestion pool', async () => {
    const atOnce = buildSuggestionPool(catalog);
    const sliced = await buildSuggestionPoolInSlices(catalog, async () => {}, everyChunk);
    expect(sliced.pool).toEqual(atOnce.pool);
    expect(sliced.vocabulary).toEqual(atOnce.vocabulary);
    expect(suggest(sliced, 'חלב')).toEqual(suggest(atOnce, 'חלב'));
  });
});
