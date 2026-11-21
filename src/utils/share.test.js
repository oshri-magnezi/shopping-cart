import { describe, expect, it } from 'vitest';
import { decodeList, encodeList, listAsText } from './share.js';
import { favorites } from './favorites.js';

const item = (name, extra = {}) => ({
  id: name,
  name,
  code: '',
  categoryId: 'dairy',
  quantity: 1,
  unit: 'unit',
  weight: 0.5,
  purchased: false,
  ...extra,
});

const encodeRaw = (value) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('sharing a list by link', () => {
  it('survives the round trip, Hebrew and all', () => {
    const list = {
      name: 'קניות לשבת',
      items: [
        item('חלב תנובה 3% 1 ליטר', { code: '7290000000011', quantity: 2 }),
        item('עגבניות', { unit: 'kg', weight: 1.5, categoryId: 'produce' }),
      ],
    };
    const decoded = decodeList(encodeList(list));
    expect(decoded.name).toBe('קניות לשבת');
    expect(decoded.items).toEqual([
      {
        name: 'חלב תנובה 3% 1 ליטר',
        code: '7290000000011',
        categoryId: 'dairy',
        quantity: 2,
        unit: 'unit',
        weight: 0.5,
      },
      { name: 'עגבניות', code: '', categoryId: 'produce', quantity: 1, unit: 'kg', weight: 1.5 },
    ]);
  });

  it('produces text that is safe in a URL', () => {
    expect(encodeList({ name: '', items: [item('חלב??>>')] })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // A link is something anyone can write. None of these may throw, and none
  // may get a value into the list that the app itself would not allow.
  it.each([
    ['nothing', ''],
    ['not base64', '!!!***'],
    ['not JSON', btoa('hello')],
    ['the wrong shape', encodeRaw({ v: 1, i: 'items' })],
    ['another version', encodeRaw({ v: 2, i: [['חלב']] })],
    ['only unusable rows', encodeRaw({ v: 1, i: [[42], null, ['   ']] })],
    ['a non-string', undefined],
    ['an oversized link', 'A'.repeat(70_000)],
  ])('rejects %s', (_, encoded) => {
    expect(decodeList(encoded)).toBeNull();
  });

  it('forces every field into the range the app allows', () => {
    const decoded = decodeList(
      encodeRaw({
        v: 1,
        n: 'x'.repeat(500),
        i: [
          ['  <img src=x onerror=alert(1)>  ', 'abc; DROP', 'nope', 5000, 1, -3],
          ['b'.repeat(300), '729', 'dairy', 'two', 0, 'NaN'],
        ],
      }),
      { isCategory: (id) => id === 'dairy', fallbackCategory: 'other' },
    );
    expect(decoded.name).toHaveLength(80);
    expect(decoded.items[0]).toEqual({
      // Kept as text — React escapes it — but trimmed like any other name.
      name: '<img src=x onerror=alert(1)>',
      code: '',
      categoryId: 'other',
      quantity: 99,
      unit: 'kg',
      weight: 0.05,
    });
    expect(decoded.items[1]).toMatchObject({
      code: '729',
      categoryId: 'dairy',
      quantity: 1,
      weight: 0.5,
    });
    expect(decoded.items[1].name).toHaveLength(80);
  });

  it('reads back the longest list it will write', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item(`${'מוצר ארוך מאוד '.repeat(10)}${i}`),
    );
    const decoded = decodeList(encodeList({ name: 'x', items }));
    expect(decoded.items).toHaveLength(150);
    expect(decoded.items[0].name.length).toBeLessThanOrEqual(80);
  });

  it('caps how many items a link can add', () => {
    const rows = Array.from({ length: 400 }, (_, i) => [`פריט ${i}`, '', 'dairy', 1, 0, 0]);
    expect(decodeList(encodeRaw({ v: 1, i: rows })).items).toHaveLength(150);
  });
});

describe('listAsText', () => {
  it('groups the items under their categories', () => {
    const text = listAsText({
      title: 'רשימת קניות',
      groups: [
        { label: 'מוצרי חלב', items: [item('חלב', { quantity: 2 }), item('קוטג')] },
        { label: 'ירקות', items: [item('עגבניות')] },
      ],
      amountOf: (entry) => (entry.quantity > 1 ? `×${entry.quantity}` : ''),
    });
    expect(text).toBe('רשימת קניות\n\nמוצרי חלב:\n- חלב (×2)\n- קוטג\n\nירקות:\n- עגבניות');
  });
});

describe('favorites', () => {
  const purchase = (...names) => ({ items: names.map((name) => item(name)) });

  it('lists what keeps coming back, most habitual first', () => {
    const history = [
      purchase('חלב', 'לחם'),
      purchase('חלב', 'ביצים'),
      purchase('חלב', 'לחם'),
      purchase('שמפו'),
    ];
    expect(favorites(history).map((entry) => entry.name)).toEqual(['חלב', 'לחם']);
  });

  it('needs two purchases — twice in one basket is not a habit', () => {
    expect(favorites([purchase('חלב', 'חלב')])).toEqual([]);
  });

  it('leaves out what is already on the list', () => {
    const history = [purchase('חלב', 'לחם'), purchase('חלב', 'לחם')];
    expect(favorites(history, [item('חלב')]).map((entry) => entry.name)).toEqual(['לחם']);
  });

  it('knows a product by its barcode whatever it was called', () => {
    const history = [
      { items: [item('חלב תנובה', { code: '7290000000011' })] },
      { items: [item('חלב 3% תנובה 1 ליטר', { code: '7290000000011' })] },
    ];
    const [regular] = favorites(history);
    // As it was bought most recently.
    expect(regular).toMatchObject({ name: 'חלב תנובה', code: '7290000000011' });
  });

  it('favours recent habits over old ones', () => {
    const history = [
      purchase('חדש'),
      purchase('חדש'),
      purchase('א'),
      purchase('ב'),
      purchase('ישן'),
      purchase('ישן'),
    ];
    expect(favorites(history, [], 1)[0].name).toBe('חדש');
  });
});
