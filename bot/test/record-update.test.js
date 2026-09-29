import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeUpdate } from '../src/record-update.js';

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
