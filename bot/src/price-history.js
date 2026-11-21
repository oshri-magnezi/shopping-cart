import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_BASE } from './pull-live-catalog.js';

/**
 * Price history: for each city, when the cheapest price of a product changed.
 *
 * Only changes are kept. Most prices do not move for months, so a record of
 * every product every night would be megabytes of the same number; a product
 * appears here only once its price has actually moved, as a short series of
 * `[day, price]` points. The site reads it to say "down ₪1.20 this month".
 *
 * Nothing is stored between nights except on the site itself: each run takes
 * yesterday's history and yesterday's catalogue from the live site, compares
 * them with the catalogue just built, and publishes the result beside it.
 * History is never committed, and a night without it loses nothing but that
 * night's comparison.
 */

export const HISTORY_SCHEMA = 1;
// How far back the site can look. Older points fall away.
export const WINDOW_DAYS = 60;
// The same rule the site uses for cross-chain identity: anything shorter is
// an in-store code that different chains reuse for different products.
const MIN_CODE = 8;
const DAY_MS = 86_400_000;

/** Whole days since 1970, in Israel — the day the prices are "of". */
export function dayOf(iso) {
  const local = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS);
}

/**
 * The cheapest price of each barcode across a city's stores, per unit kind:
 * a per-kilogram price and a per-item one are different things even under one
 * code, so the key carries which it is.
 */
export function cheapest(catalog) {
  const prices = new Map();
  for (const chain of catalog?.chains ?? []) {
    for (const [, price, code, , unit] of chain.products) {
      if (!code || code.length < MIN_CODE || !(price > 0)) continue;
      const key = unit === 1 ? `${code}k` : code;
      const known = prices.get(key);
      if (known === undefined || price < known) prices.set(key, price);
    }
  }
  return prices;
}

/**
 * Yesterday's history plus whatever moved between the two catalogues.
 *
 * A product enters the history the first time its price changes, with the
 * old price as its starting point. Running twice on one day replaces that
 * day's point rather than adding another. Points older than the window are
 * dropped, keeping one as the price the window opened at; a product with
 * nothing but that one point left has not moved in the window and goes too.
 */
export function updateHistory(previous, before, after) {
  const today = dayOf(after.generatedAt);
  const items = { ...(previous?.schema === HISTORY_SCHEMA ? previous.items : {}) };

  const was = cheapest(before);
  for (const [key, now] of cheapest(after)) {
    const old = was.get(key);
    const series = items[key] ? [...items[key]] : null;
    const last = series?.at(-1);

    if (series && last[0] === today) {
      // Same day again: correct today's point, or drop it if the price is
      // back where the point before it was.
      series.pop();
      if (series.length === 0 || series.at(-1)[1] !== now) series.push([today, now]);
      items[key] = series;
    } else if (series) {
      if (last[1] !== now) items[key] = [...series, [today, now]];
    } else if (old !== undefined && old !== now) {
      items[key] = [
        [today - 1, old],
        [today, now],
      ];
    }
  }

  const oldest = today - WINDOW_DAYS;
  for (const [key, series] of Object.entries(items)) {
    const firstInside = series.findIndex(([day]) => day >= oldest);
    const kept = firstInside <= 0 ? series : series.slice(firstInside - 1);
    if (firstInside === -1 || kept.length < 2) delete items[key];
    else items[key] = kept;
  }

  return { schema: HISTORY_SCHEMA, city: after.city, updated: today, items };
}

const historyFileFor = (catalogFile) => catalogFile.replace('price-catalog-', 'price-history-');

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// node bot/src/price-history.js <catalogue dir>
//
// Writes price-history-<n>.json beside each freshly built city file. Never
// fails the run: a city whose yesterday cannot be read keeps the history it
// had, or goes without one tonight.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'public';
  const index = JSON.parse(await readFile(path.join(dir, 'price-catalog-index.json'), 'utf8'));
  const live = await fetchJson(new URL('price-catalog-index.json', LIVE_BASE)).catch(() => null);

  for (const entry of index.cities) {
    const target = path.join(dir, historyFileFor(entry.file));
    const liveEntry = live?.cities?.find((city) => city.city === entry.city);
    // Yesterday's history first, so that whatever goes wrong below, what has
    // been collected so far is published again rather than lost.
    const previous = liveEntry
      ? await fetchJson(new URL(historyFileFor(liveEntry.file), LIVE_BASE)).catch(() => null)
      : null;
    try {
      if (!liveEntry) throw new Error('not on the live site yet');
      const after = JSON.parse(await readFile(path.join(dir, entry.file), 'utf8'));
      const before = await fetchJson(new URL(liveEntry.file, LIVE_BASE));
      const history = updateHistory(previous, before, { ...after, generatedAt: index.generatedAt });
      await writeFile(target, JSON.stringify(history), 'utf8');
      console.log(
        `${entry.city}: ${Object.keys(history.items).length} products with a price change on record.`,
      );
    } catch (error) {
      // A file is always written, so the site always finds one.
      const kept =
        previous?.schema === HISTORY_SCHEMA
          ? previous
          : {
              schema: HISTORY_SCHEMA,
              city: entry.city,
              updated: dayOf(index.generatedAt),
              items: {},
            };
      await writeFile(target, JSON.stringify(kept), 'utf8');
      console.log(`${entry.city}: history left as it was (${error.message}).`);
    }
  }
}
