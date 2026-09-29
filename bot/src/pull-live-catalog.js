import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Downloads the price catalogue the live site is serving right now.
 *
 * The catalogue is no longer committed to git. The nightly workflow builds it
 * and publishes it straight to GitHub Pages, so the site itself is where the
 * current prices live. Three things need a copy of them:
 *
 * - the deploy that runs when the owner pushes code — otherwise every push
 *   would rebuild the site from whatever stale catalogue happened to be on disk
 *   and quietly roll the prices back;
 * - the nightly guard, which compares a fresh catalogue against what shoppers
 *   are actually seeing, not against an old commit;
 * - local development (`npm run prices:pull`), so the app on your own machine
 *   shows today's prices too.
 *
 * Standard library only: `fetch` and `fs`. No dependency to install before it
 * can run, which matters in a workflow that has not run `npm ci` yet.
 */

export const LIVE_BASE = 'https://oshri-magnezi.github.io/shopping-cart/';
const INDEX_FILE = 'price-catalog-index.json';

/**
 * The city files an index points at.
 *
 * Only plain file names are accepted. The index comes over the network, and a
 * name like `../../package.json` would otherwise write outside the target
 * folder — so anything that is not a bare `price-catalog-<n>.json` is refused
 * rather than trusted.
 */
export function filesFor(index) {
  if (!index || !Array.isArray(index.cities) || index.cities.length === 0) {
    throw new Error('The live index lists no cities.');
  }
  const files = index.cities.map((city) => city?.file);
  const bad = files.filter((file) => typeof file !== 'string' || !/^price-catalog-\d+\.json$/.test(file));
  if (bad.length > 0) {
    throw new Error(`The live index names files this will not write: ${bad.join(', ')}`);
  }
  return [...new Set(files)];
}

/**
 * Whether the live copy is strictly newer than the one already on disk.
 *
 * Pulling must never move prices backwards. The case is not hypothetical: when
 * this was introduced, the repository held a catalogue five weeks fresher than
 * the one the site was serving, and a blind pull would have rolled every price
 * on the site back to August. A local copy with no readable date loses — it is
 * the one we cannot vouch for.
 */
export function liveIsNewer(live, local) {
  const liveTime = Date.parse(live?.generatedAt ?? '');
  const localTime = Date.parse(local?.generatedAt ?? '');
  if (Number.isNaN(liveTime)) return false;
  if (Number.isNaN(localTime)) return true;
  return liveTime > localTime;
}

async function readLocalIndex(outDir) {
  try {
    return JSON.parse(await readFile(path.join(outDir, INDEX_FILE), 'utf8'));
  } catch {
    return null;
  }
}

async function fetchJson(url, fetchImpl) {
  // no-store: the whole point is today's copy, not whatever a cache kept.
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}

/**
 * @param {object} options
 * @param {string} options.outDir   where to write the index and the city files
 * @param {string} [options.base]    the live site's base URL
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(file: string, text: string) => Promise<void>} [options.write]
 * @returns {Promise<{ generatedAt: string, files: string[] }>}
 *
 * The index is written **last**. A city file on its own is inert, but an index
 * pointing at a file that failed to download would break the comparison — so a
 * run that dies half-way leaves the previous index in charge.
 */
export async function pullLiveCatalog({
  outDir,
  base = LIVE_BASE,
  fetchImpl = fetch,
  write = async (file, text) => writeFile(file, text),
  local = undefined,
}) {
  const index = await fetchJson(new URL(INDEX_FILE, base), fetchImpl);
  const files = filesFor(index);

  const onDisk = local === undefined ? await readLocalIndex(outDir) : local;
  if (onDisk && !liveIsNewer(index, onDisk)) {
    return { generatedAt: onDisk.generatedAt, files: filesFor(onDisk), kept: true };
  }

  await mkdir(outDir, { recursive: true });

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop -- one at a time is kind to Pages
    const city = await fetchJson(new URL(`${file}?v=${encodeURIComponent(index.generatedAt ?? '')}`, base), fetchImpl);
    // eslint-disable-next-line no-await-in-loop
    await write(path.join(outDir, file), JSON.stringify(city));
  }
  await write(path.join(outDir, INDEX_FILE), JSON.stringify(index));

  return { generatedAt: index.generatedAt, files, kept: false };
}

// node bot/src/pull-live-catalog.js <outDir> [--index-only <file>]
if (process.argv[1] && process.argv[1].endsWith('pull-live-catalog.js')) {
  const args = process.argv.slice(2);

  // --index-only <file>: fetch just the live index to one file, or write
  // `null` when there is no live site yet. The nightly guard uses this as its
  // baseline, and a first-ever run has nothing to compare against.
  if (args[0] === '--index-only') {
    const target = args[1];
    try {
      const index = await fetchJson(new URL(INDEX_FILE, LIVE_BASE), fetch);
      await writeFile(target, JSON.stringify(index));
      console.log(`Live index from ${index.generatedAt} written to ${target}.`);
    } catch (error) {
      await writeFile(target, 'null');
      console.log(`No live index (${error.message}); comparing against nothing.`);
    }
  } else {
    const outDir = args[0] ?? 'public';
    try {
      const { generatedAt, files, kept } = await pullLiveCatalog({ outDir });
      console.log(
        kept
          ? `The catalogue already in ${outDir} (${generatedAt}) is as new as the live one; kept it.`
          : `Pulled the live catalogue from ${generatedAt}: ${files.length} cities into ${outDir}.`,
      );
    } catch (error) {
      // No live copy is only fatal when there is nothing on disk either: a
      // deploy with no catalogue at all would ship a comparison page with no
      // prices on it, and that must fail loudly instead.
      const onDisk = await readLocalIndex(outDir);
      if (onDisk) {
        console.log(`Live catalogue unavailable (${error.message}); keeping ${onDisk.generatedAt} from ${outDir}.`);
      } else {
        console.error(`No live catalogue and none in ${outDir}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
