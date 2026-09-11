import { useRef } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { GroupedRow } from './GroupedList.jsx';
import { QuantityStepper } from './QuantityStepper.jsx';
import { RowMenu } from './RowMenu.jsx';
import { SwipeRow } from './SwipeRow.jsx';
import { WeightStepper } from './WeightStepper.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import * as haptics from '../utils/haptics.js';
import './ShoppingListItem.css';

export function ShoppingListItem({ item, onEdit, onDelete }) {
  const { t } = useTranslation();
  const { dispatch } = useAppData();
  const menuRef = useRef(null);

  // One list, three ways in: the menu button, a swipe, and a long press. They
  // are deliberately the same actions — the extra routes are about reach, not
  // about doing anything new.
  const actions = [
    { key: 'edit', label: t('item.edit'), icon: Pencil, onSelect: () => onEdit(item) },
    {
      key: 'delete',
      label: t('item.delete'),
      icon: Trash2,
      danger: true,
      onSelect: () => onDelete(item),
    },
  ];

  return (
    <GroupedRow
      as="li"
      className={`list-item${item.purchased ? ' list-item-purchased' : ''}`}
    >
      <SwipeRow
        actions={actions}
        onLongPress={(x, y) => menuRef.current?.openAt(x, y)}
      >
        <button
          type="button"
          className="item-check"
          onClick={() => {
            if (!item.purchased) haptics.success();
            dispatch({ type: 'toggle-item', id: item.id });
          }}
          aria-pressed={item.purchased}
          aria-label={item.purchased ? t('item.markNotPurchased') : t('item.markPurchased')}
        >
          <span className="item-check-box" aria-hidden="true">
            <Check size={13} strokeWidth={3} />
          </span>
        </button>

        <span className="item-name">{item.name}</span>

        {item.unit === 'kg' ? (
          <WeightStepper
            value={item.weight}
            size="sm"
            onChange={(weight) => dispatch({ type: 'change-weight', id: item.id, weight })}
          />
        ) : (
          <QuantityStepper
            value={item.quantity}
            size="sm"
            onChange={(next) =>
              dispatch({ type: 'change-quantity', id: item.id, delta: next - item.quantity })
            }
          />
        )}

        <RowMenu ref={menuRef} label={t('item.more', { name: item.name })} items={actions} />
      </SwipeRow>
    </GroupedRow>
  );
}
