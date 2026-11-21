import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeUpdate, missingStores } from '../src/record-update.js';

describe('describeUpdate', () => {
  const text = describeUpdate({ generatedAt: '2026-09-29T01:47:00.000Z' }, [
    { city: 'תל אביב', stores: 10, products: 115211 },
    { city: 'חיפה', stores: 9, products: 96000 },
  ]);

  // The run happens at night UTC; the date and time are Israel's, or the
  // file would say the prices are from yesterday.
  it('gives the date and time in Israel', () => {
    assert.match(text, /29\.9\.2026/);
    assert.match(text, /04:47/);
  });

  it('lists every city with its stores and products', () => {
    assert.match(text, /- תל אביב: 10 חנויות, 115,211 מוצרים/);
    assert.match(text, /- חיפה: 9 חנויות, 96,000 מוצרים/);
  });
});

describe('missingStores', () => {
  const index = (stores) => ({
    cities: [{ city: 'חיפה', chains: stores.map((displayName) => ({ displayName })) }],
  });

  it("counts a store that was on the site and is not in tonight's catalogue", () => {
    assert.deepEqual(missingStores(index(['שופרסל', 'אושר עד']), index(['שופרסל'])), [
      { city: 'חיפה', name: 'אושר עד', nights: 1 },
    ]);
  });

  it('keeps counting from the previous file once the store has left the site', () => {
    const first = describeUpdate(
      { generatedAt: '2026-11-15T07:00:00Z' },
      [],
      [{ city: 'חיפה', name: 'אושר עד', nights: 2 }],
    );
    // Last night's catalogue no longer lists it; only the file remembers.
    const missing = missingStores(index(['שופרסל']), index(['שופרסל']), first);
    assert.deepEqual(missing, [{ city: 'חיפה', name: 'אושר עד', nights: 3 }]);
    assert.match(
      describeUpdate({ generatedAt: '2026-11-16T07:00:00Z' }, [], missing),
      /לילה 3 ברצף/,
    );
  });

  it('forgets a store the night it comes back', () => {
    const first = describeUpdate(
      { generatedAt: '2026-11-15T07:00:00Z' },
      [],
      [{ city: 'חיפה', name: 'אושר עד', nights: 2 }],
    );
    assert.deepEqual(missingStores(index(['שופרסל']), index(['שופרסל', 'אושר עד']), first), []);
  });

  it('says nothing about a city that is new tonight', () => {
    assert.deepEqual(missingStores({ cities: [] }, index(['שופרסל'])), []);
  });
});
