import { credit, leadCategory, normalize, similarity, tokenize } from './textMatch.js';
import { COMBOS, HEAD_CATEGORIES, KEYWORD_WEIGHTS } from './categoryKeywords.js';
import { FALLBACK_CATEGORY_ID } from './categories.js';

/**
 * Suggests which shelf a product belongs on, from its name alone.
 *
 * The price files carry no category, department or aisle — products arrive as
 * `[name, price, code, promo, unit]` and nothing more — so the only signals
 * available are the Hebrew name and whether the shop sells the thing by weight.
 *
 * Two sources, in order. What the shopper filed themselves always wins: it is
 * the only thing that can reach a category they invented, and a correction made
 * by hand outranks any table written here. Failing that, a weighted keyword
 * table scores every category and the best one has to earn the right to be
 * shown.
 */

// What a name *opens* with says what it is. Worth more than a word appearing
// anywhere in it: "גלידת שוקולד" is ice cream, "עוגת שוקולד" is cake.
const HEAD_WEIGHT = 3;

// Sold loose is a real hint toward produce and a weak one — the cheese counter,
// the deli and the nut bins are all sold by weight. Deliberately smaller than
// MIN_SCORE, so it can break a tie but can never carry a name on its own.
const LOOSE_BONUS = 1.5;

// One faint keyword is not an opinion, and a leader that barely edges out the
// runner-up is a coin toss wearing a suggestion's clothes.
const MIN_SCORE = 2;
const MIN_MARGIN = 1;

// Well above MATCH_THRESHOLD (0.5). Matching the wrong product shows a price
// the shopper can see and disbelieve; refiling their basket from a half-right
// memory happens quietly and stays wrong.
const LEARNED_THRESHOLD = 0.72;

// Long enough for any real product name, short enough that a promotional
// mouthful cannot fragment one memory entry into several.
const SIGNATURE_TOKENS = 6;

// Hebrew glues its prepositions to the next word, so "for laundry" is written
// "לכביסה" and arrives as a single token. `credit` cannot help — it only
// forgives a grown *suffix* — so "ג'ל מרוכז לכביסה" scored nothing for
// cleaning and was filed under dairy on the strength of "לבנה".
//
// Only one letter is ever removed, and only from a word long enough that what
// remains is still a word. The result has to hit the table exactly to count,
// so this can add a match but never invent one.
const GLUED_PREFIXES = 'בלמהכוש';
const MIN_PREFIXED_LENGTH = 4;

function unglue(value) {
  if (value.length < MIN_PREFIXED_LENGTH || !GLUED_PREFIXES.includes(value[0])) return null;
  return value.slice(1);
}

/**
 * Words after which the next word describes what a product is *not*.
 *
 * Israeli labels are full of both kinds. "סוכריות ללא סוכר" is a sweet, and
 * counting the sugar it proudly lacks filed it under dry goods. "חטיף בטעם
 * גבינה" is a crisp, not a cheese. In both the following word is talking about
 * a flavour or an absence, and scoring it argues for the wrong shelf with real
 * confidence — which is worse than not scoring it at all.
 */
const SUPPRESSORS = new Set(['ללא', 'בלי', 'בטעם', 'בניחוח', 'בסגנון', 'בריח', 'טעם']);

/**
 * The stems a name mentions only to deny or to flavour.
 *
 * Read from the normalised text rather than from the tokens, because the
 * tokenizer drops "בטעם" as noise — correctly, for matching one product
 * against another, and uselessly here, since by the time the tokens arrive the
 * word that explained the next one is gone.
 */
function deniedStems(name) {
  const words = normalize(name).split(' ').filter(Boolean);
  const denied = new Set();
  for (let i = 0; i < words.length - 1; i += 1) {
    if (!SUPPRESSORS.has(words[i])) continue;
    const next = tokenize(words[i + 1])[0];
    if (next && !next.numeric) denied.add(next.value);
  }
  return denied;
}

/**
 * Puts back the space the shops left out.
 *
 * Israeli price files abbreviate relentlessly and with a full stop:
 * "שוק.מריר", "גב.עיזים", "תח.גוף", "חט.נייטשר". `normalize` strips the stop
 * without putting anything in its place, so those arrive as one invented word
 * — "שוקמריר" — that matches nothing. The abbreviations are among the most
 * common tokens in the whole catalogue, so this is not a rare case.
 *
 * Only a stop **between two Hebrew letters** is split. That leaves "1.5 ליטר"
 * and "70%" alone, which is the reason not to do this with a blanket replace.
 */
const GLUED_ABBREVIATION = /(?<=[֐-׿])\.(?=[֐-׿])/g;

const readable = (name) => String(name).replace(GLUED_ABBREVIATION, ' ');

/**
 * A stable key for "the same kind of product".
 *
 * Sizes and fat percentages never change which shelf something sits on, so
 * they are dropped and every carton of milk collapses onto one entry. Token
 * order is kept: Hebrew leads with the head noun, and both `similarity` and
 * `leadCategory` read that order. Sorting would fold "חלב שוקולד" together
 * with "שוקולד חלב" and lose the one piece of grammar available for free.
 */
export function nameSignature(name) {
  return tokenize(readable(name ?? ''))
    .filter((token) => !token.numeric)
    .map((token) => token.value)
    .slice(0, SIGNATURE_TOKENS)
    .join(' ');
}

/** The remembered category for this name, or null. */
function fromMemory(signature, memory, isValid) {
  if (!signature || !Array.isArray(memory) || memory.length === 0) return null;

  let best = null;
  for (const entry of memory) {
    if (!entry?.signature || !isValid(entry.categoryId)) continue;

    // An exact repeat needs no scoring and cannot be beaten.
    if (entry.signature === signature) {
      return { categoryId: entry.categoryId, source: 'learned', score: 1 };
    }

    const score = similarity(signature, entry.signature);
    if (score >= LEARNED_THRESHOLD && (!best || score > best.score)) {
      best = { categoryId: entry.categoryId, source: 'learned', score };
    }
  }
  return best;
}

/** Every category that any word in the name argues for, with its total. */
function scoreKeywords(name, tokens, loose) {
  const scores = new Map();
  const add = (categoryId, amount) => {
    scores.set(categoryId, (scores.get(categoryId) ?? 0) + amount);
  };

  const head = leadCategory(name);
  const headCategory = head ? HEAD_CATEGORIES.get(head) : null;
  if (headCategory) add(headCategory, HEAD_WEIGHT);

  const denied = deniedStems(name);

  for (const token of tokens) {
    if (token.numeric) continue;
    // "ללא סוכר", "בטעם גבינה" — here to be denied, not claimed.
    if (denied.has(token.value)) continue;

    // An exact hit is the common case and skips the scan entirely.
    let weights = KEYWORD_WEIGHTS.get(token.value);
    let confidence = 1;

    // Then the same word with a glued preposition taken off. Slightly discounted:
    // most of these are real ("לכביסה"), but a first letter that only looked like
    // a preposition would be indistinguishable from one that was.
    if (!weights) {
      const bare = unglue(token.value);
      const prefixed = bare ? KEYWORD_WEIGHTS.get(bare) : undefined;
      if (prefixed) {
        weights = prefixed;
        confidence = 0.9;
      }
    }

    // Otherwise let a grown suffix still land, through the same rule that keeps
    // "חלבון" and "חלבה" from being credited as "חלב". Take the best-scoring
    // word rather than the first one found: iteration order of the table is an
    // accident of how it was typed, and scores should not depend on it.
    if (!weights) {
      confidence = 0;
      for (const [word, candidate] of KEYWORD_WEIGHTS) {
        const score = credit(word, [token]);
        if (score > confidence) {
          confidence = score;
          weights = candidate;
        }
      }
    }

    if (!weights) continue;
    // A partial word argues proportionately, not fully.
    for (const [categoryId, weight] of Object.entries(weights)) add(categoryId, weight * confidence);
  }

  // Combos read through glued prepositions too. "מלפפונים בחומץ" is pickles,
  // but `credit` will not bridge "בחומץ" to "חומץ" — it forgives a grown suffix
  // and this is a prefix — so without ungluing here the pair never fired and
  // the name stayed a tie between produce and the cupboard.
  const reach = [...tokens];
  for (const token of tokens) {
    const bare = token.numeric ? null : unglue(token.value);
    if (bare) reach.push({ value: bare, numeric: false });
  }

  for (const combo of COMBOS) {
    if (!combo.words.every((word) => credit(word, reach) > 0)) continue;
    for (const [categoryId, weight] of Object.entries(combo.scores)) add(categoryId, weight);
  }

  if (loose) add('produce', LOOSE_BONUS);

  return scores;
}

/**
 * @param {string} name
 * @param {object} [options]
 * @param {boolean} [options.loose] the shop sells this by weight
 * @param {Array<{signature: string, categoryId: string}>} [options.memory]
 * @param {Set<string>} [options.validCategoryIds] categories that still exist
 * @returns {{categoryId: string, source: 'learned'|'keywords', score: number}|null}
 *
 * Returns **null** whenever there is nothing worth showing: an empty or
 * unreadable name, a leader below MIN_SCORE, a leader that fails to clear the
 * runner-up by MIN_MARGIN, or a leader that is the fallback category itself.
 *
 * That null is the whole contract. Callers write
 * `classify(...)?.categoryId ?? FALLBACK_CATEGORY_ID` and mark the choice as a
 * suggestion only when the result was non-null — so a guess the classifier does
 * not believe is never dressed up as one. It is silently "other", exactly as
 * before this existed.
 */
export function classify(name, options = {}) {
  const { loose = false, memory = [], validCategoryIds } = options;
  if (typeof name !== 'string' || !name.trim()) return null;

  // No list of valid ids means "do not filter" — the caller is a unit test or
  // a context where categories cannot have been deleted.
  const isValid = (id) => Boolean(id) && (!validCategoryIds || validCategoryIds.has(id));

  const learned = fromMemory(nameSignature(name), memory, isValid);
  if (learned) return learned;

  const spaced = readable(name);
  const tokens = tokenize(spaced);
  const ranked = [...scoreKeywords(spaced, tokens, loose)]
    .filter(([categoryId]) => isValid(categoryId))
    .sort((a, b) => b[1] - a[1]);

  const [best, runnerUp] = ranked;
  if (!best) return null;

  const [categoryId, score] = best;
  if (categoryId === FALLBACK_CATEGORY_ID) return null;
  if (score < MIN_SCORE) return null;
  if (score - (runnerUp?.[1] ?? 0) < MIN_MARGIN) return null;

  return { categoryId, source: 'keywords', score };
}
