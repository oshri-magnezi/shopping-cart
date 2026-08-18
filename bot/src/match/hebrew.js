// Hebrew grocery text: normalization, tokenizing and similarity.
//
// This is the single source of truth for matching, shared by the site and the
// bot (which keeps a generated copy at bot/src/match/hebrew.js). Every rule
// here exists because a specific wrong match happened without it.

// Unit spellings vary per chain and per shopper.
const UNIT_REPLACEMENTS = [
  [/\bמ["״']?ל\b/g, 'מל'],
  [/\bמיליליטר\b/g, 'מל'],
  [/\bק["״']?ג\b/g, 'קג'],
  [/\bקילו(גרם)?\b/g, 'קג'],
  [/\bגר["״']?\b/g, 'גרם'],
  [/\bל["״']\b/g, 'ליטר'],
  [/\bליט\b/g, 'ליטר'],
  [/\bיח["״']?\b/g, 'יחידות'],
];

// Words that carry no matching signal — only marketing or kashrut.
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
  'טרי',
  'פרימיום',
]);

// Same product, different spelling. Both sides normalize to the first form.
const SYNONYMS = new Map([
  ['קוטגי', 'קוטג'],
  ['שוקולית', 'שוקו'],
  ['טישיו', 'טישו'],
  ['טוילט', 'טואלט'],
  ['קורנפלקסים', 'קורנפלקס'],
  ['עגבניה', 'עגבניות'],
  ['מלפפון', 'מלפפונים'],
  ['ביצה', 'ביצים'],
]);

/**
 * Category nouns. A product that *leads* with one of these belongs to a
 * different category than the shopper asked for: "גלידת מסקרפונה" is ice
 * cream, not cheese; "מעדן חלב" is a dessert, not milk.
 */
const CATEGORY_WORDS = new Set([
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
  'יוגורט',
  'דגני',
  'אבקת',
  'אבקה',
  'תבלין',
  'משחת',
  'מרכך',
]);

// Brands help when present and never hurt when absent.
const BRANDS = new Set([
  'תנובה',
  'טרה',
  'שטראוס',
  'אסם',
  'עלית',
  'יטבתה',
  'סוגת',
  'תלמה',
  'ויסוצקי',
  'פריגת',
  'זוגלובק',
]);

const NUMERIC_TOKEN = /^\d+(\.\d+)?%?$/;
const UNIT_WORDS = new Set(['ליטר', 'מל', 'קג', 'גרם', 'יחידות']);
const PACK_TOKEN = /^\d+\*\d+/;
const GLUED_SIZE = /^([\d.]+)(ליטר|מל|קג|גרם)$/;
const BASE_SIZE = /^([\d.]+)(מל|גרם)$/;

export function normalize(text) {
  let result = String(text ?? '');
  result = result.replace(/[()[\]{}]/g, ' ').replace(/[/\-_,]/g, ' ');
  for (const [pattern, replacement] of UNIT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/["״'׳.]/g, '').replace(/\s+/g, ' ').trim();
}

/** Millilitres for liquids, grams for solids — one scale per kind. */
function canonicalSize(amount, unit) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount}${unit}`;
  if (unit === 'ליטר') return `${value * 1000}מל`;
  if (unit === 'קג') return `${value * 1000}גרם`;
  return `${value}${unit}`;
}

/**
 * Splits text into tokens. Sizes collapse to one base unit so "1 ליטר" and
 * "1000 מל" compare equal rather than looking like a conflict, and pack counts
 * ("6*330") are kept distinct from unit sizes.
 */
export function tokenize(text) {
  const raw = normalize(text).split(' ').filter(Boolean);
  const tokens = [];

  for (let i = 0; i < raw.length; i += 1) {
    const word = SYNONYMS.get(raw[i]) ?? raw[i];

    if (PACK_TOKEN.test(word)) {
      tokens.push({ value: `pack${word}`, numeric: true, pack: true });
      continue;
    }

    if (NUMERIC_TOKEN.test(word)) {
      const next = raw[i + 1];
      if (next && UNIT_WORDS.has(next)) {
        tokens.push({ value: canonicalSize(word, next), numeric: true, size: true });
        i += 1;
      } else {
        tokens.push({ value: word, numeric: true });
      }
      continue;
    }

    const glued = word.match(GLUED_SIZE);
    if (glued) {
      tokens.push({ value: canonicalSize(glued[1], glued[2]), numeric: true, size: true });
      continue;
    }

    if (NOISE_WORDS.has(word)) continue;
    tokens.push({ value: word, numeric: false, brand: BRANDS.has(word) });
  }

  return tokens;
}

export function leadCategory(text) {
  const first = tokenize(text)[0];
  return first && CATEGORY_WORDS.has(first.value) ? first.value : null;
}

export function percentOf(tokens) {
  const token = tokens.find((entry) => entry.numeric && entry.value.endsWith('%'));
  return token ? token.value : null;
}

/** Pack sizes keyed by base unit, so a 1L request never matches a 2L carton. */
export function sizesOf(tokens) {
  const sizes = new Map();
  for (const token of tokens) {
    if (!token.size) continue;
    const match = token.value.match(BASE_SIZE);
    if (match && !sizes.has(match[2])) sizes.set(match[2], Number(match[1]));
  }
  return sizes;
}

/**
 * How well one word answers another.
 *
 * Prefix credit is limited to long words. Hebrew roots are short and densely
 * packed: "חלב" (milk) is a prefix of "חלבון" (protein) and "חלבה" (halva),
 * and no length or morphology rule separates those from a real inflection. A
 * five-letter floor keeps the useful cases ("מסקרפונה"/"מסקרפונת") without
 * letting three-letter roots collide with unrelated words.
 */
const MIN_PREFIX_LENGTH = 5;

export function credit(word, tokens) {
  let best = 0;
  for (const token of tokens) {
    const value = token.value ?? token;
    if (value === word) return 1;

    const [shorter, longer] = word.length <= value.length ? [word, value] : [value, word];
    if (shorter.length < MIN_PREFIX_LENGTH) continue;
    if (longer.length - shorter.length <= 2 && longer.startsWith(shorter)) {
      best = Math.max(best, 0.85);
    }
  }
  return best;
}

const RECALL_WEIGHT = 0.7;
const PRECISION_WEIGHT = 0.3;
const BRAND_BONUS = 0.05;
const HEAD_PENALTY = 0.15;
const PERCENT_PENALTY = 0.3;

export const MATCH_THRESHOLD = 0.5;

/**
 * Symmetric similarity in [0,1]. Recall asks how much of the query the product
 * covers; precision asks how much of the product the query explains. Without
 * precision, "שמן זית" scores a perfect 1.0 against "שמפו שמן זית".
 */
export function similarity(query, productName) {
  return similarityTokens(tokenize(query), tokenize(productName));
}

export function similarityTokens(left, right) {
  const leftWords = left.filter((token) => !token.numeric);
  const rightWords = right.filter((token) => !token.numeric);
  if (leftWords.length === 0 || rightWords.length === 0) return 0;

  // A product from another category is not what was asked for, however many
  // words the two names happen to share.
  const category =
    rightWords[0] && CATEGORY_WORDS.has(rightWords[0].value) ? rightWords[0].value : null;
  if (category && !leftWords.some((token) => token.value === category)) return 0;

  const recallCredits = leftWords.map((token) => credit(token.value, right));
  const recall = recallCredits.reduce((sum, value) => sum + value, 0) / leftWords.length;

  const precisionCredits = rightWords.map((token) => credit(token.value, left));
  const precision = precisionCredits.reduce((sum, value) => sum + value, 0) / rightWords.length;
  if (recall === 0 || precision === 0) return 0;

  let result = RECALL_WEIGHT * recall + PRECISION_WEIGHT * precision;

  // The first word carries the category in Hebrew.
  if (precisionCredits[0] < 0.85) result -= HEAD_PENALTY;

  // A different fat percentage is a different product.
  const wantedPercent = percentOf(left);
  const productPercent = percentOf(right);
  if (wantedPercent && productPercent && wantedPercent !== productPercent) {
    result -= PERCENT_PENALTY;
  }

  // A stated pack size is a hard requirement, not a preference: answering a
  // 1-litre request with a 2-litre carton would silently double that line of
  // the basket and quietly skew the whole comparison.
  const wantedSizes = sizesOf(left);
  if (wantedSizes.size > 0) {
    const productSizes = sizesOf(right);
    for (const [unit, wanted] of wantedSizes) {
      const found = productSizes.get(unit);
      if (found !== undefined && found !== wanted) return 0;
    }
  }

  // Naming a brand that turns up is a small confirmation; omitting one costs
  // nothing, because most shoppers never type a brand at all.
  const wantedBrand = leftWords.find((token) => token.brand);
  if (wantedBrand && rightWords.some((token) => token.value === wantedBrand.value)) {
    result += BRAND_BONUS;
  }

  return Math.min(1, Math.max(0, result));
}
