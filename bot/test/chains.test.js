import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChains, withoutDuplicateOnline } from '../src/chains.js';

const config = {
  chains: [
    { key: 'ramilevi', displayName: 'רמי לוי', portal: 'cerberus', username: 'RamiLevi', onlineStore: '039' },
    { key: 'osherad', displayName: 'אושר עד', portal: 'cerberus', username: 'osherad' },
  ],
};

describe('buildChains', () => {
  it('adds the online store as a chain of its own, with the store pinned', () => {
    const chains = buildChains(config);
    assert.deepEqual(
      chains.map((chain) => chain.key),
      ['ramilevi', 'ramilevi-online', 'osherad'],
    );
    const online = chains[1];
    assert.equal(online.displayName, 'רמי לוי אונליין');
    assert.equal(online.storeOverride, '039');
    assert.equal(online.online, true);
    assert.equal(online.baseKey, 'ramilevi');
    // Same portal, same way in: only the store differs.
    assert.equal(online.fetcher, chains[0].fetcher);
  });

  it('leaves a chain without an online store alone', () => {
    const osherad = buildChains(config).find((chain) => chain.key === 'osherad');
    assert.equal(osherad.online, undefined);
    assert.equal(osherad.storeOverride, undefined);
  });
});

describe('withoutDuplicateOnline', () => {
  const [ramilevi, ramileviOnline, osherad] = buildChains(config);
  const entry = (chain, storeId, ok = true) => ({ chain, storeId, ok });

  it('drops a branch that fell back to the same online store', () => {
    // No Rami Levy in this city: the branch fetcher fell back to 039 too.
    const kept = withoutDuplicateOnline([
      entry(ramilevi, '039'),
      entry(ramileviOnline, '039'),
      entry(osherad, '025'),
    ]);
    assert.deepEqual(
      kept.map((e) => e.chain.key),
      ['ramilevi-online', 'osherad'],
    );
  });

  it('keeps a real branch beside the online store', () => {
    const kept = withoutDuplicateOnline([entry(ramilevi, '043'), entry(ramileviOnline, '039')]);
    assert.equal(kept.length, 2);
  });

  it('keeps the branch when the online store failed to download', () => {
    const kept = withoutDuplicateOnline([entry(ramilevi, '039'), entry(ramileviOnline, undefined, false)]);
    assert.deepEqual(
      kept.map((e) => e.chain.key),
      ['ramilevi', 'ramilevi-online'],
    );
  });
});
