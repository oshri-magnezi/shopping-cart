import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyList, createId, loadData, saveData } from './storage.js';

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
