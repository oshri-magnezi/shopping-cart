import { nameSignature } from './classify.js';

// A product has to come back at least this often before it counts as a
// regular; one purchase is a purchase, not a habit.
const MIN_PURCHASES = 2;
// Each step back in the history counts for a little less, so what was bought
// every week last year gives way to what is bought every week now.
const DECAY = 0.85;

/** The same product across purchases: its barcode, or failing that its name. */
const keyOf = (item) => item.code || nameSignature(item.name) || item.name.trim();

/**
 * The shopper's regulars: products bought in several past purchases, most
 * habitual first, without the ones already on the current list.
 *
 * `history` is newest first, as the app stores it. Each regular is returned
 * the way it was last bought — same category, unit and amount — so adding it
 * back takes one tap and no questions.
 */
export function favorites(history, currentItems = [], limit = 8) {
  const seen = new Map();

  history.forEach((purchase, age) => {
    const inThisPurchase = new Set();
    for (const item of purchase.items ?? []) {
      const key = keyOf(item);
      // Twice in one basket is still one purchase of it.
      if (!key || inThisPurchase.has(key)) continue;
      inThisPurchase.add(key);

      const entry = seen.get(key) ?? { item, purchases: 0, score: 0 };
      entry.purchases += 1;
      entry.score += DECAY ** age;
      seen.set(key, entry);
    }
  });

  const onList = new Set(currentItems.map(keyOf));

  return [...seen.entries()]
    .filter(([key, entry]) => entry.purchases >= MIN_PURCHASES && !onList.has(key))
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([key, { item }]) => ({
      key,
      name: item.name,
      code: item.code ?? '',
      categoryId: item.categoryId,
      unit: item.unit ?? 'unit',
      quantity: item.quantity ?? 1,
      weight: item.weight,
    }));
}
