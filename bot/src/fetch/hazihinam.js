import path from 'node:path';
import { newPage, downloadFile } from './browser.js';
import { parseStoresFile } from '../parse/stores.js';
import {
  isFullPriceFile,
  isPromoFile,
  newestByName,
  pickStore,
  storeIdFromName,
  storeNotFoundError,
} from './shared.js';

const PORTAL = 'https://shop.hazi-hinam.co.il';
const CHAIN_NAME = 'חצי חינם';

// The listing's own filter values: 1 = prices, 2 = promotions, 3 = stores.
const TYPE_PRICES = 1;
const TYPE_PROMOS = 2;
const TYPE_STORES = 3;
// Files are listed newest-first, so the branch's PriceFull surfaces early.
const MAX_PAGES = 20;

async function openPortal(page) {
  await page.goto(`${PORTAL}/Prices`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table', { timeout: 30_000 });
}

/**
 * Reads one page of the file table.
 * Columns are: date | store code | file name | type | size | download link,
 * and the link points straight at public Azure blob storage — no login.
 */
async function readPage(page, pageNumber, type) {
  return page.evaluate(
    async (p, t) => {
      const response = await fetch(`/Prices?p=${p}&t=${t}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      return Array.from(doc.querySelectorAll('table tr'))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) =>
            cell.textContent.trim(),
          );
          const link = row.querySelector('a[href*="blob.core.windows.net"]');
          if (cells.length < 3 || !link) return null;
          return { storeCode: cells[1], name: cells[2], href: link.href };
        })
        .filter(Boolean);
    },
    pageNumber,
    type,
  );
}

async function resolveStores(page, cacheDir) {
  const rows = await readPage(page, 1, TYPE_STORES);
  const storesRow = newestByName(rows);
  if (!storesRow) throw new Error(`לא נמצא קובץ סניפים בפורטל של ${CHAIN_NAME}`);

  const localPath = path.join(cacheDir, 'hazihinam-stores.gz');
  await downloadFile(page, storesRow.href, localPath);
  return parseStoresFile(localPath);
}

export async function listStores(browser, { cacheDir }) {
  const page = await newPage(browser);
  try {
    await openPortal(page);
    // Awaited, not returned bare: the finally below would otherwise close the
    // page while this promise is still driving it.
    return await resolveStores(page, cacheDir);
  } finally {
    await page.close();
  }
}

export async function fetchHaziHinam({ browser, city, storeOverride, cacheDir, log }) {
  const page = await newPage(browser);
  try {
    log(`${CHAIN_NAME}: נפתח הפורטל`);
    await openPortal(page);

    const stores = await resolveStores(page, cacheDir);
    const picked = pickStore(stores, city, storeOverride);
    if (!picked) throw storeNotFoundError('hazihinam', CHAIN_NAME, city);

    const { store, viaOnline } = picked;
    log(`${CHAIN_NAME}: סניף ${store.name || store.storeId}${viaOnline ? ' (משלוחים ארצי)' : ''}`);

    // Walk the paged listing until this branch's full catalogue turns up.
    const candidates = [];
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
      const rows = await readPage(page, pageNumber, TYPE_PRICES);
      if (rows.length === 0) break;

      candidates.push(
        ...rows.filter(
          (row) => isFullPriceFile(row.name) && storeIdFromName(row.name) === store.storeId,
        ),
      );
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      throw new Error(`לא נמצא קובץ PriceFull לסניף ${store.storeId} של ${CHAIN_NAME}`);
    }

    const newest = newestByName(candidates);
    const destination = path.join(cacheDir, `hazihinam-${store.storeId}.gz`);

    log(`${CHAIN_NAME}: מוריד ${newest.name}`);
    await downloadFile(page, newest.href, destination);

    // Promotions are a bonus; a failure here must not cost us the prices.
    let promosPath = null;
    try {
      const promoRows = [];
      for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
        const rows = await readPage(page, pageNumber, TYPE_PROMOS);
        if (rows.length === 0) break;
        promoRows.push(
          ...rows.filter(
            (row) => isPromoFile(row.name) && storeIdFromName(row.name) === store.storeId,
          ),
        );
        if (promoRows.length > 0) break;
      }

      if (promoRows.length > 0) {
        promosPath = path.join(cacheDir, `hazihinam-${store.storeId}-promo.gz`);
        await downloadFile(page, newestByName(promoRows).href, promosPath);
      }
    } catch (error) {
      log(`${CHAIN_NAME}: המבצעים לא נטענו — ${error.message}`);
      promosPath = null;
    }

    return {
      pricesPath: destination,
      promosPath,
      storeId: store.storeId,
      storeName: store.name || store.city,
    };
  } finally {
    await page.close();
  }
}
