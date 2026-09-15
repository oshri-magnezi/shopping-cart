import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityMatches,
  isFullPriceFile,
  isPromoFile,
  isStoresFile,
  newestByName,
  storeIdFromName,
  storeNotFoundError,
  timestampFromName,
} from '../src/fetch/shared.js';

describe('file name parsing', () => {
  // Portals write the stamp two different ways, and the 13-digit chain id
  // sits right next to it — anchoring on position instead of on the date
  // pattern picks up the chain id as a timestamp.
  it('reads a split YYYYMMDD-HHMMSS stamp', () => {
    const name = 'PriceFull7290058140886-001-042-20260816-121500.gz';
    assert.equal(timestampFromName(name), '20260816121500');
    assert.equal(storeIdFromName(name), '042');
  });

  it('reads a single-run YYYYMMDDHHMM stamp', () => {
    const name = 'PriceFull7290873255550-065-202608161215.xml';
    assert.equal(timestampFromName(name), '202608161215');
    assert.equal(storeIdFromName(name), '065');
  });

  it('does not mistake the chain id for a timestamp', () => {
    assert.notEqual(storeIdFromName('PriceFull7290058140886-001-042-20260816-121500.gz'), '001');
  });

  it('returns empty parts for a name with no stamp at all', () => {
    assert.equal(timestampFromName('NotAPriceFile.gz'), '');
    assert.equal(storeIdFromName('NotAPriceFile.gz'), null);
  });

  it('picks the newest of several files', () => {
    const names = [
      'PriceFull7290058140886-001-042-20260814-121500.gz',
      'PriceFull7290058140886-001-042-20260816-235900.gz',
      'PriceFull7290058140886-001-042-20260816-080000.gz',
    ];
    assert.match(newestByName(names, (n) => n), /20260816-235900/);
  });
});

describe('file kind detection', () => {
  it('separates the three kinds regardless of case', () => {
    assert.ok(isFullPriceFile('PriceFull7290-001.gz'));
    assert.ok(!isFullPriceFile('PromoFull7290-001.gz'));
    assert.ok(isPromoFile('promofull7290-001.gz'));
    assert.ok(isStoresFile('StoresFull7290.xml'));
  });

  // A partial "Price" update is not a full catalogue and must not be taken
  // for one; it carries a fraction of the products.
  it('does not accept a partial Price file as a full one', () => {
    assert.ok(!isFullPriceFile('Price7290058140886-001-042-20260816-121500.gz'));
  });
});

describe('city matching', () => {
  it('matches a branch named with the full city', () => {
    assert.ok(cityMatches('שופרסל דיל תל אביב', 'תל אביב'));
  });

  it('matches the common abbreviation', () => {
    assert.ok(cityMatches('שלי ת"א- בן יהודה', 'תל אביב'));
  });

  // The bug this guards: a short alias matched mid-word, so "רמת אליהו" (a
  // Rishon LeZion neighbourhood) was read as ת"א and a Tel Aviv basket got
  // priced at a Rishon branch.
  it('does not match a short alias inside another word', () => {
    assert.ok(!cityMatches('רמת אליהו', 'תל אביב'));
  });

  it('is false for an unrelated town', () => {
    assert.ok(!cityMatches('סניף חיפה', 'תל אביב'));
  });

  it('is false for an empty city', () => {
    assert.ok(!cityMatches('סניף כלשהו', ''));
  });
});

/**
 * The old message said the same thing however the chain had failed: "no branch
 * in that city, set an override". For a chain whose branches all publish empty
 * catalogues that advice is not merely unhelpful, it sends whoever reads it
 * looking for a branch id that would not have helped.
 */
describe('storeNotFoundError', () => {
  const store = (storeId, city, name = '') => ({ storeId, city, name });
  const stores = [
    store('001', 'חיפה', 'הדר'),
    store('002', 'חיפה', 'קרית אליעזר'),
    store('003', 'נהריה'),
  ];

  it('says so when the chain publishes nothing anywhere', () => {
    const error = storeNotFoundError('keshet', 'קשת טעמים', 'חיפה', stores, () => false);

    assert.match(error.message, /אף אחד מ־3 סניפים/);
    assert.match(error.message, /לא יעזור/);
    assert.doesNotMatch(error.message, /לא נמצא סניף/);
  });

  it('distinguishes "none here publish" from "none here at all"', () => {
    // Two branches in Haifa, neither with a file; one elsewhere that has one.
    const error = storeNotFoundError('keshet', 'קשת טעמים', 'חיפה', stores, (s) => s.storeId === '003');

    assert.match(error.message, /2 סניפים בעיר "חיפה"/);
    assert.match(error.message, /סניף אחד אחר כן מפרסם/);
  });

  it('falls back to the plain message when the chain is simply absent', () => {
    const error = storeNotFoundError('politzer', 'פוליצר', 'תל אביב', stores, () => true);
    assert.match(error.message, /לא נמצא סניף של פוליצר בעיר "תל אביב"/);
  });

  it('keeps working for a caller that passes no branch list', () => {
    const error = storeNotFoundError('victory', 'ויקטורי', 'חיפה');
    assert.match(error.message, /לא נמצא סניף של ויקטורי/);
    assert.match(error.message, /storeOverrides\.victory/);
  });
});
