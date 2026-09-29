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
export function describeUpdate(index, cities) {
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
  return `# מחירים\n\nעודכנו לאחרונה ב־${date} בשעה ${time} (שעון ישראל).\n\n${lines.join('\n')}\n`;
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

// node bot/src/record-update.js <catalogue dir> <output file>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'public', out = 'PRICES.md'] = process.argv.slice(2);
  const { index, cities } = await summarise(dir);
  await writeFile(out, describeUpdate(index, cities), 'utf8');
  console.log(`נכתב ${out}`);
}
