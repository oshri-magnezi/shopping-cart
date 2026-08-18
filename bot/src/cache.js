import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import path from 'node:path';

// Entries are keyed by chain + city, because a different city means a
// different branch and therefore a different price file.
function entryKey(chainKey, city) {
  return `${chainKey}::${city}`;
}

async function readMeta(cacheDir) {
  try {
    return JSON.parse(await readFile(path.join(cacheDir, 'meta.json'), 'utf8'));
  } catch {
    return {};
  }
}

async function writeMeta(cacheDir, meta) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

/**
 * Returns a still-valid cache entry, or null when the bot has to fetch again.
 * A recorded file that no longer exists on disk counts as a miss.
 */
export async function readCacheEntry(cacheDir, chainKey, city, cacheHours) {
  const entry = (await readMeta(cacheDir))[entryKey(chainKey, city)];
  if (!entry) return null;

  const ageHours = (Date.now() - entry.fetchedAt) / 3_600_000;
  if (ageHours >= cacheHours) return null;

  try {
    await access(entry.pricesPath);
  } catch {
    return null;
  }

  return { ...entry, fromCache: true };
}

export async function writeCacheEntry(cacheDir, chainKey, city, result) {
  const meta = await readMeta(cacheDir);
  meta[entryKey(chainKey, city)] = { ...result, fetchedAt: Date.now() };
  await writeMeta(cacheDir, meta);
}

/**
 * Drops a corrupt download so the next run re-fetches instead of failing
 * on the same broken file forever.
 */
export async function dropCacheEntry(cacheDir, chainKey, city) {
  const meta = await readMeta(cacheDir);
  const entry = meta[entryKey(chainKey, city)];
  if (entry?.pricesPath) {
    await unlink(entry.pricesPath).catch(() => {});
  }
  delete meta[entryKey(chainKey, city)];
  await writeMeta(cacheDir, meta);
}
