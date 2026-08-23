import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, RefreshCw, Trophy } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.jsx';
import { CompareSkeleton } from '../components/CompareSkeleton.jsx';
import { BalanceArt } from '../components/EmptyArt.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatCurrency, formatDateTime, formatWeight } from '../utils/format.js';
import { findByCode, findInChain } from '../utils/catalogIndex.js';
import { useCatalog } from '../context/CatalogContext.jsx';
import './ComparePage.css';

const PREFS_KEY = 'shopping-cart-compare-prefs';
const SORT_MODES = ['cheapest', 'dearest', 'found', 'name'];

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY));
    return {
      excluded: Array.isArray(raw?.excluded) ? raw.excluded : [],
      sortBy: SORT_MODES.includes(raw?.sortBy) ? raw.sortBy : 'cheapest',
    };
  } catch {
    return { excluded: [], sortBy: 'cheapest' };
  }
}

const round = (value) => Math.round(value * 100) / 100;

export function ComparePage() {
  const { t, locale } = useTranslation();
  const { activeList } = useAppData();

  const { cities, city, setCity, catalog, chains: indexed, status, request, reload } = useCatalog();
  const [prefs, setPrefs] = useState(loadPrefs);

  // The comparison always needs product data, unlike the add-item box.
  useEffect(() => {
    request();
  }, [request]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences still apply this session */
    }
  }, [prefs]);

  const excluded = useMemo(() => new Set(prefs.excluded), [prefs.excluded]);

  const selected = useMemo(
    () => indexed.filter((chain) => !excluded.has(chain.key)),
    [indexed, excluded],
  );

  const items = activeList.items;

  // The heart of the page: every cart line priced at every selected chain.
  const table = useMemo(() => {
    if (selected.length === 0 || items.length === 0) return null;

    const lines = items.map((item) => {
      const byWeight = item.unit === 'kg';
      // Loose goods are priced per kilogram, so the line is the weight the
      // shopper asked for; everything else multiplies by the count.
      const amount = byWeight ? (item.weight ?? 0) : item.quantity;

      // A barcode identifies the same product at every chain, so it is looked
      // up directly. Only free text has to be guessed.
      const prices = selected.map((chain) => {
        // With a barcode the answer is exact, and a miss means the chain
        // genuinely does not stock it — unless the catalogue predates
        // barcodes entirely, in which case text is all we have.
        if (item.code && chain.hasCodes) return findByCode(chain, item.code);
        return findInChain(chain, item.name, { unit: byWeight ? 1 : 0 });
      });
      const exact = Boolean(item.code) && selected.every((chain) => chain.hasCodes) && prices.some(Boolean);

      // A threefold spread for one product usually means different products
      // were matched — but only when matching was by wording. With a barcode
      // the gap is a genuine price difference and must not be flagged.
      const values = prices.filter(Boolean).map((match) => match.price);
      const spread = values.length > 1 ? Math.max(...values) / Math.min(...values) : 1;

      return {
        name: item.name,
        quantity: item.quantity,
        byWeight,
        weight: item.weight,
        amount,
        prices,
        exact,
        suspect: !exact && spread >= 3,
      };
    });

    const sharedFlags = lines.map((line) => line.prices.every(Boolean));

    const totals = selected.map((chain, chainIndex) => {
      let full = 0;
      let shared = 0;
      let found = 0;

      lines.forEach((line, lineIndex) => {
        const match = line.prices[chainIndex];
        if (!match) return;
        full += match.price * line.amount;
        found += 1;
        if (sharedFlags[lineIndex]) shared += match.price * line.amount;
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

      {/* 'idle' still means work is pending — the index has not arrived yet —
          so it must show progress rather than an empty page. */}
      {!catalog && status !== 'missing' ? (
        <CompareSkeleton label={t('compare.loading')} />
      ) : null}

      {status === 'missing' ? (
        <EmptyState art={BalanceArt} title={t('compare.emptyTitle')} text={t('compare.emptyText')} />
      ) : null}

      {catalog ? (
        <>
          <div className="compare-meta">
            <span className="tabular">
              {t('compare.updatedAt', { date: formatDateTime(catalog.generatedAt, locale) })}
            </span>
            <button type="button" className="compare-refresh" onClick={reload}>
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
              <select value={city} onChange={(event) => setCity(event.target.value)}>
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

  // A chain stocking none of the list totals ₪0, which would otherwise make it
  // the cheapest on the page. Empty chains sort last whichever way the price
  // sort runs, because they are not really in the running at all.
  const byPrice = sortBy === 'dearest'
    ? (a, b) => b.sharedTotal - a.sharedTotal
    : (a, b) => a.sharedTotal - b.sharedTotal;

  return copy.sort((a, b) => {
    const aEmpty = a.foundCount === 0;
    const bEmpty = b.foundCount === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    return byPrice(a, b);
  });
}

function ChainTable({ table, items, locale, t }) {
  // The like-for-like column earns its place only when it says something the
  // total does not. With nothing common to every chain it would read ₪0 for
  // all of them; with everything common it merely repeats the total.
  const showShared = table.sharedCount > 0 && table.sharedCount < items.length;

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
          <span role="columnheader" className="col-name">{t('compare.chain')}</span>
          {showShared ? (
            <span role="columnheader" className="col-num col-shared">
              {t('compare.sharedBasket')}
            </span>
          ) : null}
          <span role="columnheader" className="col-num col-total">
            {t('compare.fullBasket')}
          </span>
          <span role="columnheader" className="col-num col-found">
            {t('compare.found')}
          </span>
        </div>

        {table.totals.map((row) => (
          <div
            key={row.key}
            role="row"
            className={`chain-table-row${
              table.winner && row.key === table.winner.key && table.sharedCount > 0
                ? ' chain-table-best'
                : ''
            }`}
          >
            <span role="cell" className="col-name chain-cell">
              <span className="chain-cell-name">{row.displayName}</span>
              {row.storeName ? (
                <span className="chain-cell-store">{row.storeName}</span>
              ) : null}
            </span>
            {showShared ? (
              <span role="cell" className="col-num col-shared">
                {/* The column header labels this on a wide screen; once the row
                    becomes a card there is no header left to do the job. */}
                <span className="cell-label">{t('compare.sharedBasket')}</span>
                <span className="cell-figure tabular" dir="ltr">
                  {formatCurrency(row.sharedTotal, locale)}
                </span>
              </span>
            ) : null}
            <span role="cell" className="col-num col-total">
              <span className="cell-label">{t('compare.fullBasket')}</span>
              {/* ₪0 would read as "free here" rather than "nothing on your
                  list is stocked here", which is what it actually means. */}
              {row.foundCount === 0 ? (
                <span className="cell-figure cell-figure-empty">{t('compare.unavailable')}</span>
              ) : (
                <span className="cell-figure tabular" dir="ltr">
                  {formatCurrency(row.fullTotal, locale)}
                </span>
              )}
            </span>
            <span role="cell" className="col-num col-found">
              <span className="cell-label">{t('compare.found')}</span>
              <span className="cell-figure tabular" dir="ltr">
                {row.foundCount}/{items.length}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* When every item was found everywhere the two figures agree, and an
          explanation of the difference would invent a distinction. */}
      {table.sharedCount < items.length ? (
        <p className="compare-note">
          {showShared ? t('compare.sharedNote') : t('compare.noSharedNote')}
        </p>
      ) : null}
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
                {line.byWeight ? (
                  <span className="breakdown-qty tabular">{formatWeight(line.weight, t)}</span>
                ) : line.quantity > 1 ? (
                  <span className="breakdown-qty tabular">×{line.quantity}</span>
                ) : null}
                {found.length === 0 ? (
                  <span className="breakdown-none">{t('compare.notFoundAnywhere')}</span>
                ) : null}
                {/* `title` only ever reaches a mouse. The same words repeat
                    in hidden text so a screen reader, and a phone with no
                    hover at all, still get the explanation. */}
                {line.exact ? (
                  <span className="breakdown-exact" title={t('compare.exactMatchHint')}>
                    {t('compare.exactMatch')}
                    <span className="sr-only"> — {t('compare.exactMatchHint')}</span>
                  </span>
                ) : null}
                {line.suspect ? (
                  <span className="breakdown-warn" title={t('compare.suspectHint')}>
                    {t('compare.suspect')}
                    <span className="sr-only"> — {t('compare.suspectHint')}</span>
                  </span>
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
                        <span className="breakdown-product">
                          {match.name}
                          {match.promo ? (
                            <span
                              className="promo-tag"
                              title={t(match.promo === 1 ? 'compare.promoPriceHint' : 'compare.promoHint')}
                            >
                              {t(match.promo === 1 ? 'compare.promoPrice' : 'compare.promo')}
                              <span className="sr-only">
                                {' — '}
                                {t(match.promo === 1 ? 'compare.promoPriceHint' : 'compare.promoHint')}
                              </span>
                            </span>
                          ) : null}
                        </span>
                        <span className="breakdown-amount tabular" dir="ltr">
                          {/* A per-kilogram figure has to say so, or it reads
                              as the price of what is actually being bought. */}
                          {line.byWeight
                            ? t('compare.perKg', { price: formatCurrency(match.price, locale) })
                            : formatCurrency(match.price, locale)}
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
