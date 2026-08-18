import path from 'node:path';
import { newPage, downloadFile } from './browser.js';
import { parseStoresFile } from '../parse/stores.js';
import {
  isFullPriceFile,
  downloadPromos,
  isStoresFile,
  newestByName,
  pickStore,
  storeIdFromName,
  storeNotFoundError,
} from './shared.js';

// The url.retail.* host serves an invalid certificate; this is the working one.
const BASE = 'https://url.publishedprices.co.il';
// Credentials are published in each chain's regulatory disclosure, not secrets.
const PASSWORDS = ['', '123456'];

/**
 * Cerberus hosts many chains behind one login, so this adapter is generic:
 * the chain is chosen by the username passed in from config.
 */
export function createCerberusFetcher({ key, displayName, username }) {
  if (!username) {
    throw new Error(`הרשת ${displayName} מוגדרת לפורטל Cerberus אך חסר לה שדה username ב-config.json`);
  }

  async function login(page, log) {
    for (const password of PASSWORDS) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      // Two forms live on this page; the sign-in one is identified by id.
      await page.waitForSelector('#login-form #password', { timeout: 30_000 });

      await page.evaluate(
        (user, pass) => {
          const set = (selector, value) => {
            const input = document.querySelector(selector);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          };
          set('#login-form #username', user);
          set('#login-form #password', pass);
        },
        username,
        password,
      );

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
        page.click('#login-button'),
      ]);

      if (!page.url().includes('/login')) {
        log(`${displayName}: התחברות הצליחה`);
        return;
      }
    }

    throw new Error(
      `ההתחברות לפורטל של ${displayName} נכשלה עם המשתמש "${username}". ` +
        'בדוק את שם המשתמש ברשימת הפורטלים הרשמית של gov.il.',
    );
  }

  /**
   * The listing is rendered client-side and its JSON endpoint rejects any
   * request without the per-session CSRF token carried on the page.
   */
  async function listFiles(page) {
    await page.goto(`${BASE}/file`, { waitUntil: 'domcontentloaded' });

    const rows = await page.evaluate(async () => {
      const token =
        document.querySelector('meta[name=csrftoken]')?.content ||
        document.querySelector('input[name=csrftoken]')?.value ||
        '';

      const response = await fetch('/file/json/dir', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          'sEcho=1&iDisplayStart=0&iDisplayLength=100000&cd=/&csrftoken=' +
          encodeURIComponent(token),
      });
      if (!response.ok) throw new Error(`רשימת הקבצים החזירה HTTP ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(`רשימת הקבצים נדחתה: ${data.error}`);

      return (data.aaData || []).map((entry) => ({
        name: String(entry.fname ?? entry[0] ?? '').replace(/<[^>]*>/g, '').trim(),
      }));
    });

    const files = rows.filter((row) => row.name);
    if (files.length === 0) {
      throw new Error(
        `החשבון "${username}" בפורטל Cerberus אינו מפרסם קבצים כרגע. ` +
          'ייתכן שהרשת עברה לפורטל אחר — עדכן את cerberus.username ב-config.json.',
      );
    }
    return files;
  }

  const downloadUrl = (name) => `${BASE}/file/d/${encodeURIComponent(name)}`;

  async function resolveStores(page, cacheDir) {
    const files = await listFiles(page);
    const storesFile = newestByName(files.filter((file) => isStoresFile(file.name)));
    if (!storesFile) throw new Error(`לא נמצא קובץ סניפים בפורטל של ${displayName}`);

    const localPath = path.join(cacheDir, `${key}-stores.gz`);
    await downloadFile(page, downloadUrl(storesFile.name), localPath);
    return { files, stores: await parseStoresFile(localPath) };
  }

  async function listStores(browser, { cacheDir }) {
    const page = await newPage(browser);
    try {
      await login(page, () => {});
      const { stores } = await resolveStores(page, cacheDir);
      return stores;
    } finally {
      await page.close();
    }
  }

  async function fetcher({ browser, city, storeOverride, cacheDir, log }) {
    const page = await newPage(browser);
    try {
      log(`${displayName}: מתחבר לפורטל`);
      await login(page, log);

      const { files, stores } = await resolveStores(page, cacheDir);

      // Only branches with a published full catalogue are candidates.
      const branchesWithFiles = new Set(
        files.filter((file) => isFullPriceFile(file.name)).map((file) => storeIdFromName(file.name)),
      );

      const picked = pickStore(stores, city, storeOverride, (store) =>
        branchesWithFiles.has(store.storeId),
      );
      if (!picked) throw storeNotFoundError(key, displayName, city);

      const { store, viaOnline } = picked;
      log(`${displayName}: סניף ${store.name || store.storeId}${viaOnline ? ' (משלוחים ארצי)' : ''}`);

      const branchFiles = files.filter(
        (file) => isFullPriceFile(file.name) && storeIdFromName(file.name) === store.storeId,
      );
      if (branchFiles.length === 0) {
        throw new Error(`לא נמצא קובץ PriceFull לסניף ${store.storeId} של ${displayName}`);
      }

      const newest = newestByName(branchFiles);
      const destination = path.join(cacheDir, `${key}-${store.storeId}.gz`);

      log(`${displayName}: מוריד ${newest.name}`);
      await downloadFile(page, downloadUrl(newest.name), destination);

      const promosPath = await downloadPromos({
        page,
        files,
        storeId: store.storeId,
        cacheDir,
        key,
        urlFor: downloadUrl,
        download: downloadFile,
        log,
        displayName,
      });

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

  return { fetcher, listStores };
}
