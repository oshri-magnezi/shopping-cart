import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

export const NAV_TIMEOUT = 30_000;

export async function launchBrowser(headless) {
  return puppeteer.launch({
    headless,
    args: ['--lang=he-IL', '--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
  });
}

export async function newPage(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9' });
  return page;
}

/**
 * Downloads a price file.
 *
 * Same-origin files go through the page so the session cookie rides along —
 * Cerberus serves nothing to an anonymous request. Cross-origin ones (e.g.
 * Shufersal's signed Azure blob links) would be blocked by CORS inside the
 * page, but they are public, so Node fetches them directly.
 */
export async function downloadFile(page, url, destPath) {
  const sameOrigin = new URL(url).origin === new URL(page.url()).origin;

  const buffer = sameOrigin
    ? Buffer.from(
        await page.evaluate(async (target) => {
          const response = await fetch(target, { credentials: 'include' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return Array.from(new Uint8Array(await response.arrayBuffer()));
        }, url),
      )
    : await fetchDirect(url);

  if (buffer.length === 0) throw new Error('הקובץ שהתקבל ריק');

  await writeFile(destPath, buffer);
  return destPath;
}

async function fetchDirect(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ההורדה נכשלה עם HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Reads every <select> on the page as {index, options:[{value,text}]}. */
export async function readSelects(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('select')).map((select, index) => ({
      index,
      id: select.id || null,
      name: select.getAttribute('name') || null,
      options: Array.from(select.options).map((option) => ({
        value: option.value,
        text: (option.textContent || '').trim(),
      })),
    })),
  );
}

/** Selects an option by value and fires the events frameworks listen for. */
export async function selectOption(page, selectIndex, value) {
  await page.evaluate(
    (index, val) => {
      const select = document.querySelectorAll('select')[index];
      select.value = val;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selectIndex,
    value,
  );
}
