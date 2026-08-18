import path from 'node:path';
import { newPage, downloadFile } from './browser.js';
import {
  cityMatches,
  isFullPriceFile,
  isPromoFile,
  newestByName,
  storeIdFromName,
  storeNotFoundError,
} from './shared.js';

const PORTAL = 'https://prices.shufersal.co.il';
const CHAIN_NAME = 'שופרסל';
// Category ids used by the portal's own filter: 2 is the full price catalogue.
const CATEGORY_PRICE_FULL = 2;
const CATEGORY_PROMO_FULL = 4;

async function openPortal(page) {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ddlStore', { timeout: 30_000 });
}

async function readStoreOptions(page) {
  return page.evaluate(() =>
    Array.from(document.querySelector('#ddlStore').options)
      .map((option) => ({ value: option.value, text: option.textContent.trim() }))
      // "0 = All" is a filter placeholder, not a branch.
      .filter((option) => option.value && option.value !== '0'),
  );
}

/**
 * Queries the portal's own filter endpoint instead of driving the dropdowns.
 * It returns exactly the rows for one store and category, which sidesteps
 * pagination and the client-side table refresh entirely.
 */
async function readCategoryRows(page, storeId, catId = CATEGORY_PRICE_FULL) {
  return page.evaluate(
    async (catId, store) => {
      const response = await fetch(`/FileObject/UpdateCategory?catID=${catId}&storeId=${store}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      return Array.from(doc.querySelectorAll('table tr'))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) =>
            cell.textContent.trim(),
          );
          const link = row.querySelector('a[href]');
          if (cells.length < 7 || !link) return null;
          // Columns: download | updated | size | type | category | branch | name
          return { name: cells[6], href: link.href };
        })
        .filter(Boolean);
    },
    catId,
    storeId,
  );
}

export async function listStores(browser) {
  const page = await newPage(browser);
  try {
    await openPortal(page);
    return (await readStoreOptions(page)).map((option) => ({
      storeId: option.value,
      name: option.text,
      city: option.text,
    }));
  } finally {
    await page.close();
  }
}

export async function fetchShufersal({ browser, city, storeOverride, cacheDir, log }) {
  const page = await newPage(browser);
  try {
    log(`${CHAIN_NAME}: נפתח הפורטל`);
    await openPortal(page);

    const options = await readStoreOptions(page);
    const chosen = storeOverride
      ? options.find((option) => option.value === String(storeOverride))
      : options.find((option) => cityMatches(option.text, city));

    if (!chosen) throw storeNotFoundError('shufersal', CHAIN_NAME, city);
    log(`${CHAIN_NAME}: סניף ${chosen.text}`);

    const rows = (await readCategoryRows(page, chosen.value)).filter((row) =>
      isFullPriceFile(row.name),
    );
    if (rows.length === 0) {
      throw new Error(`לא נמצא קובץ PriceFull לסניף ${chosen.value} של ${CHAIN_NAME}`);
    }

    const newest = newestByName(rows);
    const storeId = storeIdFromName(newest.name) ?? chosen.value;
    const destination = path.join(cacheDir, `shufersal-${storeId}.gz`);

    log(`${CHAIN_NAME}: מוריד ${newest.name}`);
    await downloadFile(page, newest.href, destination);

    // Promotions are a bonus; a failure here must not cost us the prices.
    let promosPath = null;
    try {
      const promoRows = (await readCategoryRows(page, chosen.value, CATEGORY_PROMO_FULL)).filter(
        (row) => isPromoFile(row.name),
      );
      if (promoRows.length > 0) {
        promosPath = path.join(cacheDir, `shufersal-${storeId}-promo.gz`);
        await downloadFile(page, newestByName(promoRows).href, promosPath);
      }
    } catch (error) {
      log(`${CHAIN_NAME}: המבצעים לא נטענו — ${error.message}`);
      promosPath = null;
    }

    return { pricesPath: destination, promosPath, storeId, storeName: chosen.text };
  } finally {
    await page.close();
  }
}
