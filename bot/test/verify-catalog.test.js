import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareCatalogues } from '../src/verify-catalog.js';

const index = (cities) => ({ schema: 3, cities });
const city = (name, chains) => ({
  city: name,
  chains: chains.map(([key, productCount]) => ({ key, displayName: key, productCount })),
});

describe('compareCatalogues', () => {
  it('publishes a run that held on to everything', () => {
    const before = index([city('תל אביב', [['shufersal', 6000], ['ramilevi', 14000]])]);
    const after = index([city('תל אביב', [['shufersal', 6100], ['ramilevi', 13900]])]);

    assert.equal(compareCatalogues(before, after).ok, true);
  });

  it('refuses a run that lost a chain', () => {
    // The failure this whole file exists for: the bot is fail-soft, so a chain
    // that would not answer simply is not there, and the run still succeeds.
    const before = index([city('תל אביב', [['shufersal', 6000], ['ramilevi', 14000]])]);
    const after = index([city('תל אביב', [['shufersal', 6000]])]);

    const { ok, problems } = compareCatalogues(before, after);
    assert.equal(ok, false);
    assert.match(problems[0], /ramilevi/);
  });

  it('refuses a run that lost a city', () => {
    const before = index([city('תל אביב', [['shufersal', 6000]]), city('חיפה', [['shufersal', 5000]])]);
    const after = index([city('תל אביב', [['shufersal', 6000]])]);

    const { ok, problems } = compareCatalogues(before, after);
    assert.equal(ok, false);
    assert.match(problems[0], /חיפה/);
  });

  it('refuses a chain whose catalogue collapsed', () => {
    // A truncated download, not a price change.
    const before = index([city('תל אביב', [['shufersal', 6000]])]);
    const after = index([city('תל אביב', [['shufersal', 900]])]);

    assert.equal(compareCatalogues(before, after).ok, false);
  });

  it('accepts ordinary night-to-night movement', () => {
    const before = index([city('תל אביב', [['shufersal', 6000]])]);
    const after = index([city('תל אביב', [['shufersal', 5700]])]);

    assert.equal(compareCatalogues(before, after).ok, true);
  });

  it('never objects to growth', () => {
    const before = index([city('תל אביב', [['shufersal', 6000]])]);
    const after = index([
      city('תל אביב', [['shufersal', 9000], ['newchain', 100]]),
      city('אשדוד', [['shufersal', 4000]]),
    ]);

    assert.equal(compareCatalogues(before, after).ok, true);
  });

  it('publishes the first run, when there is no baseline to lose', () => {
    const after = index([city('תל אביב', [['shufersal', 6000]])]);

    assert.equal(compareCatalogues(null, after).ok, true);
    assert.equal(compareCatalogues(index([]), after).ok, true);
  });

  it('refuses an empty result outright, baseline or not', () => {
    assert.equal(compareCatalogues(null, index([])).ok, false);
    assert.equal(compareCatalogues(null, null).ok, false);
  });
});
