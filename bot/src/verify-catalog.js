import { readFile } from 'node:fs/promises';

// A chain that answers but serves a truncated file is the failure this exists
// to catch. Real night-to-night movement is a percent or two; losing a third
// of a chain's catalogue is not a price change, it is a broken download.
const MIN_KEPT = 0.6;

/**
 * Decides whether a freshly built catalogue is safe to publish.
 *
 * The bot is deliberately fail-soft: a chain that will not answer is logged,
 * skipped, and the run still finishes successfully with whatever it managed to
 * collect. That is right for a run you are watching, and wrong for a nightly
 * job that commits and deploys on its own — five chains failing would quietly
 * ship a two-chain catalogue, and the comparison that is the whole point of the
 * app would be built on two shops. Nobody would be told, because as far as the
 * scheduler is concerned everything succeeded.
 *
 * So the run is compared against what is already published. Anything that only
 * ever shrinks by accident — a city vanishing, a chain vanishing, a catalogue
 * collapsing to a fraction of its size — stops the publish and fails the job
 * loudly instead.
 *
 * Growth is never suspicious, and neither is a first run with nothing to
 * compare against.
 */
export function compareCatalogues(previous, next) {
  const problems = [];

  if (!next || !Array.isArray(next.cities) || next.cities.length === 0) {
    return { ok: false, problems: ['The new catalogue has no cities at all.'] };
  }

  // Nothing published yet — there is no baseline, so there is nothing to lose.
  if (!previous || !Array.isArray(previous.cities) || previous.cities.length === 0) {
    return { ok: true, problems: [] };
  }

  const nextCities = new Map(next.cities.map((city) => [city.city, city]));

  for (const before of previous.cities) {
    const after = nextCities.get(before.city);
    if (!after) {
      problems.push(`${before.city}: the city is missing from the new catalogue.`);
      continue;
    }

    const afterChains = new Map((after.chains ?? []).map((chain) => [chain.key, chain]));

    for (const chain of before.chains ?? []) {
      const now = afterChains.get(chain.key);
      if (!now) {
        problems.push(`${before.city} · ${chain.displayName}: the chain is gone.`);
        continue;
      }
      const kept = chain.productCount > 0 ? now.productCount / chain.productCount : 1;
      if (kept < MIN_KEPT) {
        problems.push(
          `${before.city} · ${chain.displayName}: ${now.productCount} products, ` +
            `down from ${chain.productCount} (${Math.round(kept * 100)}% kept).`,
        );
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // A missing or unreadable baseline is treated as "nothing published yet",
    // which is the safe reading: it can only ever allow a publish, and the new
    // catalogue still has to stand on its own above.
    return null;
  }
}

// node src/verify-catalog.js <published index> <new index>
if (process.argv[1] && process.argv[1].endsWith('verify-catalog.js')) {
  const [publishedPath, freshPath] = process.argv.slice(2);
  const { ok, problems } = compareCatalogues(
    await readJson(publishedPath),
    await readJson(freshPath),
  );

  if (ok) {
    console.log('The refreshed catalogue is complete; publishing.');
  } else {
    console.error('Refusing to publish a degraded catalogue:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nNothing was committed. The published catalogue is unchanged.');
    process.exitCode = 1;
  }
}
