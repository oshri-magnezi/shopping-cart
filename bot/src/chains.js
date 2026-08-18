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

export function buildChains(config) {
  const declared = Array.isArray(config.chains) ? config.chains : [];

  return declared.map((entry) => {
    const build = PORTALS[entry.portal];
    if (!build) {
      throw new Error(
        `פורטל לא מוכר "${entry.portal}" עבור ${entry.key}. ` +
          `הפורטלים הנתמכים: ${Object.keys(PORTALS).join(', ')}`,
      );
    }

    const adapter = build(entry);
    return {
      key: entry.key,
      displayName: entry.displayName,
      fetcher: adapter.fetcher,
      listStores: adapter.listStores,
    };
  });
}
