import { ShoppingListItem } from './ShoppingListItem.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { categoryLabel } from '../utils/categories.js';
import './CategorySection.css';

export function CategorySection({ category, items, onEdit, onDelete }) {
  const { t } = useTranslation();
  const Icon = category.icon;

  return (
    <section className="category-section">
      <h2 className="category-section-header">
        <span className="category-section-icon" style={{ color: category.color }}>
          <Icon size={18} strokeWidth={2} aria-hidden="true" />
        </span>
        {categoryLabel(category, t)}
        <span className="category-section-count tabular">{items.length}</span>
      </h2>

      <ul>
        {items.map((item) => (
          <ShoppingListItem key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  );
}
