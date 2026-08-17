import { normalize, tokenize, leadCategory } from './textMatch.js';

/**
 * Builds the suggestion pool for the add-item box.
 *
 * Products are collapsed by normalized name across chains, so a shopper sees
 * one "חלב תנובה 3% 1 ליטר" carrying the price range and how many chains
 * stock it — rather than the same item repeated eight times.
 */
export function buildSuggestionPool(catalog) {
  const byName = new Map();

  for (const chain of catalog.chains) {
    for (const [name, price] of chain.products) {
      const key = normalize(name);
      if (!key) continue;

      let entry = byName.get(key);
      if (!entry) {
        entry = { name, key, chainKeys: new Set(), min: price, max: price, tokens: tokenize(name) };
        byName.set(key, entry);
      } else {
        if (price < entry.min) entry.min = price;
        if (price > entry.max) entry.max = price;
      }
      // A chain can list the same name twice; count shops, not rows.
      entry.chainKeys.add(chain.key);
    }
  }

  const pool = [...byName.values()].map((entry) => ({
    ...entry,
    chains: entry.chainKeys.size,
  }));

  // A word index keeps lookups instant against ~40k distinct names.
  const byToken = new Map();
  pool.forEach((entry, position) => {
    for (const token of entry.tokens) {
      let bucket = byToken.get(token);
      if (!bucket) {
        bucket = [];
        byToken.set(token, bucket);
      }
      bucket.push(position);
    }
  });

  return { pool, byToken };
}

/**
 * Suggestions for what the shopper is typing, best first.
 *
 * Ranking favours names that start with the query, then shorter names (a
 * plain "חלב 3% 1 ליטר" is a better suggestion than a long promotional
 * variant), then breadth of availability across chains.
 */
export function suggest({ pool, byToken }, query, limit = 8) {
  const words = tokenize(query);
  if (words.length === 0) return [];

  const last = words[words.length - 1];
  const candidates = new Set();

  // Prefix matching only. "חלב" must not pull in "חלבה" (halva) or "חלבון"
  // (protein) — in Hebrew a short root sits inside unrelated words.
  for (const [token, bucket] of byToken) {
    if (token.startsWith(last)) {
      for (const position of bucket) candidates.add(position);
      if (candidates.size > 6000) break;
    }
  }

  const queryCategory = leadCategory(query);
  // Spreading tens of thousands of values into Math.max overflows the stack.
  const maxChains = pool.reduce((max, entry) => Math.max(max, entry.chains), 1);
  const scored = [];

  for (const position of candidates) {
    const entry = pool[position];

    // Every word typed so far must be accounted for, so "שמן ז" narrows
    // rather than drifting back to everything containing "שמן".
    const matchesAll = words.every((word) =>
      entry.tokens.some((token) => token.startsWith(word)),
    );
    if (!matchesAll) continue;

    // Keep a category product out unless it was asked for.
    const category = leadCategory(entry.name);
    if (category && category !== queryCategory) continue;

    let score = 0;
    if (entry.key.startsWith(normalize(query))) score += 3;
    if (entry.tokens[0]?.startsWith(words[0])) score += 2;

    // Breadth of stocking is the strongest signal of a staple: the milk eight
    // chains carry is far likelier to be what was meant than a niche variant.
    score += 3 * (entry.chains / maxChains);

    // Long names are promotional variants; short ones are the plain product.
    score -= Math.min(entry.tokens.length, 12) / 12;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);

  return scored.slice(0, limit).map(({ entry }) => ({
    name: entry.name,
    chains: entry.chains,
    min: entry.min,
    max: entry.max,
  }));
}
