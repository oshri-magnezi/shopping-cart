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

const stateWith = (items) => ({
  activeList: { id: 'l', name: 'x', createdAt: 0, items },
  customCategories: [],
  history: [],
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
