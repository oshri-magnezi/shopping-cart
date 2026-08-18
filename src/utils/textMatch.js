// Kept as the site's entry point for matching; the rules themselves live in
// hebrew.js, which the bot shares so the two can never drift apart.
export {
  normalize,
  tokenize,
  leadCategory,
  similarity,
  credit,
  MATCH_THRESHOLD,
} from './hebrew.js';

import { similarity, MATCH_THRESHOLD } from './hebrew.js';

/** Best-scoring candidate above the threshold, or null. */
export function findBestMatch(name, candidates, threshold = MATCH_THRESHOLD) {
  let best = null;
  for (const candidate of candidates) {
    const score = similarity(name, candidate.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { ...candidate, score };
    }
  }
  return best;
}
