#!/usr/bin/env node
/**
 * Converts a shopping list exported from the website's localStorage into the
 * bot's input file.
 *
 * The site stores far more than the bot needs (ids, categories, purchase
 * flags) and wraps the items in an active-list object, so this trims it to
 * the {items:[{name,quantity}]} contract without anyone hand-editing JSON.
 *
 *   node src/export-list.js <exported.json> [output.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function extractItems(data) {
  // Accepts the full localStorage blob, a single list, or a bare array.
  const candidates = [data?.activeList?.items, data?.items, Array.isArray(data) ? data : null];
  const items = candidates.find(Array.isArray) ?? [];

  return items
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      quantity: Number.isFinite(Number(item?.quantity)) ? Math.max(1, Number(item.quantity)) : 1,
    }))
    .filter((item) => item.name);
}

const [source, target = 'shopping-list.json'] = process.argv.slice(2);

if (!source) {
  console.error('שימוש: node src/export-list.js <קובץ-שיוצא-מהאתר.json> [יעד.json]');
  process.exit(1);
}

const raw = JSON.parse(await readFile(path.resolve(source), 'utf8'));
const items = extractItems(raw);

if (items.length === 0) {
  console.error('לא נמצאו פריטים בקובץ. ודא שייצאת את רשימת הקניות מהאתר.');
  process.exit(1);
}

const destination = path.resolve(target);
await writeFile(destination, JSON.stringify({ items }, null, 2), 'utf8');
console.log(`נשמרו ${items.length} פריטים ל-${destination}`);
