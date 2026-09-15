import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildIndexInSlices } from '../utils/catalogIndex.js';
import { buildSuggestionPoolInSlices } from '../utils/suggest.js';

const INDEX_FILE = `${import.meta.env.BASE_URL}price-catalog-index.json`;
const CITY_KEY = 'shopping-cart-city';

const CatalogContext = createContext(null);

/**
 * Hands the main thread back so the browser can paint and read the keyboard.
 *
 * `scheduler.yield` is exactly this and resumes with priority, so the build
 * does not lose its place behind every other pending task; where it is not
 * available a zero timeout does the same job a little less politely.
 */
const breathe = () => {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();

  // Not `setTimeout(0)`. Browsers clamp timers in a backgrounded tab to about
  // a second, which would stretch a build with a dozen yields in it across
  // fifteen seconds — so a shopper returning to the tab would find it still
  // loading. A message port is a task like any other and is not clamped.
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
};

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

  /**
   * Tokenizing ~80k product names is the expensive part, and both the
   * comparison and the autocomplete need it — so it is done once, here.
   *
   * **After paint, and in slices.** As two `useMemo` calls this was about
   * 1.2 seconds of unbroken main-thread work — measured on a mid-range
   * desktop, so several times that on a phone — running inside the render that
   * follows the download. The app locked up exactly when the shopper had
   * started typing in the add box, and their first keystrokes went nowhere.
   *
   * The work is unchanged and so is the result. What changed is when and how
   * it runs: after the browser has painted rather than during the commit, and
   * a chain at a time with a yield in between, so no single task is long
   * enough to be felt. The autocomplete is published before the comparison
   * index starts, because that is the one the shopper is waiting on.
   */
  const [derived, setDerived] = useState({ chains: [], suggestions: null });

  useEffect(() => {
    if (!catalog) {
      setDerived({ chains: [], suggestions: null });
      return undefined;
    }

    let cancelled = false;
    // A macrotask, so this lands after the browser has painted rather than in
    // the commit that scheduled it.
    const handle = setTimeout(async () => {
      const suggestions = await buildSuggestionPoolInSlices(catalog, breathe);
      if (cancelled) return;
      // The autocomplete is what the shopper is waiting on, so publish it
      // before starting the comparison index and let a frame through between.
      setDerived((current) => ({ ...current, suggestions }));

      if (cancelled) return;
      const chains = await buildIndexInSlices(catalog, breathe);
      if (!cancelled) setDerived((current) => ({ ...current, chains }));
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [catalog]);

  const { chains, suggestions } = derived;

  // True between the catalogue arriving and its indexes being ready. Screens
  // that render from `chains` must keep showing progress across that gap, or
  // they flash an empty comparison for a frame or two.
  const indexing = Boolean(catalog) && chains.length === 0;

  const value = useMemo(
    () => ({
      index,
      cities: index ? index.cities.map((entry) => entry.city) : [],
      city,
      setCity: setCityState,
      catalog,
      chains,
      suggestions,
      indexing,
      status,
      request,
      reload: loadIndex,
    }),
    [index, city, catalog, chains, suggestions, indexing, status, request, loadIndex],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
