import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cheapest, dayOf, updateHistory, WINDOW_DAYS } from '../src/price-history.js';

const MILK = '7290000000011';
const BREAD = '7290000000028';
const catalogue = (generatedAt, ...chains) => ({
  city: 'תל אביב',
  generatedAt,
  chains: chains.map((products, i) => ({ key: `c${i}`, products })),
});
const night = (n) => new Date(Date.UTC(2026, 10, n, 7)).toISOString();

describe('cheapest', () => {
  it('takes the lowest price of a barcode across the stores', () => {
    const prices = cheapest(
      catalogue(
        night(1),
        [['חלב', 6.9, MILK]],
        [
          ['חלב', 6.5, MILK],
          ['לחם', 7, BREAD],
        ],
      ),
    );
    assert.deepEqual(
      [...prices],
      [
        [MILK, 6.5],
        [BREAD, 7],
      ],
    );
  });

  it('ignores in-store codes and keeps per-kilogram prices apart', () => {
    const prices = cheapest(
      catalogue(night(1), [
        ['לימון', 5, '14296'],
        ['גבינה', 80, MILK, 0, 1],
        ['גבינה ארוזה', 12, MILK],
      ]),
    );
    assert.deepEqual(
      [...prices],
      [
        [`${MILK}k`, 80],
        [MILK, 12],
      ],
    );
  });
});

describe('updateHistory', () => {
  it('records nothing for a price that did not move', () => {
    const before = catalogue(night(1), [['חלב', 6.9, MILK]]);
    const after = catalogue(night(2), [['חלב', 6.9, MILK]]);
    assert.deepEqual(updateHistory(null, before, after).items, {});
  });

  it('starts a series at the old price the first time a price moves', () => {
    const before = catalogue(night(1), [['חלב', 6.9, MILK]]);
    const after = catalogue(night(2), [['חלב', 6.5, MILK]]);
    const today = dayOf(night(2));
    assert.deepEqual(updateHistory(null, before, after).items, {
      [MILK]: [
        [today - 1, 6.9],
        [today, 6.5],
      ],
    });
  });

  it('adds a point only when the price moves again', () => {
    let history = updateHistory(
      null,
      catalogue(night(1), [['חלב', 6.9, MILK]]),
      catalogue(night(2), [['חלב', 6.5, MILK]]),
    );
    history = updateHistory(
      history,
      catalogue(night(2), [['חלב', 6.5, MILK]]),
      catalogue(night(3), [['חלב', 6.5, MILK]]),
    );
    assert.equal(history.items[MILK].length, 2);
    history = updateHistory(
      history,
      catalogue(night(3), [['חלב', 6.5, MILK]]),
      catalogue(night(4), [['חלב', 7.2, MILK]]),
    );
    assert.deepEqual(
      history.items[MILK].map(([, price]) => price),
      [6.9, 6.5, 7.2],
    );
  });

  it("replaces the day's point when run twice in one day", () => {
    const before = catalogue(night(1), [['חלב', 6.9, MILK]]);
    let history = updateHistory(null, before, catalogue(night(2), [['חלב', 6.5, MILK]]));
    // A second run the same day, against a live site that now shows 6.5.
    history = updateHistory(
      history,
      catalogue(night(2), [['חלב', 6.5, MILK]]),
      catalogue(night(2), [['חלב', 6.4, MILK]]),
    );
    assert.deepEqual(
      history.items[MILK].map(([, price]) => price),
      [6.9, 6.4],
    );
  });

  it('does not invent a change for a product that is new tonight', () => {
    const history = updateHistory(
      null,
      catalogue(night(1), []),
      catalogue(night(2), [['חלב', 6.5, MILK]]),
    );
    assert.deepEqual(history.items, {});
  });

  it('forgets what is older than the window, keeping the price it opened at', () => {
    const today = dayOf(night(20));
    const old = {
      schema: 1,
      items: {
        [MILK]: [
          [today - 200, 5],
          [today - 100, 6],
          [today - 10, 6.5],
        ],
        [BREAD]: [
          [today - 200, 7],
          [today - 150, 8],
        ],
      },
    };
    const same = catalogue(night(20), [
      ['חלב', 6.5, MILK],
      ['לחם', 8, BREAD],
    ]);
    const history = updateHistory(old, same, same);
    // Milk: the point before the window stays as its opening price.
    assert.deepEqual(history.items[MILK], [
      [today - 100, 6],
      [today - 10, 6.5],
    ]);
    // Bread has not moved inside the window at all.
    assert.equal(history.items[BREAD], undefined);
    assert.ok(WINDOW_DAYS < 100);
  });

  it('starts over from a history it does not understand', () => {
    const same = catalogue(night(2), [['חלב', 6.5, MILK]]);
    assert.deepEqual(updateHistory({ schema: 99, items: { x: [[1, 1]] } }, same, same).items, {});
  });
});

describe('dayOf', () => {
  it('uses the Israeli calendar day', () => {
    // 22:30 UTC is already tomorrow in Israel.
    assert.equal(dayOf('2026-11-15T22:30:00.000Z'), dayOf('2026-11-16T08:00:00.000Z'));
  });
});
