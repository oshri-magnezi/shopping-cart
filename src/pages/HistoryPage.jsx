import { useMemo, useState } from 'react';
import { ChevronDown, Receipt, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel, findCategory, getAllCategories } from '../utils/categories.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import './HistoryPage.css';

export function HistoryPage() {
  const { t, language, locale } = useTranslation();
  const { history, customCategories, dispatch } = useAppData();

  const [expandedId, setExpandedId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

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
        <EmptyState icon={Receipt} title={t('history.emptyTitle')} text={t('history.emptyText')} />
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat card">
              <span className="stat-label">{t('history.totalPurchases')}</span>
              <span className="stat-value tabular">{stats.count}</span>
            </div>
            <div className="stat card">
              <span className="stat-label">{t('history.totalSpent')}</span>
              <span className="stat-value tabular">{formatCurrency(stats.total, locale)}</span>
            </div>
            <div className="stat card">
              <span className="stat-label">{t('history.average')}</span>
              <span className="stat-value tabular">{formatCurrency(stats.average, locale)}</span>
            </div>
          </div>

          <ul className="history-list">
            {history.map((entry) => {
              const expanded = expandedId === entry.id;
              return (
                <li key={entry.id} className="history-entry card">
                  <div className="history-entry-main">
                    <button
                      type="button"
                      className="history-entry-toggle"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      aria-expanded={expanded}
                      aria-label={expanded ? t('history.collapse') : t('history.expand')}
                    >
                      <span className={`history-chevron${expanded ? ' history-chevron-open' : ''}`}>
                        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                      </span>
                      <span className="history-entry-info">
                        <span className="history-entry-date">
                          {formatDateTime(entry.completedAt, locale)}
                        </span>
                        <span className="history-entry-count">
                          {t('history.itemsLabel', { count: entry.itemCount })}
                        </span>
                      </span>
                      <span className="history-entry-leader" aria-hidden="true" />
                      <span
                        className={`history-entry-cost tabular${
                          entry.totalCost === null ? ' history-entry-cost-empty' : ''
                        }`}
                      >
                        {entry.totalCost === null
                          ? t('history.noAmount')
                          : formatCurrency(entry.totalCost, locale)}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => setPendingDelete(entry)}
                      aria-label={t('history.delete')}
                    >
                      <Trash2 size={18} strokeWidth={2} />
                    </button>
                  </div>

                  {expanded ? (
                    <ul className="history-items">
                      {entry.items.map((item) => {
                        const category = findCategory(categories, item.categoryId);
                        const Icon = category.icon;
                        return (
                          <li key={item.id} className="history-item">
                            <span className="history-item-icon" style={{ color: category.color }}>
                              <Icon size={16} strokeWidth={2} aria-hidden="true" />
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('confirm.deletePurchaseTitle')}
          message={t('confirm.deletePurchaseText')}
          onConfirm={() => {
            dispatch({ type: 'delete-purchase', id: pendingDelete.id });
            setPendingDelete(null);
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </main>
  );
}
