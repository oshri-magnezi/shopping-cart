import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, RefreshCw, Scale, Trophy } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import { buildIndex, findInChain } from '../utils/catalogIndex.js';
import './ComparePage.css';

// Written by the price bot: an index of cities, each with its own catalogue
// file. Prices are per branch, so the city decides which file to load.
const INDEX_FILE = `${import.meta.env.BASE_URL}price-catalog-index.json`;
const PREFS_KEY = 'shopping-cart-compare-prefs';
const SORT_MODES = ['cheapest', 'dearest', 'found', 'name'];

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY));
    return {
      city: typeof raw?.city === 'string' ? raw.city : '',
      excluded: Array.isArray(raw?.excluded) ? raw.excluded : [],
      sortBy: SORT_MODES.includes(raw?.sortBy) ? raw.sortBy : 'cheapest',
    };
  } catch {
    return { city: '', excluded: [], sortBy: 'cheapest' };
  }
}

const round = (value) => Math.round(value * 100) / 100;

export function ComparePage() {
  const { t, locale } = useTranslation();
  const { activeList } = useAppData();

  const [index, setIndex] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState('loading');
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences still apply this session */
    }
  }, [prefs]);

  async function loadIndex() {
    setStatus('loading');
    try {
      const response = await fetch(INDEX_FILE, { cache: 'no-store' });
      if (!response.ok) throw new Error('missing');
      const data = await response.json();
      if (!Array.isArray(data?.cities) || data.cities.length === 0) throw new Error('invalid');
      setIndex(data);
      setPrefs((prev) => ({
        ...prev,
        city: data.cities.some((entry) => entry.city === prev.city)
          ? prev.city
          : data.cities[0].city,
      }));
    } catch {
      setIndex(null);
      setStatus('missing');
    }
  }

  useEffect(() => {
    loadIndex();
  }, []);

  // Each city is a separate download, fetched only when it is chosen.
  useEffect(() => {
    if (!index || !prefs.city) return;
    const entry = index.cities.find((city) => city.city === prefs.city);
    if (!entry) return;

    let cancelled = false;
    setStatus('loading');
    setCatalog(null);

    fetch(`${import.meta.env.BASE_URL}${entry.file}`)
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
  }, [index, prefs.city]);

  // Indexing tens of thousands of products takes a moment, so it happens once
  // per city catalogue rather than on every render.
  const indexed = useMemo(() => (catalog ? buildIndex(catalog) : []), [catalog]);

  const cities = useMemo(() => (index ? index.cities.map((entry) => entry.city) : []), [index]);

  const excluded = useMemo(() => new Set(prefs.excluded), [prefs.excluded]);

  const selected = useMemo(
    () => indexed.filter((chain) => !excluded.has(chain.key)),
    [indexed, excluded],
  );

  const items = activeList.items;

  // The heart of the page: every cart line priced at every selected chain.
  const table = useMemo(() => {
    if (selected.length === 0 || items.length === 0) return null;

    const lines = items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      prices: selected.map((chain) => findInChain(chain, item.name)),
    }));

    const sharedFlags = lines.map((line) => line.prices.every(Boolean));

    const totals = selected.map((chain, chainIndex) => {
      let full = 0;
      let shared = 0;
      let found = 0;

      lines.forEach((line, lineIndex) => {
        const match = line.prices[chainIndex];
        if (!match) return;
        full += match.price * line.quantity;
        found += 1;
        if (sharedFlags[lineIndex]) shared += match.price * line.quantity;
      });

      return {
        key: chain.key,
        displayName: chain.displayName,
        storeName: chain.storeName,
        fullTotal: round(full),
        sharedTotal: round(shared),
        foundCount: found,
      };
    });

    const ranked = [...totals].sort((a, b) => a.sharedTotal - b.sharedTotal);

    return {
      lines,
      totals: sortTotals(totals, prefs.sortBy),
      sharedCount: sharedFlags.filter(Boolean).length,
      winner: ranked[0] ?? null,
      savings: ranked.length > 1 ? round(ranked[1].sharedTotal - ranked[0].sharedTotal) : 0,
      chains: selected,
    };
  }, [selected, items, prefs.sortBy]);

  function toggleChain(key) {
    setPrefs((prev) => {
      const next = new Set(prev.excluded);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, excluded: [...next] };
    });
  }

  return (
    <main className="page">
      <div className="compare-header">
        <div>
          <h1 className="compare-title">{t('compare.title')}</h1>
          <p className="compare-subtitle">{t('compare.subtitle')}</p>
        </div>
      </div>

      {status === 'loading' ? <p className="compare-loading">{t('compare.loading')}</p> : null}

      {status === 'missing' ? (
        <EmptyState icon={Scale} title={t('compare.emptyTitle')} text={t('compare.emptyText')} />
      ) : null}

      {catalog ? (
        <>
          <div className="compare-meta">
            <span className="tabular">
              {t('compare.updatedAt', { date: formatDateTime(catalog.generatedAt, locale) })}
            </span>
            <button type="button" className="compare-refresh" onClick={loadIndex}>
              <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
              {t('compare.refreshData')}
            </button>
          </div>

          <section className="compare-filters">
            <label className="city-picker">
              <span className="city-picker-label">
                <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                {t('compare.cityLabel')}
              </span>
              <select
                value={prefs.city}
                onChange={(event) => setPrefs((prev) => ({ ...prev, city: event.target.value }))}
              >
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>

            <div className="chain-chips" role="group" aria-label={t('compare.filterTitle')}>
              {indexed.map((chain) => {
                const active = !excluded.has(chain.key);
                return (
                  <button
                    type="button"
                    key={chain.key}
                    className={`chain-chip${active ? ' chain-chip-on' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleChain(chain.key)}
                  >
                    <span className="chain-chip-box" aria-hidden="true">
                      {active ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    {chain.displayName}
                  </button>
                );
              })}
            </div>

            <div className="compare-filters-controls">
              <button
                type="button"
                className="compare-link"
                onClick={() => setPrefs((prev) => ({ ...prev, excluded: [] }))}
              >
                {t('compare.selectAll')}
              </button>
              <label className="compare-sort">
                <span>{t('compare.sortBy')}</span>
                <select
                  value={prefs.sortBy}
                  onChange={(event) =>
                    setPrefs((prev) => ({ ...prev, sortBy: event.target.value }))
                  }
                >
                  <option value="cheapest">{t('compare.sortCheapest')}</option>
                  <option value="dearest">{t('compare.sortDearest')}</option>
                  <option value="found">{t('compare.sortMostFound')}</option>
                  <option value="name">{t('compare.sortName')}</option>
                </select>
              </label>
            </div>
          </section>

          {items.length === 0 ? (
            <p className="compare-none">{t('compare.emptyCart')}</p>
          ) : selected.length === 0 ? (
            <p className="compare-none">{t('compare.noneSelected')}</p>
          ) : table ? (
            <>
              {table.winner && table.sharedCount > 0 ? (
                <div className="compare-winner">
                  <span className="compare-winner-icon" aria-hidden="true">
                    <Trophy size={22} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="compare-winner-name">
                      {t('compare.winner', { chain: table.winner.displayName })}
                    </p>
                    <p className="compare-winner-savings">
                      {table.savings > 0
                        ? t('compare.savings', {
                            amount: formatCurrency(table.savings, locale),
                          })
                        : t('compare.basketOf', { count: table.sharedCount })}
                    </p>
                  </div>
                  <span className="compare-winner-total tabular">
                    {formatCurrency(table.winner.sharedTotal, locale)}
                  </span>
                </div>
              ) : null}

              <ChainTable table={table} items={items} locale={locale} t={t} />
              <Breakdown table={table} locale={locale} t={t} />
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function sortTotals(totals, sortBy) {
  const copy = [...totals];
  if (sortBy === 'name') return copy.sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  if (sortBy === 'found') return copy.sort((a, b) => b.foundCount - a.foundCount);
  if (sortBy === 'dearest') return copy.sort((a, b) => b.sharedTotal - a.sharedTotal);
  return copy.sort((a, b) => a.sharedTotal - b.sharedTotal);
}

function ChainTable({ table, items, locale, t }) {
  // With nothing common to every chain the shared column would read ₪0 for
  // all of them, which says nothing — so it is dropped rather than shown.
  const showShared = table.sharedCount > 0;

  return (
    <section className="compare-section">
      <div className="compare-section-header">
        <h2>{t('compare.resultsTitle')}</h2>
        <span className="compare-section-sub">
          {t('compare.basketSummary', { found: table.sharedCount, total: items.length })}
        </span>
      </div>

      <div className="chain-table" role="table">
        <div className="chain-table-head" role="row">
          <span role="columnheader">{t('compare.chain')}</span>
          {showShared ? (
            <span role="columnheader" className="col-num">
              {t('compare.sharedBasket')}
            </span>
          ) : null}
          <span role="columnheader" className="col-num">
            {t('compare.fullBasket')}
          </span>
          <span role="columnheader" className="col-num">
            {t('compare.found')}
          </span>
        </div>

        {table.totals.map((row) => (
          <div
            key={row.key}
            role="row"
            className={`chain-table-row${
              table.winner && row.key === table.winner.key && showShared ? ' chain-table-best' : ''
            }`}
          >
            <span role="cell" className="chain-cell">
              <span className="chain-cell-name">{row.displayName}</span>
              {row.storeName ? (
                <span className="chain-cell-store">{row.storeName}</span>
              ) : null}
            </span>
            {showShared ? (
              <span role="cell" className="col-num tabular chain-cell-shared">
                {formatCurrency(row.sharedTotal, locale)}
              </span>
            ) : null}
            <span role="cell" className="col-num tabular">
              {formatCurrency(row.fullTotal, locale)}
            </span>
            <span role="cell" className="col-num tabular chain-cell-found">
              {row.foundCount}/{items.length}
            </span>
          </div>
        ))}
      </div>

      <p className="compare-note">
        {showShared ? t('compare.sharedNote') : t('compare.noSharedNote')}
      </p>
    </section>
  );
}

function Breakdown({ table, locale, t }) {
  return (
    <section className="compare-section">
      <div className="compare-section-header">
        <h2>{t('compare.itemsTitle')}</h2>
      </div>

      <ul className="breakdown">
        {table.lines.map((line, index) => {
          const found = line.prices.filter(Boolean);
          const cheapest = found.length > 0 ? Math.min(...found.map((m) => m.price)) : null;

          return (
            <li key={`${line.name}-${index}`} className="breakdown-item">
              <div className="breakdown-head">
                <h3 className="breakdown-name">{line.name}</h3>
                {line.quantity > 1 ? (
                  <span className="breakdown-qty tabular">×{line.quantity}</span>
                ) : null}
                {found.length === 0 ? (
                  <span className="breakdown-none">{t('compare.notFoundAnywhere')}</span>
                ) : null}
              </div>

              {found.length > 0 ? (
                <ul className="breakdown-prices">
                  {table.chains.map((chain, chainIndex) => {
                    const match = line.prices[chainIndex];
                    if (!match) return null;
                    const best = match.price === cheapest;
                    return (
                      <li
                        key={chain.key}
                        className={`breakdown-price${best ? ' breakdown-price-best' : ''}`}
                      >
                        <span className="breakdown-chain">{chain.displayName}</span>
                        <span className="breakdown-product">{match.name}</span>
                        <span className="breakdown-amount tabular">
                          {formatCurrency(match.price, locale)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
