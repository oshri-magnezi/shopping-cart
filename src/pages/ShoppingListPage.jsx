import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { CategoryPickerModal } from '../components/CategoryPickerModal.jsx';
import { CategorySection } from '../components/CategorySection.jsx';
import { CompletePurchaseModal } from '../components/CompletePurchaseModal.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { getAllCategories, FALLBACK_CATEGORY_ID } from '../utils/categories.js';
import { formatDateTime } from '../utils/format.js';
import './ShoppingListPage.css';

export function ShoppingListPage() {
  const { t, language, locale } = useTranslation();
  const { activeList, customCategories, dispatch } = useAppData();
  const inputRef = useRef(null);

  const [draftName, setDraftName] = useState('');
  const [picker, setPicker] = useState(null); // { mode, item }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [completing, setCompleting] = useState(false);

  const categories = useMemo(
    () => getAllCategories(customCategories, language),
    [customCategories, language],
  );

  const items = activeList.items;
  const purchasedCount = items.filter((item) => item.purchased).length;
  const allPurchased = items.length > 0 && purchasedCount === items.length;

  // Groups items under their category, dropping categories with nothing in them.
  const grouped = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: items.filter(
          (item) =>
            item.categoryId === category.id ||
            // An item whose custom category was removed still needs a home.
            (category.id === FALLBACK_CATEGORY_ID &&
              !categories.some((entry) => entry.id === item.categoryId)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, items]);

  // Finishing the last item opens the cost prompt on its own.
  useEffect(() => {
    if (allPurchased) setCompleting(true);
  }, [allPurchased]);

  function handleAddSubmit(event) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setPicker({ mode: 'add', item: { name: trimmed, categoryId: FALLBACK_CATEGORY_ID, quantity: 1 } });
  }

  function handlePickerConfirm(values) {
    if (picker.mode === 'add') {
      dispatch({ type: 'add-item', ...values });
      setDraftName('');
      inputRef.current?.focus();
    } else {
      dispatch({ type: 'update-item', id: picker.item.id, changes: values });
    }
    setPicker(null);
  }

  function handleComplete(totalCost) {
    dispatch({ type: 'complete-purchase', totalCost });
    setCompleting(false);
  }

  return (
    <main className="page">
      <div className="list-header">
        <div className="list-heading">
          {/* The title doubles as the input, so naming a basket needs no extra
              control and an unnamed list still reads as a heading. The wrapper
              carries a copy of the text so the field — and its underline —
              stop at the end of the name instead of spanning the row. */}
          <span
            className="list-title-field"
            data-value={activeList.name || t('list.title')}
          >
            <input
              type="text"
              className="list-title-input"
              value={activeList.name ?? ''}
              placeholder={t('list.title')}
              aria-label={t('list.nameLabel')}
              maxLength={60}
              // Without this the input's default 20-character intrinsic width
              // would size the grid cell instead of the text copy behind it.
              size={1}
              onChange={(event) => dispatch({ type: 'rename-list', name: event.target.value })}
            />
            <Pencil className="list-title-pencil" size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="list-meta">
            {t('list.createdAt', { date: formatDateTime(activeList.createdAt, locale) })}
          </p>
        </div>
        {allPurchased ? (
          <button type="button" className="btn btn-primary" onClick={() => setCompleting(true)}>
            {t('list.finishPurchase')}
          </button>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div
          className="tally"
          role="group"
          aria-label={t('list.progress', { done: purchasedCount, total: items.length })}
        >
          {/* One mark per item, filled as it goes in the cart. */}
          <div className="tally-marks" aria-hidden="true">
            {items.map((item) => (
              <span
                key={item.id}
                className={`tally-mark${item.purchased ? ' tally-mark-done' : ''}`}
              />
            ))}
          </div>
          <span className="tally-label tabular">
            {purchasedCount}/{items.length}
          </span>
        </div>
      ) : null}

      <form className="add-form" onSubmit={handleAddSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="text-input"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder={t('list.addPlaceholder')}
          aria-label={t('list.addPlaceholder')}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!draftName.trim()}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          <span className="add-form-label">{t('list.addButton')}</span>
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('list.emptyTitle')} text={t('list.emptyText')} />
      ) : (
        grouped.map((group) => (
          <CategorySection
            key={group.category.id}
            category={group.category}
            items={group.items}
            onEdit={(item) => setPicker({ mode: 'edit', item })}
            onDelete={(item) => setPendingDelete(item)}
          />
        ))
      )}

      {picker ? (
        <CategoryPickerModal
          mode={picker.mode}
          initialItem={picker.item}
          onConfirm={handlePickerConfirm}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('confirm.deleteItemTitle')}
          message={t('confirm.deleteItemText', { name: pendingDelete.name })}
          onConfirm={() => {
            dispatch({ type: 'delete-item', id: pendingDelete.id });
            setPendingDelete(null);
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}

      {completing ? (
        <CompletePurchaseModal onComplete={handleComplete} onClose={() => setCompleting(false)} />
      ) : null}
    </main>
  );
}
