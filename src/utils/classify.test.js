import { describe, expect, it } from 'vitest';
import { classify, nameSignature } from './classify.js';
import {
  COMBOS,
  HEAD_CATEGORIES,
  KEYWORD_WEIGHTS,
  WRITTEN_WORDS,
} from './categoryKeywords.js';
import { BUILT_IN_CATEGORIES } from './categories.js';

/**
 * The price files carry no category, so every case here is decided from a
 * Hebrew name alone. Most of these are names where a plain word list gets the
 * wrong answer, and the rule that saves each one is named beside it.
 *
 * The scores are not the point; which side of the margin they land on is. A
 * suggestion the classifier cannot justify has to come back as null, because
 * the caller shows a marker for anything else — and a marker on a coin toss is
 * worse than no suggestion at all.
 */

describe('a suggestion the app cannot justify is no suggestion', () => {
  it.each(['', '   ', 'משהו', 'פסק זמן'])('%s yields nothing', (name) => {
    expect(classify(name)).toBeNull();
  });

  it('never suggests the fallback category itself', () => {
    // "other" is where an unclassified item already lands. Suggesting it would
    // put a marker on the default and tell the shopper a guess was made.
    for (const name of ['משהו', 'פיצה', 'סבון', 'אפונה']) {
      expect(classify(name)?.categoryId).not.toBe('other');
    }
  });

  it('declines when two shelves are equally plausible', () => {
    // Pizza is fresh or frozen depending only on which aisle you were in, and
    // the table says so with equal weights. This is the case that fails if the
    // margin rule is ever replaced with first-hit-wins.
    expect(classify('פיצה')).toBeNull();
    // Named, it resolves — the qualifier outweighs the food word.
    expect(classify('פיצה קפואה')?.categoryId).toBe('frozen');
  });

  it('treats a missing name as a missing name', () => {
    expect(classify(null)).toBeNull();
    expect(classify(undefined)).toBeNull();
  });
});

describe('a word that pulls toward several shelves', () => {
  // Chocolate is a snack, an ingredient and a flavour. What decides is the
  // noun the name opens with, which in Hebrew is what the thing *is*.
  it.each([
    ['שוקולד', 'snacks'],
    ['חלב שוקולד', 'drinks'],
    ['שוקו', 'drinks'],
    ['עוגת שוקולד', 'bakery'],
    ['גלידת שוקולד', 'frozen'],
    ['מעדן שוקולד', 'dairy'],
  ])('%s belongs to %s', (name, categoryId) => {
    expect(classify(name)?.categoryId).toBe(categoryId);
  });

  it('does not let the flavour outvote the head noun', () => {
    const guess = classify('חלב שוקולד');
    expect(guess.categoryId).not.toBe('snacks');
    expect(guess.categoryId).not.toBe('dairy');
  });
});

describe('short Hebrew roots do not pick the wrong shelf', () => {
  // The same collision hebrew.test.js guards for matching, in a new place:
  // חלב is a prefix of both חלבון and חלבה.
  it('חלב is dairy', () => {
    expect(classify('חלב')?.categoryId).toBe('dairy');
  });

  it.each(['חלבה', 'חלבון'])('%s is not dairy', (name) => {
    expect(classify(name)?.categoryId).not.toBe('dairy');
  });

  it('keeps plant milks in the chilled aisle on purpose', () => {
    // Soy milk sits beside the milk in every shop here. Recorded as a decision
    // rather than left to look like an accident.
    expect(classify('חלב סויה')?.categoryId).toBe('dairy');
  });
});

describe('spelling and plural do not change the shelf', () => {
  it.each([
    ['עגבניה', 'עגבניות'],
    ['מלפפון', 'מלפפונים'],
    ['שוקולד', 'שוקולדים'],
  ])('%s and %s agree', (singular, plural) => {
    const one = classify(singular);
    expect(one).not.toBeNull();
    expect(classify(plural)?.categoryId).toBe(one.categoryId);
  });
});

describe('sold loose is a hint, never an answer', () => {
  it('cannot carry a word the table does not know', () => {
    expect(classify('פיטאיה', { loose: true })).toBeNull();
  });

  it('breaks the tie for a fruit the table does know', () => {
    expect(classify('אבוקדו', { loose: true })?.categoryId).toBe('produce');
  });

  it('does not outrank a real keyword', () => {
    // The nut bins are sold by weight too.
    expect(classify('אגוזי מלך', { loose: true })?.categoryId).toBe('snacks');
  });
});

describe('hygiene is told apart from cleaning', () => {
  it.each(['שמפו', 'משחת שיניים', 'דאודורנט', 'סבון גוף'])('%s is care', (name) => {
    expect(classify(name)?.categoryId).toBe('care');
  });

  it.each(['אקונומיקה', 'נייר טואלט', 'סבון כלים'])('%s is cleaning', (name) => {
    expect(classify(name)?.categoryId).toBe('cleaning');
  });

  it('declines when soap could be either', () => {
    expect(classify('סבון')).toBeNull();
  });
});

describe('what the shopper filed themselves outranks the table', () => {
  const asSnacks = [{ signature: 'חלב', categoryId: 'snacks' }];

  it('beats the keyword answer outright', () => {
    const guess = classify('חלב 3% 1 ליטר', { memory: asSnacks });
    expect(guess).toMatchObject({ categoryId: 'snacks', source: 'learned' });
  });

  it('does not fire for an unrelated name', () => {
    expect(classify('לחם', { memory: asSnacks }).source).toBe('keywords');
  });

  it('reaches a category the table cannot know about', () => {
    // The whole reason the learned store exists: a category the shopper
    // invented can never appear in a word list written here.
    const memory = [{ signature: 'לחם אחיד פרוס', categoryId: 'mine' }];
    const guess = classify('לחם אחיד', {
      memory,
      validCategoryIds: new Set(['bakery', 'mine']),
    });
    expect(guess).toMatchObject({ categoryId: 'mine', source: 'learned' });
  });

  it('never returns a category that has since been deleted', () => {
    const memory = [{ signature: 'לחם אחיד פרוס', categoryId: 'mine' }];
    const guess = classify('לחם אחיד', {
      memory,
      validCategoryIds: new Set(['bakery']),
    });
    expect(guess).toMatchObject({ categoryId: 'bakery', source: 'keywords' });
  });

  it('is identical to no memory at all when the store is empty', () => {
    expect(classify('חלב', { memory: [] })).toEqual(classify('חלב'));
  });

  it('survives malformed entries', () => {
    const memory = [null, {}, { signature: 'חלב' }, { categoryId: 'snacks' }];
    expect(classify('חלב', { memory })?.categoryId).toBe('dairy');
  });
});

describe('nameSignature', () => {
  it('collapses every size and percentage onto one entry', () => {
    // Otherwise a shopper would have to correct each carton of milk separately.
    expect(nameSignature('חלב 3% 1 ליטר')).toBe(nameSignature('חלב 1% 2 ליטר'));
  });

  it('keeps word order, because Hebrew leads with the head noun', () => {
    expect(nameSignature('חלב שוקולד')).not.toBe(nameSignature('שוקולד חלב'));
  });

  it('is empty for a name with nothing in it', () => {
    expect(nameSignature('')).toBe('');
    expect(nameSignature(null)).toBe('');
  });
});

describe('what a thing is beats what it tastes of', () => {
  // The largest class of name the classifier used to give up on. Both words
  // scored the same, the margin refused to choose, and the shopper got nothing
  // for a product whose category is obvious to any reader.
  it.each([
    ['מיץ פטל', 'drinks'],
    ['ריבת דובדבן', 'canned'],
    ['רסק עגבניות', 'canned'],
    ['גלידת תות', 'frozen'],
    ['עוגת גבינה', 'bakery'],
  ])('%s is %s', (name, categoryId) => {
    expect(classify(name)?.categoryId).toBe(categoryId);
  });

  it('still loses to a pair that means something else together', () => {
    // Vinegar made from wine is not wine, however much of the word is.
    expect(classify('חומץ יין לבן')?.categoryId).toBe('canned');
  });
});

describe('a label that denies a word is not claiming it', () => {
  it('does not count what a product says it lacks', () => {
    // "סוכריות ללא סוכר" was filed under dry goods on the strength of the very
    // sugar it advertises not having.
    expect(classify('סוכריות ללא סוכר')?.categoryId).toBe('snacks');
  });

  it('does not count a flavour as an ingredient', () => {
    expect(classify('חטיף תפוא בטעם גבינה')?.categoryId).toBe('snacks');
  });

  it('leaves the same word alone when nothing denies it', () => {
    expect(classify('סוכר לבן')?.categoryId).toBe('canned');
    expect(classify('גבינה')?.categoryId).toBe('dairy');
  });
});

describe('Hebrew glues its prepositions to the next word', () => {
  it('reads through a glued preposition', () => {
    // "ג'ל מרוכז לכביסה לבנה" scored nothing for cleaning, because "לכביסה" is
    // one token — and was filed as cheese on the strength of "לבנה".
    expect(classify('ג\'ל מרוכז לכביסה לבנה')?.categoryId).toBe('cleaning');
    expect(classify('שמפו לשיער')?.categoryId).toBe('care');
  });

  it('does not invent a word by shortening one', () => {
    // Stripping a letter only counts when what is left hits the table exactly,
    // so a word that merely begins with one of those letters stays unknown.
    expect(classify('בורדו')).toBeNull();
  });
});

describe("the shops' own abbreviations", () => {
  // Price files abbreviate with a full stop and no space, and `normalize`
  // removes the stop without putting anything back — so "שוק.מריר" arrived as
  // the invented word "שוקמריר" and matched nothing at all. These are among
  // the most common tokens in the whole catalogue.
  it.each([
    ['שוק.מריר 70%', 'snacks'],
    ['גב.עיזים 150 גרם', 'dairy'],
    ['תח.גוף ניוטרוגינה', 'care'],
    ['חט.נייטשר וואלי', 'snacks'],
  ])('%s is %s', (name, categoryId) => {
    expect(classify(name)?.categoryId).toBe(categoryId);
  });

  it('leaves a decimal number alone', () => {
    // Only a stop between two Hebrew letters is split. Splitting every stop
    // would turn "1.5 ליטר" into two numbers and a unit.
    expect(nameSignature('חלב 1.5% 1 ליטר')).toBe(nameSignature('חלב 3% 2 ליטר'));
    expect(classify('חלב 1.5% 1 ליטר')?.categoryId).toBe('dairy');
  });
});

describe('the keyword table itself', () => {
  it('has no two words that fold onto the same stem', () => {
    // A silent, destructive class of bug: the table is a Map keyed by stem, so
    // a second word folding onto an existing key replaces it without a word of
    // complaint. This is how listing "שוקולית" under snacks quietly deleted
    // "שוקו" from drinks — the behaviour test caught it, but only by luck of
    // having a case for that exact drink.
    const seen = new Map();
    const collisions = [];
    for (const word of WRITTEN_WORDS) {
      const key = nameSignature(word);
      // Both halves matter. Two different spellings folding together is the
      // obvious case; the same word written twice is the quieter one, and it
      // is how "קוקטייל" came to be listed as a drink in one place and as an
      // ambiguous word in another, with only the later entry surviving.
      if (seen.has(key)) collisions.push(`${seen.get(key)} / ${word}`);
      seen.set(key, word);
    }
    expect(collisions).toEqual([]);
  });

  it('only ever names categories that exist', () => {
    const known = new Set(BUILT_IN_CATEGORIES.map((category) => category.id));
    const named = new Set();
    for (const scores of KEYWORD_WEIGHTS.values()) Object.keys(scores).forEach((id) => named.add(id));
    for (const combo of COMBOS) Object.keys(combo.scores).forEach((id) => named.add(id));
    for (const id of HEAD_CATEGORIES.values()) named.add(id);

    expect([...named].filter((id) => !known.has(id))).toEqual([]);
  });
});
