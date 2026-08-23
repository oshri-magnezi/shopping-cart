import { describe, expect, it } from 'vitest';
import {
  MATCH_THRESHOLD,
  credit,
  leadCategory,
  normalize,
  similarity,
  sizesOf,
  tokenize,
} from './hebrew.js';

/**
 * Every case here is a wrong match that actually reached the screen. The
 * numbers matter less than the side of the threshold they land on, so the
 * assertions are written in those terms wherever possible.
 */

describe('short Hebrew roots do not collide with longer words', () => {
  // "חלב" (milk) is a prefix of both "חלבון" (protein) and "חלבה" (halva).
  it.each(['חלבון', 'חלבה'])('חלב does not match %s', (product) => {
    expect(similarity('חלב', product)).toBe(0);
  });

  it('חלב still matches a real milk carton', () => {
    expect(similarity('חלב', 'חלב תנובה 3% 1 ליטר')).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('applies prefix credit only from five letters up', () => {
    // Long enough that added letters read as an inflection...
    expect(credit('שוקולד', [{ value: 'שוקולדים' }])).toBeGreaterThan(0);
    // ...too short to tell an inflection from an unrelated word.
    expect(credit('חלב', [{ value: 'חלבה' }])).toBe(0);
  });

  it('credits added suffixes only, not substituted letters', () => {
    // Why SYNONYMS has to carry these pairs by hand.
    expect(credit('מלפפון', [{ value: 'מלפפונים' }])).toBe(0);
  });
});

describe('precision keeps a query from matching a superset', () => {
  it('שמן זית does not match שמפו שמן זית', () => {
    expect(similarity('שמן זית', 'שמפו שמן זית')).toBe(0);
  });

  it('שמן זית matches an actual olive oil', () => {
    expect(similarity('שמן זית', 'שמן זית כתית מעולה 750 מל')).toBeGreaterThanOrEqual(
      MATCH_THRESHOLD,
    );
  });
});

describe('a leading category noun is a different product', () => {
  it('rejects גלידת מסקרפונה for מסקרפונה', () => {
    expect(similarity('מסקרפונה', 'גלידת מסקרפונה')).toBe(0);
  });

  it('accepts גבינת מסקרפונה for מסקרפונה', () => {
    expect(similarity('מסקרפונה', 'גבינת מסקרפונה 250 גרם')).toBeGreaterThanOrEqual(
      MATCH_THRESHOLD,
    );
  });

  // "לאבנה עם שמן זית" is a dip, not an oil. Adding a word here is safe by
  // construction: it only rejects when the shopper did not ask for it.
  it('rejects a dish that merely contains the ingredient', () => {
    expect(similarity('שמן זית', 'לאבנה עם שמן זית')).toBe(0);
  });

  it('still finds the dish when it is what was asked for', () => {
    expect(similarity('לאבנה', 'לאבנה עם שמן זית')).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('reads the category off the first token only', () => {
    expect(leadCategory('גלידת מסקרפונה')).toBe('גלידת');
    expect(leadCategory('מסקרפונה גלידת')).toBeNull();
  });
});

describe('unit canonicalization', () => {
  it('treats 1 ליטר and 1000 מל as the same size', () => {
    expect(similarity('חלב 1 ליטר', 'חלב 1000 מל')).toBe(1);
  });

  it('collapses קג to grams', () => {
    expect(sizesOf(tokenize('קמח 1 קג')).get('גרם')).toBe(1000);
  });

  // A stated size is a hard requirement: answering a 1-litre request with a
  // 2-litre carton would silently double that line of the basket.
  it('rejects a different size outright', () => {
    expect(similarity('חלב 1 ליטר', 'חלב 2 ליטר')).toBe(0);
  });

  it('keeps pack counts separate from unit sizes', () => {
    const [token] = tokenize('6*330');
    expect(token.pack).toBe(true);
    expect(token.size).toBeUndefined();
  });
});

describe('promotional decoration', () => {
  // Chains prefix promoted lines with a literal "*מבצע*". The stars stopped
  // that from ever matching the noise word, so 1,572 products in one city
  // carried a junk head token that dragged their precision down.
  it('strips the stars so the promo word can be dropped as noise', () => {
    expect(tokenize('*מבצע* גבינת פקורינו').map((token) => token.value)).toEqual([
      'גבינת',
      'פקורינו',
    ]);
  });

  it('scores a decorated name the same as a plain one', () => {
    expect(similarity('גבינת פקורינו', '*מבצע* גבינת פקורינו')).toBe(
      similarity('גבינת פקורינו', 'גבינת פקורינו'),
    );
  });

  // The same character multiplies a pack count, and the tokenizer needs it.
  it('keeps the star that means multiplication', () => {
    const [token] = tokenize('6*330 מל');
    expect(token.value).toBe('pack6*330');
    expect(token.pack).toBe(true);
  });

  // Chains write the same thing both ways. Missing the spaced form offered a
  // 20-bag multipack at 29.90 to someone who asked for one bag at 4.50.
  it('recognises a pack count written with spaces', () => {
    const [, token] = tokenize('במבה מארז 20 * 15 גרם');
    expect(token.value).toBe('pack20*15');
    expect(token.pack).toBe(true);
  });

  it('ranks the single unit above the multipack', () => {
    expect(similarity('במבה', 'במבה 80 גרם')).toBeGreaterThan(
      similarity('במבה', 'במבה מארז 20 * 15 גרם'),
    );
  });
});

describe('spelling variants', () => {
  it("matches קוטג' to קוטג", () => {
    expect(similarity("קוטג'", 'קוטג 5%')).toBe(1);
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalize('חלב  3%  (טרי)')).toBe('חלב 3% טרי');
  });
});

describe('fat percentage', () => {
  it('penalises a different percentage without rejecting it', () => {
    const wrong = similarity('חלב 3%', 'חלב 1%');
    const right = similarity('חלב 3%', 'חלב 3%');
    expect(wrong).toBeLessThan(right);
  });
});

describe('tokenize contract', () => {
  // Guards the exact regression that blanked the whole app: tokens became
  // objects and suggest.js was still calling string methods on them.
  it('returns objects carrying a value string', () => {
    for (const token of tokenize('חלב תנובה 3% 1 ליטר')) {
      expect(typeof token).toBe('object');
      expect(typeof token.value).toBe('string');
    }
  });

  it('drops noise words that carry no matching signal', () => {
    expect(tokenize('מארז חלב').map((token) => token.value)).toEqual(['חלב']);
  });

  it('flags known brands', () => {
    const brand = tokenize('חלב תנובה').find((token) => token.value === 'תנובה');
    expect(brand.brand).toBe(true);
  });
});
