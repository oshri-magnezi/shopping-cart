import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePricesFile } from '../src/parse/prices.js';

// The parser rejects anything under 500 products as a partial "Price" file,
// so the fixture is padded with filler around the rows under test.
function priceXml(rows) {
  const filler = Array.from(
    { length: 520 },
    (_, i) =>
      `<Item><ItemCode>111000${String(i).padStart(4, '0')}</ItemCode>` +
      `<ItemName>מוצר מילוי ${i}</ItemName><ItemPrice>9.90</ItemPrice>` +
      `<ItemStatus>1</ItemStatus></Item>`,
  ).join('');
  return `<?xml version="1.0" encoding="utf-8"?><Root><Items>${rows}${filler}</Items></Root>`;
}

let dir;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'prices-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function parse(rows) {
  const file = path.join(dir, `${Math.random().toString(36).slice(2)}.xml`);
  await writeFile(file, priceXml(rows), 'utf8');
  return parsePricesFile(file, 'בדיקה');
}

describe('parsePricesFile', () => {
  it('reads the core fields of a product', async () => {
    const products = await parse(
      `<Item><ItemCode>7290000000011</ItemCode><ItemName>חלב תנובה 3%</ItemName>
       <ManufactureName>תנובה</ManufactureName><UnitQty>ליטר</UnitQty><Quantity>1</Quantity>
       <ItemPrice>6.90</ItemPrice><ItemStatus>1</ItemStatus></Item>`,
    );
    const milk = products.find((p) => p.code === '7290000000011');
    assert.equal(milk.name, 'חלב תנובה 3%');
    assert.equal(milk.price, 6.9);
    assert.equal(milk.manufacturer, 'תנובה');
  });

  // Field names differ per chain; findValue compares case-insensitively, so
  // ItemId/ItemNm and bIsWeighted/BisWeighted all have to land the same way.
  it('accepts the alternative field spellings', async () => {
    const products = await parse(
      `<Item><ItemId>7290000000028</ItemId><ItemNm>לחם אחיד</ItemNm>
       <Price>5.50</Price><ItemStatus>1</ItemStatus></Item>`,
    );
    const bread = products.find((p) => p.code === '7290000000028');
    assert.equal(bread.name, 'לחם אחיד');
    assert.equal(bread.price, 5.5);
  });

  // Roughly one product in twenty is sold loose, and for those ItemPrice is
  // per kilogram. Reading it as the price of one item both overstates the
  // basket and makes a loose-vs-packed comparison meaningless.
  it('marks products sold by weight', async () => {
    const products = await parse(
      `<Item><ItemCode>7290000000059</ItemCode><ItemName>עגבניה</ItemName>
       <UnitQty>קילוגרם</UnitQty><Quantity>1.00</Quantity><BisWeighted>1</BisWeighted>
       <ItemPrice>6.90</ItemPrice><ItemStatus>1</ItemStatus></Item>`,
    );
    assert.equal(products.find((p) => p.code === '7290000000059').weighted, true);
  });

  it('reads the lower-case bIsWeighted spelling too', async () => {
    const products = await parse(
      `<Item><ItemCode>7290000000066</ItemCode><ItemName>מלפפון</ItemName>
       <bIsWeighted>1</bIsWeighted><ItemPrice>7.90</ItemPrice><ItemStatus>1</ItemStatus></Item>`,
    );
    assert.equal(products.find((p) => p.code === '7290000000066').weighted, true);
  });

  it('leaves an ordinary packed product unweighed', async () => {
    const products = await parse(
      `<Item><ItemCode>7290000000073</ItemCode><ItemName>קמח 1 קג</ItemName>
       <BisWeighted>0</BisWeighted><ItemPrice>5.90</ItemPrice><ItemStatus>1</ItemStatus></Item>`,
    );
    assert.equal(products.find((p) => p.code === '7290000000073').weighted, false);
  });

  it('drops delisted products and unpriced rows', async () => {
    const products = await parse(
      `<Item><ItemCode>7290000000035</ItemCode><ItemName>מוצר שהוסר</ItemName>
       <ItemPrice>4.00</ItemPrice><ItemStatus>0</ItemStatus></Item>
       <Item><ItemCode>7290000000042</ItemCode><ItemName>מוצר ללא מחיר</ItemName>
       <ItemPrice>0</ItemPrice><ItemStatus>1</ItemStatus></Item>`,
    );
    assert.ok(!products.some((p) => p.code === '7290000000035'));
    assert.ok(!products.some((p) => p.code === '7290000000042'));
  });

  // A partial "Price" update carries a fraction of the catalogue. Letting one
  // through would quietly report most of a chain's stock as unavailable.
  it('rejects a file too small to be a full catalogue', async () => {
    const file = path.join(dir, 'partial.xml');
    await writeFile(
      file,
      `<Root><Items><Item><ItemCode>1</ItemCode><ItemName>יחיד</ItemName>
       <ItemPrice>1.00</ItemPrice><ItemStatus>1</ItemStatus></Item></Items></Root>`,
      'utf8',
    );
    await assert.rejects(() => parsePricesFile(file, 'בדיקה'), /חשוד כחלקי/);
  });
});
