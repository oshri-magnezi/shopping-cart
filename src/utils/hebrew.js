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
  'מאגדת',
  'מארזי',
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

// Every list below is consulted with token values, and token values are folded
// by `singular`. An entry written in the plural — "שקדים", "קפסולות" — would
// otherwise never be found again once the tokenizer started folding.
const toStems = (words) => new Set(words.map(singular));

// Hebrew glues its prepositions to the next word, so "in tomato paste" is
// written "ברסק עגבניות" and the paste arrives as one token, "ברסק". Only the
// listed words are ever unglued, and only to test them against the list — so
// this can never turn an ordinary word into a disqualifier by accident.
const KIND_PREFIXES = 'בלמהכו';

function bareKind(token) {
  const word = token.value;
  if (KIND_WORDS.has(word)) return word;
  if (word.length > 3 && KIND_PREFIXES.includes(word[0])) {
    const bare = word.slice(1);
    if (KIND_WORDS.has(bare)) return bare;
  }
  return null;
}

/**
 * Words that change what a product *is*, wherever they sit in its name.
 *
 * The head rule above only inspects the first word, which is why it never saw
 * "חלב קוקוס" or "ביצה קינדר גוי" — both lead with the very noun that was
 * searched for. What disqualifies them is a modifier further along.
 *
 * The list is deliberately short and every entry has to pass the same test as
 * a category noun: **it can only ever reject a product the shopper did not ask
 * for**, because a query containing the word keeps its own match. Searching
 * for "חלב קוקוס" still finds coconut milk; searching for "חלב" no longer
 * does. That property is what makes the list safe to extend.
 */
const KIND_WORDS = toStems([
  // Plant milks are a different product from milk, not a variety of it.
  'קוקוס',
  'סויה',
  'שקדים',
  'שיבולת',
  // Preparations of a thing, rather than the thing.
  'מיץ',
  'חומץ',
  'רסק',
  'ריבה',
  'ריבת',
  'ממרח',
  'אבקת',
  'תמצית',
  'מרק',
  // Confectionery built on a fruit or an egg.
  'מצופה',
  'מצופות',
  'מצופים',
  'קינדר',
]);

/**
 * Category nouns. A product that *leads* with one of these belongs to a
 * different category than the shopper asked for: "גלידת מסקרפונה" is ice
 * cream, not cheese; "מעדן חלב" is a dessert, not milk.
 */
const CATEGORY_WORDS = toStems([
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
  'לאבנה',
  'מחית',
  'נוזל',
  'קפסולות',
  'דאודורנט',
  'מסטיק',
  'בייגלה',
  'פריכיות',
  'מברשת',
  'וופל',
  'קרקר',
  'קרקרים',
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
  // Pack counts are written both ways — "6*330" and "20 * 15". Closing the
  // gaps first means one rule recognises both, and stops a 20-bag multipack
  // being offered as the single bag someone asked for.
  result = result.replace(/(\d)\s*\*\s*(\d)/g, '$1*$2');

  // Chains decorate promoted lines as "*מבצע*", and the stars stopped that
  // ever matching the noise word. Strip those, but keep the star that means
  // multiplication in a pack count like 6*330 — the tokenizer relies on it.
  result = result.replace(/\*/g, (star, at, text) =>
    /\d/.test(text[at - 1] ?? '') && /\d/.test(text[at + 1] ?? '') ? star : ' ',
  );
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
/**
 * Folds a Hebrew plural onto its singular.
 *
 * Catalogues are written in the singular — "בננה", "תפוח עץ" — and shoppers
 * type the plural. The two then share only three or four leading letters, one
 * short of the prefix rule, so "בננות" found bananas in none of the seven
 * chains and "תפוחים" found apples in almost none.
 *
 * Both sides of every comparison are folded, so this cannot introduce a match
 * on its own: it can only bring a plural and its own singular together. A word
 * that is not really a plural — "תרבות" — folds to the same stem wherever it
 * appears and keeps matching itself. Words of four letters or fewer are left
 * alone, which is what protects "מים" and "חיים" from being eaten.
 */
function singular(word) {
  if (word.length <= 4) return word;
  if (word.endsWith('ים')) return word.slice(0, -2);
  // Feminine plurals drop the ות and take back their ה: בננות -> בננה.
  if (word.endsWith('ות')) return `${word.slice(0, -2)}ה`;
  return word;
}

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
    tokens.push({ value: singular(word), numeric: false, brand: BRANDS.has(word) });
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
 * five-letter floor keeps plain suffix growth ("שוקולד"/"שוקולדים") without
 * letting three-letter roots collide with unrelated words.
 *
 * This credits an *added* suffix only, never a substituted letter, so
 * "גבינה"/"גבינות" and "מלפפון"/"מלפפונים" score nothing here — that
 * is what SYNONYMS is for.
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

  // The same judgement, for words that do their work anywhere in the name
  // rather than at the front. These are the misses the head rule cannot see,
  // because the head is exactly what the shopper asked for: "חלב קוקוס" leads
  // with milk, "ביצה קינדר" leads with egg.
  const kind = rightWords.map(bareKind).find(Boolean);
  if (kind && !leftWords.some((token) => bareKind(token) === kind)) return 0;

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
