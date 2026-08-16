import { Check, Pencil, Trash2 } from 'lucide-react';
import { QuantityStepper } from './QuantityStepper.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import './ShoppingListItem.css';

export function ShoppingListItem({ item, onEdit, onDelete }) {
  const { t } = useTranslation();
  const { dispatch } = useAppData();

  return (
    <li className={`list-item${item.purchased ? ' list-item-purchased' : ''}`}>
      <button
        type="button"
        className="item-check"
        onClick={() => dispatch({ type: 'toggle-item', id: item.id })}
        aria-pressed={item.purchased}
        aria-label={item.purchased ? t('item.markNotPurchased') : t('item.markPurchased')}
      >
        <span className="item-check-box" aria-hidden="true">
          {item.purchased ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      </button>

      <span className="item-name">{item.name}</span>

      <QuantityStepper
        value={item.quantity}
        size="sm"
        onChange={(next) =>
          dispatch({ type: 'change-quantity', id: item.id, delta: next - item.quantity })
        }
      />

      <button
        type="button"
        className="icon-btn item-action"
        onClick={() => onEdit(item)}
        aria-label={t('item.edit')}
      >
        <Pencil size={18} strokeWidth={2} />
      </button>

      <button
        type="button"
        className="icon-btn icon-btn-danger item-action"
        onClick={() => onDelete(item)}
        aria-label={t('item.delete')}
      >
        <Trash2 size={18} strokeWidth={2} />
      </button>
    </li>
  );
}
