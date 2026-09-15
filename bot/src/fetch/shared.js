import { normalize } from '../match/normalize.js';
import { cityName, isOnlineStore } from './cities.js';

/**
 * Splits a published file name into its parts.
 *
 * Names look like PriceFull<chainId>-<subChain>-<storeId>-<YYYYMMDD>-<HHMMSS>
 * but the number of segments before the date varies (Stores files carry one,
 * price files carry two). Anchoring on the date segment rather than on a
 * fixed position is what makes this work across all three portals — the
 * 13-digit chain id would otherwise be mistaken for a timestamp.
 */
function splitName(name) {
  const base = String(name).replace(/\.(xml|gz)$/gi, '').replace(/\.xml$/i, '');
  const segments = base.split('-');
  // Portals write the stamp either as YYYYMMDD-HHMMSS or as one YYYYMMDDHHMM run.
  const dateIndex = segments.findIndex((segment) => /^20\d{6}(\d{2,6})?$/.test(segment));

  if (dateIndex <= 0) return { storeId: null, timestamp: '' };

  const stamp = segments[dateIndex];
  const timestamp =
    stamp.length > 8 ? stamp : stamp + (segments[dateIndex + 1] ?? '').padEnd(6, '0');

  return { storeId: segments[dateIndex - 1] ?? null, timestamp };
}

/** File name → sortable timestamp string (YYYYMMDDHHMMSS). */
export function timestampFromName(name) {
  return splitName(name).timestamp;
}

export function newestByName(entries, nameOf = (entry) => entry.name) {
  return [...entries].sort((a, b) =>
    timestampFromName(nameOf(b)).localeCompare(timestampFromName(nameOf(a))),
  )[0];
}

/** PriceFull7290058140886-001-042-20260816-121500.gz → "042" */
export function storeIdFromName(name) {
  return splitName(name).storeId;
}

export function isFullPriceFile(name) {
  return /pricefull/i.test(String(name));
}

export function isPromoFile(name) {
  return /promofull/i.test(String(name));
}

export function isStoresFile(name) {
  return /stores/i.test(String(name));
}

// Branch names abbreviate the big cities (ת"א, פ"ת, ראשל"צ), so a plain
// substring test on the full city name misses most of them.
const CITY_ALIASES = [
  ['תל אביב', 'תא', 'תלאביב יפו'],
  ['ירושלים', 'ים', 'ירושלם'],
  ['פתח תקווה', 'פת', 'פתח תקוה'],
  ['ראשון לציון', 'ראשלצ'],
  ['רמת גן', 'רג'],
  ['באר שבע', 'בש'],
  ['בני ברק', 'בב'],
  ['כפר סבא', 'כס'],
];

const squash = (text) => normalize(text).replace(/\s/g, '');

/**
 * Loose Hebrew city comparison, tolerant of quotes, hyphens and spacing.
 *
 * Short abbreviations must match a whole word: as a substring, "ת\"א" also
 * hides inside "רמ|ת א|ליהו", which once sent a Tel Aviv basket to a Rishon
 * LeZion branch.
 */
export function cityMatches(text, city) {
  const target = squash(city);
  if (!target) return false;

  const group = CITY_ALIASES.find((names) => names.some((name) => squash(name) === target));
  const needles = group ? group.map(squash) : [target];

  const haystack = squash(text);
  const words = normalize(text).split(' ').filter(Boolean);

  return needles.some((needle) =>
    needle.length <= 3 ? words.includes(needle) : haystack.includes(needle),
  );
}

/**
 * Picks the branch to price against: the requested city when the chain has a
 * shop there, otherwise the chain's nationwide delivery catalogue.
 *
 * `isUsable` lets the caller exclude branches that publish no full price file
 * — several chains list shops whose catalogue never appears, and pricing
 * against the next real branch beats dropping the chain from the comparison.
 * Returns null only when nothing usable exists.
 */
export function pickStore(stores, city, storeOverride, isUsable = () => true) {
  if (storeOverride) {
    const forced = stores.find((store) => store.storeId === String(storeOverride));
    if (forced) return { store: forced, viaOnline: false };
  }

  const usable = stores.filter(isUsable);

  const local = usable.find((store) => cityMatches(`${cityName(store.city)} ${store.name}`, city));
  if (local) return { store: local, viaOnline: false };

  const online = usable.find(isOnlineStore);
  return online ? { store: online, viaOnline: true } : null;
}

/**
 * Explains why a chain could not be priced, accurately.
 *
 * The original message said one thing in every case: "no branch in that city,
 * set a storeOverride". For קשת טעמים that advice is simply wrong — the chain
 * lists twenty-seven branches and twenty-six of them publish an empty
 * catalogue, so no override exists that would help. Reading that line three
 * nights running and going looking for a branch id is time spent on a problem
 * that is not there.
 *
 * `stores` and `isUsable` are optional so the older callers keep working
 * unchanged; passing them is what buys the better diagnosis.
 */
export function storeNotFoundError(chainKey, chainName, city, stores = null, isUsable = null) {
  const listHint = `הרץ "node src/index.js --list-stores ${chainKey}" כדי לראות את רשימת הסניפים`;
  // Hebrew agrees in number across the whole clause, not just the noun, so
  // these produce the clause rather than a count to be pasted into one.
  const branches = (n) => (n === 1 ? 'סניף אחד' : `${n} סניפים`);
  const othersPublish = (n) =>
    n === 1 ? 'סניף אחד אחר כן מפרסם' : `${n} סניפים אחרים כן מפרסמים`;

  if (Array.isArray(stores) && stores.length > 0 && typeof isUsable === 'function') {
    const inCity = stores.filter((store) =>
      cityMatches(`${cityName(store.city)} ${store.name}`, city),
    );
    const publishing = stores.filter(isUsable);

    if (publishing.length === 0) {
      return new Error(
        `${chainName}: אף אחד מ־${branches(stores.length)} לא מפרסם קובץ מחירים מלא, ` +
          `כך שאין מה להשוות. זו בעיה אצל הרשת, לא בהגדרות — storeOverride לא יעזור כאן.`,
      );
    }

    if (inCity.length > 0) {
      return new Error(
        `${chainName}: יש ${branches(inCity.length)} בעיר "${city}", אבל אף אחד מהם לא מפרסם ` +
          `קובץ מחירים מלא. ${othersPublish(publishing.length)} — ${listHint}, ` +
          `ואז הגדר מזהה סניף ב-config.json תחת storeOverrides.${chainKey} אם מחיר מסניף אחר מקובל.`,
      );
    }
  }

  return new Error(
    `לא נמצא סניף של ${chainName} בעיר "${city}". ` +
      `${listHint}, ואז הגדר מזהה סניף ב-config.json תחת storeOverrides.${chainKey}.`,
  );
}

/**
 * Downloads the branch's PromoFull, or returns null.
 *
 * Promotions are a bonus, never a requirement: a chain whose promo file is
 * missing or unreadable still has perfectly good shelf prices, so every
 * failure here is logged and swallowed rather than failing the chain.
 */
export async function downloadPromos({
  page,
  files,
  storeId,
  cacheDir,
  key,
  urlFor,
  download,
  log,
  displayName,
}) {
  try {
    const candidates = files.filter(
      (file) => isPromoFile(file.name) && storeIdFromName(file.name) === storeId,
    );
    if (candidates.length === 0) return null;

    const newest = newestByName(candidates);
    const destination = `${cacheDir}/${key}-${storeId}-promo.gz`;
    await download(page, urlFor(newest.name), destination);
    return destination;
  } catch (error) {
    log(`${displayName}: המבצעים לא נטענו — ${error.message}`);
    return null;
  }
}
