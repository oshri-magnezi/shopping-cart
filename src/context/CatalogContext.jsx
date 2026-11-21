import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createCatalogClient } from '../utils/catalogClient.js';

const INDEX_FILE = `${import.meta.env.BASE_URL}price-catalog-index.json`;
const CITY_KEY = 'shopping-cart-city';

const CatalogContext = createContext(null);
const EMPTY = [];

// One engine for the app's lifetime. Created on first use, so a visit that
// never needs prices never starts a worker.
let sharedClient = null;
const client = () => (sharedClient ??= createCatalogClient());

/** True on a connection the shopper has asked us to go easy on. */
function onMeteredConnection() {
  const connection = navigator.connection;
  return Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? '');
}

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
  // the download and later ones ride along. `need` says which of the two
  // indexes that caller is waiting on — 'chains' for the comparison,
  // 'suggestions' for the add box — so that one is built first.
  const firstNeed = useRef('suggestions');
  const request = useCallback((need = 'suggestions') => {
    firstNeed.current = need;
    setWanted(true);
  }, []);

  // Warm the catalogue while the browser is idle, so the comparison and the
  // autocomplete are ready before they are asked for. The download and the
  // indexing both happen in a worker, so this costs the page nothing — but it
  // does cost data, so not on a connection marked as metered.
  useEffect(() => {
    if (!index || wanted || onMeteredConnection()) return undefined;
    const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 1500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const handle = idle(() => setWanted(true), { timeout: 4000 });
    return () => cancel(handle);
  }, [index, wanted]);

  useEffect(() => {
    if (!wanted || !index || !city) return undefined;

    const entry = index.cities.find((item) => item.city === city);
    if (!entry) return undefined;

    let cancelled = false;
    setStatus('loading');
    setCatalog(null);

    // Absolute, because a worker resolves relative URLs against its own file.
    const url = new URL(
      `${import.meta.env.BASE_URL}${entry.file}?v=${index.generatedAt ?? ''}`,
      window.location.href,
    ).href;

    client()
      .load(url, firstNeed.current)
      .then((loaded) => {
        if (cancelled) return;
        setCatalog(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [index, city, wanted]);

  // The questions the screens ask. Each waits for the catalogue it was asked
  // about; the identity changes with the catalogue, so an effect that depends
  // on one re-runs when the city or the night's prices change.
  const ready = Boolean(catalog);
  const api = useMemo(
    () => ({
      matchItems: (items) => (ready ? client().match(items) : Promise.resolve(null)),
      cheapest: (item) => (ready ? client().cheapest(item) : Promise.resolve(null)),
      suggest: (query, limit) => (ready ? client().suggest(query, limit) : Promise.resolve([])),
      priceHistory: (keys) =>
        ready ? client().priceHistory(keys) : Promise.resolve({ today: null, series: {} }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the catalogue itself
    [catalog],
  );

  const value = useMemo(
    () => ({
      index,
      cities: index ? index.cities.map((entry) => entry.city) : [],
      city,
      setCity: setCityState,
      // The loaded catalogue's date and stores — not its products, which stay
      // with the engine.
      catalog,
      chains: catalog?.chains ?? EMPTY,
      ...api,
      status,
      request,
      reload: loadIndex,
    }),
    [index, city, catalog, api, status, request, loadIndex],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
