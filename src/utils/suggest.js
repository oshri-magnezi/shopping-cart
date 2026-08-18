import { normalize, tokenize, leadCategory } from './textMatch.js';

/**
 * Builds the suggestion pool for the add-item box.
 *
 * Products are collapsed across chains so a shopper sees one entry carrying
 * the price range and how many chains stock it, rather than the same item
 * repeated eight times. Barcode is the grouping key wherever the chains
 * publish one — it survives the wording differences that names do not.
 */
export function buildSuggestionPool(catalog) {
  const byName = new Map();

  for (const chain of catalog.chains) {
    for (const [name, price, code] of chain.products) {
      const normalized = normalize(name);
      if (!normalized) continue;
      const key = code || normalized;

      let entry = byName.get(key);
      if (!entry) {
        entry = {
          name,
          key,
          code: code || '',
          chainKeys: new Set(),
          min: price,
          max: price,
          tokens: tokenize(name),
        };
        byName.set(key, entry);
      } else {
        if (price < entry.min) entry.min = price;
        if (price > entry.max) entry.max = price;
      }
      // A chain can list the same product twice; count shops, not rows.
      entry.chainKeys.add(chain.key);
    }
  }

  const pool = [...byName.values()].map((entry) => ({
    ...entry,
    chains: entry.chainKeys.size,
  }));

  // Two indexes keep every keystroke cheap against ~40k distinct names: exact
  // tokens, plus a sorted vocabulary that supports binary-searched prefix
  // lookups instead of walking the whole map each time.
  const byToken = new Map();
  pool.forEach((entry, position) => {
    for (const token of entry.tokens) {
      let bucket = byToken.get(token.value);
      if (!bucket) {
        bucket = [];
        byToken.set(token.value, bucket);
      }
      bucket.push(position);
    }
  });

  const vocabulary = [...byToken.keys()].sort();
  // Computed once here rather than per keystroke. Note that spreading tens of
  // thousands of values into Math.max would overflow the call stack.
  const maxChains = pool.reduce((max, entry) => Math.max(max, entry.chains), 1);

  return { pool, byToken, vocabulary, maxChains };
}

/** First index in the sorted vocabulary at or after `prefix`. */
function lowerBound(vocabulary, prefix) {
  let low = 0;
  let high = vocabulary.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (vocabulary[mid] < prefix) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Suggestions for what the shopper is typing, best first.
 *
 * Ranking favours names that start with the query, then breadth of
 * availability across chains, then shorter names — a plain "חלב 3% 1 ליטר"
 * beats a long promotional variant.
 */
export function suggest({ pool, byToken, vocabulary, maxChains }, query, limit = 8) {
  const words = tokenize(query).map((token) => token.value);
  if (words.length === 0) return [];

  const last = words[words.length - 1];
  const candidates = new Set();

  // Prefix matching only. "חלב" must not pull in "חלבה" (halva) or "חלבון"
  // (protein) — in Hebrew a short root sits inside unrelated words. Sorted
  // order means the matching tokens are one contiguous run.
  for (let i = lowerBound(vocabulary, last); i < vocabulary.length; i += 1) {
    const token = vocabulary[i];
    if (!token.startsWith(last)) break;
    for (const position of byToken.get(token)) candidates.add(position);
    if (candidates.size > 6000) break;
  }

  const queryCategory = leadCategory(query);
  const scored = [];

  for (const position of candidates) {
    const entry = pool[position];

    // Every word typed so far must be accounted for, so "שמן ז" narrows
    // rather than drifting back to everything containing "שמן".
    const matchesAll = words.every((word) =>
      entry.tokens.some((token) => token.value.startsWith(word)),
    );
    if (!matchesAll) continue;

    // Keep a category product out unless it was asked for.
    const category = leadCategory(entry.name);
    if (category && category !== queryCategory) continue;

    let score = 0;
    if (normalize(entry.name).startsWith(normalize(query))) score += 3;
    if (entry.tokens[0]?.value.startsWith(words[0])) score += 2;

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
    code: entry.code,
    chains: entry.chains,
    min: entry.min,
    max: entry.max,
  }));
}
