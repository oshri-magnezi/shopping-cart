import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { loadData, saveData } from '../utils/storage.js';
import { reducer } from './reducer.js';

const AppDataContext = createContext(null);

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
