import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { CategoryPickerModal } from '../components/CategoryPickerModal.jsx';
import { CategorySection } from '../components/CategorySection.jsx';
import { CompletePurchaseModal } from '../components/CompletePurchaseModal.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { LiveRegion } from '../components/LiveRegion.jsx';
import { ShelfTicketArt } from '../components/EmptyArt.jsx';
import { ProductSuggest } from '../components/ProductSuggest.jsx';
import { UndoBar } from '../components/UndoBar.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { classify, nameSignature } from '../utils/classify.js';
import { useTranslation } from '../i18n/useTranslation.js';
import { getAllCategories, FALLBACK_CATEGORY_ID } from '../utils/categories.js';
import { formatDateTime } from '../utils/format.js';
import './ShoppingListPage.css';

export function ShoppingListPage() {
  const { t, language, locale } = useTranslation();
  const { activeList, customCategories, categoryMemory, dispatch } = useAppData();
  const inputRef = useRef(null);

  const [draftName, setDraftName] = useState('');
  // { session, mode, item } — `session` only exists to key the modal below.
  const [picker, setPicker] = useState(null);
  const pickerSession = useRef(0);
  // What the undo bar is currently offering back: the item and where it sat.
  const [undoable, setUndoable] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [announcement, setAnnouncement] = useState('');

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

  /**
   * Opens the picker with a category already guessed from the name.
   *
   * The guess is made here, synchronously, rather than inside the modal: the
   * modal is mounted fresh on every open, so a category chosen before it exists
   * is simply its initial state. A suggestion that arrived later would move the
   * selection a beat after the shopper was already looking at it.
   *
   * `categorySuggested` only travels as far as the modal — `handleSubmit` there
   * builds its payload explicitly, so it never reaches the stored item.
   */
  function openPicker(name, code = '', unit = 'unit') {
    const guess = classify(name, {
      loose: unit === 'kg',
      memory: categoryMemory,
      validCategoryIds: new Set(categories.map((category) => category.id)),
    });

    pickerSession.current += 1;
    setPicker({
      session: pickerSession.current,
      mode: 'add',
      item: {
        name,
        code,
        unit,
        quantity: 1,
        categoryId: guess?.categoryId ?? FALLBACK_CATEGORY_ID,
        categorySuggested: guess !== null,
      },
    });
  }

  function handleAddSubmit(event) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    openPicker(trimmed);
  }

  function handlePickerConfirm(values) {
    // What the shopper files by hand is the only signal that can ever suggest a
    // category they invented, and an edit is them saying the filing was wrong.
    //
    // `other` is recorded only when it overrides a suggestion. Storing it every
    // time would fill the store with the default and teach the app to suggest
    // "other" for everything. `values.name`, not the draft — the name may have
    // been edited in the modal.
    if (values.categoryId !== FALLBACK_CATEGORY_ID || picker.item.categorySuggested) {
      dispatch({
        type: 'remember-category',
        signature: nameSignature(values.name),
        categoryId: values.categoryId,
      });
    }

    if (picker.mode === 'add') {
      dispatch({ type: 'add-item', ...values });
      setAnnouncement(t('live.itemAdded', { name: values.name }));
      setDraftName('');
      inputRef.current?.focus();
    } else {
      dispatch({ type: 'update-item', id: picker.item.id, changes: values });
    }
    setPicker(null);
  }

  /**
   * Deletes at once and offers it back, rather than asking first.
   *
   * The index is captured here because after the dispatch it is gone, and
   * putting the item back anywhere else would quietly reorder the list.
   */
  function handleDelete(item) {
    const index = items.findIndex((entry) => entry.id === item.id);
    dispatch({ type: 'delete-item', id: item.id });
    setAnnouncement(t('live.itemRemoved', { name: item.name }));
    setUndoable({ item, index });
  }

  function handleComplete(totalCost) {
    dispatch({ type: 'complete-purchase', totalCost });
    setCompleting(false);
  }

  return (
    <main className="page">
      <LiveRegion message={announcement} />

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
          {/* One mark per item, filling in order rather than in place.
              Lighting the mark that sits at the checked item's own position
              scattered the bar — tick the first, third and fifth things in the
              basket and you got gaps, which reads as a fault rather than as
              progress. The count is what the bar is reporting, so the count is
              what it draws: each tick advances it by one more segment. */}
          <div className="tally-marks" aria-hidden="true">
            {items.map((item, index) => (
              <span
                key={item.id}
                className={`tally-mark${index < purchasedCount ? ' tally-mark-done' : ''}`}
              />
            ))}
          </div>
          <span className="tally-label tabular">
            {purchasedCount}/{items.length}
          </span>
        </div>
      ) : null}

      <form className="add-form" onSubmit={handleAddSubmit}>
        <ProductSuggest
          value={draftName}
          onChange={setDraftName}
          onPick={({ name, code, unit }) => {
            setDraftName(name);
            // A product the shop sells loose opens straight on the weight box.
            openPicker(name, code, unit === 1 ? 'kg' : 'unit');
          }}
          onSubmit={() => {
            const trimmed = draftName.trim();
            if (trimmed) openPicker(trimmed);
          }}
          inputRef={inputRef}
          inputProps={{
            className: 'text-input',
            placeholder: t('list.addPlaceholder'),
            'aria-label': t('list.addPlaceholder'),
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!draftName.trim()}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          <span className="add-form-label">{t('list.addButton')}</span>
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState art={ShelfTicketArt} title={t('list.emptyTitle')} text={t('list.emptyText')} />
      ) : (
        grouped.map((group) => (
          <CategorySection
            key={group.category.id}
            category={group.category}
            items={group.items}
            onEdit={(item) => {
              pickerSession.current += 1;
              setPicker({ session: pickerSession.current, mode: 'edit', item });
            }}
            onDelete={handleDelete}
          />
        ))
      )}

      {picker ? (
        <CategoryPickerModal
          /* The modal seeds its fields from `initialItem` with useState, which
             only runs on mount. Replacing one open picker with another — the
             same component, a different product — would keep the old name and
             the old category while the new props said otherwise, and the
             suggestion marker would end up on a tile nobody suggested. Keying
             on the session forces the fresh mount the seeding assumes. */
          key={picker.session}
          mode={picker.mode}
          initialItem={picker.item}
          onConfirm={handlePickerConfirm}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {undoable ? (
        <UndoBar
          key={undoable.item.id}
          message={t('undo.itemDeleted', { name: undoable.item.name })}
          onUndo={() => {
            dispatch({ type: 'restore-item', item: undoable.item, index: undoable.index });
            setUndoable(null);
          }}
          onDismiss={() => setUndoable(null)}
        />
      ) : null}

      {completing ? (
        <CompletePurchaseModal onComplete={handleComplete} onClose={() => setCompleting(false)} />
      ) : null}
    </main>
  );
}
