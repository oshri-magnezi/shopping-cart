import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePricesFile } from './parse/prices.js';
import { parsePromosFile } from './parse/promos.js';
import { cityName } from './fetch/cities.js';
import { cityMatches } from './fetch/shared.js';

/**
 * Exports the full product catalogues for the site to match against.
 *
 * Shipping the catalogue rather than a fixed set of results is what lets the
 * website price *any* basket the shopper types, instead of only the items the
 * bot happened to run on.
 *
 * Products are stored as [name, price, barcode] triples, with a fourth `1`
 * appended when the price is a promotion. The barcode is the real prize: the
 * same code means the same product at every chain, so once a shopper picks a
 * product the site can look it up exactly instead of guessing from Hebrew
 * names eight times over.
 */
// Bumped whenever the product tuple changes shape, so the site can tell a
// stale catalogue from a current one.
export const CATALOG_SCHEMA = 2;

export async function buildCatalog({
  fetched,
  city,
  browser,
  cacheDir,
  log,
  // Per-city catalogues get their chain list from the index instead, and
  // gathering store lists costs a browser round trip per chain.
  includeCities = true,
}) {
  const entries = [];

  for (const entry of fetched) {
    if (!entry?.ok) continue;
    const chain = entry.chain;

    let products;
    try {
      products = await parsePricesFile(entry.pricesPath, chain.displayName);
    } catch (error) {
      log(`${chain.displayName}: הקטלוג לא נפתח — ${error.message}`);
      continue;
    }

    // Promotions are optional: a chain without them still prices a basket.
    let promos = { prices: new Map(), promoted: new Set() };
    if (entry.promosPath) {
      try {
        promos = await parsePromosFile(entry.promosPath);
      } catch (error) {
        log(`${chain.displayName}: המבצעים לא נקראו — ${error.message}`);
      }
    }

    let discounted = 0;
    let flagged = 0;
    const rows = products.map((product) => {
      const code = product.code ?? '';
      const promo = code ? promos.prices.get(code) : undefined;

      // 1 = this price is the promotion price. 2 = a deal exists but depends
      // on quantity or the rest of the basket, so the shelf price stands.
      if (promo !== undefined && promo < product.price) {
        discounted += 1;
        return [product.name, promo, code, 1];
      }
      if (code && promos.promoted.has(code)) {
        flagged += 1;
        return [product.name, product.price, code, 2];
      }
      return [product.name, product.price, code];
    });

    entries.push({
      key: chain.key,
      displayName: chain.displayName,
      storeName: entry.storeName ?? '',
      storeId: entry.storeId ?? '',
      cities: includeCities ? await chainCities(chain, browser, cacheDir, log) : [],
      products: rows,
    });

    const parts = [];
    if (discounted > 0) parts.push(`${discounted} במחיר מבצע`);
    if (flagged > 0) parts.push(`${flagged} עם מבצע`);
    const suffix = parts.length > 0 ? `, ${parts.join(', ')}` : '';
    log(`${chain.displayName}: ${products.length} מוצרים לקטלוג${suffix}`);
  }

  return { schema: CATALOG_SCHEMA, generatedAt: new Date().toISOString(), city, chains: entries };
}

/**
 * The towns a chain actually has branches in, so the site can offer a city
 * filter that only lists places the selected chains serve.
 */
async function chainCities(chain, browser, cacheDir, log) {
  try {
    const stores = await chain.listStores(browser, { cacheDir });
    const names = stores
      .map((store) => {
        // The city field is a CBS code for some chains and the whole branch
        // label for others, so anything that isn't a recognised town falls
        // through to reading the town out of the branch name.
        const resolved = cityName(store.city);
        if (KNOWN_CITIES.includes(resolved)) return resolved;
        return guessCityFromName(`${resolved} ${store.name}`);
      })
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'));
  } catch (error) {
    log(`${chain.displayName}: רשימת הערים לא נטענה — ${error.message}`);
    return [];
  }
}

// Some chains carry no city field at all and only name the branch, which
// usually contains the town ("בן יהודה תל אביב").
const KNOWN_CITIES = [
  'תל אביב',
  'ירושלים',
  'חיפה',
  'באר שבע',
  'ראשון לציון',
  'פתח תקווה',
  'נתניה',
  'חולון',
  'בת ים',
  'רמת גן',
  'אשדוד',
  'אשקלון',
  'רחובות',
  'הרצליה',
  'כפר סבא',
  'רעננה',
  'מודיעין',
  'בית שמש',
  'חדרה',
  'עפולה',
  'נהריה',
  'עכו',
  'טבריה',
  'אילת',
  'קרית גת',
  'רמלה',
  'לוד',
  'גבעתיים',
  'הוד השרון',
  'ראש העין',
  'יבנה',
  'כרמיאל',
  'נצרת',
  'בני ברק',
];

// Branch names abbreviate towns ("שלי ת\"א- בן יהודה"), so this reuses the
// alias-aware comparison rather than a plain substring test — otherwise every
// branch name becomes its own "city".
function guessCityFromName(name) {
  return KNOWN_CITIES.find((city) => cityMatches(name, city)) ?? '';
}

export async function writeCatalog(outputPath, payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload), 'utf8');
  return outputPath;
}

/**
 * Writes one catalogue per city plus a small index.
 *
 * Prices differ between branches, so a single nationwide file would quote
 * Tel Aviv prices to a shopper in Rishon LeZion. Splitting by city keeps each
 * download the size of one city's catalogue and lets the site fetch only the
 * one it needs. Files are numbered because Hebrew city names make poor
 * filenames across systems.
 */
export async function writeCityCatalogs(outputDir, cityPayloads) {
  await mkdir(outputDir, { recursive: true });

  const index = { schema: CATALOG_SCHEMA, generatedAt: new Date().toISOString(), cities: [] };

  for (const [position, payload] of cityPayloads.entries()) {
    const file = `price-catalog-${position}.json`;
    await writeFile(path.join(outputDir, file), JSON.stringify(payload), 'utf8');

    index.cities.push({
      city: payload.city,
      file,
      chains: payload.chains.map((chain) => ({
        key: chain.key,
        displayName: chain.displayName,
        storeName: chain.storeName,
        productCount: chain.products.length,
      })),
    });
  }

  const indexPath = path.join(outputDir, 'price-catalog-index.json');
  await writeFile(indexPath, JSON.stringify(index), 'utf8');
  return indexPath;
}
