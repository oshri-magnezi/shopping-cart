// Matches a shopper's words against product names from the price catalogues.
//
// Runs entirely in the browser: no network call, no data leaving the device,
// and instant. The scoring is tuned for Hebrew grocery names, which are short,
// heavily prefixed, and lead with the category noun.

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

/**
 * Category nouns. When a product *starts* with one of these and the shopper
 * did not ask for it, it is a different kind of thing: "גלידת מסקרפונה" is
 * ice cream, "מעדן חלב" is a dessert, "חטיף טורטיה חלב" is a snack.
 */
const CATEGORY_WORDS = [
  'גלידה',
  'גלידת',
  'מעדן',
  'מעדני',
  'חטיף',
  'חטיפי',
  'משקה',
  'משקאות',
  'עוגה',
  'עוגת',
  'עוגיות',
  'עוגיה',
  'קרם',
  'ממרח',
  'רוטב',
  'מרק',
  'סלט',
  'תערובת',
  'בורקס',
  'פשטידה',
  'קינוח',
  'שוקולד',
  'ופל',
  'ביסקוויט',
  'תרסיס',
  'שמפו',
  'סבון',
  'תחליב',
];

const CATEGORY_SET = new Set(CATEGORY_WORDS);

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

/**
 * How well one word answers another.
 *
 * Substring matching is deliberately restricted: in Hebrew "חלב" sits inside
 * "חלבון", which is protein, not milk. Only a longer word that *starts* with
 * the shorter one counts, and only when the extra letters look like an
 * inflection rather than a different word.
 */
function credit(word, tokens) {
  let best = 0;
  for (const token of tokens) {
    if (token === word) return 1;

    const [shorter, longer] = word.length <= token.length ? [word, token] : [token, word];
    if (shorter.length < 3) continue;

    const extra = longer.length - shorter.length;
    if (extra <= 2 && longer.startsWith(shorter)) {
      best = Math.max(best, 0.85);
    }
  }
  return best;
}

/** The category noun a product leads with, if any. */
export function leadCategory(text) {
  const first = tokenize(text)[0];
  return first && CATEGORY_SET.has(first) ? first : null;
}

/**
 * Symmetric similarity in [0,1]: both how much of A appears in B and how much
 * of B appears in A. The two-sided view stops a short name from matching every
 * long one that happens to contain it.
 */
export function similarity(query, productName) {
  const left = tokenize(query);
  const right = tokenize(productName);
  if (left.length === 0 || right.length === 0) return 0;

  // A product from another category is not the thing that was asked for,
  // however many words the two names happen to share.
  const category = leadCategory(productName);
  if (category && !left.includes(category)) return 0;

  const recall = left.reduce((sum, word) => sum + credit(word, right), 0) / left.length;
  const precision = right.reduce((sum, word) => sum + credit(word, left), 0) / right.length;
  if (recall === 0 || precision === 0) return 0;

  // The first word carries the category in Hebrew, so a product whose head
  // noun the shopper never mentioned is a weaker answer.
  const headPenalty = credit(right[0], left) >= 0.85 ? 0 : 0.15;

  const harmonic = (2 * recall * precision) / (recall + precision);
  return Math.max(0, harmonic * 0.6 + recall * 0.4 - headPenalty);
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
