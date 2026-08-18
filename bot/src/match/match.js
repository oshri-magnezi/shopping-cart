import { tokenize, similarityTokens } from './hebrew.js';

// How close a rival has to be before price decides between them.
const CHEAPEST_WINDOW = 0.08;

/** Scores a query against a product, both already tokenized. */
export function score(queryTokens, productTokens) {
  return similarityTokens(queryTokens, productTokens);
}

/**
 * Finds the best product for one list item. Among genuinely near-equal
 * matches the cheapest wins, so a generic "חלב 3%" lands on the value brand
 * rather than the closest-worded premium one.
 */
export function matchItem(itemName, products, threshold) {
  const queryTokens = tokenize(itemName);
  if (queryTokens.length === 0) return null;

  const scored = [];
  for (const product of products) {
    const value = score(queryTokens, product.tokens);
    if (value >= threshold) scored.push({ product, score: value });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;

  const contenders = scored.filter((entry) => entry.score >= bestScore - CHEAPEST_WINDOW);
  contenders.sort((a, b) => a.product.price - b.product.price);
  const chosen = contenders[0];

  return {
    product: chosen.product,
    score: Number(chosen.score.toFixed(3)),
    alternatives: scored.slice(0, 3).map((entry) => ({
      name: entry.product.name,
      price: entry.product.price,
      score: Number(entry.score.toFixed(3)),
    })),
  };
}

/** Pre-tokenizes a catalogue once so each item match is a cheap comparison. */
export function indexProducts(products) {
  return products.map((product) => ({
    ...product,
    tokens: tokenize(`${product.name} ${product.manufacturer}`),
  }));
}
