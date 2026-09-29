import {
  Bath,
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

// Built-in categories. `color` is only used for the icon, which sits on four
// backgrounds: light and dark, selected and not. Every colour keeps its hue
// from the original set but shares one lightness, chosen so the icon clears
// 3:1 against all four (categories.test.js). Slightly less saturated than the
// stock set it replaced, whose bright primaries read as a default palette and
// half of which vanished on one theme or the other.
export const BUILT_IN_CATEGORIES = [
  { id: 'produce', icon: Carrot, color: '#38924f' },
  { id: 'dairy', icon: Milk, color: '#3c87bb' },
  { id: 'meat', icon: Beef, color: '#d15c52' },
  { id: 'bakery', icon: Croissant, color: '#b96f2d' },
  { id: 'canned', icon: Package, color: '#8a70d6' },
  { id: 'frozen', icon: Snowflake, color: '#3a8ba4' },
  { id: 'drinks', icon: CupSoda, color: '#517fdc' },
  { id: 'snacks', icon: Candy, color: '#cd5b83' },
  { id: 'cleaning', icon: SprayCan, color: '#3c8e84' },
  // Toiletries used to share the cleaning shelf, which put toothpaste next to
  // bleach. They are bought on a different rhythm and belong apart.
  { id: 'care', icon: Bath, color: '#b963a9' },
  { id: 'other', icon: ShoppingBasket, color: '#768295' },
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
