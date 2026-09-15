import { describe, expect, it } from 'vitest';
import { buildIndex, buildIndexInSlices, findByCode, findInChain, indexChain } from './catalogIndex.js';

const chain = (products) => indexChain({ key: 'test', displayName: 'Test', products });

describe('barcode lookup', () => {
  const indexed = chain([
    ['חלב תנובה 3% 1 ליטר', 6.9, '7290000000011'],
    ['לחם אחיד פרוס', 5.5, '7290000000028'],
  ]);

  it('returns the exact product and marks it exact', () => {
    const match = findByCode(indexed, '7290000000011');
    expect(match).toMatchObject({ name: 'חלב תנובה 3% 1 ליטר', price: 6.9, exact: true, score: 1 });
  });

  it('returns null for a code this chain does not stock', () => {
    expect(findByCode(indexed, '7290000009999')).toBeNull();
  });

  it('returns null for an empty code rather than guessing', () => {
    expect(findByCode(indexed, '')).toBeNull();
  });

  it('reports whether the catalogue carries codes at all', () => {
    expect(indexed.hasCodes).toBe(true);
    expect(chain([['לחם', 5.5, '']]).hasCodes).toBe(false);
  });

  // Short codes are in-store PLUs that chains assign independently, so the
  // same code means different products at different chains. Answering with
  // one of those and calling it an exact match is worse than not answering.
  it('ignores a code too short to be a barcode', () => {
    const plu = chain([['לימון', 4.9, '14296']]);
    expect(findByCode(plu, '14296')).toBeNull();
    expect(plu.hasCodes).toBe(false);
  });

  it('still indexes an 8-digit EAN-8', () => {
    expect(findByCode(chain([['לימון', 4.9, '12345678']]), '12345678')).not.toBeNull();
  });
});

describe('unit of sale', () => {
  const loose = ['עגבניה', 6.9, '7290000000059', 0, 1];
  const packed = ['עגבניות ארוזות 1 קג', 12.9, '7290000000066'];

  it('reads the per-kilogram flag off the fifth element', () => {
    expect(findByCode(chain([loose]), '7290000000059').unit).toBe(1);
  });

  it('treats a row without the flag as priced per item', () => {
    expect(findByCode(chain([packed]), '7290000000066').unit).toBe(0);
  });

  // Comparing ₪/kg against ₪/item silently decides the winner on a unit
  // mismatch rather than on price.
  it('will not answer a per-item query with a per-kilogram product', () => {
    expect(findInChain(chain([loose]), 'עגבניה', { unit: 0 })).toBeNull();
  });

  it('will not answer a per-kilogram query with a per-item product', () => {
    expect(findInChain(chain([packed]), 'עגבניות', { unit: 1 })).toBeNull();
  });

  it('matches within the same unit', () => {
    expect(findInChain(chain([loose, packed]), 'עגבניה', { unit: 1 }).price).toBe(6.9);
  });

  it('defaults to per-item when no unit is asked for', () => {
    expect(findInChain(chain([loose, packed]), 'עגבניות').price).toBe(12.9);
  });
});

describe('text lookup', () => {
  it('picks the cheapest among near-equal matches', () => {
    const indexed = chain([
      ['חלב תנובה 3% 1 ליטר', 8.9, '1'],
      ['חלב 3% 1 ליטר', 6.4, '2'],
    ]);
    expect(findInChain(indexed, 'חלב 3% 1 ליטר').price).toBe(6.4);
  });

  // Comparing as candidates were visited made the winner depend on insertion
  // order, so the same basket could price differently between runs.
  it('gives the same answer whatever order the catalogue is in', () => {
    const products = [
      ['חלב תנובה 3% 1 ליטר', 8.9, '1'],
      ['חלב 3% 1 ליטר', 6.4, '2'],
      ['חלב טרה 3% 1 ליטר', 7.2, '3'],
    ];
    const forward = findInChain(chain(products), 'חלב 3% 1 ליטר');
    const reverse = findInChain(chain([...products].reverse()), 'חלב 3% 1 ליטר');
    expect(reverse.name).toBe(forward.name);
    expect(reverse.price).toBe(forward.price);
  });

  // A wrong match is usually a cheap novelty, so "cheapest among near-equals"
  // was actively selecting them. Measured on real data, this cost ~15% off
  // every basket total.
  // The near-miss scores 0.80 against the right product's 0.85. A 0.06 window
  // admitted it, and "cheapest wins" then preferred it outright.
  it('does not fall through to a cheap near-miss', () => {
    const indexed = chain([
      ['סוכר לבן 1 קג', 5.9, '7290000000011'],
      ['סוכר וניל בטעם קרמל 10 גרם', 3.0, '7290000000028'],
    ]);
    expect(findInChain(indexed, 'סוכר').name).toBe('סוכר לבן 1 קג');
  });

  it('still prefers the cheaper of two equally good matches', () => {
    const indexed = chain([
      ['קמח לבן 1 קג', 7.9, '7290000000035'],
      ['קמח לבן 1 קג', 5.4, '7290000000042'],
    ]);
    expect(findInChain(indexed, 'קמח לבן 1 קג').price).toBe(5.4);
  });

  it('returns null when nothing clears the threshold', () => {
    expect(findInChain(chain([['לחם אחיד פרוס', 5.5, '1']]), 'מסקרפונה')).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(findInChain(chain([['לחם', 5.5, '1']]), '   ')).toBeNull();
  });

  it('carries the promo flag through', () => {
    const indexed = chain([['שמן זית כתית 750 מל', 24.9, '1', 1]]);
    expect(findInChain(indexed, 'שמן זית 750 מל').promo).toBe(1);
  });
});

/**
 * The comparison screen renders straight from this index, so a sliced build
 * that differed from the whole-hog one would show different prices depending
 * on nothing but timing.
 */
describe('building in slices', () => {
  const sample = {
    chains: [
      { key: 'a', displayName: 'a', products: [['חלב 3% 1 ליטר', 6.9, '7290000000011']] },
      { key: 'b', displayName: 'b', products: [['לחם אחיד', 5.5, '']] },
    ],
  };

  it('produces exactly what building it in one go produces', async () => {
    const atOnce = buildIndex(sample);
    const sliced = await buildIndexInSlices(sample, async () => {});

    expect(sliced).toHaveLength(atOnce.length);
    sliced.forEach((chain, i) => {
      expect(chain.key).toBe(atOnce[i].key);
      expect(chain.vocabulary).toEqual(atOnce[i].vocabulary);
      expect([...chain.byToken.entries()]).toEqual([...atOnce[i].byToken.entries()]);
      expect([...chain.byCode.entries()]).toEqual([...atOnce[i].byCode.entries()]);
    });
  });

  it('gives the browser a turn once per chain', async () => {
    let breaths = 0;
    await buildIndexInSlices(sample, async () => { breaths += 1; });
    expect(breaths).toBe(sample.chains.length);
  });
});
