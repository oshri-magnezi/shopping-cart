import {
  Beef,
  Candy,
  Carrot,
  Croissant,
  CupSoda,
  Milk,
  Package,
  ShoppingBasket,
  Snowflake,
  SprayCan,
  Tag,
} from 'lucide-react';

// Built-in categories. `color` is only used for the icon tile, so it stays
// readable against the surface in both themes.
export const BUILT_IN_CATEGORIES = [
  { id: 'produce', icon: Carrot, color: '#16a34a' },
  { id: 'dairy', icon: Milk, color: '#0284c7' },
  { id: 'meat', icon: Beef, color: '#dc2626' },
  { id: 'bakery', icon: Croissant, color: '#d97706' },
  { id: 'canned', icon: Package, color: '#7c3aed' },
  { id: 'frozen', icon: Snowflake, color: '#0891b2' },
  { id: 'drinks', icon: CupSoda, color: '#2563eb' },
  { id: 'snacks', icon: Candy, color: '#db2777' },
  { id: 'cleaning', icon: SprayCan, color: '#0d9488' },
  { id: 'other', icon: ShoppingBasket, color: '#64748b' },
];

export const CUSTOM_CATEGORY_ICON = Tag;
export const CUSTOM_CATEGORY_COLOR = '#6366f1';
export const FALLBACK_CATEGORY_ID = 'other';

const builtInById = new Map(BUILT_IN_CATEGORIES.map((category) => [category.id, category]));

export function isBuiltInCategory(id) {
  return builtInById.has(id);
}

/**
 * Merges built-in and user-created categories into one display list.
 * Custom categories carry their own name; built-ins resolve through i18n.
 */
export function getAllCategories(customCategories, language) {
  const builtIn = BUILT_IN_CATEGORIES.map((category) => ({
    id: category.id,
    icon: category.icon,
    color: category.color,
    translationKey: `category.${category.id}`,
    name: null,
    custom: false,
  }));

  const custom = customCategories.map((category) => ({
    id: category.id,
    icon: CUSTOM_CATEGORY_ICON,
    color: CUSTOM_CATEGORY_COLOR,
    translationKey: null,
    name: language === 'he' ? category.nameHe : category.nameEn,
    custom: true,
  }));

  return [...builtIn, ...custom];
}

export function findCategory(categories, id) {
  return categories.find((category) => category.id === id) ?? categories[0];
}

export function categoryLabel(category, t) {
  if (!category) return '';
  return category.custom ? category.name : t(category.translationKey);
}
