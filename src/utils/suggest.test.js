import { describe, expect, it } from 'vitest';
import { buildSuggestionPool, suggest } from './suggest.js';

const catalog = (chains) => ({ chains });
const chain = (key, products) => ({ key, displayName: key, products });

describe('buildSuggestionPool', () => {
  it('collapses the same barcode across chains into one entry', () => {
    const pool = buildSuggestionPool(
      catalog([
        chain('a', [['חלב תנובה 3% 1 ליטר', 6.9, '7290000000011']]),
        chain('b', [['ח.תנובה 3% ליטר', 7.4, '7290000000011']]),
      ]),
    );
    expect(pool.pool).toHaveLength(1);
    expect(pool.pool[0]).toMatchObject({ chains: 2, min: 6.9, max: 7.4 });
  });

  it('falls back to the normalized name when there is no barcode', () => {
    const pool = buildSuggestionPool(
      catalog([chain('a', [['לחם אחיד', 5.5, '']]), chain('b', [['לחם אחיד', 6.1, '']])]),
    );
    expect(pool.pool).toHaveLength(1);
    expect(pool.pool[0].chains).toBe(2);
  });

  it('counts shops rather than rows when a chain lists a product twice', () => {
    const pool = buildSuggestionPool(
      catalog([chain('a', [['לחם', 5.5, '1'], ['לחם', 5.5, '1']])]),
    );
    expect(pool.pool[0].chains).toBe(1);
  });

  // Spreading tens of thousands of values into Math.max overflows the call
  // stack, which showed up as silently empty suggestions rather than an error.
  it('computes maxChains over a large pool without overflowing', () => {
    const products = Array.from({ length: 60000 }, (_, i) => [`מוצר${i}`, 1 + i, String(i)]);
    const pool = buildSuggestionPool(catalog([chain('a', products)]));
    expect(pool.pool).toHaveLength(60000);
    expect(pool.maxChains).toBe(1);
  });
});

describe('suggest', () => {
  const pool = buildSuggestionPool(
    catalog([
      chain('a', [
        ['חלב תנובה 3% 1 ליטר', 6.9, '1'],
        ['חלבה בטעם וניל', 12.0, '2'],
        ['חלבון אבקה 500 גרם', 89.0, '3'],
        ['לחם אחיד פרוס', 5.5, '4'],
      ]),
      // Stocked more widely, which is the signal that marks it as the staple.
      chain('b', [['חלב תנובה 3% 1 ליטר', 7.1, '1']]),
    ]),
  );

  // Prefix, never substring: a short Hebrew root sits inside unrelated words.
  it('does not offer חלב for the substring לב', () => {
    expect(suggest(pool, 'לב')).toEqual([]);
  });

  // "חלבה" is a legitimate completion of "חלב" while someone is mid-word, so
  // it is ranking rather than filtering that has to put the staple first.
  it('ranks the widely-stocked staple above niche prefix neighbours', () => {
    const names = suggest(pool, 'חלב').map((option) => option.name);
    expect(names[0]).toBe('חלב תנובה 3% 1 ליטר');
  });

  it('narrows as more words are typed', () => {
    expect(suggest(pool, 'לחם אח').map((option) => option.name)).toEqual(['לחם אחיד פרוס']);
  });

  it('returns nothing for a query that matches no word', () => {
    expect(suggest(pool, 'מסקרפונה')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(suggest(pool, '   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(suggest(pool, 'ל', 1)).toHaveLength(1);
  });

  it('carries the barcode and the price range across chains', () => {
    const [option] = suggest(pool, 'חלב תנובה');
    expect(option).toMatchObject({ code: '1', min: 6.9, max: 7.1, chains: 2 });
  });
});
