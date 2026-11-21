import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.jsx';
import { ShelfTicketArt } from '../components/EmptyArt.jsx';
import { GroupedList, GroupedRow } from '../components/GroupedList.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { FALLBACK_CATEGORY_ID, getAllCategories } from '../utils/categories.js';
import { formatWeight } from '../utils/format.js';
import { decodeList } from '../utils/share.js';
import './ImportPage.css';

/**
 * Where a shared-list link lands.
 *
 * The list is shown first and added only when the shopper says so: a link is
 * something anyone can send, and opening one must never change what is on
 * your list by itself. Whatever the link holds is validated by `decodeList`
 * and shown as plain text.
 */
export function ImportPage() {
  const { t, language } = useTranslation();
  const { customCategories, dispatch } = useAppData();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const shared = useMemo(() => {
    const known = new Set(
      getAllCategories(customCategories, language).map((category) => category.id),
    );
    return decodeList(params.get('d'), {
      isCategory: (id) => known.has(id),
      fallbackCategory: FALLBACK_CATEGORY_ID,
    });
  }, [params, customCategories, language]);

  if (!shared) {
    return (
      <main className="page">
        <EmptyState
          art={ShelfTicketArt}
          title={t('import.invalidTitle')}
          text={t('import.invalidText')}
        >
          <Link to="/" className="btn btn-secondary">
            {t('import.toList')}
          </Link>
        </EmptyState>
      </main>
    );
  }

  function add() {
    dispatch({ type: 'add-items', items: shared.items });
    navigate('/', { replace: true });
  }

  return (
    <main className="page">
      <header className="import-header">
        <h1 className="import-title" data-large-title>
          {shared.name || t('import.title')}
        </h1>
        <p className="import-subtitle">
          {shared.name ? `${t('import.title')} · ` : ''}
          {t('import.count', { count: shared.items.length })}
        </p>
      </header>

      <GroupedList>
        <ul className="stagger">
          {shared.items.map((item, index) => (
            <GroupedRow as="li" key={index} className="import-row">
              <span className="import-name">{item.name}</span>
              <span className="import-amount tabular" dir="ltr">
                {item.unit === 'kg'
                  ? formatWeight(item.weight, t)
                  : item.quantity > 1
                    ? `×${item.quantity}`
                    : ''}
              </span>
            </GroupedRow>
          ))}
        </ul>
      </GroupedList>

      <p className="import-note">{t('import.note')}</p>

      <div className="import-actions">
        <Link to="/" replace className="btn btn-secondary">
          {t('import.skip')}
        </Link>
        <button type="button" className="btn btn-primary" onClick={add}>
          {t('import.add')}
        </button>
      </div>
    </main>
  );
}
