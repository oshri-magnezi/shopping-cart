import { buildIndexInSlices, cheapestPrice, findByCode, findInChain } from './catalogIndex.js';
import { buildSuggestionPoolInSlices, suggest } from './suggest.js';

/**
 * Everything that reads a city's price catalogue, behind four calls.
 *
 * The catalogue is ~100k rows, and indexing it is seconds of work on a phone.
 * This object owns that work so it can live wherever there is room for it: in
 * a Web Worker normally (catalog.worker.js), where it cannot hold up a frame
 * or a keystroke, and on the main thread as a fallback where workers are
 * missing. Both run this same code, so they cannot disagree.
 *
 * `breathe` hands the thread back between slices — a real yield on the main
 * thread, nothing at all in a worker.
 */
export function createCatalogEngine(breathe = async () => {}) {
  let chains = Promise.resolve([]);
  let pool = Promise.resolve(null);
  let historyUrl = null;
  let history = null;

  return {
    /**
     * Takes a parsed city file and starts both indexes, the one the screen is
     * waiting on first. Returns what the UI needs to draw straight away: the
     * catalogue's date and its stores, without their products.
     */
    load(catalog, first = 'suggestions', priceHistoryUrl = null) {
      historyUrl = priceHistoryUrl;
      history = null;
      const buildChains = () => buildIndexInSlices(catalog, breathe);
      const buildPool = () => buildSuggestionPoolInSlices(catalog, breathe);

      if (first === 'chains') {
        chains = buildChains();
        pool = chains.then(buildPool);
      } else {
        pool = buildPool();
        chains = pool.then(buildChains);
      }
      // A failed build is reported by whichever call awaits it, not here.
      chains.catch(() => {});
      pool.catch(() => {});

      return {
        generatedAt: catalog.generatedAt,
        chains: catalog.chains.map((chain) => ({
          key: chain.key,
          displayName: chain.displayName,
          storeName: chain.storeName,
          online: Boolean(chain.online),
          hasCodes: chain.products.some((row) => row[2] && row[2].length >= 8),
        })),
      };
    },

    /**
     * Prices each item at every store: `result[item][store]` is a match or
     * null. A barcode identifies the same product everywhere, so it is looked
     * up directly — a miss means the store does not stock it. Only free text
     * has to be guessed.
     */
    async match(items) {
      const indexed = await chains;
      return items.map((item) =>
        indexed.map((chain) =>
          item.code && chain.hasCodes
            ? findByCode(chain, item.code)
            : findInChain(chain, item.name, { unit: item.unit }),
        ),
      );
    },

    /** The lowest price this item carries anywhere in the city, or null. */
    async cheapest(item) {
      return cheapestPrice(await chains, item);
    },

    /**
     * The price history of the given products: `{ today, series }`, with a
     * series for each key that has one. The file is fetched the first time
     * it is asked for, and a city without one simply has no series.
     */
    async priceHistory(keys) {
      if (!historyUrl) return { today: null, series: {} };
      history ??= fetch(historyUrl)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
      const data = await history;
      const series = {};
      if (data?.schema === 1) {
        for (const key of keys) if (data.items[key]) series[key] = data.items[key];
      }
      return { today: data?.updated ?? null, series };
    },

    /** Autocomplete for the add box. */
    async suggest(query, limit) {
      const built = await pool;
      return built ? suggest(built, query, limit) : [];
    },
  };
}
