import {
  CATEGORY_MEMORY_LIMIT,
  createEmptyList,
  createId,
  DEFAULT_WEIGHT,
} from '../utils/storage.js';
import { FALLBACK_CATEGORY_ID } from '../utils/categories.js';

/**
 * Every change the app can make to the shopper's data.
 *
 * It lives in its own module so it can be tested directly. Reaching it through
 * the provider would mean rendering a tree to assert on an array, and the
 * ordering guarantees below are exactly the kind of thing that deserves a
 * plain unit test.
 */
export function reducer(state, action) {
  switch (action.type) {
    case 'rename-list':
      return { ...state, activeList: { ...state.activeList, name: action.name } };

    case 'add-item': {
      const item = {
        id: createId(),
        name: action.name,
        // Set when the shopper picked a real product from the catalogue; it is
        // what lets the comparison match exactly instead of by wording.
        code: action.code ?? '',
        categoryId: action.categoryId,
        quantity: action.quantity,
        // Loose goods are bought by weight, so the amount lives in `weight`
        // (kilograms) and `quantity` stays at 1 rather than meaning two of it.
        unit: action.unit ?? 'unit',
        weight: action.weight ?? DEFAULT_WEIGHT,
        purchased: false,
      };
      return {
        ...state,
        activeList: { ...state.activeList, items: [...state.activeList.items, item] },
      };
    }

    case 'update-item': {
      const items = state.activeList.items.map((item) =>
        item.id === action.id ? { ...item, ...action.changes } : item,
      );
      return { ...state, activeList: { ...state.activeList, items } };
    }

    case 'toggle-item': {
      const items = state.activeList.items.map((item) =>
        item.id === action.id ? { ...item, purchased: !item.purchased } : item,
      );
      return { ...state, activeList: { ...state.activeList, items } };
    }

    case 'change-quantity': {
      const items = state.activeList.items.map((item) =>
        item.id === action.id
          ? { ...item, quantity: Math.max(1, Math.min(99, item.quantity + action.delta)) }
          : item,
      );
      return { ...state, activeList: { ...state.activeList, items } };
    }

    // Weight is set outright rather than nudged by a delta: the stepper
    // already clamps it, and a delta would drift with floating point.
    case 'change-weight': {
      const items = state.activeList.items.map((item) =>
        item.id === action.id ? { ...item, weight: action.weight } : item,
      );
      return { ...state, activeList: { ...state.activeList, items } };
    }

    case 'delete-item': {
      const items = state.activeList.items.filter((item) => item.id !== action.id);
      return { ...state, activeList: { ...state.activeList, items } };
    }

    // Re-adds a past purchase to the active list. Ids are regenerated so the
    // copies are independent of the archived ones (and of each other, if the
    // same purchase is copied twice), and everything starts unchecked.
    case 'copy-purchase': {
      const copied = action.items.map((item) => ({
        ...item,
        id: createId(),
        purchased: false,
      }));
      return {
        ...state,
        activeList: { ...state.activeList, items: [...state.activeList.items, ...copied] },
      };
    }

    /**
     * Removes a category the shopper created and moves anything filed under it
     * back to "other", so no item is left pointing at a category that is gone.
     * History keeps its own copies and is deliberately untouched — a past
     * purchase should still read the way it did on the day.
     */
    case 'delete-custom-category': {
      const items = state.activeList.items.map((item) =>
        item.categoryId === action.id ? { ...item, categoryId: FALLBACK_CATEGORY_ID } : item,
      );
      return {
        ...state,
        activeList: { ...state.activeList, items },
        customCategories: state.customCategories.filter((category) => category.id !== action.id),
        // For the same reason the items above are reassigned: a remembered
        // correction pointing at a category that no longer exists would keep
        // suggesting a shelf the shopper can no longer see.
        categoryMemory: state.categoryMemory.filter((entry) => entry.categoryId !== action.id),
      };
    }

    /**
     * Records which shelf the shopper filed a product on.
     *
     * Last write wins. Moving something is what a shopper does when they mean
     * it, and weighting by how often a category was confirmed would make a
     * settled habit take three corrections to unlearn.
     */
    case 'remember-category': {
      if (!action.signature || !action.categoryId) return state;
      const rest = state.categoryMemory.filter((entry) => entry.signature !== action.signature);
      const next = [
        { signature: action.signature, categoryId: action.categoryId, at: Date.now() },
        ...rest,
      ];
      // Order is the recency, so the cap drops the oldest correction.
      return { ...state, categoryMemory: next.slice(0, CATEGORY_MEMORY_LIMIT) };
    }

    case 'add-custom-category': {
      const category = { id: action.id, nameHe: action.name, nameEn: action.name };
      return { ...state, customCategories: [...state.customCategories, category] };
    }

    // Archives the finished list and starts a fresh, empty one.
    case 'complete-purchase': {
      const purchase = {
        id: state.activeList.id,
        name: state.activeList.name ?? '',
        createdAt: state.activeList.createdAt,
        completedAt: Date.now(),
        totalCost: action.totalCost,
        itemCount: state.activeList.items.length,
        items: state.activeList.items,
      };
      return { ...state, activeList: createEmptyList(), history: [purchase, ...state.history] };
    }

    case 'delete-purchase':
      return { ...state, history: state.history.filter((entry) => entry.id !== action.id) };

    /**
     * Puts a deleted item back where it was.
     *
     * The index matters. Dropping it on the end would technically undo the
     * deletion while visibly reordering the list, and the shopper would have
     * to hunt for the thing they just rescued. Splicing is clamped because the
     * list may legitimately have changed while the undo bar was up.
     */
    case 'restore-item': {
      const items = [...state.activeList.items];
      const at = Math.min(Math.max(0, action.index ?? items.length), items.length);
      items.splice(at, 0, action.item);
      return { ...state, activeList: { ...state.activeList, items } };
    }

    case 'restore-purchase': {
      const history = [...state.history];
      const at = Math.min(Math.max(0, action.index ?? history.length), history.length);
      history.splice(at, 0, action.entry);
      return { ...state, history };
    }

    default:
      return state;
  }
}
