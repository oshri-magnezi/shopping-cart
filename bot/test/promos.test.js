import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePromosFile } from '../src/parse/promos.js';

let dir;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'promos-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function parse(promotions) {
  const file = path.join(dir, `${Math.random().toString(36).slice(2)}.xml`);
  await writeFile(
    file,
    `<?xml version="1.0" encoding="utf-8"?><Root><Promotions>${promotions}</Promotions></Root>`,
    'utf8',
  );
  return parsePromosFile(file);
}

const simple = `
  <Promotion><PromotionId>1</PromotionId><ClubId>0</ClubId>
    <PromotionItems><Item><ItemCode>7290000000011</ItemCode>
      <RewardType>1</RewardType><MinQty>1</MinQty><DiscountedPrice>4.90</DiscountedPrice>
    </Item></PromotionItems>
  </Promotion>`;

describe('parsePromosFile', () => {
  it('takes a plain per-unit discount as a price', async () => {
    const { prices } = await parse(simple);
    assert.equal(prices.get('7290000000011'), 4.9);
  });

  it('keeps the lowest when a product has several promotions', async () => {
    const { prices } = await parse(
      simple +
        `<Promotion><PromotionId>2</PromotionId><ClubId>0</ClubId>
          <PromotionItems><Item><ItemCode>7290000000011</ItemCode>
            <RewardType>1</RewardType><MinQty>1</MinQty><DiscountedPrice>3.90</DiscountedPrice>
          </Item></PromotionItems></Promotion>`,
    );
    assert.equal(prices.get('7290000000011'), 3.9);
  });

  // Everything below is a deal the basket cannot be priced against, so it
  // becomes a flag rather than a price and the shelf price stands.
  const unpriceable = {
    'a club-only price': `
      <Promotion><PromotionId>3</PromotionId><ClubId>5</ClubId>
        <PromotionItems><Item><ItemCode>7290000000028</ItemCode>
          <RewardType>1</RewardType><MinQty>1</MinQty><DiscountedPrice>4.00</DiscountedPrice>
        </Item></PromotionItems></Promotion>`,
    'a multi-buy': `
      <Promotion><PromotionId>4</PromotionId><ClubId>0</ClubId>
        <PromotionItems><Item><ItemCode>7290000000028</ItemCode>
          <RewardType>1</RewardType><MinQty>3</MinQty><DiscountedPrice>10.00</DiscountedPrice>
        </Item></PromotionItems></Promotion>`,
    'a basket-spend deal': `
      <Promotion><PromotionId>5</PromotionId><ClubId>0</ClubId>
        <Groups><Group><GroupID>1</GroupID><MinPurchaseAmount>75</MinPurchaseAmount></Group></Groups>
        <PromotionItems><Item><ItemCode>7290000000028</ItemCode>
          <RewardType>1</RewardType><MinQty>1</MinQty><DiscountedPrice>4.00</DiscountedPrice>
        </Item></PromotionItems></Promotion>`,
    'a non-price reward': `
      <Promotion><PromotionId>6</PromotionId><ClubId>0</ClubId>
        <PromotionItems><Item><ItemCode>7290000000028</ItemCode>
          <RewardType>2</RewardType><MinQty>1</MinQty><DiscountedPrice>4.00</DiscountedPrice>
        </Item></PromotionItems></Promotion>`,
    'a bundle over several products': `
      <Promotion><PromotionId>7</PromotionId><ClubId>0</ClubId>
        <PromotionItems>
          <Item><ItemCode>7290000000028</ItemCode><RewardType>1</RewardType>
            <MinQty>1</MinQty><DiscountedPrice>4.00</DiscountedPrice></Item>
          <Item><ItemCode>7290000000035</ItemCode><RewardType>1</RewardType>
            <MinQty>1</MinQty><DiscountedPrice>4.00</DiscountedPrice></Item>
        </PromotionItems></Promotion>`,
  };

  for (const [label, xml] of Object.entries(unpriceable)) {
    it(`does not price ${label}`, async () => {
      const { prices } = await parse(xml);
      assert.equal(prices.get('7290000000028'), undefined);
    });
  }

  it('flags an open deal it cannot price', async () => {
    const { promoted } = await parse(unpriceable['a multi-buy']);
    assert.ok(promoted.has('7290000000028'));
  });

  it('does not flag a club deal, which most shoppers cannot use', async () => {
    const { promoted } = await parse(unpriceable['a club-only price']);
    assert.ok(!promoted.has('7290000000028'));
  });

  it('does not double-report a product it already priced', async () => {
    const { prices, promoted } = await parse(simple);
    assert.ok(prices.has('7290000000011'));
    assert.ok(!promoted.has('7290000000011'));
  });

  it('reads ClubId written as "0 - כלל הלקוחות"', async () => {
    const { prices } = await parse(simple.replace('<ClubId>0</ClubId>', '<ClubId>0 - כלל הלקוחות</ClubId>'));
    assert.equal(prices.get('7290000000011'), 4.9);
  });
});
