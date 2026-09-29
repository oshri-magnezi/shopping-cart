import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseXml } from '../src/parse/xml.js';

describe('parseXml', () => {
  it('reads the escaped characters real product names carry', () => {
    const names = Array.from({ length: 20_000 }, (_, i) => `<Item><Name>מוצר &amp; &quot;${i}&quot;</Name></Item>`);
    const tree = parseXml(`<Root>${names.join('')}</Root>`);
    assert.equal(tree.Root.Item.length, 20_000);
    assert.equal(tree.Root.Item[0].Name, 'מוצר & "0"');
  });

  // A "billion laughs" file: each entity expands to ten of the one before, so
  // a few hundred bytes would become gigabytes. The parser does not expand an
  // entity inside another, so the reference is left as it is.
  it('does not expand nested entities', () => {
    const levels = Array.from(
      { length: 9 },
      (_, i) => `<!ENTITY l${i + 1} "${`&l${i};`.repeat(10)}">`,
    ).join('');
    const bomb = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY l0 "ha">${levels}]><r>&l9;</r>`;
    assert.ok(JSON.stringify(parseXml(bomb)).length < 1_000);
  });

  // The wide variant needs no nesting: one large entity referenced over and
  // over, past the cap on expanded length.
  it('refuses an entity expanded past the length limit', () => {
    const big = 'x'.repeat(5_000);
    const bomb = `<!DOCTYPE r [<!ENTITY e "${big}">]><r>${'&e;'.repeat(30_000)}</r>`;
    assert.throws(() => parseXml(bomb));
  });

  // A real price file declares no entities at all. One declaring hundreds is
  // not a price file; the cap on declarations (unlimited until 2026-09-29)
  // refuses it before any of them is expanded.
  it('refuses a file declaring hundreds of entities', () => {
    const declared = Array.from({ length: 500 }, (_, i) => `<!ENTITY e${i} "x">`).join('');
    assert.throws(() => parseXml(`<!DOCTYPE r [${declared}]><r>&e1;</r>`));
  });
});
