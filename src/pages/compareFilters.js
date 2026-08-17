import { findBestMatch } from '../utils/textMatch.js';

export const SORT_MODES = ['cheapest', 'found', 'name'];

const round = (value) => Math.round(value * 100) / 100;

/**
 * Lines up the user's current cart against the priced results.
 *
 * The results file is a snapshot for whatever list the bot last ran on, but
 * what the shopper cares about is the cart in front of them — so only items
 * present in both are compared, and the cart's quantities win.
 *
 * Names are matched by similarity rather than equality: the two lists are
 * edited at different times, and "חלב 3%" should still line up with
 * "חלב תנובה 3% 1 ליטר". Each priced item is claimed at most once so two
 * similar cart lines cannot both point at the same prices.
 */
export function cartEntries(cartItems, results) {
  const candidates = (results.items ?? []).map((item, index) => ({ name: item.name, index }));
  const claimed = new Set();
  const entries = [];

  for (const item of cartItems) {
    const available = candidates.filter((candidate) => !claimed.has(candidate.index));
    const match = findBestMatch(item.name, available);
    if (!match) continue;

    claimed.add(match.index);
    entries.push({
      index: match.index,
      name: item.name,
      quantity: item.quantity,
      pricedName: match.name,
      score: match.score,
    });
  }

  return entries;
}

/**
 * Rebuilds the comparison for the selected chains over the given cart entries.
 *
 * Filtering has to recompute rather than just hide rows: the shared basket is
 * by definition "items found at every *compared* chain", so dropping a chain
 * that was missing an item widens it and changes every total.
 */
export function buildComparison(results, selectedKeys, { hideUnavailable, sortBy }, entries) {
  const rows = results.comparison?.rows ?? [];
  const chainsByKey = new Map(results.chains.map((chain) => [chain.key, chain]));

  const selected = rows.filter((row) => selectedKeys.has(row.key));
  const priced = selected.filter(
    (row) => row.ok && Array.isArray(chainsByKey.get(row.key)?.matches),
  );

  const sharedEntries = entries.filter((entry) =>
    priced.every((row) => chainsByKey.get(row.key).matches[entry.index]),
  );

  const computed = selected.map((row) => {
    const chain = chainsByKey.get(row.key);
    if (!row.ok || !Array.isArray(chain?.matches)) return { ...row, ok: false };

    let fullTotal = 0;
    let foundCount = 0;
    for (const entry of entries) {
      const match = chain.matches[entry.index];
      if (!match) continue;
      fullTotal += match.product.price * entry.quantity;
      foundCount += 1;
    }

    const sharedTotal = sharedEntries.reduce(
      (sum, entry) => sum + chain.matches[entry.index].product.price * entry.quantity,
      0,
    );

    return {
      ...row,
      ok: true,
      fullTotal: round(fullTotal),
      sharedTotal: round(sharedTotal),
      foundCount,
      itemCount: entries.length,
    };
  });

  const visible = hideUnavailable ? computed.filter((row) => row.ok) : computed;
  const ranked = computed.filter((row) => row.ok).sort((a, b) => a.sharedTotal - b.sharedTotal);

  return {
    rows: sortRows(visible, sortBy),
    winner: ranked[0] ?? null,
    savings: ranked.length > 1 ? round(ranked[1].sharedTotal - ranked[0].sharedTotal) : 0,
    sharedCount: sharedEntries.length,
    comparedChains: priced.map((row) => chainsByKey.get(row.key)),
  };
}

function sortRows(rows, sortBy) {
  const copy = [...rows];

  if (sortBy === 'name') {
    return copy.sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  }

  if (sortBy === 'found') {
    return copy.sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return (b.foundCount ?? 0) - (a.foundCount ?? 0);
    });
  }

  // Cheapest first, with unavailable chains pushed to the bottom.
  return copy.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (!a.ok) return 0;
    return a.sharedTotal - b.sharedTotal;
  });
}
