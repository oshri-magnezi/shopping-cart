import path from 'node:path';
import { newPage, downloadFile } from './browser.js';
import { cityMatches, isFullPriceFile, newestByName, storeNotFoundError } from './shared.js';

const PORTAL = 'https://laibcatalog.co.il';
const CHAIN_NAME = 'ויקטורי';
const CHAIN_LABEL = /ויקטורי/;

const SELECT_CHAIN = '#MainContent_chain';
const SELECT_BRANCH = '#MainContent_branch';
const SELECT_FILE_TYPE = '#MainContent_fileType';
const BUTTON_SEARCH = '#MainContent_btnSearch';

async function openPortal(page) {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(SELECT_BRANCH, { timeout: 30_000 });
}

function readOptions(page, selector) {
  return page.evaluate(
    (sel) =>
      Array.from(document.querySelector(sel).options).map((option) => ({
        value: option.value,
        text: option.textContent.trim(),
      })),
    selector,
  );
}

/**
 * This portal fronts three chains, and a branch's value is prefixed with its
 * chain id. Filtering on that prefix is what keeps the bot from silently
 * pricing a H. Cohen or Mahsanei HaShuk branch instead of a Victory one.
 */
async function victoryBranches(page) {
  const chains = await readOptions(page, SELECT_CHAIN);
  const victory = chains.find((option) => CHAIN_LABEL.test(option.text) && option.value !== '-1');
  if (!victory) throw new Error(`לא נמצאה רשת ${CHAIN_NAME} בפורטל`);

  const branches = await readOptions(page, SELECT_BRANCH);
  return {
    chainId: victory.value,
    branches: branches.filter((option) => option.value.startsWith(victory.value)),
  };
}

export async function listStores(browser) {
  const page = await newPage(browser);
  try {
    await openPortal(page);
    const { branches } = await victoryBranches(page);
    return branches.map((option) => ({
      storeId: option.value,
      name: option.text,
      city: option.text,
    }));
  } finally {
    await page.close();
  }
}

export async function fetchVictory({ browser, city, storeOverride, cacheDir, log }) {
  const page = await newPage(browser);
  try {
    log(`${CHAIN_NAME}: נפתח הפורטל`);
    await openPortal(page);

    const { chainId, branches } = await victoryBranches(page);

    const chosen = storeOverride
      ? branches.find((option) => option.value.endsWith(String(storeOverride)))
      : branches.find((option) => cityMatches(option.text, city));

    if (!chosen) throw storeNotFoundError('victory', CHAIN_NAME, city);
    log(`${CHAIN_NAME}: סניף ${chosen.text}`);

    // WebForms rebuilds the results table on postback, so the selections have
    // to go through real change events and the search button, not direct
    // value assignment.
    await page.select(SELECT_FILE_TYPE, 'pricefull');
    await page.select(SELECT_BRANCH, chosen.value);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
      page.click(BUTTON_SEARCH),
    ]);

    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table tr'))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) =>
            cell.textContent.trim(),
          );
          const link = row.querySelector('a[href^="http"]');
          if (cells.length < 2 || !link) return null;
          return { name: cells[0], href: link.href };
        })
        .filter(Boolean),
    );

    const fullFiles = rows.filter((row) => isFullPriceFile(row.name));
    if (fullFiles.length === 0) {
      throw new Error(`לא נמצא קובץ PriceFull לסניף ${chosen.text} של ${CHAIN_NAME}`);
    }

    const newest = newestByName(fullFiles);
    const storeId = chosen.value.slice(chainId.length + 3) || chosen.value;
    const destination = path.join(cacheDir, `victory-${storeId}.gz`);

    log(`${CHAIN_NAME}: מוריד ${newest.name}`);
    await downloadFile(page, newest.href, destination);

    return { pricesPath: destination, storeId, storeName: chosen.text };
  } finally {
    await page.close();
  }
}
