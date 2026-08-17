import { tokenize, similarity, MATCH_THRESHOLD } from './textMatch.js';

/**
 * Builds a token → product index for one chain's catalogue.
 *
 * Scoring a query against all ~10,000 products of every chain on each render
 * is far too slow. The index narrows each lookup to the handful of products
 * that share a word with the query, which is a few dozen instead of tens of
 * thousands.
 */
export function indexChain(chain) {
  const byToken = new Map();

  chain.products.forEach((product, index) => {
    for (const token of tokenize(product[0])) {
      let bucket = byToken.get(token);
      if (!bucket) {
        bucket = [];
        byToken.set(token, bucket);
      }
      bucket.push(index);
    }
  });

  return { ...chain, byToken };
}

export function buildIndex(catalog) {
  return catalog.chains.map(indexChain);
}

/**
 * Finds the cheapest good match for a query in an indexed chain.
 *
 * Among candidates that score about equally well the cheapest wins, so a
 * generic "חלב 3%" lands on the value brand rather than whichever premium
 * product happens to be worded most similarly.
 */
const NEAR_TIE = 0.06;

export function findInChain(indexed, query) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  const candidates = new Set();
  for (const token of queryTokens) {
    const exact = indexed.byToken.get(token);
    if (exact) for (const index of exact) candidates.add(index);

    // Partial words matter in Hebrew ("קוטג" vs "קוטג'"), so also sweep
    // tokens that contain the query word when the exact bucket is thin.
    if (!exact || exact.length < 5) {
      for (const [key, bucket] of indexed.byToken) {
        if (key.length >= 3 && (key.includes(token) || token.includes(key))) {
          for (const index of bucket) candidates.add(index);
        }
      }
    }
  }

  let best = null;
  for (const index of candidates) {
    const [name, price] = indexed.products[index];
    const score = similarity(query, name);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score + NEAR_TIE || (score > best.score - NEAR_TIE && price < best.price)) {
      best = { name, price, score };
    }
  }

  return best;
}
