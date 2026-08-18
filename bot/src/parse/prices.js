import { readXmlFile } from './gunzip.js';
import { parseXml, findRecordArray, findValue } from './xml.js';

const ITEM_MARKERS = ['ItemCode', 'ItemName', 'ItemId', 'ItemNm'];

// A full branch catalogue runs to thousands of products. Anything smaller
// means a partial "Price" update slipped through instead of "PriceFull".
const MIN_EXPECTED_PRODUCTS = 500;

/** PriceFull XML → Product[] */
export async function parsePricesFile(filePath, chainName) {
  const root = parseXml(await readXmlFile(filePath));

  const products = findRecordArray(root, ITEM_MARKERS)
    .map((item) => {
      const price = Number(findValue(item, 'ItemPrice', 'Price'));
      const quantity = findValue(item, 'Quantity');
      const unit = findValue(item, 'UnitQty', 'UnitOfMeasure', 'UnitMeasure');

      return {
        code: findValue(item, 'ItemCode', 'ItemId', 'Barcode'),
        name: findValue(item, 'ItemName', 'ItemNm'),
        manufacturer: findValue(item, 'ManufacturerName', 'ManufactureName') ?? '',
        price,
        unitQty: [quantity, unit].filter(Boolean).join(' '),
        unitPrice: Number(findValue(item, 'UnitOfMeasurePrice')) || null,
        status: findValue(item, 'ItemStatus'),
      };
    })
    .filter((product) => product.name && Number.isFinite(product.price) && product.price > 0)
    .filter((product) => product.status !== '0');

  if (products.length < MIN_EXPECTED_PRODUCTS) {
    throw new Error(
      `קובץ המחירים של ${chainName} חשוד כחלקי (${products.length} מוצרים בלבד). ` +
        'ככל הנראה הורד קובץ Price ולא PriceFull.',
    );
  }

  return products;
}
