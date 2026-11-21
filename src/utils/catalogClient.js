import { createCatalogEngine } from './catalogEngine.js';

/**
 * Hands the main thread back so the browser can paint and read the keyboard.
 * Only the fallback path needs it; in a worker there is nothing to hold up.
 *
 * Not `setTimeout(0)`: browsers clamp timers in a backgrounded tab to about a
 * second, which would stretch a build across fifteen. A message port is a
 * task like any other and is not clamped.
 */
const breathe = () => {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
};

/** The engine on this thread, for browsers (and tests) without workers. */
function localClient() {
  let engine = createCatalogEngine(breathe);
  return {
    async load(url, first) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      engine = createCatalogEngine(breathe);
      return engine.load(
        await response.json(),
        first,
        url.replace('price-catalog-', 'price-history-'),
      );
    },
    match: (items) => engine.match(items),
    cheapest: (item) => engine.cheapest(item),
    suggest: (query, limit) => engine.suggest(query, limit),
    priceHistory: (keys) => engine.priceHistory(keys),
  };
}

/** The engine in a worker; each call is a message answered by its id. */
function workerClient() {
  const worker = new Worker(new URL('../workers/catalog.worker.js', import.meta.url), {
    type: 'module',
  });
  const waiting = new Map();
  let nextId = 1;

  worker.onmessage = ({ data }) => {
    const call = waiting.get(data.id);
    if (!call) return;
    waiting.delete(data.id);
    if (data.error) call.reject(new Error(data.error));
    else call.resolve(data.result);
  };

  const ask = (type, args) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...args });
    });

  return {
    load: (url, first) => ask('load', { url, first }),
    match: (items) => ask('match', { items }),
    cheapest: (item) => ask('cheapest', { item }),
    suggest: (query, limit) => ask('suggest', { query, limit }),
    priceHistory: (keys) => ask('priceHistory', { keys }),
  };
}

/**
 * The catalogue, wherever it can run. Same four calls either way, all
 * returning promises.
 */
export function createCatalogClient() {
  if (typeof Worker === 'undefined') return localClient();
  try {
    return workerClient();
  } catch {
    return localClient();
  }
}
