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
  // Barcodes are the exact path: the same code is the same product at every
  // chain, so a product the shopper picked never has to be guessed again.
  const byCode = new Map();

  chain.products.forEach((product, index) => {
    const code = product[2];
    if (code && !byCode.has(code)) byCode.set(code, index);

    for (const token of tokenize(product[0])) {
      let bucket = byToken.get(token);
      if (!bucket) {
        bucket = [];
        byToken.set(token, bucket);
      }
      bucket.push(index);
    }
  });

  // A catalogue built before barcodes existed has none at all. Knowing that
  // lets the comparison fall back to text instead of reporting every item as
  // missing when a stale file is deployed.
  return { ...chain, byToken, byCode, hasCodes: byCode.size > 0 };
}

/** Exact lookup by barcode, or null when this chain does not stock it. */
export function findByCode(indexed, code) {
  if (!code) return null;
  const index = indexed.byCode.get(code);
  if (index === undefined) return null;

  const [name, price, , promo] = indexed.products[index];
  return { name, price, promo: promo ?? 0, score: 1, exact: true };
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

  // Collect first, decide after: comparing as we go made the winner depend on
  // the order candidates happened to be visited, so the same query could
  // return different products on different runs.
  const scored = [];
  for (const index of candidates) {
    const [name, price, , promo] = indexed.products[index];
    const score = similarity(query, name);
    if (score >= MATCH_THRESHOLD) scored.push({ name, price, promo: promo ?? 0, score });
  }
  if (scored.length === 0) return null;

  const bestScore = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
  return scored
    .filter((entry) => entry.score >= bestScore - NEAR_TIE)
    .reduce((cheapest, entry) => (entry.price < cheapest.price ? entry : cheapest));
}
