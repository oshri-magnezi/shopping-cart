import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
  // Raised from the default 100 purely as a safety margin for very large
  // official catalogues; these files are shallow, so the guard should never
  // fire in practice.
  maxNestedTags: 10_000,
  // These files come from outside servers, so the XML-bomb guards stay on.
  // An XML bomb needs entities declared in a DOCTYPE, and no price file
  // declares any (none of 97 cached files, 2026-09-29), so declarations are
  // capped low. Escaped characters in names (&amp;, &quot;) are ordinary: the
  // busiest real file has ~10k, so the expansion cap sits a hundred times
  // above that, and the expanded length above the largest file (~29M chars).
  processEntities: {
    enabled: true,
    maxEntityCount: 100,
    maxTotalExpansions: 1_000_000,
    maxExpandedLength: 100_000_000,
  },
});

export function parseXml(text) {
  return parser.parse(text);
}

/**
 * Chains publish the same data under different spellings and casings
 * (ItemCode / ItemId, StoreId / StoreID), so every lookup goes through a
 * case-insensitive search instead of a hardcoded path.
 */
export function findKey(node, ...candidates) {
  if (!node || typeof node !== 'object') return undefined;
  const wanted = candidates.map((candidate) => candidate.toLowerCase());
  for (const [key, value] of Object.entries(node)) {
    if (wanted.includes(key.toLowerCase())) return value;
  }
  return undefined;
}

export function findValue(node, ...candidates) {
  const value = findKey(node, ...candidates);
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/**
 * Walks the whole tree for the first array whose entries look like records
 * (objects carrying at least one of the marker fields). Structures differ
 * enough between chains that searching beats guessing a path.
 */
export function findRecordArray(root, markers) {
  const wanted = markers.map((marker) => marker.toLowerCase());
  let best = null;

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const looksRight =
        node.length > 0 &&
        node.every((entry) => entry && typeof entry === 'object') &&
        node.some((entry) =>
          Object.keys(entry).some((key) => wanted.includes(key.toLowerCase())),
        );
      if (looksRight && (!best || node.length > best.length)) best = node;
      node.forEach(visit);
      return;
    }

    // A single record is not wrapped in an array by the XML parser.
    const isRecord = Object.keys(node).some((key) => wanted.includes(key.toLowerCase()));
    if (isRecord && !best) best = [node];

    Object.values(node).forEach(visit);
  };

  visit(root);
  return best ?? [];
}
