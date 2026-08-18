import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChains } from './chains.js';
import { launchBrowser } from './fetch/browser.js';
import { readCacheEntry, writeCacheEntry, dropCacheEntry } from './cache.js';
import { parsePricesFile } from './parse/prices.js';
import { indexProducts, matchItem } from './match/match.js';
import { compareBaskets } from './compare.js';
import { printReport, writeResults } from './report.js';
import { buildCatalog, writeCityCatalogs } from './catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'cache');
const OUTPUT_DIR = path.join(ROOT, 'output');

function parseArgs(argv) {
  const args = { refresh: false, headful: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--refresh') args.refresh = true;
    else if (flag === '--headful') args.headful = true;
    else if (flag === '--list') args.list = argv[++i];
    else if (flag === '--city') args.city = argv[++i];
    else if (flag === '--list-stores') args.listStores = argv[++i];
    else if (flag === '--out') args.out = argv[++i];
    else if (flag === '--catalog') args.catalog = argv[++i];
    else if (flag === '--cities') args.cities = argv[++i];
    else if (flag === '--watch') {
      // The interval is optional: "--watch" alone uses the default.
      const next = argv[i + 1];
      args.watch = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

const log = (message) => console.log(`  ${message}`);

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizeItems(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      quantity: Number.isFinite(Number(item?.quantity)) ? Math.max(1, Number(item.quantity)) : 1,
    }))
    .filter((item) => item.name);
}

async function runListStores(chainKey, config, args, chains) {
  const chain = chains.find((entry) => entry.key === chainKey);
  if (!chain) {
    console.error(
      `רשת לא מוכרת: ${chainKey}. הרשתות הזמינות: ${chains.map((c) => c.key).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const browser = await launchBrowser(args.headful ? false : config.headless);
  try {
    const stores = await chain.listStores(browser, { cacheDir: CACHE_DIR });
    console.log(`\nסניפי ${chain.displayName} (${stores.length}):\n`);
    for (const store of stores) {
      console.log(`  ${store.storeId}\t${store.name}${store.city ? ` — ${store.city}` : ''}`);
    }
    console.log('');
  } finally {
    await browser.close();
  }
}

/** Fetches each chain in turn; one chain failing must not sink the run. */
async function collectChainFiles(config, args, chains) {
  const results = [];
  const pending = [];

  for (const chain of chains) {
    const cached = args.refresh
      ? null
      : await readCacheEntry(CACHE_DIR, chain.key, config.city, config.cacheHours);

    if (cached) {
      log(`${chain.displayName}: נטען מהמטמון`);
      results.push({ chain, ...cached, ok: true });
    } else {
      pending.push(chain);
    }
  }

  if (pending.length > 0) {
    const browser = await launchBrowser(args.headful ? false : config.headless);
    try {
      for (const chain of pending) {
        try {
          const fetched = await chain.fetcher({
            browser,
            city: config.city,
            storeOverride: config.storeOverrides?.[chain.key] ?? null,
            cacheDir: CACHE_DIR,
            log,
          });
          await writeCacheEntry(CACHE_DIR, chain.key, config.city, fetched);
          results.push({ chain, ...fetched, ok: true, fromCache: false });
        } catch (error) {
          log(`${chain.displayName}: נכשל — ${error.message}`);
          results.push({ chain, ok: false, error: error.message });
        }
      }
    } finally {
      await browser.close();
    }
  }

  return chains.map((chain) => results.find((result) => result.chain.key === chain.key));
}

async function matchChain(entry, items, threshold, config) {
  const { chain } = entry;
  if (!entry.ok) {
    return { key: chain.key, displayName: chain.displayName, ok: false, error: entry.error };
  }

  try {
    const products = indexProducts(await parsePricesFile(entry.pricesPath, chain.displayName));
    log(`${chain.displayName}: ${products.length} מוצרים בקטלוג`);

    return {
      key: chain.key,
      displayName: chain.displayName,
      ok: true,
      storeId: entry.storeId,
      storeName: entry.storeName,
      fromCache: Boolean(entry.fromCache),
      productCount: products.length,
      matches: items.map((item) => matchItem(item.name, products, threshold)),
    };
  } catch (error) {
    // A file that will not parse is worse than no file: drop it so the next
    // run re-downloads instead of failing identically forever.
    await dropCacheEntry(CACHE_DIR, chain.key, config.city);
    return {
      key: chain.key,
      displayName: chain.displayName,
      ok: false,
      error: error.message,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadJson(path.join(ROOT, 'config.json'));
  if (args.city) config.city = args.city;
  const chains = buildChains(config);

  await mkdir(CACHE_DIR, { recursive: true });

  if (args.listStores) {
    await runListStores(args.listStores, config, args, chains);
    return;
  }

  // The catalogue export prices whole cities, not one shopping list, so it
  // runs before the list is even read.
  if (args.catalog) {
    await runCatalog(config, args, chains, path.resolve(ROOT, args.catalog));
    return;
  }

  const listPath = path.resolve(ROOT, args.list ?? 'shopping-list.json');
  const items = normalizeItems(await loadJson(listPath));
  if (items.length === 0) {
    console.error(`רשימת הקניות ב-${listPath} ריקה או לא תקינה.`);
    process.exitCode = 1;
    return;
  }

  const outputPath = args.out ? path.resolve(ROOT, args.out) : path.join(OUTPUT_DIR, 'results.json');

  if (args.watch) {
    await runWatch({ items, config, args, chains, outputPath });
    return;
  }

  const comparison = await runOnce({ items, config, args, chains, outputPath, verbose: true });
  process.exitCode = comparison.ranked.length > 0 ? 0 : 1;
}

/**
 * Builds one catalogue per city for the website.
 *
 * Prices are per branch, so a shopper in Rishon LeZion must not be quoted Tel
 * Aviv prices. Each city gets its own file and the site loads only the one it
 * needs; a small index lists the cities and which chains each of them has.
 */
async function runCatalog(config, args, chains, outputDir) {
  const cities = (args.cities ?? config.city)
    .split(',')
    .map((city) => city.trim())
    .filter(Boolean);

  console.log(`\nבונה קטלוג מחירים ל-${cities.length} ערים: ${cities.join(', ')}\n`);

  const payloads = [];

  for (const city of cities) {
    console.log(`— ${city} —`);
    const cityConfig = { ...config, city };
    const fetched = await collectChainFiles(cityConfig, args, chains);
    const browser = await launchBrowser(args.headful ? false : config.headless);

    let payload;
    try {
      payload = await buildCatalog({
        fetched,
        city,
        browser,
        cacheDir: CACHE_DIR,
        log,
        includeCities: false,
      });
    } finally {
      await browser.close();
    }

    if (payload.chains.length === 0) {
      log(`${city}: אף רשת לא החזירה מחירים — העיר מדולגת`);
      continue;
    }
    payloads.push(payload);
  }

  if (payloads.length === 0) {
    console.error('\nלא נבנה קטלוג לאף עיר.\n');
    process.exitCode = 1;
    return;
  }

  const indexPath = await writeCityCatalogs(outputDir, payloads);
  const products = payloads.reduce(
    (sum, payload) => sum + payload.chains.reduce((n, chain) => n + chain.products.length, 0),
    0,
  );

  console.log(
    `\nנשמרו ${products.toLocaleString('he-IL')} מוצרים ב-${payloads.length} ערים.\nאינדקס: ${indexPath}\n`,
  );
  process.exitCode = 0;
}

/** One full pass: fetch, match, compare, report, persist. */
async function runOnce({ items, config, args, chains, outputPath, verbose }) {
  if (verbose) console.log(`\nמשווה ${items.length} פריטים בעיר ${config.city}...\n`);

  const fetched = await collectChainFiles(config, args, chains);
  const chainResults = [];
  for (const entry of fetched) {
    chainResults.push(await matchChain(entry, items, config.matchThreshold, config));
  }

  const comparison = compareBaskets(items, chainResults);
  if (verbose) printReport({ items, comparison, city: config.city, chainResults });

  await writeResults(outputPath, {
    generatedAt: new Date().toISOString(),
    city: config.city,
    matchThreshold: config.matchThreshold,
    items,
    chains: chainResults,
    comparison,
  });
  if (verbose) console.log(`הפירוט המלא נשמר ב-${outputPath}\n`);

  return comparison;
}

/**
 * Keeps results current. The chains republish their catalogues through the
 * day, so the loop re-fetches on an interval and rewrites the results file
 * in place — whatever reads that file always sees the latest prices.
 */
async function runWatch({ items, config, args, chains, outputPath }) {
  const minutes = Number(args.watch) > 0 ? Number(args.watch) : 30;
  console.log(
    `\nמצב מעקב: ${items.length} פריטים בעיר ${config.city}, רענון כל ${minutes} דקות.` +
      `\nהתוצאות נכתבות ל-${outputPath}. עצירה ב-Ctrl+C.\n`,
  );

  let tick = 0;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\nמצב המעקב נעצר.\n');
    process.exit(0);
  });

  while (!stopping) {
    tick += 1;
    const startedAt = new Date();
    const clock = startedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    try {
      // Always re-fetch: a cached file would defeat the point of watching.
      const comparison = await runOnce({
        items,
        config,
        args: { ...args, refresh: true },
        chains,
        outputPath,
        verbose: tick === 1,
      });

      const winner = comparison.winner;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        winner
          ? `${clock} — ${winner.displayName} מוביל ב-₪${winner.sharedTotal.toFixed(2)} ` +
              `(${comparison.ranked.length} רשתות, ${seconds} שניות)`
          : `${clock} — אף רשת לא החזירה מחירים (${seconds} שניות)`,
      );
    } catch (error) {
      console.log(`${clock} — הריצה נכשלה: ${error.message}. מנסה שוב בסבב הבא.`);
    }

    await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));
  }
}

main().catch((error) => {
  console.error(`\nשגיאה: ${error.message}\n`);
  process.exitCode = 1;
});
