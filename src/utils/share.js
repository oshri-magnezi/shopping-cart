// Sharing a list: as text for a chat, and as a link that opens it in the app.
//
// The link carries the list itself — there is no server to keep it on. That
// makes whatever arrives in a link untrusted input: anyone can write one. It
// is decoded into plain values, every field is checked and bounded, and
// nothing in it is ever treated as more than text to show.

// Room for MAX_ITEMS names at MAX_NAME characters each, base64 and all.
const MAX_ENCODED = 64_000;
const MAX_ITEMS = 150;
const MAX_NAME = 80;

/** UTF-8 text → base64 that is safe inside a URL. */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Packs the list for a link. Rows are positional to keep the link short:
 * [name, code, categoryId, quantity, byWeight, weight].
 */
export function encodeList(list) {
  const rows = list.items
    .slice(0, MAX_ITEMS)
    .map((item) => [
      item.name.slice(0, MAX_NAME),
      item.code ?? '',
      item.categoryId ?? '',
      item.quantity ?? 1,
      item.unit === 'kg' ? 1 : 0,
      item.unit === 'kg' ? (item.weight ?? 0.5) : 0,
    ]);
  return toBase64Url(JSON.stringify({ v: 1, n: (list.name ?? '').slice(0, MAX_NAME), i: rows }));
}

const clamp = (value, low, high, fallback) =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/**
 * Unpacks a shared list, or returns null if it is not one.
 *
 * Never throws and never trusts: wrong shapes are rejected, text is trimmed
 * and cut to length, numbers are forced into the ranges the app itself
 * allows, and a category the app does not know becomes `fallbackCategory`.
 */
export function decodeList(encoded, { isCategory = () => true, fallbackCategory = 'other' } = {}) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_ENCODED) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (!data || data.v !== 1 || !Array.isArray(data.i)) return null;

  const items = [];
  for (const row of data.i.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(row)) continue;
    const [name, code, categoryId, quantity, byWeight, weight] = row;
    if (typeof name !== 'string') continue;
    const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!cleanName) continue;

    items.push({
      name: cleanName,
      // A barcode is digits and nothing else; anything different is dropped
      // and the item is matched by its name instead.
      code: typeof code === 'string' && /^\d{1,14}$/.test(code) ? code : '',
      categoryId:
        typeof categoryId === 'string' && isCategory(categoryId) ? categoryId : fallbackCategory,
      quantity: Math.round(clamp(Number(quantity), 1, 99, 1)),
      unit: byWeight === 1 ? 'kg' : 'unit',
      // Only loose goods carry a weight; everything else gets the app's default.
      weight: byWeight === 1 ? clamp(Number(weight), 0.05, 20, 0.5) : 0.5,
    });
  }
  if (items.length === 0) return null;

  return {
    name: typeof data.n === 'string' ? data.n.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '',
    items,
  };
}

/**
 * The list as a message: a title, then the items under their categories.
 * `groups` is the same grouping the list page draws — [{ label, items }].
 */
export function listAsText({ title, groups, amountOf }) {
  const lines = [title, ''];
  for (const group of groups) {
    lines.push(`${group.label}:`);
    for (const item of group.items) {
      const amount = amountOf(item);
      lines.push(`- ${item.name}${amount ? ` (${amount})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
