import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Copy, Trash2 } from 'lucide-react';
import { UndoBar } from '../components/UndoBar.jsx';
import { AnimatedCurrency } from '../components/AnimatedCurrency.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { RowMenu } from '../components/RowMenu.jsx';
import { ReceiptArt } from '../components/EmptyArt.jsx';
import { SpendingTrend } from '../components/SpendingTrend.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel, findCategory, getAllCategories } from '../utils/categories.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import './HistoryPage.css';

export function HistoryPage() {
  const { t, language, locale } = useTranslation();
  const { history, customCategories, dispatch } = useAppData();
  const navigate = useNavigate();

  const [expandedId, setExpandedId] = useState(null);
  const [undoable, setUndoable] = useState(null);

  // Copying lands the items on the list page, so the result is visible
  // straight away instead of silently happening on another screen.
  function handleCopy(entry) {
    dispatch({ type: 'copy-purchase', items: entry.items });
    navigate('/');
  }

  // Same trade as the list: remove now, offer it back, keep its place in the
   // series so the spending trend does not jump while the offer stands.
  function handleDelete(entry) {
    const index = history.findIndex((row) => row.id === entry.id);
    dispatch({ type: 'delete-purchase', id: entry.id });
    setUndoable({ entry, index });
  }

  const categories = useMemo(
    () => getAllCategories(customCategories, language),
    [customCategories, language],
  );

  // Averages only count trips where an amount was actually recorded.
  const stats = useMemo(() => {
    const priced = history.filter((entry) => typeof entry.totalCost === 'number');
    const total = priced.reduce((sum, entry) => sum + entry.totalCost, 0);
    return {
      count: history.length,
      total,
      average: priced.length > 0 ? total / priced.length : 0,
    };
  }, [history]);

  return (
    <main className="page">
      <h1 className="history-title">{t('history.title')}</h1>
      <p className="history-subtitle">{t('history.subtitle')}</p>

      {history.length === 0 ? (
        <EmptyState art={ReceiptArt} title={t('history.emptyTitle')} text={t('history.emptyText')} />
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-label">{t('history.totalPurchases')}</span>
              <span className="stat-value tabular">{stats.count}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t('history.totalSpent')}</span>
              <AnimatedCurrency className="stat-value tabular" value={stats.total} locale={locale} />
            </div>
            <div className="stat">
              <span className="stat-label">{t('history.average')}</span>
              <AnimatedCurrency
                className="stat-value tabular"
                value={stats.average}
                locale={locale}
              />
            </div>
          </div>

          <SpendingTrend history={history} locale={locale} />

          <div className="grouped history-list">
            {history.map((entry) => {
              const expanded = expandedId === entry.id;
              return (
                <div key={entry.id} className="history-entry">
                  <div className="grouped-row history-entry-main">
                    <button
                      type="button"
                      className="history-entry-toggle"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      aria-expanded={expanded}
                      aria-label={expanded ? t('history.collapse') : t('history.expand')}
                    >
                      <span className={`history-chevron${expanded ? ' history-chevron-open' : ''}`}>
                        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
                      </span>
                      <span className="history-entry-info">
                        {entry.name ? (
                          <span className="history-entry-label">{entry.name}</span>
                        ) : null}
                        <span className="history-entry-date">
                          {formatDateTime(entry.completedAt, locale)}
                        </span>
                        <span className="history-entry-count">
                          {t('history.itemsLabel', { count: entry.itemCount })}
                        </span>
                      </span>
                      <span
                        className={`history-entry-cost tabular${
                          entry.totalCost === null ? ' history-entry-cost-empty' : ''
                        }`}
                        dir={entry.totalCost === null ? undefined : 'ltr'}
                      >
                        {entry.totalCost === null
                          ? t('history.noAmount')
                          : formatCurrency(entry.totalCost, locale)}
                      </span>
                    </button>

                    <RowMenu
                      label={t('history.more')}
                      items={[
                        {
                          key: 'copy',
                          label: t('history.copy'),
                          icon: Copy,
                          onSelect: () => handleCopy(entry),
                        },
                        {
                          key: 'delete',
                          label: t('history.delete'),
                          icon: Trash2,
                          danger: true,
                          onSelect: () => handleDelete(entry),
                        },
                      ]}
                    />
                  </div>

                  <div className="history-collapse" inert={expanded ? undefined : ''}>
                    <ul className="history-items">
                      {entry.items.map((item) => {
                        const category = findCategory(categories, item.categoryId);
                        const Icon = category.icon;
                        return (
                          <li key={item.id} className="history-item">
                            <span className="history-item-icon" style={{ color: category.color }}>
                              <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                            </span>
                            <span className="history-item-name">{item.name}</span>
                            <span className="history-item-category">
                              {categoryLabel(category, t)}
                            </span>
                            <span className="history-item-qty tabular">×{item.quantity}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {undoable ? (
        <UndoBar
          key={undoable.entry.id}
          message={t('undo.purchaseDeleted')}
          onUndo={() => {
            dispatch({ type: 'restore-purchase', entry: undoable.entry, index: undoable.index });
            setUndoable(null);
          }}
          onDismiss={() => setUndoable(null)}
        />
      ) : null}
    </main>
  );
}
