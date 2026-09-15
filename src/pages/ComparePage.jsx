import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, MapPin, RefreshCw } from 'lucide-react';
import { AnimatedCurrency } from '../components/AnimatedCurrency.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { GroupedList } from '../components/GroupedList.jsx';
import { CompareSkeleton } from '../components/CompareSkeleton.jsx';
import { BalanceArt } from '../components/EmptyArt.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatCurrency, formatDateTime, formatWeight } from '../utils/format.js';
import { findByCode, findInChain } from '../utils/catalogIndex.js';
import { compareBaskets } from '../utils/basket.js';
import { useCatalog } from '../context/CatalogContext.jsx';
import './ComparePage.css';

const PREFS_KEY = 'shopping-cart-compare-prefs';

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY));
    return { excluded: Array.isArray(raw?.excluded) ? raw.excluded : [] };
  } catch {
    return { excluded: [] };
  }
}

export function ComparePage() {
  const { t, locale } = useTranslation();
  const { activeList } = useAppData();

  const { cities, city, setCity, catalog, chains: indexed, indexing, status, request, reload } =
    useCatalog();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

    const { rows, maxFound, winner, runnerUp, savings } = compareBaskets(lines, selected);

    return {
      lines,
      rows,
      maxFound,
      winner,
      runnerUp,
      savings,
      chains: selected,
    };
  }, [selected, items]);

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
      <header className="compare-header">
        <h1 className="compare-title">{t('compare.title')}</h1>
        <p className="compare-subtitle">{t('compare.subtitle')}</p>
      </header>

      {/* 'idle' still means work is pending — the index has not arrived yet —
          so it must show progress rather than an empty page. `indexing` covers
          the gap after it: the catalogue is here but has not been tokenized
          yet, and rendering from an empty index would flash "0 chains". */}
      {(!catalog || indexing) && status !== 'missing' ? (
        <CompareSkeleton label={t('compare.loading')} />
      ) : null}

      {status === 'missing' ? (
        <EmptyState art={BalanceArt} title={t('compare.emptyTitle')} text={t('compare.emptyText')} />
      ) : null}

      {catalog && !indexing ? (
        <>
          {/* Collapsed by default. Expanded, this panel used to fill half a
              phone screen before a single price was visible; the answer has to
              come first and the controls second. */}
          <section className={`filter${filtersOpen ? ' filter-open' : ''}`}>
            <button
              type="button"
              className="filter-summary"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="filter-summary-text">
                {t('compare.filterSummary', {
                  city,
                  count: selected.length,
                  total: indexed.length,
                })}
              </span>
              <span className="filter-summary-action">{t('compare.filterEdit')}</span>
              <ChevronDown className="filter-chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>

            {/* Always mounted so its height can be animated in both
                directions; `inert` keeps the collapsed controls out of the tab
                order and away from screen readers. */}
            <div className="filter-collapse" inert={filtersOpen ? undefined : ''}>
              <div className="filter-clip">
                <div className="filter-body">
                <label className="city-picker">
                  <span className="city-picker-label">{t('compare.cityLabel')}</span>
                  <select value={city} onChange={(event) => setCity(event.target.value)}>
                    {cities.map((name) => (
                      <option key={name} value={name}>
                        {name}
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
                          {active ? <Check size={11} strokeWidth={3} /> : null}
                        </span>
                        {chain.displayName}
                      </button>
                    );
                  })}
                </div>

                <div className="filter-controls">
                  <button
                    type="button"
                    className="compare-link"
                    onClick={() => setPrefs((prev) => ({ ...prev, excluded: [] }))}
                  >
                    {t('compare.selectAll')}
                  </button>
                </div>

                <div className="filter-meta">
                  <span>{t('compare.updatedAt', { date: formatDateTime(catalog.generatedAt, locale) })}</span>
                  <button type="button" className="compare-link" onClick={reload}>
                    <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
                    {t('compare.refreshData')}
                  </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {items.length === 0 ? (
            <p className="compare-none">{t('compare.emptyCart')}</p>
          ) : selected.length === 0 ? (
            <p className="compare-none">{t('compare.noneSelected')}</p>
          ) : table ? (
            <>
              {/* The answer, before anything that qualifies it. One figure,
                  larger than everything else on the page, in the only accent
                  colour this screen is allowed to spend. */}
              {table.winner ? (
                <div className="lead">
                  <p className="lead-label">{t('compare.cheapestLabel')}</p>
                  <h2 className="lead-chain">{table.winner.displayName}</h2>
                  {/* What you would actually pay there, for everything it
                      stocks — not a subtotal of some shared remainder. */}
                  <AnimatedCurrency
                    className="lead-total tabular"
                    value={table.winner.total}
                    locale={locale}
                  />
                  <p className="lead-coverage">
                    {table.maxFound === items.length
                      ? t('compare.coverageAll')
                      : t('compare.coverageSome', { found: table.maxFound, total: items.length })}
                  </p>
                  {table.savings > 0 && table.runnerUp ? (
                    <p className="lead-note">
                      {t('compare.savingsVs', {
                        amount: formatCurrency(table.savings, locale),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Two readings of the same figures. On a wide screen they sit
                  side by side and the ladder sticks, so the ranking stays in
                  view while the per-item detail — much the longer of the two —
                  scrolls past it. */}
              <div className="compare-columns">
                <ChainLadder table={table} items={items} locale={locale} t={t} />
                <Breakdown table={table} locale={locale} t={t} />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

/**
 * Every chain as one flat row, descending. The rows are deliberately identical
 * in weight: the winner has already been named above, and repeating that
 * emphasis seven times would leave the page with no hierarchy at all.
 */
function ChainLadder({ table, items, locale, t }) {
  return (
    <GroupedList
      label={t('compare.resultsTitle')}
      meta={
        <>
          <span aria-hidden="true" dir="ltr">
            {table.maxFound}/{items.length}
          </span>
          <span className="sr-only">
            {t('compare.coverageSome', { found: table.maxFound, total: items.length })}
          </span>
        </>
      }
    >
      <div className="ladder stagger" role="table" aria-label={t('compare.resultsTitle')}>
        {/* The column names still exist for assistive technology; on screen the
            row labels its own figures, so a header strip is dead weight. */}
        <div role="row" className="sr-only">
          <span role="columnheader">{t('compare.chain')}</span>
          <span role="columnheader">{t('compare.fullBasket')}</span>
          <span role="columnheader">{t('compare.found')}</span>
        </div>

        {table.rows.map((row, position) => {
          const best = table.winner && row.key === table.winner.key;
          const empty = row.foundCount === 0;
          // Ranked below the leaders because it stocks less of the list, not
          // because it is expensive. The break says which.
          const partial = !empty && row.foundCount < table.maxFound;
          const firstPartial =
            partial && (position === 0 || table.rows[position - 1].foundCount === table.maxFound);

          return (
            <Fragment key={row.key}>
              {firstPartial ? (
                <p className="ladder-divider">{t('compare.partialGroup')}</p>
              ) : null}
              <div
                role="row"
                className={`grouped-row ladder-row${best ? ' ladder-row-best' : ''}${
                  empty ? ' ladder-row-empty' : ''
                }`}
              >
                <span role="cell" className="ladder-chain">
                  <span className="ladder-chain-name">{row.displayName}</span>
                  <span className="ladder-chain-sub">
                    {row.storeName ? <span>{row.storeName}</span> : null}
                    {/* Only worth saying when something is missing. When every
                        chain has the whole list — the ordinary case — a column
                        of identical 4/4 is noise you have to read past. */}
                    {row.foundCount < items.length ? (
                      <span className="ladder-missing tabular" dir="ltr">
                        {row.foundCount}/{items.length}
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {t('compare.coverageSome', { found: row.foundCount, total: items.length })}
                    </span>
                  </span>
                </span>

                <span role="cell" className="ladder-figures">
                  {/* ₪0 would read as "free here" rather than "nothing on your
                      list is stocked here", which is what it actually means. */}
                  {empty ? (
                    <span className="ladder-total ladder-total-empty">
                      {t('compare.unavailable')}
                    </span>
                  ) : (
                    <AnimatedCurrency
                      className="ladder-total tabular"
                      value={row.total}
                      locale={locale}
                    />
                  )}
                  {/* Plain money, and only against a basket holding the same
                      items. The leader has nothing to be more expensive than. */}
                  {row.overLeader > 0 ? (
                    <span className="ladder-level">
                      {t('compare.overLeader', { amount: formatCurrency(row.overLeader, locale) })}
                    </span>
                  ) : null}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <p className="compare-note grouped-block">{t('compare.indexNote')}</p>
    </GroupedList>
  );
}

function Breakdown({ table, locale, t }) {
  return (
    <GroupedList label={t('compare.itemsTitle')}>
      {table.lines.map((line, index) => {
        const found = line.prices.filter(Boolean);
        const cheapest = found.length > 0 ? Math.min(...found.map((m) => m.price)) : null;

        return (
          <div key={`${line.name}-${index}`} className="breakdown-item">
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
              {/* `title` only ever reaches a mouse. The same words repeat in
                  hidden text so a screen reader, and a phone with no hover at
                  all, still get the explanation. */}
              {line.exact ? (
                <span className="tag tag-exact" title={t('compare.exactMatchHint')}>
                  {t('compare.exactMatch')}
                  <span className="sr-only"> — {t('compare.exactMatchHint')}</span>
                </span>
              ) : null}
              {line.suspect ? (
                <span className="tag tag-warn" title={t('compare.suspectHint')}>
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
                            className="tag tag-promo"
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
                        {/* A per-kilogram figure has to say so, or it reads as
                            the price of what is actually being bought. */}
                        {line.byWeight
                          ? t('compare.perKg', { price: formatCurrency(match.price, locale) })
                          : formatCurrency(match.price, locale)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </GroupedList>
  );
}
