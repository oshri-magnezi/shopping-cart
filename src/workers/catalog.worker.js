import { createCatalogEngine } from '../utils/catalogEngine.js';

// The catalogue engine, off the main thread. Downloading, parsing and
// indexing a city file all happen here, so none of it can cost the page a
// frame. Messages are `{ id, type, ...args }` and every one is answered with
// `{ id, result }` or `{ id, error }`.
let engine = createCatalogEngine();

// price-catalog-<n>.json?v=… → price-history-<n>.json?v=…, beside it.
const historyUrlFor = (url) => url.replace('price-catalog-', 'price-history-');

const handlers = {
  async load({ url, first }) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // A fresh engine per city, so answers from the previous one cannot leak
    // into the next.
    engine = createCatalogEngine();
    return engine.load(await response.json(), first, historyUrlFor(url));
  },
  match: ({ items }) => engine.match(items),
  cheapest: ({ item }) => engine.cheapest(item),
  suggest: ({ query, limit }) => engine.suggest(query, limit),
  priceHistory: ({ keys }) => engine.priceHistory(keys),
};

self.onmessage = async ({ data }) => {
  const { id, type, ...args } = data;
  try {
    self.postMessage({ id, result: await handlers[type](args) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
