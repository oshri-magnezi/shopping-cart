const DATA_KEY = 'shopping-cart-data';
const DATA_VERSION = 1;

export function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyList() {
  return { id: createId(), createdAt: Date.now(), items: [] };
}

export function createInitialData() {
  return {
    version: DATA_VERSION,
    activeList: createEmptyList(),
    customCategories: [],
    history: [],
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
            createdAt: parsed.activeList.createdAt ?? Date.now(),
            items: parsed.activeList.items.filter((item) => item && typeof item.name === 'string'),
          }
        : createEmptyList();

    return {
      version: DATA_VERSION,
      activeList,
      customCategories: Array.isArray(parsed.customCategories) ? parsed.customCategories : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
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
