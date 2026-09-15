import { describe, expect, it } from 'vitest';
import { reducer } from './reducer.js';

const item = (id, name) => ({
  id,
  name,
  code: '',
  categoryId: 'other',
  quantity: 1,
  unit: 'unit',
  weight: 0.5,
  purchased: false,
});

const stateWith = (items, categoryMemory = []) => ({
  activeList: { id: 'l', name: 'x', createdAt: 0, items },
  customCategories: [],
  history: [],
  categoryMemory,
});

const names = (state) => state.activeList.items.map((entry) => entry.name);

describe('restore-item', () => {
  it('puts an item back exactly where it was', () => {
    const before = stateWith([item('a', 'חלב'), item('b', 'לחם'), item('c', 'ביצים')]);
    const removed = before.activeList.items[1];

    const afterDelete = reducer(before, { type: 'delete-item', id: 'b' });
    expect(names(afterDelete)).toEqual(['חלב', 'ביצים']);

    const restored = reducer(afterDelete, { type: 'restore-item', item: removed, index: 1 });
    expect(names(restored)).toEqual(['חלב', 'לחם', 'ביצים']);
  });

  it('restores the first item to the front, not the back', () => {
    const before = stateWith([item('a', 'חלב'), item('b', 'לחם')]);
    const removed = before.activeList.items[0];
    const afterDelete = reducer(before, { type: 'delete-item', id: 'a' });

    const restored = reducer(afterDelete, { type: 'restore-item', item: removed, index: 0 });
    expect(names(restored)).toEqual(['חלב', 'לחם']);
  });

  // The undo offer stands for several seconds, and the list can change while
  // it does. A stale index must land the item somewhere sane rather than throw
  // or silently drop it.
  it('clamps an index that no longer fits the list', () => {
    const removed = item('b', 'לחם');
    const shrunk = stateWith([item('a', 'חלב')]);

    const restored = reducer(shrunk, { type: 'restore-item', item: removed, index: 9 });
    expect(names(restored)).toEqual(['חלב', 'לחם']);
  });

  it('does not mutate the state it was given', () => {
    const before = stateWith([item('a', 'חלב')]);
    const snapshot = before.activeList.items;

    reducer(before, { type: 'restore-item', item: item('b', 'לחם'), index: 0 });
    expect(snapshot).toHaveLength(1);
    expect(before.activeList.items).toBe(snapshot);
  });
});

describe('restore-purchase', () => {
  const purchase = (id, cost) => ({
    id,
    name: id,
    createdAt: 0,
    completedAt: 0,
    totalCost: cost,
    itemCount: 0,
    items: [],
  });

  it('puts a purchase back in its place in the series', () => {
    const before = {
      ...stateWith([]),
      history: [purchase('p1', 100), purchase('p2', 200), purchase('p3', 300)],
    };
    const removed = before.history[1];

    const afterDelete = reducer(before, { type: 'delete-purchase', id: 'p2' });
    expect(afterDelete.history.map((p) => p.id)).toEqual(['p1', 'p3']);

    const restored = reducer(afterDelete, {
      type: 'restore-purchase',
      entry: removed,
      index: 1,
    });
    expect(restored.history.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

/**
 * The learned store is what lets the app suggest a shelf the shopper invented,
 * so its ordering is the feature: the array is the recency, and the cap has to
 * drop the oldest correction rather than the newest one.
 */
describe('remember-category', () => {
  const entry = (signature, categoryId) => ({ signature, categoryId });
  const remember = (state, signature, categoryId) =>
    reducer(state, { type: 'remember-category', signature, categoryId });

  it('puts the newest correction at the front', () => {
    const before = stateWith([], [entry('לחם', 'bakery')]);
    const after = remember(before, 'חלב', 'dairy');

    expect(after.categoryMemory.map((e) => e.signature)).toEqual(['חלב', 'לחם']);
  });

  it('replaces a product rather than filing it twice', () => {
    // Moving something is a correction, not a second opinion.
    const before = stateWith([], [entry('חלב', 'dairy')]);
    const after = remember(before, 'חלב', 'snacks');

    expect(after.categoryMemory).toHaveLength(1);
    expect(after.categoryMemory[0].categoryId).toBe('snacks');
  });

  it('drops the oldest correction once it is full', () => {
    const full = Array.from({ length: 200 }, (_, i) => entry(`p${i}`, 'other'));
    const after = remember(stateWith([], full), 'חדש', 'dairy');

    expect(after.categoryMemory).toHaveLength(200);
    expect(after.categoryMemory[0].signature).toBe('חדש');
    expect(after.categoryMemory.some((e) => e.signature === 'p199')).toBe(false);
    expect(after.categoryMemory.some((e) => e.signature === 'p198')).toBe(true);
  });

  it.each([
    ['an empty signature', '', 'dairy'],
    ['no category', 'חלב', ''],
  ])('ignores %s', (_label, signature, categoryId) => {
    const before = stateWith([], [entry('לחם', 'bakery')]);
    expect(remember(before, signature, categoryId)).toBe(before);
  });
});

describe('delete-custom-category', () => {
  it('forgets what was filed under it', () => {
    // Otherwise the store keeps recommending a shelf that is no longer there.
    const before = stateWith([item('a', 'חלב')], [
      { signature: 'חלב', categoryId: 'mine' },
      { signature: 'לחם', categoryId: 'bakery' },
    ]);
    const after = reducer(before, { type: 'delete-custom-category', id: 'mine' });

    expect(after.categoryMemory.map((e) => e.signature)).toEqual(['לחם']);
  });
});

describe('complete-purchase', () => {
  it('keeps the learned categories when the list is archived', () => {
    // The basket is finished; what the shopper taught the app is not.
    const before = stateWith([item('a', 'חלב')], [{ signature: 'חלב', categoryId: 'dairy' }]);
    const after = reducer(before, { type: 'complete-purchase', totalCost: 12 });

    expect(after.categoryMemory).toHaveLength(1);
  });
});
