/**
 * Builds the per-chain totals.
 *
 * Two totals are produced on purpose. The full basket answers "what would I
 * pay here", but it flatters a chain that simply failed to stock an item.
 * The shared basket — only items every surviving chain matched — is the one
 * that decides the winner, because it compares like for like.
 */
export function compareBaskets(items, chainResults) {
  const succeeded = chainResults.filter((result) => result.ok);

  const sharedIndexes = items
    .map((_, index) => index)
    .filter((index) => succeeded.every((result) => result.matches[index]));

  const rows = chainResults.map((result) => {
    if (!result.ok) {
      return {
        key: result.key,
        displayName: result.displayName,
        ok: false,
        error: result.error,
      };
    }

    let fullTotal = 0;
    let foundCount = 0;
    for (const [index, item] of items.entries()) {
      const match = result.matches[index];
      if (!match) continue;
      fullTotal += match.product.price * item.quantity;
      foundCount += 1;
    }

    const sharedTotal = sharedIndexes.reduce(
      (sum, index) => sum + result.matches[index].product.price * items[index].quantity,
      0,
    );

    return {
      key: result.key,
      displayName: result.displayName,
      ok: true,
      storeId: result.storeId,
      storeName: result.storeName,
      fromCache: result.fromCache,
      fullTotal: round(fullTotal),
      sharedTotal: round(sharedTotal),
      foundCount,
      itemCount: items.length,
    };
  });

  const ranked = rows.filter((row) => row.ok).sort((a, b) => a.sharedTotal - b.sharedTotal);
  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  return {
    rows,
    ranked,
    winner,
    savings: winner && runnerUp ? round(runnerUp.sharedTotal - winner.sharedTotal) : 0,
    sharedIndexes,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
