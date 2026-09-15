import { tokenize } from './textMatch.js';

/**
 * The words the classifier knows, and what shelf each one pulls toward.
 *
 * Data only — the scoring lives in classify.js. This is the file to edit when
 * a product is filed wrong, and every edit should arrive with a test beside it.
 *
 * **A word may pull toward more than one shelf**, so an entry can carry a
 * weight per category rather than a single answer. "שוקולד" is mostly a snack
 * but also appears in cakes and desserts, so it leans to snacks without ruling
 * the others out; the margin rule in classify.js decides whether the leader is
 * worth showing at all. A word listed with two equal weights is one this table
 * deliberately refuses to guess about — "פיצה" is fresh or frozen depending
 * only on which aisle you were standing in.
 *
 * The lists were not invented. They were grown against the published
 * catalogue — a hundred thousand distinct product names — by repeatedly
 * measuring which words appeared most often in names nothing could place
 * (`scratchpad/gaps.mjs`) and adding from the top of that list down. That is
 * why "גבינת" sits beside "גבינה" and why the abbreviations are here: the
 * shops write "גב.עיזים" and "שוק.מריר", and those are among the most common
 * tokens in the whole catalogue.
 */

/**
 * Written words are folded the same way tokens are.
 *
 * `tokenize` applies SYNONYMS and then `singular`, so "עגבניה" arrives as
 * "עגבניה", "מלפפונים" as "מלפפונ" and "משקאות" as "משקאה". Hand-writing those
 * stems would be unreadable and would rot the moment `singular` changed, so the
 * lists below stay in plain Hebrew and are folded here at load.
 */
const stem = (word) => tokenize(word)[0]?.value ?? word;

/** Bulk entries for one shelf. Most words only ever mean one thing. */
const only = (categoryId, weight, words) => words.map((w) => [w, { [categoryId]: weight }]);

/**
 * Words that genuinely pull more than one way, weighted by how strongly.
 *
 * Kept apart from the bulk lists because each one is a judgement that had a
 * reason, and a reason is easier to revisit when it is not buried in a list of
 * two hundred nouns.
 */
const AMBIGUOUS = [
  ['שוקולד', { snacks: 2, bakery: 0.5, dairy: 0.5 }],
  ['שוק', { snacks: 3, meat: 1 }], // "שוק.מריר" is chocolate; "שוק עוף" is a drumstick.
  ['שוקו', { drinks: 3, dairy: 1 }],
  ['פיצה', { bakery: 2, frozen: 2 }], // Fresh or frozen; the table will not guess.
  ['אפונה', { canned: 1.5, produce: 1.5, frozen: 1.5 }],
  ['תירס', { canned: 2, produce: 1.5 }],
  ['טונה', { canned: 2.5, meat: 1 }], // Sold in a tin almost without exception here.
  ['סבון', { care: 1.5, cleaning: 1.5 }], // Hands or dishes.
  ['מרכך', { care: 1, cleaning: 1 }], // Hair or laundry.
  ['אבקת', { canned: 1, cleaning: 1 }], // Baking or washing.
  ['קפסולה', { drinks: 1.5, cleaning: 1.5 }], // Coffee or dishwasher.
  ['קרם', { care: 2, dairy: 0.5 }],
  ['מגבונים', { cleaning: 2, care: 1 }],
  ['טישו', { cleaning: 2, care: 1 }],
  ['נייר', { cleaning: 2 }],
  ['מברשת', { care: 2, cleaning: 1 }],
  ['קפה', { canned: 2, drinks: 1 }],
  ['תה', { canned: 2, drinks: 1 }],
  ['פלפל', { produce: 2, canned: 1 }],
  ['פטריות', { produce: 2, canned: 1 }],
  ['ברוקולי', { produce: 2, frozen: 1 }],
  ['שניצל', { meat: 2, frozen: 1 }],
  ['המבורגר', { meat: 2, frozen: 1 }],
  ['ציפס', { snacks: 2, frozen: 1 }],
  ['בורקס', { bakery: 2, frozen: 1 }],
  ['עוגיות', { bakery: 2, snacks: 1 }],
  ['בצק', { bakery: 1.5, frozen: 1.5 }],
  ['עגבניה', { produce: 3, canned: 0.5 }],
  ['סויה', { dairy: 1, canned: 1 }],
  ['לבן', { dairy: 1.5 }], // Also just "white".
  ['צהובה', { dairy: 2 }],
  ['ספריי', { cleaning: 1.5, care: 1.5 }], // Air freshener or deodorant.
  ['כמוסה', { drinks: 1.5, cleaning: 1.5 }], // Coffee or dishwasher.
  ['טבליה', { cleaning: 2, care: 1 }],
  ['וניל', { snacks: 1, bakery: 1, frozen: 1 }], // A flavour, never a shelf.
  ['תערובת', { canned: 1.5, snacks: 1.5 }],
  ['סלט', { produce: 1.5, canned: 1.5 }],
  ['קוקוס', { canned: 1.5, snacks: 1.5 }],
  ['טופו', { dairy: 2, produce: 1 }],
  ['מטרנה', { dairy: 2, care: 1.5 }], // Infant formula sits with the milk.
  ['פיניש', { cleaning: 2.5 }],
  // "ג'ל" loses its apostrophe in normalisation and arrives as "גל".
  ['גל', { care: 1.5, cleaning: 1.5 }],
  ['מי', { drinks: 2 }], // "מי קוקוס", "מי עדן" — waters of something.
  ['עלי', { produce: 2 }], // "עלי גפן", "עלי בזיליקום".
  ['פרוטאין', { snacks: 1.5, care: 1.5 }], // A supplement, or a hair dye.
  ['קולור', { care: 1.5, cleaning: 1.5 }], // Hair colour, or colour-safe detergent.
  ['קוקטייל', { drinks: 1.5, canned: 1.5 }], // A drink, or a jar of olives.
];

const RAW_KEYWORDS = [
  ...AMBIGUOUS,

  // ---- produce ----
  ...only('produce', 3, [
    'מלפפון', 'בצל', 'שום', 'תפוח', 'בננה', 'לימון', 'גזר', 'חסה', 'קישוא',
    'חציל', 'אבטיח', 'מלון', 'ענבים', 'תות', 'אבוקדו', 'כרוב', 'פטרוזיליה',
    'כוסברה', 'בטטה', 'אגס', 'תמר', 'רימון', 'תפודים', 'תפוא', 'אננס',
    'אפרסק', 'מנגו', 'פטל', 'תפוז', 'דובדבן', 'אוכמניה', 'משמש', 'שזיף',
    'נקטרינה', 'קלמנטינה', 'אשכולית', 'פומלה', 'ליים', 'סלרי', 'שמיר',
    'נענע', 'בזיליקום', 'רוקט', 'תרד', 'סלק', 'צנון', 'לפת', 'דלעת',
    'דלורית', 'כרובית', 'כרישה', 'ארטישוק', 'במיה', 'גמבה', 'עלים',
    'קיווי', 'פסיפלורה', 'ליצי', 'אפרסמון', 'חבוש', 'תאנים', 'שומר',
    'קולורבי', 'סברס', 'אורגנו', 'רוזמרין', 'מרווה', 'טימין', 'נבטי',
    'שאלוט', 'לוביה', 'קולסלאו',
  ]),
  // פירות (fruit) and פירה (mashed potato) fold to the same token, so this
  // entry decides for both. Fruit is much the commoner reading, and losing the
  // potato is the better of the two mistakes on offer.
  ...only('produce', 2, ['פרי', 'ירקות', 'פירות', 'עשבי']),

  // ---- dairy ----
  // "לבנה" is the soft cheese and also the adjective "white", so it is
  // listed low: strong enough to tip a name that already smells of dairy,
  // too weak to file a white laundry gel as cheese.
  ...only('dairy', 1.5, ['לבנה']),
  ...only('dairy', 3, [
    'קוטג', 'שמנת', 'חמאה',
    'ביצים', 'אשל', 'מעדן', 'מוצרלה', 'בולגרית', 'גאודה', 'עמק',
    'קממבר', 'ברי', 'פטה', 'ריקוטה', 'מסקרפונה', 'פרמזן', 'צפתית', 'חלבי',
    'שמנית', 'גיל', 'יופלה', 'דנונה', 'מילקי', 'פודינג',
  ]),

  // ---- meat & fish ----
  ...only('meat', 3, [
    'נקניקיות', 'סלמון', 'כבד', 'אנטריקוט', 'כרעיים',
    'חזה', 'טחון', 'קבב', 'פסטרמה', 'בקר', 'הודו', 'דניס', 'אמנון', 'פילה',
    'דג', 'דגים', 'סלמי', 'שוקיים', 'כנפיים', 'אסאדו', 'שווארמה', 'קציצות',
    'לברק', 'מושט', 'בורי', 'הרינג', 'סרדינים', 'פרגית', 'צלעות', 'סטייק',
    'כתף', 'ירכיים', 'עגל', 'טלה', 'כבש', 'חזיר', 'מעושן', 'נתח',
  ]),

  // ---- bakery ----
  ...only('bakery', 3, [
    'חלה', 'בגט', 'קרואסון', 'מאפה',
    'טורטיה', 'מצות', 'רוגלך', 'בייגל', 'פוקצה', 'שטרודל',
    'טוסט', 'צנימים', 'מלווח', 'סופגניה', 'מאפים', 'כריך',
  ]),

  // ---- canned, dry and store cupboard ----
  ...only('canned', 3, [
    'שימורי', 'טחינה', 'שמן', 'קמח', 'סוכר', 'אורז', 'פסטה', 'אטריות',
    'קטשופ', 'מיונז', 'חרדל', 'דבש', 'עדשים',
    'שעועית', 'גרגירי', 'מלח', 'קוסקוס', 'סולת', 'קורנפלקס', 'גרנולה',
    'תבלין', 'תיבול', 'פפריקה', 'כורכום',
    'קינמון', 'זעתר', 'סומק', 'נודלס', 'שועל', 'שיבולת', 'דגני', 'חיטה',
    'בורגול', 'קינואה', 'פתיתים', 'שמרים', 'חומץ', 'סילאן',
    'ממרחי', 'חמוצים', 'קטניות', 'גריסים',
    'תמצית', 'לאפה', 'פירורי', 'ציפוי', 'אבקה',
  ]),
  ...only('canned', 2, ['חומוס', 'זית', 'משומר', 'קופסה']),
  // Third pass over the gap report: each of these appeared at least
  // seventy times in names nothing could place.
  ...only('canned', 3, [
    'ספגטי', 'פנה', 'קונכיות', 'לזניה', 'כוסמת', 'כוסמין', 'שומשום',
    'קקאו', 'אספרסו', 'נמס', 'מרגרינה', 'סחוג', 'חילבה',
    'זרעי', 'פשתן', 'צימוקי', 'שמרי', 'ג\'לי', 'מחמצת', 'קדאיף', 'מטבוחה',
    'קורנפלור', 'קצפת', 'סוכרזית', 'גריסי', 'סוכרלוז', 'ממולאים',
  ]),


  // ---- frozen ----
  // The qualifier carries the weight rather than a combo: "קפוא" and "קפואה"
  // are separate tokens (credit() will not bridge four-letter words) and each
  // has to outweigh whatever food word stands beside it.
  ...only('frozen', 3, [
    'הקפאה', 'מלאווח', 'גחנון', 
    'קרחון', 'סורבה',
  ]),

  // ---- drinks ----
  ...only('drinks', 3, [
    'וודקה', 'וויסקי', 'ערק', 'ליקר', 'טוניק',
    'אנרגיה', 'שתייה', 'מוגז', 'מינרלים', 'ברנדי', 'רום',
    'טקילה', 'ג\'ין', 'שמפניה',
  ]),
  ...only('drinks', 2, ['פחית', 'פחיות', 'שישייה']),
  // A bottle is a container, but in a grocery catalogue it is a container of
  // something drinkable far more often than not.
  ...only('drinks', 2.5, ['בקבוק', 'קנקן']),
  // Grape varieties name a wine and nothing else in a grocery.
  ...only('drinks', 3, [
    'קברנה', 'סוביניון', 'מרלו', 'שרדונה', 'רוזה', 'יינות', 'מיצים',
    'אייס', 'סמוזי', 'מילקשייק',
  ]),


  // ---- snacks ----
  ...only('snacks', 3, [
    'תפוציפס', 'אגוזי', 'אגוז',
    'פיצוחים', 'גרעינים', 'גרעיני', 'שקדים', 'בוטנים', 'ופל', 'וופל',
    'ביסקוויט', 'מסטיק', 'קרקר', 'פריכיות', 'בייגלה', 'חלבה', 'מרשמלו',
    'פופקורן', 'בונבוניירה', 'נוגט', 'טופי', 'קרמבו', 'לוקום',
    'פיסטוק', 'קשיו', 'פקאן', 'צימוקים', 'מקופלת', 'פרלינים',
    'קראנץ', 'צ\'יטוס',
  ]),
  ...only('snacks', 2, ['קלוי', 'מיובש', 'מסוכר']),
  // "ביסלי בצל" is a crisp, not an onion.
  ...only('snacks', 4, ['במבה', 'ביסלי', 'אפרופו', 'קליק', 'שוגי', 'סקיטלס']),
  ...only('snacks', 3, [
    'ממתק', 'מנטוס', 'חמוציה', 'טופיפי', 'נאטס', 'חמצוצים', 'גומיות',
    'חטיפים', 'לוז', 'מקדמיה', 'ברזילאי',
  ]),


  // ---- cleaning ----
  ...only('cleaning', 3, [
    'טואלט', 'ניילון', 'סמרטוט', 'ספוג',
    'מטהר', 'אשפה', 'כלור', 'מנקה', 'רצפה', 'מרסס', 'מטליה',
    'לניקוי', 'מבשם',
    'מכונה', 'כיור', 'אמבטיה', 'חלונות', 'תנור', 'שומנים', 'אבק', 'מטאטא',
    'מגב', 'דלי', 'פח', 'ריחני', 'חיטוי', 'קרצוף',
  ]),
  ...only('cleaning', 2, [
    'כלים', 'ניקוי', 'נוזלי', 'כפפה', 'אלומיניום', 'צלחת', 'צלחות',
    'כוס', 'כוסות', 'סכום', 'מפית', 'מפיות', 'קיסם', 'נרות', 'נר', 'גפרורים',
    'חדפעמי', 'פלסטיק', 'נירוסטה', 'תבנית', 
  ]),

  ...only('meat', 3, ['קבנוס', 'קורנדביף', 'לוף', 'מורטדלה', 'קרפצ\'יו']),
  ...only('dairy', 3, ['צדר', 'מולר', 'אמנטל', 'קפיר', 'שמנתית']),

  // ---- hygiene & care ----
  ...only('care', 3, [
    'שיניים', 'תחליב', 'גילוח', 'תער', 'טמפונים',
    'תחבושות', 'דנטלי', 'בושם', 'שיער', 'לשיער', 'לחות', 'רחצה',
    'מסיר', 'איפור', 'לק', 'שפתון', 'מסקרה', 'קונדומים', 'פדים', 'מגבון',
    'קרמים', 'סרום', 'מסכה', 'שיזוף', 'אפטר', 'אינטימי',
    'תחתונים', 'טיפוח', 'עדשות', 'מקלוני', 'משחה', 'גוף',
  ]),
  ...only('care', 2, [
    'פנים', 'ידיים', 'אוזניים', 'רגליים', 'עור', 'שפתיים', 'ציפורניים',
    'תינוק', 'בייבי', 'לגבר', 'לאישה', 'מגן', 'לילה', 'יום',
  ]),

  // Nouns that name the product itself rather than its flavour.
  //
  // "מיץ פטל" is juice, "ריבת דובדבן" is jam, "רוטב עגבניות" is sauce.
  // With everything at 3 these tied against the fruit and the margin rule
  // declined to guess, which was the single largest class of name the
  // classifier gave up on. Above the ordinary weight, below a combo's.
  ...only('drinks', 4, ['מיץ', 'נקטר', 'תרכיז', 'לימונדה', 'שייק', 'משקה']),
  ...only('canned', 4, ['ריבה', 'ריבת', 'רוטב', 'ממרח', 'מרק', 'מחית', 'רסק', 'סירופ']),
  ...only('frozen', 4, ['גלידה', 'גלידת', 'שלגון', 'ארטיק', 'קפוא', 'קפואה', 'מוקפא', 'מוקפאה']),
  ...only('bakery', 4, ['עוגה', 'עוגת']),
  ...only('drinks', 4, ['בירה', 'יין', 'קולה', 'מים', 'סודה', 'חליטת', 'חליטה']),
  ...only('snacks', 4, ['סוכריות', 'חטיף', 'חטיפי', 'אורביט']),
  // The shops' own abbreviations, which are among the commonest tokens here:
  // חט.נייטשר, שוק.מריר, גב.עיזים, תח.גוף, תחל.קפה.
  ...only('snacks', 4, ['חט']),
  ...only('dairy', 4, ['עיז', 'גב', 'גבי']),
  ...only('care', 4, ['תח']),
  ...only('dairy', 4, ['גבינה', 'גבינת', 'יוגורט', 'חלב']),
  ...only('bakery', 4, ['לחם', 'פיתה', 'לחמניה']),
  ...only('meat', 4, ['עוף', 'בשר', 'נקניק']),
  ...only('cleaning', 4, ['אקונומיקה', 'כביסה', 'אסלה']),
  ...only('care', 4, ['שמפו', 'דאודורנט', 'משחת', 'חיתולים']),
];

/**
 * Brands, and the shelf each one implies.
 *
 * A brand is often the only category signal a name has: "לינדט אקסלנס 70%" and
 * "ניוטרוגינה ויזבלי" contain no noun saying what they are. These were taken
 * from the most frequent unplaceable products in the real catalogue, counted by
 * how many chains stock them, so the list is short and every entry earns its
 * place.
 *
 * Two kinds, and the difference matters more than it looks.
 *
 * A **house brand** spans shelves. אסם sells soup and crisps, שטראוס sells
 * chocolate and yoghurt. These say where a product probably sits and have to
 * lose to any word that actually names it.
 *
 * A **product brand** is the name of one thing. פריגת is juice; ספרייט is a
 * soft drink; ביסלי is a crisp. In "פריגת ענבים" and "ספרייט ליים" the fruit is
 * the flavour and the brand is the product — but both scored three, the margin
 * refused to choose, and the most widely stocked products in the whole
 * catalogue came back with no suggestion at all. So a product brand sits at the
 * defining weight, level with "מיץ" and for the same reason.
 */
const RAW_BRANDS = [
  ...only('cleaning', 4, ['פיירי', 'אריאל', 'סופטלן', 'ריצפז', 'קליניקס']),
  ...only('cleaning', 2.5, ['סנו', 'ניקול', 'מר', 'באדי']),
  ...only('care', 4, ['פלמוליב', 'פנטן', 'ניוטרוגינה', 'קולגייט', 'ליסטרין', 'אולטרסול']),
  ...only('care', 2.5, [
    'דאב', 'דאו', 'קרפרי', 'האגיס',
    'פמפרס', 'טיטולים', 'קמיל', 'לוריאל', 'גרנייה', 'ניבאה', 'ג\'ילט',
    'אלביב', 'הד', 'קלינקס', 'לייף', 'אואי', 'שאולדרס', 'סטיק',
  ]),
  // Product brands: the brand IS the product, so it outranks a flavour.
  ...only('drinks', 4, [
    'שוופס', 'קוקה', 'פפסי', 'פריגת', 'פרילי', 'תפוזינה', 'סוצני',
    'גולדסטאר', 'הייניקן', 'קרלסברג', 'טובורג', 'סבן', 'מירינדה', 'ספרייט',
    'נביעות', 'ספרינג', 'אפרול', 'שטיינלגר', 'פאנטה', 'קינלי', 'נסטי',
    'טרופית', 'יפאורה', 'פרוטה',
  ]),
  // House brands: a hint about the aisle, nothing more.
  ...only('drinks', 2.5, ['עין', 'טמפו', 'יטבתה', 'נסקפה', 'ויסוצקי', 'לנדוור']),
  ...only('snacks', 4, [
    'לינדט', 'מילקה', 'טובלרון', 'פרינגלס', 'אוראו', 'מלטיזרס', 'פיטנס',
    'קראנצוס', 'דוריטוס', 'טוויקס', 'מארס', 'סניקרס', 'בונטי', 'קיטקט',
  ]),
  ...only('snacks', 2.5, ['קינדר', 'נסטלה']),
  ...only('dairy', 2.5, ['תנובה', 'טרה', 'גד', 'שטראוס']),
  ...only('canned', 2, ['אסם', 'יכין', 'סוגת', 'תלמה', 'הרדוף', 'ויליפוד']),
  ...only('frozen', 4, ['סנפרוסט', 'מאמאמיה', 'שלושת', 'דגה', 'קרטיב', 'פולרטי']),
  ...only('meat', 2.5, ['זוגלובק', 'מעולה']),
];

/**
 * Pairs whose meaning together is not the sum of their parts.
 *
 * Only for cases where the individual words genuinely point elsewhere:
 * "חלב שוקולד" is neither milk nor chocolate but a drink, and "חומץ יין" is
 * not wine at all. A qualifier that simply outweighs its neighbour belongs in
 * the keyword table, where it composes with everything rather than with one
 * listed partner.
 */
const RAW_COMBOS = [
  { words: ['חלב', 'שוקולד'], scores: { drinks: 6 } },
  { words: ['סבון', 'כלים'], scores: { cleaning: 6 } },
  { words: ['סבון', 'גוף'], scores: { care: 6 } },
  { words: ['סבון', 'ידיים'], scores: { care: 6 } },
  { words: ['נייר', 'טואלט'], scores: { cleaning: 6 } },
  { words: ['אבקת', 'כביסה'], scores: { cleaning: 6 } },
  { words: ['מרכך', 'כביסה'], scores: { cleaning: 6 } },
  { words: ['מרכך', 'שיער'], scores: { care: 6 } },
  { words: ['רסק', 'עגבניה'], scores: { canned: 6 } },
  { words: ['שמן', 'זית'], scores: { canned: 6 } },
  { words: ['מי', 'קוקוס'], scores: { drinks: 6 } },
  { words: ['דגני', 'בוקר'], scores: { canned: 6 } },
  { words: ['נוזל', 'כלים'], scores: { cleaning: 6 } },
  { words: ['מגבות', 'נייר'], scores: { cleaning: 6 } },
  // Not wine, however much of the word is wine.
  { words: ['חומץ', 'יין'], scores: { canned: 6 } },
  { words: ['אטריות', 'ביצים'], scores: { canned: 6 } },
  { words: ['שמן', 'קנולה'], scores: { canned: 6 } },
  { words: ['קרם', 'קוקוס'], scores: { canned: 6 } },
  { words: ['מלפפון', 'חומץ'], scores: { canned: 6 } },
  { words: ['מלפפון', 'מלח'], scores: { canned: 6 } },
  { words: ['פטה', 'כבש'], scores: { dairy: 6 } },
  { words: ['קמח', 'שקד'], scores: { canned: 6 } },
  { words: ['אבקת', 'אפיה'], scores: { canned: 6 } },
  { words: ['גרעיני', 'חמניה'], scores: { snacks: 6 } },
  { words: ['עוגיות', 'ציפס'], scores: { bakery: 6 } },
];

/**
 * What a product *is*, when it opens by saying so.
 *
 * Hebrew puts the head noun first: "גלידת שוקולד" is ice cream, "עוגת שוקולד"
 * is cake, "מעדן חלב" is a dessert. `leadCategory` already recognises this set
 * — it was built and debugged against a real catalogue for the bot's matcher —
 * so this only has to say which shelf each of its words means.
 *
 * Words left out are left out on purpose. "אבקה" is baking powder or laundry
 * powder; "קפסולות" is coffee or dishwasher; "סלט" could be half the shop. An
 * unmapped head word contributes nothing and the rest of the name decides.
 */
const RAW_HEADS = {
  גלידה: 'frozen',
  גלידת: 'frozen',
  מעדן: 'dairy',
  מעדני: 'dairy',
  יוגורט: 'dairy',
  לאבנה: 'dairy',
  חטיף: 'snacks',
  חטיפי: 'snacks',
  שוקולד: 'snacks',
  ופל: 'snacks',
  וופל: 'snacks',
  ביסקוויט: 'snacks',
  קינוח: 'snacks',
  מסטיק: 'snacks',
  בייגלה: 'snacks',
  פריכיות: 'snacks',
  קרקר: 'snacks',
  קרקרים: 'snacks',
  משקה: 'drinks',
  משקאות: 'drinks',
  עוגה: 'bakery',
  עוגת: 'bakery',
  עוגיות: 'bakery',
  עוגיה: 'bakery',
  בורקס: 'bakery',
  ממרח: 'canned',
  רוטב: 'canned',
  מרק: 'canned',
  תבלין: 'canned',
  מחית: 'canned',
  דגני: 'canned',
  תרסיס: 'cleaning',
  נוזל: 'cleaning',
  שמפו: 'care',
  תחליב: 'care',
  משחת: 'care',
  דאודורנט: 'care',
  מברשת: 'care',
};

/**
 * Every word as written, before stemming.
 *
 * Exported only so a test can prove no two of them fold onto the same stem.
 * That collision is silent and destructive: "שוקולית" is a SYNONYM of "שוקו",
 * so listing it under snacks quietly replaced the drink. The test caught it;
 * nothing else would have.
 */
export const WRITTEN_WORDS = [...RAW_BRANDS, ...RAW_KEYWORDS].map(([word]) => word);

/**
 * Stemmed word -> { categoryId: weight }.
 *
 * Brands go in first so a real category noun listed later wins the key — a
 * duplicate is a mistake either way, and this makes the mistake harmless.
 */
export const KEYWORD_WEIGHTS = new Map(
  [...RAW_BRANDS, ...RAW_KEYWORDS].map(([word, scores]) => [stem(word), scores]),
);

/** Every combo word is stemmed too, so they are comparable with tokens. */
export const COMBOS = RAW_COMBOS.map((combo) => ({
  words: combo.words.map(stem),
  scores: combo.scores,
}));

/** Stemmed `leadCategory` value -> category id. */
export const HEAD_CATEGORIES = new Map(
  Object.entries(RAW_HEADS).map(([word, categoryId]) => [stem(word), categoryId]),
);
