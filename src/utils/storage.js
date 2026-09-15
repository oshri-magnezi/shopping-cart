const DATA_KEY = 'shopping-cart-data';
const DATA_VERSION = 1;

/**
 * Half a kilo: the amount most counter purchases land on, and a figure the
 * shopper adjusts rather than one that pretends to know.
 */
export const DEFAULT_WEIGHT = 0.5;

/**
 * How many name-to-category corrections to keep.
 *
 * A household's regular basket is a few dozen products, so this covers it
 * several times over while staying a few kilobytes — small beside the purchase
 * history already in this key. Oldest entries fall off the end.
 */
export const CATEGORY_MEMORY_LIMIT = 200;

export function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyList() {
  return { id: createId(), name: '', createdAt: Date.now(), items: [] };
}

export function createInitialData() {
  return {
    version: DATA_VERSION,
    activeList: createEmptyList(),
    customCategories: [],
    history: [],
    categoryMemory: [],
  };
}

/**
 * Reads persisted state. Anything malformed falls back to a fresh, valid
 * shape so a corrupted localStorage entry can never break the app.
 */
export function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return createInitialData();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialData();

    const activeList =
      parsed.activeList && Array.isArray(parsed.activeList.items)
        ? {
            id: parsed.activeList.id ?? createId(),
            // Lists saved before naming existed simply have no name.
            name: typeof parsed.activeList.name === 'string' ? parsed.activeList.name : '',
            createdAt: parsed.activeList.createdAt ?? Date.now(),
            items: parsed.activeList.items
              .filter((item) => item && typeof item.name === 'string')
              .map((item) => ({
                ...item,
                // Lists saved before barcodes existed simply carry no code.
                code: typeof item.code === 'string' ? item.code : '',
                // Likewise, everything saved before weighed items existed was
                // counted in whole units.
                unit: item.unit === 'kg' ? 'kg' : 'unit',
                weight:
                  Number.isFinite(item.weight) && item.weight > 0
                    ? item.weight
                    : DEFAULT_WEIGHT,
              })),
          }
        : createEmptyList();

    return {
      version: DATA_VERSION,
      activeList,
      customCategories: Array.isArray(parsed.customCategories) ? parsed.customCategories : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      // Absent for everything saved before category suggestions existed, which
      // is the whole migration: an empty store simply suggests nothing yet.
      categoryMemory: Array.isArray(parsed.categoryMemory)
        ? parsed.categoryMemory
            .filter(
              (entry) =>
                entry &&
                typeof entry.signature === 'string' &&
                entry.signature &&
                typeof entry.categoryId === 'string' &&
                entry.categoryId,
            )
            .slice(0, CATEGORY_MEMORY_LIMIT)
        : [],
    };
  } catch {
    return createInitialData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded or storage blocked — keep running in memory */
  }
}
