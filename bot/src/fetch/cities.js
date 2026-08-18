/**
 * Chains publish the branch city as a CBS municipality code rather than a
 * name ("5000" for Tel Aviv), so a plain string compare never matches. This
 * map covers the towns the participating chains actually operate in; codes
 * were confirmed against branch names in the live Stores files.
 */
export const CITY_CODES = new Map([
  ['31', 'אופקים'],
  ['70', 'אשדוד'],
  ['171', 'פרדסיה'],
  ['195', 'קדימה'],
  ['246', 'נתיבות'],
  ['681', 'גבעת שמואל'],
  ['874', 'מגדל העמק'],
  ['1015', 'מבשרת ציון'],
  ['1031', 'שדרות'],
  ['1034', 'באר טוביה'],
  ['1139', 'כרמיאל'],
  ['1165', 'שילת'],
  ['1200', 'מודיעין'],
  ['2400', 'אור יהודה'],
  ['2500', 'נשר'],
  ['2600', 'אילת'],
  ['2610', 'בית שמש'],
  ['2630', 'קרית גת'],
  ['2640', 'ראש העין'],
  ['2660', 'יבנה'],
  ['2800', 'קרית שמונה'],
  ['3000', 'ירושלים'],
  ['3570', 'אריאל'],
  ['3616', 'מעלה אדומים'],
  ['3780', 'ביתר עילית'],
  ['4000', 'חיפה'],
  ['5000', 'תל אביב'],
  ['6100', 'בני ברק'],
  ['6200', 'בת ים'],
  ['6300', 'גבעתיים'],
  ['6400', 'הרצליה'],
  ['6500', 'חדרה'],
  ['6600', 'חולון'],
  ['6700', 'טבריה'],
  ['6900', 'כפר סבא'],
  ['7000', 'לוד'],
  ['7100', 'אשקלון'],
  ['7400', 'נתניה'],
  ['7600', 'עכו'],
  ['7700', 'עפולה'],
  ['7800', 'פרדס חנה'],
  ['7900', 'פתח תקווה'],
  ['8300', 'ראשון לציון'],
  ['8400', 'רחובות'],
  ['8500', 'רמלה'],
  ['8600', 'רמת גן'],
  ['8700', 'רעננה'],
  ['9000', 'באר שבע'],
  ['9100', 'נהריה'],
  ['9200', 'בית שאן'],
  ['9300', 'זכרון יעקב'],
  ['9500', 'קרית ביאליק'],
  ['9700', 'הוד השרון'],
]);

/** Turns a raw city field into a name, leaving real names untouched. */
export function cityName(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return /^\d+$/.test(text) ? (CITY_CODES.get(text) ?? '') : text;
}

/**
 * Chains run one logical "branch" for their delivery/online catalogue. When a
 * chain has no shop in the requested city, that store still prices the whole
 * country, so it is a far better answer than dropping the chain entirely.
 */
export function isOnlineStore(store) {
  return /משלוח|אינטרנט|אונליין|online|מרלוג/i.test(`${store.name} ${store.city}`);
}
