import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes PRICES.md: when the prices were last refreshed, and what the
 * catalogue holds per city.
 *
 * The nightly refresh commits this file, in the owner's name, as the record
 * that the update happened. It is a few lines, overwritten each night, so the
 * history keeps one small entry per update — the catalogue itself, tens of
 * megabytes, stays out of git.
 */
export function describeUpdate(index, cities, missing = []) {
  const when = new Date(index.generatedAt);
  const date = when.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const time = when.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
  const count = (n) => n.toLocaleString('en-US');

  const lines = cities.map(
    ({ city, stores, products }) => `- ${city}: ${stores} חנויות, ${count(products)} מוצרים`,
  );
  const absent = missing.map(
    ({ city, name, nights }) => `- ${city} · ${name} · לילה ${nights} ברצף`,
  );
  const tail = absent.length > 0 ? `\n## חנויות שחסרו\n\n${absent.join('\n')}\n` : '';

  return `# מחירים\n\nעודכנו לאחרונה ב־${date} בשעה ${time} (שעון ישראל).\n\n${lines.join('\n')}\n${tail}`;
}

const MISSING_LINE = /^- (.+) · (.+) · לילה (\d+) ברצף$/gm;

/**
 * Stores that were on the site and are not in tonight's catalogue, with how
 * many nights running each has been gone.
 *
 * One quiet night is ordinary and the publish guard allows it; the same
 * store gone three nights running is a fetcher that needs fixing, and nothing
 * else would say so. The count has to live somewhere between runs, and it
 * lives in PRICES.md itself: a store newly missing is found by comparing with
 * the catalogue published last night (`previousIndex`), and one that was
 * already missing is read back from the previous file's own list
 * (`previousText`) — by then it is no longer in last night's catalogue.
 */
export function missingStores(previousIndex, index, previousText = '') {
  const tonight = new Map(
    index.cities.map((city) => [city.city, new Set(city.chains.map((chain) => chain.displayName))]),
  );
  const nights = new Map();

  for (const [, city, name, count] of previousText.matchAll(MISSING_LINE)) {
    if (tonight.has(city) && !tonight.get(city).has(name)) {
      nights.set(`${city}|${name}`, { city, name, nights: Number(count) + 1 });
    }
  }
  for (const before of previousIndex?.cities ?? []) {
    const now = tonight.get(before.city);
    if (!now) continue;
    for (const chain of before.chains ?? []) {
      const key = `${before.city}|${chain.displayName}`;
      if (!now.has(chain.displayName) && !nights.has(key)) {
        nights.set(key, { city: before.city, name: chain.displayName, nights: 1 });
      }
    }
  }
  return [...nights.values()];
}

/** Reads the built catalogue in `dir` and sums it up per city. */
export async function summarise(dir) {
  const index = JSON.parse(await readFile(path.join(dir, 'price-catalog-index.json'), 'utf8'));
  const cities = [];
  for (const entry of index.cities) {
    const file = JSON.parse(await readFile(path.join(dir, entry.file), 'utf8'));
    cities.push({
      city: entry.city,
      stores: file.chains.length,
      products: file.chains.reduce((sum, chain) => sum + chain.products.length, 0),
    });
  }
  return { index, cities };
}

// node bot/src/record-update.js <catalogue dir> <output file> [published index]
//
// With the index that was live before tonight's publish, the file also lists
// the stores that have gone missing. Without it, it simply lists the cities.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'public', out = 'PRICES.md', publishedPath] = process.argv.slice(2);
  const { index, cities } = await summarise(dir);
  const read = (file) => readFile(file, 'utf8').catch(() => '');
  const published = publishedPath ? JSON.parse((await read(publishedPath)) || 'null') : null;
  const missing = published ? missingStores(published, index, await read(out)) : [];
  await writeFile(out, describeUpdate(index, cities, missing), 'utf8');
  console.log(`נכתב ${out}`);
}
