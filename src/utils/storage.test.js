import { beforeEach, describe, expect, it } from 'vitest';
import {
  CATEGORY_MEMORY_LIMIT,
  createEmptyList,
  createId,
  loadData,
  saveData,
} from './storage.js';

const KEY = 'shopping-cart-data';

beforeEach(() => localStorage.clear());

describe('loadData', () => {
  it('returns a valid empty shape when nothing is stored', () => {
    const data = loadData();
    expect(data.activeList.items).toEqual([]);
    expect(data.customCategories).toEqual([]);
    expect(data.history).toEqual([]);
  });

  // A corrupted entry must never be able to break the app on start-up.
  it.each(['not json at all', '{"activeList":', 'null', '[]', '"a string"'])(
    'falls back to a fresh state for %s',
    (raw) => {
      localStorage.setItem(KEY, raw);
      const data = loadData();
      expect(Array.isArray(data.activeList.items)).toBe(true);
      expect(Array.isArray(data.history)).toBe(true);
    },
  );

  it('drops items that are not shaped like items', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ activeList: { items: [{ name: 'חלב' }, null, { quantity: 2 }] } }),
    );
    expect(loadData().activeList.items).toHaveLength(1);
  });

  // Lists saved before a field existed must keep working rather than being
  // thrown away — the shopper's list is the one thing that cannot be rebuilt.
  it('migrates items saved before barcodes existed', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ activeList: { items: [{ name: 'חלב', quantity: 1 }] } }),
    );
    expect(loadData().activeList.items[0].code).toBe('');
  });

  it('keeps a name that is already stored', () => {
    localStorage.setItem(KEY, JSON.stringify({ activeList: { name: 'שבת', items: [] } }));
    expect(loadData().activeList.name).toBe('שבת');
  });

  it('substitutes an empty name when the stored one is not a string', () => {
    localStorage.setItem(KEY, JSON.stringify({ activeList: { name: 42, items: [] } }));
    expect(loadData().activeList.name).toBe('');
  });
});

describe('saveData', () => {
  it('round-trips through storage', () => {
    const data = loadData();
    data.activeList.items.push({ id: createId(), name: 'לחם', code: '', quantity: 2 });
    saveData(data);
    expect(loadData().activeList.items[0].name).toBe('לחם');
  });

  it('survives storage being unavailable', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveData(loadData())).not.toThrow();
    Storage.prototype.setItem = original;
  });
});

describe('createId', () => {
  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, createId));
    expect(ids.size).toBe(500);
  });
});

describe('createEmptyList', () => {
  it('starts unnamed, empty and timestamped', () => {
    const list = createEmptyList();
    expect(list.name).toBe('');
    expect(list.items).toEqual([]);
    expect(typeof list.createdAt).toBe('number');
  });
});

/**
 * The learned categories are the only part of the saved state written by
 * inference rather than by a direct action, so a malformed entry here would
 * come back as a confident wrong suggestion rather than as visible damage.
 */
describe('categoryMemory', () => {
  const store = (categoryMemory) =>
    localStorage.setItem(KEY, JSON.stringify({ activeList: createEmptyList(), categoryMemory }));

  it('is empty for anything saved before suggestions existed', () => {
    localStorage.setItem(KEY, JSON.stringify({ activeList: createEmptyList() }));
    expect(loadData().categoryMemory).toEqual([]);
  });

  it('drops entries that cannot be used', () => {
    store([
      { signature: 'חלב', categoryId: 'dairy' },
      null,
      { signature: 'לחם' },
      { categoryId: 'bakery' },
      { signature: '', categoryId: 'bakery' },
      { signature: 'ביצים', categoryId: 7 },
    ]);

    expect(loadData().categoryMemory).toEqual([{ signature: 'חלב', categoryId: 'dairy' }]);
  });

  it('caps a store that grew past the limit', () => {
    store(Array.from({ length: 500 }, (_, i) => ({ signature: `p${i}`, categoryId: 'other' })));

    const { categoryMemory } = loadData();
    expect(categoryMemory).toHaveLength(CATEGORY_MEMORY_LIMIT);
    // The front of the array is the most recent, so the cap keeps the front.
    expect(categoryMemory[0].signature).toBe('p0');
  });

  it('survives a round trip', () => {
    const entries = [{ signature: 'חלב', categoryId: 'dairy', at: 1 }];
    saveData({ ...loadData(), categoryMemory: entries });

    expect(loadData().categoryMemory).toEqual(entries);
  });

  it('ignores a store that is not a list at all', () => {
    store({ 'חלב': 'dairy' });
    expect(loadData().categoryMemory).toEqual([]);
  });
});
