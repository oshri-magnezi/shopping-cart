import { describe, expect, it } from 'vitest';
import he from './he.json';
import en from './en.json';

/**
 * Both languages take the singular at one, so "1 פריטים" and "1 items" are
 * equally wrong. A key opts into plural handling by defining `key_one`.
 */
describe('plural forms', () => {
  const pluralised = ['history.itemsLabel', 'live.comparisonReady'];

  it.each(pluralised)('%s has both forms in both languages', (key) => {
    for (const dict of [he, en]) {
      expect(dict[`${key}_one`]).toBeTruthy();
      expect(dict[`${key}_other`]).toBeTruthy();
      // The bare key must be gone, or it would silently win the lookup.
      expect(dict[key]).toBeUndefined();
    }
  });

  it('keeps the singular free of a count placeholder in Hebrew', () => {
    expect(he['history.itemsLabel_one']).not.toContain('{count}');
  });

  it('selects the singular at one and the plural above it', () => {
    const rules = new Intl.PluralRules('he');
    expect(rules.select(1)).toBe('one');
    expect(rules.select(3)).toBe('other');
  });
});

describe('dictionaries', () => {
  // A key present in one language and missing in the other renders as the raw
  // key on screen, which is invisible until someone switches language.
  it('define exactly the same keys', () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders in every string', () => {
    const holders = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(he)) {
      expect(holders(en[key]), `placeholders differ for ${key}`).toEqual(holders(he[key]));
    }
  });
});
