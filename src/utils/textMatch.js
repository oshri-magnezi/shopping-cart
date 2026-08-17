// Matches a cart item against the priced items in a results file.
//
// Exact string equality is too brittle: "חלב 3%" and "חלב תנובה 3% 1 ליטר"
// are the same shopping intent, and the two lists are edited at different
// times. This scores name similarity locally — no network call, no data
// leaving the browser, and instant.

const UNIT_REPLACEMENTS = [
  [/\bמ["״']?ל\b/g, 'מל'],
  [/\bק["״']?ג\b/g, 'קג'],
  [/\bגר["״']?\b/g, 'גרם'],
  [/\bל["״']\b/g, 'ליטר'],
  [/\bיח["״']?\b/g, 'יחידות'],
];

const NOISE_WORDS = new Set([
  'מארז',
  'אריזה',
  'חדש',
  'מבצע',
  'כשר',
  'בדץ',
  'למהדרין',
  'מהדרין',
  'בטעם',
  'של',
  'עם',
]);

export function normalize(text) {
  let result = String(text ?? '');
  result = result.replace(/[()[\]{}]/g, ' ').replace(/[\/\-_,]/g, ' ');
  for (const [pattern, replacement] of UNIT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/["״'׳.]/g, '').replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((word) => word && !NOISE_WORDS.has(word));
}

function credit(word, tokens) {
  let best = 0;
  for (const token of tokens) {
    if (token === word) return 1;
    if (word.length >= 2 && token.length >= 2 && (token.includes(word) || word.includes(token))) {
      best = Math.max(best, 0.8);
    }
  }
  return best;
}

/**
 * Symmetric similarity in [0,1]: both how much of A appears in B and how much
 * of B appears in A. The two-sided view stops a short name from matching every
 * long one that happens to contain it.
 */
export function similarity(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 || right.length === 0) return 0;

  const recall = left.reduce((sum, word) => sum + credit(word, right), 0) / left.length;
  const precision = right.reduce((sum, word) => sum + credit(word, left), 0) / right.length;
  if (recall === 0 || precision === 0) return 0;

  // Harmonic mean, leaning on recall — the shopper's words matter most.
  return (2 * recall * precision) / (recall + precision) * 0.6 + recall * 0.4;
}

export const MATCH_THRESHOLD = 0.5;

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
