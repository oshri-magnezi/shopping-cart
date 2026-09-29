import { fetchShufersal, listStores as shufersalStores } from './fetch/shufersal.js';
import { fetchVictory, listStores as victoryStores } from './fetch/victory.js';
import { fetchHaziHinam, listStores as haziHinamStores } from './fetch/hazihinam.js';
import { createCerberusFetcher } from './fetch/cerberus.js';

/**
 * Chains are declared in config rather than hardcoded, because which chain
 * publishes on which portal keeps changing — Hazi Hinam's account went empty
 * and Victory stopped serving full price files, while a dozen other chains
 * sit behind the same Cerberus login. Adding one is a config line, not code.
 */
const PORTALS = {
  shufersal: () => ({ fetcher: fetchShufersal, listStores: shufersalStores }),
  victory: () => ({ fetcher: fetchVictory, listStores: victoryStores }),
  hazihinam: () => ({ fetcher: fetchHaziHinam, listStores: haziHinamStores }),
  cerberus: (entry) => createCerberusFetcher(entry),
};

/**
 * The chains to price, from config.json.
 *
 * A chain whose `onlineStore` is set also yields a second entry for that
 * store: its own key (`ramilevi-online`), a name that says what it is, and the
 * store pinned. The online store is a separate price list — at Shufersal it
 * was cheaper on 86% of shared products, by 8.8% on average (2026-09-28) — so
 * it is compared as a shop in its own right, in every city, since it delivers
 * to all of them.
 */
export function buildChains(config) {
  const declared = Array.isArray(config.chains) ? config.chains : [];

  return declared.flatMap((entry) => {
    const build = PORTALS[entry.portal];
    if (!build) {
      throw new Error(
        `פורטל לא מוכר "${entry.portal}" עבור ${entry.key}. ` +
          `הפורטלים הנתמכים: ${Object.keys(PORTALS).join(', ')}`,
      );
    }

    const adapter = build(entry);
    const chain = {
      key: entry.key,
      displayName: entry.displayName,
      fetcher: adapter.fetcher,
      listStores: adapter.listStores,
    };
    if (!entry.onlineStore) return [chain];

    return [
      chain,
      {
        ...chain,
        key: `${entry.key}-online`,
        displayName: `${entry.displayName} אונליין`,
        online: true,
        baseKey: entry.key,
        storeOverride: String(entry.onlineStore),
      },
    ];
  });
}

/**
 * Drops a branch that is really the online store.
 *
 * Where a chain has no branch in the city, its fetcher falls back to the
 * chain's online store — and when that store is also listed as a chain of its
 * own, the city would show the same price list twice under two names. The
 * online entry is kept, because its name says what it is.
 */
export function withoutDuplicateOnline(fetched) {
  const onlineStores = new Set(
    fetched
      .filter((entry) => entry?.ok && entry.chain.online)
      .map((entry) => `${entry.chain.baseKey}:${entry.storeId}`),
  );
  return fetched.filter(
    (entry) =>
      !entry?.ok ||
      entry.chain.online ||
      !onlineStores.has(`${entry.chain.key}:${entry.storeId}`),
  );
}
