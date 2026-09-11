import { GroupedList } from './GroupedList.jsx';
import { ShoppingListItem } from './ShoppingListItem.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel } from '../utils/categories.js';
import './CategorySection.css';

export function CategorySection({ category, items, onEdit, onDelete }) {
  const { t } = useTranslation();
  const Icon = category.icon;

  return (
    <GroupedList
      className="category-section"
      label={
        <>
          <span className="category-section-icon" style={{ color: category.color }}>
            <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
          </span>
          {categoryLabel(category, t)}
        </>
      }
    >
      <ul className="stagger">
        {items.map((item) => (
          <ShoppingListItem key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </GroupedList>
  );
}
