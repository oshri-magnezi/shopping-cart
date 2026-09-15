import { describe, expect, it } from 'vitest';
import { BUILT_IN_CATEGORIES } from './categories.js';

/**
 * Category icons sit on four different backgrounds — light and dark, selected
 * and not — and only the tile colour changes between them. An icon colour that
 * reads well on the pale tile can vanish on the dark selected one, which is
 * not a case anyone thinks to look at.
 *
 * WCAG 1.4.11 asks 3:1 of a graphical object. These icons are `aria-hidden`
 * and every tile carries a legible text label beside them, so strictly they
 * are decorative and exempt — but "you can't see it" is still true whatever
 * the standard says about it.
 */

const TILE_BACKGROUNDS = {
  // --color-surface-sunken and --color-primary-soft, both themes (tokens.css).
  'light, unselected': '#f2f0ec',
  'light, selected': '#e7efec',
  'dark, unselected': '#0d0b0a',
  'dark, selected': '#1d3833',
};

const MIN_GRAPHIC_CONTRAST = 3;

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

const contrast = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * The seven that were already below the floor when this test was written, on
 * 2026-09-15. Listed rather than fixed: changing them is a change to a palette
 * the owner chose, which is his call and not a thing to slip into a feature
 * branch. The list is here so the number cannot quietly grow.
 */
const KNOWN_BELOW = new Set([
  'bakery|light, unselected',
  'bakery|light, selected',
  'produce|light, unselected',
  'produce|light, selected',
  'meat|dark, selected',
  'canned|dark, selected',
  'drinks|dark, selected',
  'snacks|dark, selected',
  'other|dark, selected',
]);

describe('category icon colours', () => {
  it('adds no new icon that disappears into its tile', () => {
    const failing = [];
    for (const category of BUILT_IN_CATEGORIES) {
      for (const [state, background] of Object.entries(TILE_BACKGROUNDS)) {
        const key = `${category.id}|${state}`;
        if (KNOWN_BELOW.has(key)) continue;
        const ratio = contrast(category.color, background);
        if (ratio < MIN_GRAPHIC_CONTRAST) failing.push(`${key} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failing).toEqual([]);
  });

  it('keeps the known list honest', () => {
    // If one of these is fixed the entry should go, so the list never becomes
    // a place where a real regression can hide behind a stale exemption.
    const stillFailing = [...KNOWN_BELOW].filter((key) => {
      const [id, state] = key.split('|');
      const category = BUILT_IN_CATEGORIES.find((entry) => entry.id === id);
      return category && contrast(category.color, TILE_BACKGROUNDS[state]) < MIN_GRAPHIC_CONTRAST;
    });

    expect(stillFailing).toEqual([...KNOWN_BELOW]);
  });

  it('gives every category a distinct colour', () => {
    const colours = BUILT_IN_CATEGORIES.map((category) => category.color);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
