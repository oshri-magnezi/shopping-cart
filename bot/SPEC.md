# מפרט מימוש מלא: בוט השוואת מחירי סל קניות (super-price-bot)

> מסמך זה הוא מפרט סגור לביצוע. המודל המממש לא אמור לקבל החלטות תכנון —
> כל החלטה כבר התקבלה כאן. כשכתוב "גלה בזמן ריצה", יש פרוצדורת גילוי מדויקת.
> אם מציאות הפורטל סותרת את המפרט — הפורטל קובע, ויש לתעד את הסטייה ב-README.

## Context

בוט Node.js + Puppeteer שמקבל רשימת קניות (JSON) ומדווח באיזו רשת — **שופרסל, חצי חינם, ויקטורי** — הסל הכי זול. מקור הנתונים: קבצי המחירים הרשמיים לפי חוק שקיפות המחירים (2015), לא סריקת אתרי קנייה. הקבצים מפורסמים **פר-סניף**, לכן נבחר סניף לפי עיר. פרויקט נפרד מאתר רשימת הקניות; מבנה הקלט תואם לאתר לצורך חיבור עתידי.

**סטטוס מחקר (אומת ב-2026-08-16 בכלים חיים):**

| רשת | פורטל | אומת |
|---|---|---|
| שופרסל | `https://prices.shufersal.co.il` — פתוח, בלי התחברות, טבלת קבצים עם דפדוף, הורדה מ-Azure Blob בקישורים חתומים. קוד רשת `7290027600007` | ✔ נבדק חי |
| חצי חינם | Cerberus: `https://url.retail.publishedprices.co.il` — טופס התחברות (שדות username/password, בלי CAPTCHA). Web client לקבצים: `/file/d/HaziHinam/` | ✔ נבדק חי |
| ויקטורי | `https://laibcatalog.co.il` — פתוח, בלי התחברות. Dropdowns: רשת / תת-רשת / סניף / סוג קובץ / תאריך + טבלת הורדות | ✔ נבדק חי |

- Cerberus מופעל ע"י NCR; שם המשתמש לחצי חינם: `HaziHinam`. סיסמה: לנסות ריקה תחילה, אחר-כך `123456` (מקור: המועצה לצרכנות). אלו פרטי גישה ציבוריים שהחוק מחייב — לא סוד.
- שמות קבצים בכל הפורטלים: `<Type><ChainId>-<StoreId>-<YYYYMMDDHHMM>...` עם סיומת `.gz` או `.xml.gz`. Types: `Stores`/`StoresFull`, `PriceFull`, `Price` (עדכון חלקי — **לא להשתמש**), `PromoFull`, `Promo`.
- **גרסה 1: PriceFull + Stores בלבד.** מבצעים (PromoFull) — שלב עתידי.
- וולט לא נכללת (פלטפורמת משלוחים, אין קבצי שקיפות, הגנות בוטים). אין לנסות לעקוף שום הגנת בוטים או CAPTCHA בשום שלב.

---

## 1. מבנה הפרויקט והתלויות

תיקייה: `C:\Users\efi\Desktop\super-price-bot`

```
super-price-bot/
├── package.json            # "type": "module", engines node >=20
├── shopping-list.json      # קלט לדוגמה (ראה §2)
├── config.json             # ראה §3
├── README.md               # הוראות הרצה + טבלת הפורטלים + סטיות מהמפרט אם היו
├── .gitignore              # node_modules, cache/, output/
├── src/
│   ├── index.js            # CLI + אורקסטרציה (§9)
│   ├── chains.js           # קונפיג שלוש הרשתות (§4)
│   ├── fetch/
│   │   ├── browser.js      # Puppeteer משותף + downloadViaPage (§5)
│   │   ├── shufersal.js    # §5.1
│   │   ├── hazihinam.js    # §5.2
│   │   └── victory.js      # §5.3
│   ├── parse/
│   │   ├── gunzip.js       # פענוח gz (§6)
│   │   ├── stores.js       # Stores XML → [{storeId, name, city}] (§6.1)
│   │   └── prices.js       # PriceFull XML → Product[] (§6.2)
│   ├── match/
│   │   ├── normalize.js    # §7.1
│   │   └── match.js        # §7.2–7.4
│   ├── compare.js          # §8
│   └── report.js           # §8.1
├── cache/                  # קבצים שהורדו + meta.json
└── output/                 # results.json אחרון
```

תלויות בלבד: `puppeteer` (latest), `fast-xml-parser` (v4). אין ספריית CLI — פענוח argv ידני. אין TypeScript.

## 2. סכמת הקלט

```json
{
  "items": [
    { "name": "חלב 3% 1 ליטר", "quantity": 2 },
    { "name": "לחם מחיטה מלאה", "quantity": 1 }
  ]
}
```

`name`: טקסט חופשי בעברית. `quantity`: שלם ≥ 1 (ברירת מחדל 1 אם חסר). שדות נוספים (id, categoryId מהאתר) — מותרים ומתעלמים מהם.

## 3. config.json

```json
{
  "city": "תל אביב",
  "storeOverrides": { "shufersal": null, "hazihinam": null, "victory": null },
  "matchThreshold": 0.55,
  "cacheHours": 24,
  "headless": true
}
```

`storeOverrides`: מזהה סניף ידני שגובר על חיפוש לפי עיר (למקרה שהעיר לא נמצאת). כל ערכי הקונפיג נקראים פעם אחת ב-index.js ומוזרמים כפרמטרים — אין `import config` בתוך מודולים.

## 4. חוזה האדפטרים (chains.js)

```js
export const chains = [
  { key: 'shufersal', displayName: 'שופרסל',  fetcher: fetchShufersal },
  { key: 'hazihinam', displayName: 'חצי חינם', fetcher: fetchHaziHinam },
  { key: 'victory',   displayName: 'ויקטורי',  fetcher: fetchVictory },
];
```

חתימת כל fetcher — אחידה:

```js
/**
 * @param {object} ctx { browser, city, storeOverride, cacheDir, cacheHours, log }
 * @returns {Promise<{ pricesPath: string, storeId: string, storeName: string }>}
 * pricesPath — נתיב מקומי לקובץ PriceFull (עדיין דחוס .gz)
 * זורק Error עם הודעה ברורה בעברית אם נכשל. index.js תופס וממשיך.
 */
```

**Cache:** לפני כל הורדה בדוק ב-`cache/meta.json` רשומה `{chainKey, storeId, filePath, fetchedAt}`. אם קיימת, הקובץ קיים בדיסק, ו-`now - fetchedAt < cacheHours` — החזר אותה בלי לפתוח דפדפן. דגל `--refresh` מדלג על הבדיקה. עדכן את meta.json אחרי כל הורדה מוצלחת.

## 5. שכבת ההורדה (Puppeteer)

### browser.js

- `launchBrowser(headless)` — מופע יחיד משותף. args: `['--lang=he-IL']`. viewport 1280×900.
- `downloadFile(page, url, destPath)` — הורדה **מתוך הקשר הדף** (כדי לשמר cookies/session):
  ```js
  const buf = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return Array.from(new Uint8Array(await r.arrayBuffer()));
  }, url);
  await fs.writeFile(destPath, Buffer.from(buf));
  ```
  אם הקובץ > ~50MB והעברת המערך איטית — fallback ל-CDP: `Browser.setDownloadBehavior` עם `downloadPath` והמתנה לסיום ההורדה (polling על הקובץ עד שגודלו מתייצב). לממש את ה-fallback רק אם נתקלים בבעיה בפועל.
- כל המתנה: `page.waitForSelector` עם timeout 30s. **אסור** `waitForTimeout` שרירותי מעל 2s.

### 5.1 shufersal.js

1. פתח `https://prices.shufersal.co.il`. העמוד מציג טבלת קבצים עם דפדוף ושני מסננים (dropdown קטגוריה, dropdown סניף).
2. **גילוי מסננים:** קרא את כל אלמנטי `<select>` בעמוד. זהה: (א) select שהאופציות שלו כוללות טקסטים כמו "PricesFull"/"מחירים מלא" — זה מסנן הקטגוריה; (ב) select עם עשרות/מאות אופציות של שמות סניפים — זה מסנן הסניף.
3. **בחירת סניף:** אם `storeOverride` נתון — בחר את האופציה שה-value שלה שווה לו. אחרת חפש אופציה שהטקסט שלה מכיל את `city` (normalize: להסיר גרשיים ורווחים כפולים). אין התאמה → Error: `לא נמצא סניף שופרסל בעיר "X". הרץ עם --list-stores shufersal לרשימה.`
4. בחר קטגוריית PricesFull, בחר את הסניף, המתן לעדכון הטבלה (waitForSelector על שורה שמכילה `PriceFull`).
5. מהטבלה קח את השורה **העדכנית ביותר** שבה השם מתחיל ב-`PriceFull` (לא `Price`!). חלץ את קישור ההורדה (Azure, חתום) והורד עם `downloadFile` אל `cache/shufersal-<storeId>.gz`.
6. `storeId` נגזר משם הקובץ (`PriceFull7290027600007-<storeId>-...`).
7. תמיכה ב-`--list-stores`: הדפס את כל אופציות מסנן הסניפים (value + text) וסיים.

### 5.2 hazihinam.js (Cerberus)

1. פתח `https://url.retail.publishedprices.co.il/login`.
2. מלא username=`HaziHinam`, password ריק. שלח. אם חזרת לעמוד login או הופיעה שגיאה — נסה password=`123456`. שני הכישלונות → Error עם הנחיה לבדוק את פרטי הגישה מול gov.il.
3. אחרי התחברות נווט ל-`/file/d/HaziHinam/` (או לתיקייה שמוצגת). מוצגת טבלת קבצים (Cerberus web client).
4. אם יש תיבת חיפוש/סינון בעמוד — סנן `PriceFull`. אחרת קרא את כל שורות הטבלה.
5. **בחירת סניף:** הורד קודם את קובץ `Stores`/`StoresFull` העדכני (הוא קטן), פענח (§6.1), מצא storeId לפי city (התאמת מחרוזת מנורמלת). אין → Error עם הצעת `--list-stores hazihinam`.
6. מבין קבצי `PriceFull<ChainId>-<StoreId>-*` של הסניף הנבחר קח את העדכני ביותר (מיון לפי חותמת הזמן שבשם הקובץ), הורד אל `cache/hazihinam-<storeId>.gz` דרך `downloadFile` (ה-session פעיל בזכות ההורדה מתוך הדף).
7. הערה למממש: אם הטבלה נטענת ב-AJAX, ייתכן endpoint פנימי `POST /file/json/dir`. מותר להשתמש בו מתוך הקשר הדף אם ה-DOM לא נוח — אבל DOM קודם.

### 5.3 victory.js (laibcatalog)

1. פתח `https://laibcatalog.co.il`. אין התחברות.
2. בעמוד חמישה dropdowns (עברית): רשת / תת-רשת / סניף / סוג קובץ / תאריך.
3. בחר רשת שהטקסט שלה מכיל "ויקטורי". אם יש תת-רשת — בחר את הראשונה שאינה ריקה.
4. בחר סוג קובץ שמכיל "מחיר" ו"מלא" (PriceFull). השאר את התאריך על ברירת המחדל (היום).
5. סניף: לפי storeOverride או התאמת city לטקסט האופציות. אין → Error + `--list-stores victory`.
6. לחץ חיפוש/הצג (הכפתור שמרענן את טבלת התוצאות), המתן לטבלה, קח את השורה העדכנית ביותר, הורד אל `cache/victory-<storeId>.xml.gz`.
7. אזהרה: קודי הרשת בפורטל הזה משרתים גם "ח. כהן" ו"מחסני השוק" — לוודא שהאופציה שנבחרה היא ויקטורי לפי הטקסט, לא לפי מיקום ברשימה.

## 6. פענוח

### gunzip.js
`import { gunzipSync } from 'node:zlib'` → `gunzipSync(await fs.readFile(path)).toString('utf8')`. אם ה-buffer לא מתחיל ב-magic `1f 8b` — הקובץ כנראה XML לא דחוס; החזר אותו כמחרוזת כמו שהוא. (קורה בחלק מהפורטלים.)

### עקרון כללי ל-XML (שני הפרסרים)
הסכמות **שונות בין רשתות** באותיות גדולות/קטנות ובשמות שדות. לכן: אחרי parse עם fast-xml-parser (`ignoreAttributes: false`), עבור על העץ עם פונקציית עזר `findKey(obj, ...candidates)` שמחפשת מפתח **ללא תלות ברישיות**. אל תניח מבנה — חפש.

### 6.1 stores.js
מועמדי מערך הסניפים: `Stores.Store`, `Root.SubChains.SubChain.Stores.Store`, `asx:abap...` (מבנים חריגים). לכל store חלץ: `StoreId`/`StoreID`, `StoreName`, `City`. החזר `[{storeId, name, city}]`.

### 6.2 prices.js
מועמדי מערך הפריטים: `Root.Items.Item`, `Prices.Products.Product`, `root.Items.Item`. שדות לכל מוצר (מועמדים לפי סדר עדיפות):

| שדה פלט | מועמדי מפתח ב-XML |
|---|---|
| `code` | ItemCode, ItemId, Barcode |
| `name` | ItemName, ItemNm |
| `manufacturer` | ManufacturerName, ManufactureName |
| `price` | ItemPrice (float) |
| `unitQty` | Quantity + UnitQty (למשל "1" + "ליטר") |
| `unitPrice` | UnitOfMeasurePrice (float; מחיר ל-100 גרם/ליטר — לשמור כמו שהוא) |

סינון: זרוק מוצרים בלי name או עם price שאינו מספר חיובי. אם `ItemStatus` קיים וערכו מציין "לא פעיל" — דלג. החזר `Product[]`. צפי: 8,000–30,000 מוצרים לסניף. פענוח בזיכרון — מותר (קבצים עד ~60MB פתוחים).

**בדיקת שפיות מובנית:** אחרי parse, אם `products.length < 500` — זרוק Error "קובץ המחירים חשוד כחלקי" (כנראה הורד `Price` במקום `PriceFull`).

## 7. התאמת מוצרים (הלב של הבוט)

### 7.1 normalize.js — `normalize(str) → string` ו-`tokenize(str) → Token[]`

נורמליזציה, לפי הסדר:
1. הסר גרשיים/גרש (`"` `'` `״` `׳`), נקודות, פסיקים, סוגריים; החלף `-` `/` ברווח.
2. כווץ רווחים; טרים.
3. החלפות מילוניות (מפה קבועה): `ל'`→`ליטר`, `מ"ל`→`מל`, `ק"ג`→`קג`, `גר'`→`גרם`, `ג'`→`גרם` (רק כשצמוד למספר), `יח'`→`יחידות`.
4. הסר מילות רעש (רשימה קבועה): `מארז`, `אריזה`, `חדש`, `מבצע`, `כשר`, `בדץ`, `למהדרין`, `בטעם`.

טוקניזציה: פצל לרווחים. כל טוקן מסווג: **מספרי** (רגקס `^\d+(\.\d+)?%?$` — כולל `3%`, `1.5`) או **מילולי**. צמד "מספר + יחידה" (`1` `ליטר`) מאוחד לטוקן מספרי אחד `1ליטר`.

### 7.2 ניקוד התאמה — `score(queryTokens, productTokens) → number` בטווח [0,1]

```
wordQ  = טוקנים מילוליים של השאילתה, numQ = מספריים
לכל w ב-wordQ: מצא התאמה ב-productTokens —
   התאמה מלאה = 1.0
   הכלה (w מוכל בטוקן מוצר או להפך, אורך≥2) = 0.8
   אחרת 0
wordScore = ממוצע ההתאמות של wordQ            (אם wordQ ריק → 0)
numScore:  לכל n ב-numQ — קיים במוצר = 1, לא קיים = 0; ממוצע (אם numQ ריק → נייטרלי)

score = 0.75·wordScore + 0.25·numScore        (אם numQ ריק: score = wordScore)

עונש סתירה: אם למוצר יש טוקן אחוז (כמו 1%) שונה מאחוז שהשאילתה ביקשה (3%) → score -= 0.3
עונש חוסר עוגן: אם הטוקן המילולי הראשון של השאילתה (מילת המפתח: "חלב") לא קיבל ≥0.8 → score -= 0.25
clamp ל-[0,1]
```

### 7.3 בחירה — `matchItem(item, products, threshold) → Match|null`

1. חשב score לכל המוצרים (לולאה פשוטה; 30k × פריטים בודדים — מהיר, אין צורך באינדקס).
2. קח את כל המועמדים עם `score ≥ threshold`.
3. אם ריק → `null` (הפריט "לא נמצא" ברשת זו).
4. מתוך המועמדים שנמצאים בטווח `bestScore - 0.08` — בחר את **הזול** (כדי ש"חלב 3%" ייקח את המותג הזול, לא את היקר עם ניסוח דומה יותר).
5. החזר `{ product, score, alternatives: top3 }` (top3 לשקיפות בדו"ח).

### 7.4 קבועים
כל הקבועים (0.75/0.25, עונשים 0.3/0.25, חלון 0.08) מוגדרים כ-`const` בראש match.js עם הערה שהם כוונון — לא לפזר מספרי קסם.

## 8. השוואה ודו"ח

### compare.js
לכל רשת: `total = Σ match.product.price × item.quantity` על הפריטים שנמצאו. בנוסף חשב **סל משותף**: תת-קבוצת הפריטים שנמצאו **בכל** הרשתות שהצליחו, ו-`sharedTotal` לכל רשת עליה. הדירוג הקובע למנצחת: `sharedTotal` (השוואה הוגנת). אם רשת נכשלה בהורדה — היא מוצגת בדו"ח כ"נכשלה" ולא משתתפת.

### report.js — פלט קונסולה (RTL-friendly, בלי ספריות)

```
════════ השוואת סל קניות ════════
רשימה: 8 פריטים | עיר: תל אביב | סל משותף: 6 פריטים

  רשת         סל משותף     סל מלא      נמצאו
  ──────────  ──────────  ──────────  ──────
► חצי חינם     ₪142.60     ₪188.90      7/8
  שופרסל       ₪151.20     ₪196.40      8/8
  ויקטורי      ₪149.80     —נכשלה—      —

► הזול ביותר (סל משותף): חצי חינם — חיסכון ₪8.60 מול שופרסל

פירוט: [לכל פריט: השם המבוקש, ולכל רשת — שם המוצר שהותאם, מחיר, score]
פריטים שלא נמצאו: [שם + באיזו רשת]
```

בנוסף כתוב `output/results.json` מלא: קלט, כל התאמה עם alternatives, סכומים, timestamps, storeId לכל רשת.

## 9. index.js — אורקסטרציה

```
node src/index.js [--list shopping-list.json] [--city "..."] [--refresh]
                  [--list-stores <chainKey>] [--headful]
```

זרימה: קרא config + argv (argv גובר) → טען רשימה → launch browser → **הרץ את שלושת ה-fetchers בטור** (לא במקביל — פשטות ודיבוג) עם try/catch פר-רשת → סגור browser → parse → match → compare → report. exit code 0 אם לפחות רשת אחת הצליחה; 1 אחרת.

`--list-stores X`: מריץ רק את שלב גילוי הסניפים של הרשת ומדפיס את הרשימה (לעזרת המשתמש בבחירת override).

## 10. טיפול בשגיאות — חובה

- כל Error מהאדפטרים: הודעה בעברית, שם הרשת, והצעד הבא למשתמש.
- Puppeteer timeout → "הפורטל של X לא נענה; נסה שוב מאוחר יותר או הרץ עם --headful לבדיקה".
- קובץ שלא נפתח (gz פגום) → מחק אותו מה-cache לפני ההודעה (שלא יתקע ריצות באות).
- אסור שהתהליך יקרוס על רשת אחת — תמיד ממשיכים עם השאר.

## 11. אימות (Verification) — לבצע לפי הסדר

1. `node src/index.js --list-stores shufersal` → נדפסת רשימת סניפים אמיתית.
2. אותו דבר לחצי חינם ולויקטורי (לחצי חינם זה מאמת גם את ההתחברות).
3. ריצה מלאה עם רשימת 8 פריטים מגוונים: מדויק ("חלב תנובה 3% 1 ליטר"), עמום ("לחם"), עם אחוז ("קוטג 5%"), לועזי-עברי ("קורנפלקס"), לא-קיים ("מוצר בדיוני 999"). ודא: הדו"ח מודפס, ה"לא נמצא" מסומן רק לבדיוני, המנצחת מוכרזת לפי הסל המשותף.
4. ריצה שנייה מיד — ודא שלא נפתח דפדפן (cache hit, מהיר). ואז `--refresh` — ודא שכן.
5. **בדיקת נכונות התאמות:** פתח את `output/results.json`, קח 4 התאמות, השווה ידנית מול אתר הרשת (מחיר בטווח סביר ומוצר נכון). אם התאמה שגויה — כוונן את קבועי §7.4 ותעד.
6. נתק אינטרנט/שנה URL של רשת אחת זמנית — ודא שהדו"ח יוצא עם שתי הנותרות ומציין את הכשל.

## 12. מחוץ לתחולה (לא לממש בגרסה זו)

PromoFull ומחירי מועדון; ריצה מתוזמנת; ממשק ווב; חיבור לאתר רשימת הקניות (ייצוא JSON מהאתר — שלב עתידי); רשתות נוספות (רמי לוי/יוחננוף — יתווספו כאדפטרים באותו חוזה).
