import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { QuantityStepper } from './QuantityStepper.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel, getAllCategories, FALLBACK_CATEGORY_ID } from '../utils/categories.js';
import { createId } from '../utils/storage.js';
import './CategoryPickerModal.css';

/**
 * The popup that opens whenever an item is added or edited: pick a category,
 * set the quantity, and (in edit mode) adjust the name.
 */
export function CategoryPickerModal({ mode, initialItem, onConfirm, onClose }) {
  const { t, language } = useTranslation();
  const { customCategories, dispatch } = useAppData();

  const categories = getAllCategories(customCategories, language);
  const [name, setName] = useState(initialItem.name);
  const [categoryId, setCategoryId] = useState(initialItem.categoryId ?? FALLBACK_CATEGORY_ID);
  const [quantity, setQuantity] = useState(initialItem.quantity ?? 1);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const isEdit = mode === 'edit';
  const trimmedName = name.trim();

  function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    // The id is minted here so the new category can be selected in the same
    // update, without waiting to read it back from the store.
    const id = createId();
    dispatch({ type: 'add-custom-category', id, name: trimmed });
    setCategoryId(id);
    setCreatingCategory(false);
    setNewCategoryName('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!trimmedName) return;
    // Editing the name by hand no longer identifies a specific product, so the
    // barcode is dropped and matching falls back to the text engine.
    const code = trimmedName === initialItem.name ? (initialItem.code ?? '') : '';
    onConfirm({ name: trimmedName, code, categoryId, quantity });
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
              return (
                <button
                  type="button"
                  key={category.id}
                  role="radio"
                  aria-checked={selected}
                  className={`category-option${selected ? ' category-option-selected' : ''}`}
                  onClick={() => setCategoryId(category.id)}
                >
                  <span className="category-icon" style={{ color: category.color }}>
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="category-name">{categoryLabel(category, t)}</span>
                  {selected ? (
                    <span className="category-check" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

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
          <span className="field-label">{t('picker.quantity')}</span>
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </div>
      </form>
    </Modal>
  );
}
