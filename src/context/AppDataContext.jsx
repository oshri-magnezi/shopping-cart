import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { createEmptyList, createId, loadData, saveData } from '../utils/storage.js';

const AppDataContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'add-item': {
      const item = {
        id: createId(),
        name: action.name,
        categoryId: action.categoryId,
        quantity: action.quantity,
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

    case 'delete-item': {
      const items = state.activeList.items.filter((item) => item.id !== action.id);
      return { ...state, activeList: { ...state.activeList, items } };
    }

    case 'add-custom-category': {
      const category = { id: action.id, nameHe: action.name, nameEn: action.name };
      return { ...state, customCategories: [...state.customCategories, category] };
    }

    // Archives the finished list and starts a fresh, empty one.
    case 'complete-purchase': {
      const purchase = {
        id: state.activeList.id,
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

    default:
      return state;
  }
}

export function AppDataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadData);

  useEffect(() => {
    saveData(state);
  }, [state]);

  const value = useMemo(() => ({ ...state, dispatch }), [state]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
}
