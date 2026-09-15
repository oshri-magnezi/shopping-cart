import { readFile } from 'node:fs/promises';

// A chain that answers but serves a truncated file is the failure this exists
// to catch. Real night-to-night movement is a percent or two; losing a third
// of a chain's catalogue is not a price change, it is a broken download.
const MIN_KEPT = 0.6;

// The comparison takes a median across the chains carrying a shopper's list,
// and a median drawn from two shops is not a typical price. Below three, the
// thing the app exists to do stops working.
const MIN_CHAINS = 3;

// One shop having a bad night is ordinary. A third of a city's chains going
// quiet at once is an outage, and publishing that would hand shoppers a
// comparison drawn from whoever happened to stay up.
const MAX_CHAIN_LOSS = 1 / 3;

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
 * So the run is compared against what is already published. The question it
 * asks is not "did anything get lost" but "is this still good enough to
 * publish", and those are very different tests. The first one blocked a
 * catalogue that had gained a whole new chain in all four cities over one shop
 * that went quiet in one of them, and held three weeks of price movement back
 * to protect data that was already staler than what it was refusing.
 *
 * Two kinds of loss, judged differently:
 *
 * - **A chain that is simply absent** is tolerable. It drops out of the
 *   comparison and the remaining chains are still correct. One or two going
 *   quiet is a normal night.
 * - **A chain that came back truncated** is not. Those prices are published as
 *   fact, and a partial file quietly misprices a basket. Missing data is safer
 *   than wrong data, so this stays a hard stop at any size.
 *
 * Growth is never suspicious, and neither is a first run with nothing to
 * compare against.
 */
export function compareCatalogues(previous, next) {
  const problems = [];
  const notes = [];

  if (!next || !Array.isArray(next.cities) || next.cities.length === 0) {
    return { ok: false, problems: ['The new catalogue has no cities at all.'], notes };
  }

  // Nothing published yet — there is no baseline, so there is nothing to lose.
  if (!previous || !Array.isArray(previous.cities) || previous.cities.length === 0) {
    return { ok: true, problems, notes };
  }

  const nextCities = new Map(next.cities.map((city) => [city.city, city]));

  for (const before of previous.cities) {
    const after = nextCities.get(before.city);
    if (!after) {
      problems.push(`${before.city}: the city is missing from the new catalogue.`);
      continue;
    }

    const afterChains = new Map((after.chains ?? []).map((chain) => [chain.key, chain]));
    const had = before.chains ?? [];
    const lost = [];

    for (const chain of had) {
      const now = afterChains.get(chain.key);
      if (!now) {
        lost.push(chain.displayName);
        continue;
      }
      const kept = chain.productCount > 0 ? now.productCount / chain.productCount : 1;
      if (kept < MIN_KEPT) {
        problems.push(
          `${before.city} · ${chain.displayName}: came back truncated — ${now.productCount} ` +
            `products, down from ${chain.productCount} (${Math.round(kept * 100)}% kept).`,
        );
      }
    }

    const remaining = afterChains.size;
    if (remaining < MIN_CHAINS) {
      problems.push(
        `${before.city}: only ${remaining} chains left, which is too few to compare a basket.`,
      );
    } else if (had.length > 0 && lost.length / had.length > MAX_CHAIN_LOSS) {
      problems.push(
        `${before.city}: ${lost.length} of ${had.length} chains went quiet (${lost.join(', ')}).`,
      );
    } else if (lost.length > 0) {
      notes.push(`${before.city}: ${lost.join(', ')} did not answer; publishing without them.`);
    }
  }

  return { ok: problems.length === 0, problems, notes };
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
  const { ok, problems, notes } = compareCatalogues(
    await readJson(publishedPath),
    await readJson(freshPath),
  );

  // Tolerated losses are still worth saying out loud. A chain that goes quiet
  // three nights running is a fetcher that needs fixing, and the only place
  // that pattern is visible is this log.
  for (const note of notes) console.log(`Note: ${note}`);

  if (ok) {
    console.log('The refreshed catalogue is good; publishing.');
  } else {
    console.error('Refusing to publish a degraded catalogue:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nNothing was committed. The published catalogue is unchanged.');
    process.exitCode = 1;
  }
}
