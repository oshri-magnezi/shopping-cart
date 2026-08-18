import { readXmlFile } from './gunzip.js';
import { parseXml, findRecordArray, findValue } from './xml.js';

const STORE_MARKERS = ['StoreId', 'StoreID', 'StoreName', 'StoreNumber'];

/** Stores XML → [{ storeId, name, city }] */
export async function parseStoresFile(filePath) {
  const root = parseXml(await readXmlFile(filePath));

  return findRecordArray(root, STORE_MARKERS)
    .map((store) => ({
      storeId: findValue(store, 'StoreId', 'StoreID', 'StoreNumber', 'StoreCode'),
      name: findValue(store, 'StoreName', 'StoreNm') ?? '',
      city: findValue(store, 'City', 'CityName') ?? '',
    }))
    .filter((store) => store.storeId);
}
