import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filesFor, liveIsNewer, pullLiveCatalog } from '../src/pull-live-catalog.js';

/**
 * The live site is now where the current prices live, and this is what copies
 * them back down — into the deploy, into the nightly guard, onto a laptop. The
 * cases that matter are the ones where a bad answer would quietly publish a
 * broken or stale catalogue.
 */

const index = {
  schema: 3,
  generatedAt: '2026-09-28T01:31:00.000Z',
  cities: [
    { city: 'תל אביב', file: 'price-catalog-0.json' },
    { city: 'חיפה', file: 'price-catalog-1.json' },
  ],
};

/** A fetch that answers from a table, and records what was asked. */
function fakeFetch(table) {
  const asked = [];
  const impl = async (url) => {
    const key = String(url).split('?')[0].split('/').pop();
    asked.push(key);
    if (!(key in table)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => table[key] };
  };
  return { impl, asked };
}

describe('filesFor', () => {
  it('lists each city file once', () => {
    assert.deepEqual(filesFor(index), ['price-catalog-0.json', 'price-catalog-1.json']);
  });

  it('refuses an index with no cities', () => {
    assert.throws(() => filesFor({ cities: [] }), /no cities/);
    assert.throws(() => filesFor(null), /no cities/);
  });

  it('refuses a file name that could write outside the folder', () => {
    // The index arrives over the network; it does not get to choose paths.
    const hostile = { cities: [{ file: '../../package.json' }] };
    assert.throws(() => filesFor(hostile), /will not write/);
  });
});

describe('pullLiveCatalog', () => {
  it('writes every city file and then the index', async () => {
    const { impl } = fakeFetch({
      'price-catalog-index.json': index,
      'price-catalog-0.json': { city: 'תל אביב' },
      'price-catalog-1.json': { city: 'חיפה' },
    });
    const written = [];
    const result = await pullLiveCatalog({
      outDir: 'out',
      local: null,
      fetchImpl: impl,
      write: async (file) => written.push(file.split(/[\\/]/).pop()),
    });

    assert.equal(result.generatedAt, index.generatedAt);
    // The index last: a half-finished run must not leave an index pointing at
    // a file that never arrived.
    assert.deepEqual(written, ['price-catalog-0.json', 'price-catalog-1.json', 'price-catalog-index.json']);
  });

  it('leaves the old index in charge when a city file fails', async () => {
    const { impl } = fakeFetch({
      'price-catalog-index.json': index,
      'price-catalog-0.json': { city: 'תל אביב' },
      // price-catalog-1.json is missing
    });
    const written = [];
    await assert.rejects(
      pullLiveCatalog({
        outDir: 'out',
        local: null,
        fetchImpl: impl,
        write: async (file) => written.push(file.split(/[\\/]/).pop()),
      }),
      /HTTP 404/,
    );
    assert.equal(written.includes('price-catalog-index.json'), false);
  });

  it('fails outright when the live site has no index', async () => {
    const { impl } = fakeFetch({});
    await assert.rejects(pullLiveCatalog({ outDir: 'out', local: null, fetchImpl: impl, write: async () => {} }), /HTTP 404/);
  });
});

describe('never moving prices backwards', () => {
  const at = (generatedAt) => ({ generatedAt });

  it('prefers the newer copy either way round', () => {
    assert.equal(liveIsNewer(at('2026-09-28T01:00:00Z'), at('2026-08-23T02:00:00Z')), true);
    // The case this exists for: the repository held a fresher catalogue than
    // the site, and a blind pull would have rolled the site back to August.
    assert.equal(liveIsNewer(at('2026-08-23T02:00:00Z'), at('2026-09-28T01:00:00Z')), false);
    assert.equal(liveIsNewer(at('2026-09-28T01:00:00Z'), at('2026-09-28T01:00:00Z')), false);
  });

  it('trusts a dated live copy over an undated local one, and never an undated live one', () => {
    assert.equal(liveIsNewer(at('2026-09-28T01:00:00Z'), null), true);
    assert.equal(liveIsNewer(at('2026-09-28T01:00:00Z'), at('garbage')), true);
    assert.equal(liveIsNewer(at(undefined), at('2026-08-23T02:00:00Z')), false);
  });

  it('keeps a fresher local catalogue and downloads nothing', async () => {
    const { impl, asked } = fakeFetch({ 'price-catalog-index.json': index });
    const written = [];
    const local = { ...index, generatedAt: '2026-10-01T00:00:00.000Z' };
    const result = await pullLiveCatalog({
      outDir: 'out',
      local,
      fetchImpl: impl,
      write: async (file) => written.push(file),
    });

    assert.equal(result.kept, true);
    assert.equal(result.generatedAt, local.generatedAt);
    assert.deepEqual(written, []);
    assert.deepEqual(asked, ['price-catalog-index.json']);
  });
});
