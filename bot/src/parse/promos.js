import { readXmlFile } from './gunzip.js';
import { parseXml, findRecordArray, findValue } from './xml.js';

const PROMO_MARKERS = ['PromotionId', 'PromotionID', 'PromotionDescription'];
const ITEM_MARKERS = ['ItemCode', 'ItemId'];

/**
 * Reads a PromoFull file and splits it into what can and cannot be priced:
 * `prices` maps a barcode to an honest per-unit price, and `promoted` holds
 * the barcodes that carry some other kind of deal.
 *
 * Most published promotions cannot be applied to a basket. "3 for ₪10" depends
 * on how many the shopper buys, club prices depend on membership, "spend ₪75"
 * depends on the whole trolley, and gift deals give a different product.
 * Showing any of those as *the* price would understate the total, so they are
 * skipped and the shelf price stands.
 *
 * The per-item fields live inside Groups → Group → PromotionItems, not on the
 * promotion record itself — a promotion can cover several products on
 * different terms.
 */
export async function parsePromosFile(filePath) {
  const root = parseXml(await readXmlFile(filePath));
  const prices = new Map();
  // Products carrying a deal we cannot price. Measured against real data,
  // this is the overwhelming majority: at one chain, 2,595 promotions yielded
  // zero simple unit prices — nearly all are multi-buys or bundles. Flagging
  // them still helps, because the shopper can go and look.
  const promoted = new Set();

  for (const promo of findRecordArray(root, PROMO_MARKERS)) {
    const items = findRecordArray(promo, ITEM_MARKERS);
    const openToAll = isOpenToEveryone(promo);

    if (openToAll) {
      for (const item of items) {
        const itemCode = findValue(item, 'ItemCode', 'ItemId');
        if (itemCode) promoted.add(itemCode);
      }
    }

    if (!openToAll) continue;
    if (requiresBasketSpend(promo)) continue;
    // A promotion spanning several products is a bundle, not a unit price.
    if (items.length !== 1) continue;

    const item = items[0];
    const code = findValue(item, 'ItemCode', 'ItemId');
    if (!code) continue;

    // RewardType 1 is "this item costs the discounted price"; anything else
    // (gift, cheapest-free, added value) cannot be reduced to a unit price.
    const rewardType = findValue(item, 'RewardType');
    if (rewardType && rewardType !== '1') continue;

    // A minimum above one unit makes it a multi-buy.
    const minQty = Number(findValue(item, 'MinQty') ?? '1');
    if (Number.isFinite(minQty) && minQty > 1) continue;

    const price = Number(findValue(item, 'DiscountedPrice'));
    if (!Number.isFinite(price) || price <= 0) continue;

    // Several promotions can cover one product; the shopper pays the lowest.
    const current = prices.get(code);
    if (current === undefined || price < current) prices.set(code, price);
  }

  // A priced promotion needs no separate flag.
  for (const code of prices.keys()) promoted.delete(code);

  return { prices, promoted };
}

/** Club-only prices are not available to every shopper. */
function isOpenToEveryone(promo) {
  const clubId = findValue(promo, 'ClubId', 'ClubID');
  if (!clubId) return true;
  // Chains write this as "0" or as "0 - כלל הלקוחות".
  return clubId.trim().startsWith('0');
}

/** "Spend ₪75 and get…" depends on the rest of the trolley. */
function requiresBasketSpend(promo) {
  for (const group of findRecordArray(promo, ['GroupID', 'MinPurchaseAmount'])) {
    const amount = Number(findValue(group, 'MinPurchaseAmount') ?? '0');
    if (Number.isFinite(amount) && amount > 0) return true;
  }
  return false;
}
