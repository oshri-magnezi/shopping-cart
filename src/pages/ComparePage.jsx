import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, MapPin, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { CityPicker } from '../components/CityPicker.jsx';
import { CurrencyText } from '../components/CurrencyText.jsx';
import { RollingCurrency } from '../components/RollingCurrency.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { GroupedList } from '../components/GroupedList.jsx';
import { CompareSkeleton } from '../components/CompareSkeleton.jsx';
import { BalanceArt } from '../components/EmptyArt.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatCurrency, formatFreshness, formatWeight } from '../utils/format.js';
import { useFlipList } from '../utils/motion.js';
import { historyKey, stepPoints, trendOf } from '../utils/trend.js';
import { bestSplit, compareBaskets } from '../utils/basket.js';
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

  const {
    cities,
    city,
    setCity,
    catalog,
    chains: indexed,
    matchItems,
    priceHistory,
    status,
    request,
    reload,
  } = useCatalog();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The comparison always needs product data, unlike the add-item box.
  useEffect(() => {
    request('chains');
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

  // What the engine is asked: only what identifies a product. Quantities and
  // weights are left out, so tapping a stepper re-prices the table here
  // without another round trip.
  const wantedKey = JSON.stringify(items.map((item) => [item.name, item.code ?? '', item.unit]));
  const wanted = useMemo(
    () =>
      JSON.parse(wantedKey).map(([name, code, unit]) => ({
        name,
        code,
        unit: unit === 'kg' ? 1 : 0,
      })),
    [wantedKey],
  );

  // Every item priced at every store of the city, from the catalogue engine.
  // `for` remembers which question the answer belongs to, so a stale answer
  // is never drawn against a newer list.
  const [matched, setMatched] = useState(null);
  useEffect(() => {
    let cancelled = false;
    matchItems(wanted).then((prices) => {
      if (!cancelled && prices) setMatched({ for: wanted, chains: indexed, prices });
    });
    return () => {
      cancelled = true;
    };
  }, [matchItems, wanted, indexed]);
  const matches = matched && matched.for === wanted && matched.chains === indexed ? matched : null;

  // The heart of the page: every cart line priced at every selected chain.
  const table = useMemo(() => {
    if (!matches || selected.length === 0 || items.length === 0) return null;
    const chainAt = selected.map((chain) => indexed.indexOf(chain));

    const lines = items.map((item, itemIndex) => {
      const byWeight = item.unit === 'kg';
      // Loose goods are priced per kilogram, so the line is the weight the
      // shopper asked for; everything else multiplies by the count.
      const amount = byWeight ? (item.weight ?? 0) : item.quantity;

      const prices = chainAt.map((chainIndex) => matches.prices[itemIndex][chainIndex]);
      // With a barcode the answer is exact — unless a store's catalogue
      // predates barcodes, in which case text is all there was to go on.
      const exact =
        Boolean(item.code) && selected.every((chain) => chain.hasCodes) && prices.some(Boolean);

      // A threefold spread for one product usually means different products
      // were matched — but only when matching was by wording. With a barcode
      // the gap is a genuine price difference and must not be flagged.
      const values = prices.filter(Boolean).map((match) => match.price);
      const spread = values.length > 1 ? Math.max(...values) / Math.min(...values) : 1;

      // Whose price history to show: the product itself when it has a
      // barcode, otherwise the cheapest product the wording matched.
      const cheapestMatch = prices
        .filter(Boolean)
        .reduce((low, match) => (low === null || match.price < low.price ? match : low), null);
      const trendKey = item.code
        ? historyKey(item.code, byWeight ? 1 : 0)
        : historyKey(cheapestMatch?.code, cheapestMatch?.unit);

      return {
        name: item.name,
        quantity: item.quantity,
        byWeight,
        weight: item.weight,
        amount,
        prices,
        exact,
        suspect: !exact && spread >= 3,
        trendKey,
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
      split: bestSplit(lines, selected, winner),
      chains: selected,
    };
  }, [matches, selected, indexed, items]);

  // The price history of what is on the list, asked for once the table is
  // there — a small file, read in the worker, needed by nothing above it.
  const trendKeys = table ? table.lines.map((line) => line.trendKey).join('|') : '';
  const [history, setHistory] = useState({ today: null, series: {} });
  useEffect(() => {
    if (!trendKeys) return undefined;
    let cancelled = false;
    priceHistory(trendKeys.split('|').filter(Boolean)).then((found) => {
      if (!cancelled) setHistory(found);
    });
    return () => {
      cancelled = true;
    };
  }, [priceHistory, trendKeys]);

  // Prices are on their way: the catalogue is loading, or it has loaded and
  // this list has not been priced against it yet.
  const pricing = items.length > 0 && !matches;

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
        <h1 className="compare-title" data-large-title>
          {t('compare.title')}
        </h1>
        <p className="compare-subtitle">{t('compare.subtitle')}</p>
      </header>

      {/* 'idle' still means work is pending — the index has not arrived yet —
          so it must show progress rather than an empty page. `pricing` covers
          the gap after it: the catalogue is here but this list has not been
          priced against it yet. */}
      {(!catalog || pricing) && status !== 'missing' ? (
        <CompareSkeleton label={t('compare.loading')} />
      ) : null}

      {status === 'missing' ? (
        // Written for the shopper, who can do nothing about a missing file but
        // can check their connection and ask again. It used to tell them to
        // run the price bot.
        <EmptyState art={BalanceArt} title={t('compare.emptyTitle')} text={t('compare.emptyText')}>
          <button type="button" className="btn btn-secondary" onClick={reload}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
            {t('compare.retry')}
          </button>
        </EmptyState>
      ) : null}

      {catalog && !pricing ? (
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
                  // Isolated (FSI … PDI, both invisible). A Hebrew city inside
                  // an English sentence otherwise drags the neighbouring
                  // numbers into its own direction, and the line read
                  // "6 · תל אביב of 6 chains".
                  city: `⁨${city}⁩`,
                  count: selected.length,
                  total: indexed.length,
                })}
              </span>
              <span className="filter-summary-action">{t('compare.filterEdit')}</span>
              <ChevronDown
                className="filter-chevron"
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>

            {/* Always mounted so its height can be animated in both
                directions; `inert` keeps the collapsed controls out of the tab
                order and away from screen readers. */}
            <div className="filter-collapse" inert={filtersOpen ? undefined : ''}>
              <div className="filter-clip">
                <div className="filter-body">
                  <div className="city-picker">
                    <span id="city-picker-label" className="city-picker-label">
                      {t('compare.cityLabel')}
                    </span>
                    <CityPicker
                      labelId="city-picker-label"
                      value={city}
                      options={cities}
                      onChange={setCity}
                    />
                  </div>

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
                    <span>
                      {t('compare.updatedAt', {
                        date: formatFreshness(catalog.generatedAt, locale),
                      })}
                    </span>
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
            <EmptyState
              art={BalanceArt}
              title={t('compare.emptyCartTitle')}
              text={t('compare.emptyCart')}
            >
              <Link to="/" className="btn btn-secondary">
                {t('compare.toList')}
              </Link>
            </EmptyState>
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
                  {/* Rolls digit by digit, like a Wallet balance: the one
                      figure on the page worth watching change. The ladder
                      below keeps the quieter count. */}
                  <RollingCurrency
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
                  {table.winner.online ? (
                    <p className="lead-note">{t('compare.onlineWinner')}</p>
                  ) : null}
                </div>
              ) : null}

              {table.split ? <SplitOffer split={table.split} locale={locale} t={t} /> : null}

              {/* Two readings of the same figures. On a wide screen they sit
                  side by side and the ladder sticks, so the ranking stays in
                  view while the per-item detail — much the longer of the two —
                  scrolls past it. */}
              <div className="compare-columns">
                <ChainLadder table={table} items={items} locale={locale} t={t} />
                <Breakdown table={table} history={history} locale={locale} t={t} />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

/**
 * Sixty days of a price as a small step line: flat while the price held,
 * a step where it changed. Decoration beside the sentence that says the
 * same thing, so it is hidden from assistive technology.
 */
function Sparkline({ points }) {
  const width = 64;
  const height = 18;
  // Room for the end dot inside the box.
  const pad = 3;
  const days = points.map(([day]) => day);
  const prices = points.map(([, price]) => price);
  const [first, last] = [Math.min(...days), Math.max(...days)];
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const x = (day) => pad + ((day - first) / Math.max(1, last - first)) * (width - 2 * pad);
  const y = (price) =>
    high === low ? height / 2 : pad + ((high - price) / (high - low)) * (height - 2 * pad);
  const path = points
    .map(([day, price], index) =>
      index === 0 ? `M${x(day)},${y(price)}` : `H${x(day)}V${y(price)}`,
    )
    .join('');
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Today's price, so the line reads as arriving somewhere. */}
      <circle cx={x(last)} cy={y(prices.at(-1))} r="2.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The two-shop alternative, when one exists that is worth a second trip.
 *
 * One line under the answer, closed by default: the page's answer is still
 * the single cheapest shop, and this is an aside to it. Opened, it says what
 * to buy where.
 */
function SplitOffer({ split, locale, t }) {
  const [open, setOpen] = useState(false);
  const [first, second] = split.parts;

  return (
    <section className={`split grouped${open ? ' split-open' : ''}`}>
      <button
        type="button"
        className="split-summary"
        aria-expanded={open}
        aria-controls="split-detail"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="split-text">
          <span className="split-title">
            {t('compare.splitTitle', {
              first: first.chain.displayName,
              second: second.chain.displayName,
            })}
          </span>
          <span className="split-saving">
            {t('compare.splitSaving', { amount: formatCurrency(split.saving, locale) })}
          </span>
        </span>
        <span className="split-total tabular" dir="ltr">
          <CurrencyText value={split.total} locale={locale} />
        </span>
        <ChevronDown className="split-chevron" size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <div id="split-detail" className="split-collapse" inert={open ? undefined : ''}>
        <div className="split-clip">
          {split.parts.map((part) => (
            <div key={part.chain.key} className="split-part">
              <p className="split-part-head">
                <span>{part.chain.displayName}</span>
                <span className="tabular" dir="ltr">
                  <CurrencyText value={part.subtotal} locale={locale} />
                </span>
              </p>
              <ul>
                {part.items.map((item, index) => (
                  <li key={index} className="split-item">
                    <span>{item.name}</span>
                    <span className="tabular" dir="ltr">
                      <CurrencyText value={item.price} locale={locale} />
                    </span>
                  </li>
                ))}
              </ul>
              {part.chain.online ? (
                <p className="split-part-note">{t('compare.onlineStore')}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Every chain as one flat row, descending. The rows are deliberately identical
 * in weight: the winner has already been named above, and repeating that
 * emphasis seven times would leave the page with no hierarchy at all.
 */
function ChainLadder({ table, items, locale, t }) {
  // When a filter change reorders the chains, the rows slide to their new
  // places instead of the list being redrawn in a different order.
  const ladderRef = useRef(null);
  useFlipList(ladderRef, table.rows.map((row) => row.key).join());

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
      <div
        ref={ladderRef}
        className="ladder stagger"
        role="table"
        aria-label={t('compare.resultsTitle')}
      >
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
                <p className="ladder-divider" data-flip="divider">
                  {t('compare.partialGroup')}
                </p>
              ) : null}
              <div
                role="row"
                data-flip={row.key}
                className={`grouped-row ladder-row${best ? ' ladder-row-best' : ''}${
                  empty ? ' ladder-row-empty' : ''
                }`}
              >
                <span role="cell" className="ladder-chain">
                  <span className="ladder-chain-name">{row.displayName}</span>
                  <span className="ladder-chain-sub">
                    {/* An online store is registered under a warehouse name
                        nobody would recognise, and its prices leave out the
                        delivery fee — the row says both plainly. */}
                    {row.online ? (
                      <span>{t('compare.onlineStore')}</span>
                    ) : row.storeName ? (
                      <span>{row.storeName}</span>
                    ) : null}
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
                    // Plain text, not rolling digits: ten rows of digit
                    // columns were a third of the page's elements and most of
                    // the half-second it took to lay out on a phone. A change
                    // of order still shows, as the rows slide.
                    <span className="ladder-total tabular" dir="ltr">
                      <CurrencyText value={row.total} locale={locale} />
                    </span>
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

/**
 * What each item costs at each chain — collapsed to its answer by default.
 *
 * Open, twelve items times six chains was ten screens of small text on a
 * phone, and the one figure a shopper wants from each block (where is this
 * cheapest?) was buried in the middle of it. Each item now shows that answer
 * on its own row, and opens to the full comparison on a tap: the grouped-list
 * disclosure iOS uses, and the heading-wraps-button pattern screen readers
 * expect of an accordion.
 */
function Breakdown({ table, history, locale, t }) {
  const [open, setOpen] = useState(() => new Set());
  // Rows that have ever been opened. A row's per-store prices are built the
  // first time it opens and kept after, so closing still animates; built for
  // every row up front, they were most of the page's elements while nobody
  // was looking at them.
  const [built, setBuilt] = useState(() => new Set());

  const toggle = (index) => {
    setBuilt((current) => (current.has(index) ? current : new Set(current).add(index)));
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <GroupedList label={t('compare.itemsTitle')}>
      {table.lines.map((line, index) => {
        const found = line.prices.filter(Boolean);
        const cheapest = found.length > 0 ? Math.min(...found.map((m) => m.price)) : null;
        const bestIndex = line.prices.findIndex((match) => match && match.price === cheapest);
        const isOpen = open.has(index);
        const panelId = `breakdown-${index}`;
        const price = (value) =>
          line.byWeight ? (
            t('compare.perKg', { price: formatCurrency(value, locale) })
          ) : (
            <CurrencyText value={value} locale={locale} />
          );
        const series = history.series[line.trendKey];
        const trend = history.today === null ? null : trendOf(series, history.today);
        const trendText = trend
          ? t(trend.change < 0 ? 'compare.trendDown' : 'compare.trendUp', {
              amount: formatCurrency(Math.abs(trend.change), locale),
            })
          : '';

        return (
          <div
            key={`${line.name}-${index}`}
            className={`breakdown-item${isOpen ? ' breakdown-open' : ''}`}
          >
            <h3 className="breakdown-heading">
              <button
                type="button"
                className="breakdown-toggle"
                aria-expanded={found.length > 0 ? isOpen : undefined}
                aria-controls={found.length > 0 ? panelId : undefined}
                disabled={found.length === 0}
                onClick={() => toggle(index)}
              >
                <span className="breakdown-head">
                  <span className="breakdown-name">{line.name}</span>
                  {line.byWeight ? (
                    <span className="breakdown-qty tabular">{formatWeight(line.weight, t)}</span>
                  ) : line.quantity > 1 ? (
                    <span className="breakdown-qty tabular">×{line.quantity}</span>
                  ) : null}
                  {/* `title` only ever reaches a mouse. The same words repeat in
                      hidden text so a screen reader, and a phone with no hover
                      at all, still get the explanation. */}
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
                </span>

                {/* The answer this block exists to give, visible while closed. */}
                {found.length === 0 ? (
                  <span className="breakdown-none">{t('compare.notFoundAnywhere')}</span>
                ) : (
                  <span className="breakdown-summary">
                    <span className="breakdown-summary-chain">
                      {table.chains[bestIndex]?.displayName}
                    </span>
                    {/* A fall is worth seeing before the row is opened; a rise
                        is said inside, where it can be read in full. */}
                    {trend && trend.change < 0 ? (
                      <TrendingDown
                        className="breakdown-trend-mark"
                        size={15}
                        strokeWidth={2}
                        aria-label={trendText}
                      />
                    ) : null}
                    <span className="breakdown-summary-amount tabular" dir="ltr">
                      {price(cheapest)}
                    </span>
                    <ChevronDown
                      className="breakdown-chevron"
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                )}
              </button>
            </h3>

            {found.length > 0 ? (
              <div className="breakdown-collapse" id={panelId}>
                <div className="breakdown-clip">
                  {built.has(index) ? (
                    <>
                      <ul className="breakdown-prices" inert={isOpen ? undefined : ''}>
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
                                    title={t(
                                      match.promo === 1
                                        ? 'compare.promoPriceHint'
                                        : 'compare.promoHint',
                                    )}
                                  >
                                    {t(match.promo === 1 ? 'compare.promoPrice' : 'compare.promo')}
                                    <span className="sr-only">
                                      {' — '}
                                      {t(
                                        match.promo === 1
                                          ? 'compare.promoPriceHint'
                                          : 'compare.promoHint',
                                      )}
                                    </span>
                                  </span>
                                ) : null}
                              </span>
                              <span className="breakdown-amount tabular" dir="ltr">
                                {/* A per-kilogram figure has to say so, or it reads
                                  as the price of what is actually being bought. */}
                                {price(match.price)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      {trend ? (
                        <p
                          className={`breakdown-trend${trend.change < 0 ? ' breakdown-trend-down' : ''}`}
                          inert={isOpen ? undefined : ''}
                        >
                          {trend.change < 0 ? (
                            <TrendingDown size={15} strokeWidth={2} aria-hidden="true" />
                          ) : (
                            <TrendingUp size={15} strokeWidth={2} aria-hidden="true" />
                          )}
                          <span>{trendText}</span>
                          <Sparkline points={stepPoints(series, history.today)} />
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </GroupedList>
  );
}
