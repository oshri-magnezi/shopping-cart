import { tokenize, similarity, MATCH_THRESHOLD } from './textMatch.js';

/**
 * Builds a word → product index for one chain's catalogue.
 *
 * Scoring a query against all ~10,000 products of every chain on each render
 * is far too slow. The index narrows each lookup to the handful of products
 * that share a word with the query, which is a few dozen instead of tens of
 * thousands.
 */
// A real barcode is 8 digits at the shortest (EAN-8). Anything shorter is an
// in-store PLU, which chains assign independently: in one city's catalogue 77
// short codes appear at more than one chain and 7 of those are unrelated
// products — code 14296 is a lemon at one chain and a tray of pastries at
// another. Indexing those would answer a lookup with the wrong product and
// label it an exact match.
const MIN_CROSS_CHAIN_CODE = 8;

export function indexChain(chain) {
  const byToken = new Map();
  // Barcodes are the exact path: the same code is the same product at every
  // chain, so a product the shopper picked never has to be guessed again.
  const byCode = new Map();

  chain.products.forEach((product, index) => {
    const code = product[2];
    if (code && code.length >= MIN_CROSS_CHAIN_CODE && !byCode.has(code)) byCode.set(code, index);

    for (const token of tokenize(product[0])) {
      // `tokenize` yields objects; the map must be keyed by the word itself.
      // Keying by the object instead silently gave every occurrence its own
      // entry and made every lookup miss, so text search returned nothing at
      // all while barcode search went on working.
      let bucket = byToken.get(token.value);
      if (!bucket) {
        bucket = [];
        byToken.set(token.value, bucket);
      }
      bucket.push(index);
    }
  });

  // A catalogue built before barcodes existed has none at all. Knowing that
  // lets the comparison fall back to text instead of reporting every item as
  // missing when a stale file is deployed.
  return {
    ...chain,
    byToken,
    byCode,
    // Sorted so prefix lookups can binary-search to the matching run instead
    // of walking every word in the chain.
    vocabulary: [...byToken.keys()].sort(),
    hasCodes: byCode.size > 0,
  };
}

/**
 * Reads one catalogue row. `unit` is 1 when the price is per kilogram, which
 * only a fifth element declares — a catalogue written before that existed
 * simply has none, and every row reads as priced per item.
 */
function readProduct(products, index) {
  const [name, price, , promo, unit] = products[index];
  return { name, price, promo: promo ?? 0, unit: unit ?? 0 };
}

/** Exact lookup by barcode, or null when this chain does not stock it. */
export function findByCode(indexed, code) {
  if (!code) return null;
  const index = indexed.byCode.get(code);
  if (index === undefined) return null;

  return { ...readProduct(indexed.products, index), score: 1, exact: true };
}

export function buildIndex(catalog) {
  return catalog.chains.map(indexChain);
}

/**
 * The lowest price this item currently carries anywhere in the loaded city.
 *
 * Used to answer the question a shopper actually has at the counter — what
 * half a kilo of this will come to — before they have opened the comparison.
 */
export function cheapestPrice(chains, { name, code = '', unit = 0 }) {
  let best = null;
  for (const chain of chains) {
    const match = code && chain.hasCodes ? findByCode(chain, code) : findInChain(chain, name, { unit });
    if (match && (best === null || match.price < best.price)) best = match;
  }
  return best;
}

/** First position in the sorted vocabulary at or after `prefix`. */
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
 * Finds the cheapest good match for a query in an indexed chain.
 *
 * Among candidates that score about equally well the cheapest wins, so a
 * generic "חלב 3%" lands on the value brand rather than whichever premium
 * product happens to be worded most similarly.
 */
// Measured against a real Tel Aviv catalogue over a 16-item basket. At 0.06
// the window was wide enough to admit near-misses, and because it then picks
// the cheapest, it actively preferred them: "סוכר" landed on vanilla-sugar
// sachets at 3 and "ביצים" on a Kinder egg. Wrong matches are usually cheap
// novelties, so the rule was biasing every basket downward — the same basket
// came to 1058 at 0.06 and 1222 at 0.04, with identical coverage (110/112).
// 0.04 is the widest window that excludes them, so it keeps as much of the
// original "value brand beats premium" intent as the data allows.
const NEAR_TIE = 0.04;
// Below this, the exact bucket is too thin to trust on its own and the prefix
// sweep is worth its cost.
const THIN_BUCKET = 5;

export function findInChain(indexed, query, { unit = 0 } = {}) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  const candidates = new Set();
  for (const { value: word } of queryTokens) {
    const exact = indexed.byToken.get(word);
    if (exact) for (const index of exact) candidates.add(index);

    // Partial words matter in Hebrew ("קוטג" vs "קוטג'"), so a thin exact
    // bucket also sweeps the words that extend the query word. Sorted order
    // means those sit in one contiguous run, which is why this is a bounded
    // scan rather than a pass over all ~6,000 words of the chain.
    if (!exact || exact.length < THIN_BUCKET) {
      const { vocabulary } = indexed;
      for (let i = lowerBound(vocabulary, word); i < vocabulary.length; i += 1) {
        const key = vocabulary[i];
        if (!key.startsWith(word)) break;
        for (const index of indexed.byToken.get(key)) candidates.add(index);
      }
    }
  }

  // Collect first, decide after: comparing as we go made the winner depend on
  // the order candidates happened to be visited, so the same query could
  // return different products on different runs.
  const scored = [];
  for (const index of candidates) {
    const product = readProduct(indexed.products, index);
    // Comparing a per-kilogram price against a per-item one is meaningless:
    // loose tomatoes at ₪6.90 a kilo would look dearer than a packed kilo at
    // ₪12.90 look cheaper, purely because the two numbers measure different
    // things. So the unit is a hard requirement, exactly like a stated size.
    if (product.unit !== unit) continue;
    const score = similarity(query, product.name);
    if (score >= MATCH_THRESHOLD) scored.push({ ...product, score });
  }
  if (scored.length === 0) return null;

  const bestScore = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
  return scored
    .filter((entry) => entry.score >= bestScore - NEAR_TIE)
    .reduce((cheapest, entry) => (entry.price < cheapest.price ? entry : cheapest));
}
