import { describe, expect, it } from 'vitest';
import { createCatalogEngine } from './catalogEngine.js';
import { buildIndex, cheapestPrice, findByCode, findInChain } from './catalogIndex.js';
import { buildSuggestionPool, suggest } from './suggest.js';

const catalog = {
  generatedAt: '2026-11-15T08:00:00.000Z',
  chains: [
    {
      key: 'a',
      displayName: 'א',
      storeName: 'סניף',
      products: [
        ['חלב תנובה 3% 1 ליטר', 6.9, '7290000000011'],
        ['לחם אחיד 750 גרם', 7.4, '7290000000028'],
        ['עגבניות', 5.9, '123', 0, 1],
      ],
    },
    {
      key: 'a-online',
      displayName: 'א אונליין',
      storeName: 'מחסן',
      online: true,
      products: [
        ['חלב תנובה 3% 1 ליטר', 6.5, '7290000000011'],
        ['במבה 80 גרם', 4.9, '7290000000035'],
      ],
    },
  ],
};

// The engine only moves the work; it must answer exactly as the functions it
// wraps do when called directly.
describe('catalogue engine', () => {
  it('describes the catalogue without its products', () => {
    const loaded = createCatalogEngine().load(catalog);
    expect(loaded).toEqual({
      generatedAt: catalog.generatedAt,
      chains: [
        { key: 'a', displayName: 'א', storeName: 'סניף', online: false, hasCodes: true },
        {
          key: 'a-online',
          displayName: 'א אונליין',
          storeName: 'מחסן',
          online: true,
          hasCodes: true,
        },
      ],
    });
  });

  it.each(['chains', 'suggestions'])(
    'matches like the index does (built %s first)',
    async (first) => {
      const engine = createCatalogEngine();
      engine.load(catalog, first);
      const indexed = buildIndex(catalog);
      const items = [
        { name: 'חלב', code: '7290000000011', unit: 0 },
        { name: 'לחם אחיד', code: '', unit: 0 },
        { name: 'עגבניות', code: '', unit: 1 },
        { name: 'אין כזה', code: '', unit: 0 },
      ];

      expect(await engine.match(items)).toEqual(
        items.map((item) =>
          indexed.map((chain) =>
            item.code
              ? findByCode(chain, item.code)
              : findInChain(chain, item.name, { unit: item.unit }),
          ),
        ),
      );
      expect(await engine.cheapest(items[0])).toEqual(cheapestPrice(indexed, items[0]));
      expect(await engine.suggest('חלב')).toEqual(suggest(buildSuggestionPool(catalog), 'חלב'));
    },
  );

  it('answers with nothing before a catalogue is loaded', async () => {
    const engine = createCatalogEngine();
    expect(await engine.match([{ name: 'חלב', code: '', unit: 0 }])).toEqual([[]]);
    expect(await engine.suggest('חלב')).toEqual([]);
  });
});
