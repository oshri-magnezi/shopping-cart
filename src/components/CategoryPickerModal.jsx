import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { QuantityStepper } from './QuantityStepper.jsx';
import { WeightStepper } from './WeightStepper.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel, getAllCategories, FALLBACK_CATEGORY_ID } from '../utils/categories.js';
import { cheapestPrice } from '../utils/catalogIndex.js';
import { createId, DEFAULT_WEIGHT } from '../utils/storage.js';
import { formatCurrency, formatWeight } from '../utils/format.js';
import './CategoryPickerModal.css';

// The amounts a deli counter is actually asked for.
const QUICK_WEIGHTS = [0.25, 0.5, 1];

/**
 * The popup that opens whenever an item is added or edited: pick a category,
 * set the quantity, and (in edit mode) adjust the name.
 */
// Ties the pre-selected radio to the line explaining why it is selected, so a
// screen-reader user is not handed an unexplained choice.
const SUGGESTION_NOTE_ID = 'category-suggested-note';

export function CategoryPickerModal({ mode, initialItem, onConfirm, onClose }) {
  const { t, language, locale } = useTranslation();
  const { customCategories, dispatch } = useAppData();
  const { chains, request } = useCatalog();

  const categories = getAllCategories(customCategories, language);
  const [name, setName] = useState(initialItem.name);
  const [categoryId, setCategoryId] = useState(initialItem.categoryId ?? FALLBACK_CATEGORY_ID);
  const [quantity, setQuantity] = useState(initialItem.quantity ?? 1);
  const [unit, setUnit] = useState(initialItem.unit ?? 'unit');
  const [weight, setWeight] = useState(initialItem.weight ?? DEFAULT_WEIGHT);
  // Purely presentational: whether the note explaining the pre-selected tile is
  // still true. Once the shopper expresses a preference it is not, and leaving
  // it up would describe a choice they have already replaced.
  const [touched, setTouched] = useState(false);
  const showingSuggestion = Boolean(initialItem.categorySuggested) && !touched;
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  // Confirming inline rather than in a dialog: a modal on top of this modal
  // would be a worse experience than two taps on the tile itself.
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const isEdit = mode === 'edit';
  const trimmedName = name.trim();
  const byWeight = unit === 'kg';

  // The estimate is the whole point of the weight box, and it needs prices.
  useEffect(() => {
    request();
  }, [request]);

  // What this costs right now at the cheapest chain in the chosen city — the
  // figure a shopper is trying to work out while standing at the counter.
  // Null until the catalogue arrives, and then the row simply appears rather
  // than reserving empty space for itself.
  const match = useMemo(() => {
    if (chains.length === 0 || !trimmedName) return null;
    return cheapestPrice(chains, {
      name: trimmedName,
      code: initialItem.code ?? '',
      unit: byWeight ? 1 : 0,
    });
  }, [chains, trimmedName, initialItem.code, byWeight]);

  // A product the catalogue sells loose should open on the weight box, so the
  // shopper is never asked how many tomatoes they want when the shop counts
  // them in kilograms.
  const looseInCatalogue = match?.unit === 1;
  useEffect(() => {
    if (looseInCatalogue) setUnit('kg');
  }, [looseInCatalogue]);

  function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    // The id is minted here so the new category can be selected in the same
    // update, without waiting to read it back from the store.
    const id = createId();
    dispatch({ type: 'add-custom-category', id, name: trimmed });
    setCategoryId(id);
    setTouched(true);
    setCreatingCategory(false);
    setNewCategoryName('');
  }

  function handleDeleteCategory(id) {
    dispatch({ type: 'delete-custom-category', id });
    // Anything filed under it moves to "other"; follow the selection there.
    if (categoryId === id) setCategoryId(FALLBACK_CATEGORY_ID);
    setTouched(true);
    setConfirmingDelete(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!trimmedName) return;
    // Editing the name by hand no longer identifies a specific product, so the
    // barcode is dropped and matching falls back to the text engine.
    const code = trimmedName === initialItem.name ? (initialItem.code ?? '') : '';
    // Weighed goods carry their amount in `weight`; the count stays at one so
    // the two can never both be multiplying the same line.
    onConfirm({
      name: trimmedName,
      code,
      categoryId,
      unit,
      quantity: byWeight ? 1 : quantity,
      weight: byWeight ? weight : DEFAULT_WEIGHT,
    });
  }

  return (
    <Modal
      title={isEdit ? t('picker.editTitle') : t('picker.addTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('picker.cancel')}
          </button>
          <button
            type="submit"
            form="category-picker-form"
            className="btn btn-primary"
            disabled={!trimmedName}
          >
            {isEdit ? t('picker.confirmEdit') : t('picker.confirmAdd')}
          </button>
        </>
      }
    >
      <form id="category-picker-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">{t('picker.itemName')}</span>
          <input
            type="text"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <div className="field">
          <span className="field-label">{t('picker.category')}</span>
          <div className="category-grid" role="radiogroup" aria-label={t('picker.category')}>
            {categories.map((category) => {
              const Icon = category.icon;
              const selected = category.id === categoryId;
              if (confirmingDelete === category.id) {
                return (
                  <div key={category.id} className="category-option category-option-confirm">
                    <span className="category-confirm-text">{t('picker.deleteConfirm')}</span>
                    <button
                      type="button"
                      className="category-confirm-yes"
                      onClick={() => handleDeleteCategory(category.id)}
                      aria-label={t('picker.deleteYes')}
                    >
                      <Check size={16} strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      className="category-confirm-no"
                      onClick={() => setConfirmingDelete(null)}
                      aria-label={t('picker.deleteNo')}
                    >
                      <X size={16} strokeWidth={3} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={category.id}
                  className={`category-option${selected ? ' category-option-selected' : ''}`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="category-pick"
                    onClick={() => {
                      setCategoryId(category.id);
                      setTouched(true);
                    }}
                    aria-describedby={
                      showingSuggestion && selected ? SUGGESTION_NOTE_ID : undefined
                    }
                  >
                    <span className="category-icon" style={{ color: category.color }}>
                      <Icon size={20} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="category-name">{categoryLabel(category, t)}</span>
                    {/* Both of these say "this is the one", so the tile shows
                        one or the other — never both. On a guessed tile the
                        word is the more useful of the two, and the tick would
                        only cost the name the room it needs. Quiet on purpose:
                        the filled tile is still the emphasis and this is its
                        label, not a rival to it. */}
                    {selected && showingSuggestion ? (
                      <span className="category-recommended">
                        {t('picker.categoryRecommended')}
                      </span>
                    ) : null}
                    {/* Inside the pick button and after the name, so it can
                        never land on top of the delete control. */}
                    {selected && !showingSuggestion ? (
                      <span className="category-check" aria-hidden="true">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>

                  {/* Only categories the shopper made can be removed. */}
                  {category.custom ? (
                    <button
                      type="button"
                      className="category-delete"
                      onClick={() => setConfirmingDelete(category.id)}
                      aria-label={t('picker.deleteCategory', { name: categoryLabel(category, t) })}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  ) : null}

                </div>
              );
            })}
          </div>

          {/* A caption for the filled tile, not a second signal competing with
              it. The selection is the emphasis; this only says where it came
              from, so the shopper knows it was guessed rather than remembered
              from last time. */}
          {showingSuggestion ? (
            <p className="category-suggested-note" id={SUGGESTION_NOTE_ID}>
              {t('picker.categorySuggested')}
            </p>
          ) : null}

          {creatingCategory ? (
            <div className="new-category-row">
              <input
                type="text"
                className="text-input"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder={t('picker.newCategoryName')}
                aria-label={t('picker.newCategoryName')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreateCategory();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim()}
              >
                {t('picker.createCategory')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="new-category-trigger"
              onClick={() => setCreatingCategory(true)}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t('picker.newCategory')}
            </button>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="sold-by-label">
            {t('picker.soldBy')}
          </span>
          <div className="unit-toggle" role="radiogroup" aria-labelledby="sold-by-label">
            <button
              type="button"
              role="radio"
              aria-checked={!byWeight}
              className={`unit-option${!byWeight ? ' unit-option-on' : ''}`}
              onClick={() => setUnit('unit')}
            >
              {t('picker.byUnit')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={byWeight}
              className={`unit-option${byWeight ? ' unit-option-on' : ''}`}
              onClick={() => setUnit('kg')}
            >
              {t('picker.byWeight')}
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            {byWeight ? t('picker.weight') : t('picker.quantity')}
          </span>

          {byWeight ? (
            <>
              <WeightStepper value={weight} onChange={setWeight} />
              <div className="quick-weights" role="group" aria-label={t('picker.quickWeight')}>
                {QUICK_WEIGHTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={`quick-weight${weight === amount ? ' quick-weight-on' : ''}`}
                    onClick={() => setWeight(amount)}
                  >
                    {formatWeight(amount, t)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <QuantityStepper value={quantity} onChange={setQuantity} />
          )}

          {/* At a count of one the arithmetic restates the price, so the row
              only earns its place when it works something out. */}
          {match && (byWeight || quantity > 1) ? (
            <p className="price-estimate">
              <span className="price-estimate-unit">
                {byWeight
                  ? t('picker.perKg', { price: formatCurrency(match.price, locale) })
                  : formatCurrency(match.price, locale)}
              </span>
              <span className="price-estimate-total tabular" dir="ltr">
                {t('picker.estimate', {
                  weight: byWeight ? formatWeight(weight, t) : `×${quantity}`,
                  total: formatCurrency(match.price * (byWeight ? weight : quantity), locale),
                })}
              </span>
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
