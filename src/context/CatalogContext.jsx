import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildIndex } from '../utils/catalogIndex.js';
import { buildSuggestionPool } from '../utils/suggest.js';

const INDEX_FILE = `${import.meta.env.BASE_URL}price-catalog-index.json`;
const CITY_KEY = 'shopping-cart-city';

const CatalogContext = createContext(null);

/**
 * Holds the price catalogue for the selected city.
 *
 * A city catalogue is several megabytes, so it is fetched only when something
 * actually needs it — opening the comparison, or typing in the add-item box.
 * The small index loads up front so the city list is always available.
 */
export function CatalogProvider({ children }) {
  const [index, setIndex] = useState(null);
  const [city, setCityState] = useState(() => {
    try {
      return localStorage.getItem(CITY_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState('idle');
  const [wanted, setWanted] = useState(false);

  const loadIndex = useCallback(async () => {
    setCatalog(null);
    try {
      const response = await fetch(INDEX_FILE, { cache: 'no-store' });
      if (!response.ok) throw new Error('missing');
      const data = await response.json();
      if (!Array.isArray(data?.cities) || data.cities.length === 0) throw new Error('invalid');

      setIndex(data);
      setCityState((current) =>
        data.cities.some((entry) => entry.city === current) ? current : data.cities[0].city,
      );
    } catch {
      setIndex(null);
      setStatus('missing');
    }
  }, []);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    try {
      if (city) localStorage.setItem(CITY_KEY, city);
    } catch {
      /* storage unavailable — the choice still holds for this session */
    }
  }, [city]);

  // Anything that needs product data calls this; the first caller triggers
  // the download and later ones ride along.
  const request = useCallback(() => setWanted(true), []);

  useEffect(() => {
    if (!wanted || !index || !city) return;

    const entry = index.cities.find((item) => item.city === city);
    if (!entry) return;

    let cancelled = false;
    setStatus('loading');
    setCatalog(null);

    fetch(`${import.meta.env.BASE_URL}${entry.file}?v=${index.generatedAt ?? ''}`)
      .then((response) => {
        if (!response.ok) throw new Error('missing');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [index, city, wanted]);

  // Tokenizing ~80k product names is the expensive part, and both the
  // comparison and the autocomplete need it. Doing it once here means the
  // work happens on load rather than twice, on two different screens.
  const chains = useMemo(() => (catalog ? buildIndex(catalog) : []), [catalog]);
  const suggestions = useMemo(() => (catalog ? buildSuggestionPool(catalog) : null), [catalog]);

  const value = useMemo(
    () => ({
      index,
      cities: index ? index.cities.map((entry) => entry.city) : [],
      city,
      setCity: setCityState,
      catalog,
      chains,
      suggestions,
      status,
      request,
      reload: loadIndex,
    }),
    [index, city, catalog, chains, suggestions, status, request, loadIndex],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
