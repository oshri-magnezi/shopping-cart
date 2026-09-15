import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareCatalogues } from '../src/verify-catalog.js';

const index = (cities) => ({ schema: 3, cities });
const city = (name, chains) => ({
  city: name,
  chains: chains.map(([key, productCount]) => ({ key, displayName: key, productCount })),
});

// Six chains, so a third of them is two — enough room to tell "one went quiet"
// apart from "an outage".
const six = (counts) =>
  city('תל אביב', Object.entries(counts).map(([key, n]) => [key, n]));
const full = { a: 6000, b: 6000, c: 6000, d: 6000, e: 6000, f: 6000 };

describe('compareCatalogues', () => {
  it('publishes a run that held on to everything', () => {
    const after = { ...full, a: 6100, b: 5900 };
    assert.equal(compareCatalogues(index([six(full)]), index([six(after)])).ok, true);
  });

  it('publishes when one chain simply did not answer', () => {
    // The night this was written for: one shop out of six went quiet, and the
    // strict version held three weeks of prices back over it.
    const after = { ...full };
    delete after.f;

    const { ok, notes } = compareCatalogues(index([six(full)]), index([six(after)]));
    assert.equal(ok, true);
    assert.match(notes[0], /f/);
  });

  it('still publishes when a chain is lost and another is gained', () => {
    const after = { ...full, newchain: 5000 };
    delete after.f;

    assert.equal(compareCatalogues(index([six(full)]), index([six(after)])).ok, true);
  });

  it('refuses when a third of a city goes quiet at once', () => {
    const after = { ...full };
    delete after.e;
    delete after.f;
    delete after.d;

    const { ok, problems } = compareCatalogues(index([six(full)]), index([six(after)]));
    assert.equal(ok, false);
    assert.match(problems[0], /went quiet/);
  });

  it('refuses a truncated chain however small the shortfall list', () => {
    // Missing data drops out of the comparison; truncated data is published as
    // fact and quietly misprices a basket. Only one chain is affected here and
    // it is still a hard stop.
    const after = { ...full, c: 900 };

    const { ok, problems } = compareCatalogues(index([six(full)]), index([six(after)]));
    assert.equal(ok, false);
    assert.match(problems[0], /truncated/);
  });

  it('accepts ordinary night-to-night movement', () => {
    const after = Object.fromEntries(Object.keys(full).map((k) => [k, 5700]));
    assert.equal(compareCatalogues(index([six(full)]), index([six(after)])).ok, true);
  });

  it('refuses a city left with too few chains to compare', () => {
    const before = city('חיפה', [['a', 100], ['b', 100], ['c', 100]]);
    const after = city('חיפה', [['a', 100], ['b', 100]]);

    const { ok, problems } = compareCatalogues(index([before]), index([after]));
    assert.equal(ok, false);
    assert.match(problems[0], /too few/);
  });

  it('refuses a run that lost a city', () => {
    const before = index([six(full), city('חיפה', [['a', 100], ['b', 100], ['c', 100]])]);
    const after = index([six(full)]);

    const { ok, problems } = compareCatalogues(before, after);
    assert.equal(ok, false);
    assert.match(problems[0], /חיפה/);
  });

  it('never objects to growth', () => {
    const after = index([
      six({ ...full, g: 9000 }),
      city('אשדוד', [['a', 4000], ['b', 4000], ['c', 4000]]),
    ]);

    assert.equal(compareCatalogues(index([six(full)]), after).ok, true);
  });

  it('publishes the first run, when there is no baseline to lose', () => {
    const after = index([six(full)]);

    assert.equal(compareCatalogues(null, after).ok, true);
    assert.equal(compareCatalogues(index([]), after).ok, true);
  });

  it('refuses an empty result outright, baseline or not', () => {
    assert.equal(compareCatalogues(null, index([])).ok, false);
    assert.equal(compareCatalogues(null, null).ok, false);
  });
});
