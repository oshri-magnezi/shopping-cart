const round = (value) => Math.round(value * 100) / 100;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Ranks the chains for one shopping list.
 *
 * The question is "where should I do this shop", and you go to one shop — so a
 * chain is judged on two things: how much of your list it actually stocks, and
 * how its prices compare to what that basket normally costs.
 *
 * ## Why not just add the prices up
 *
 * Comparing raw totals across chains punishes the chains that stock more of
 * your list: a shop missing your olive oil looks cheaper than one that has it.
 * The totals are not measuring the same basket.
 *
 * ## Why not compare only the items everyone stocks
 *
 * That was the previous model, and it fails in the opposite direction. The
 * intersection of seven chains over four items collapsed to a single product,
 * so the "cheapest basket" was decided by whoever sold that one item for ten
 * agorot less — and every chain you added made the comparison narrower.
 *
 * ## What this does instead
 *
 * Each item gets a reference price: the **median** across the chains that
 * stock it. The median rather than the mean because a single mis-matched
 * product at ten times the price would drag a mean far off, and a wrong match
 * is the most likely error in the whole pipeline.
 *
 * A chain's price index is then its spend over the reference spend, across
 * everything it stocks:
 *
 *     index = Σ price(chain, item) · amount  /  Σ reference(item) · amount
 *
 * This is a basket index, not an average of percentages: it weights by money,
 * so two percent off the olive oil counts for more than twenty percent off a
 * packet of gum — which is the way a shopper's wallet counts it too. An index
 * of 0.94 means this basket costs six percent less here than it typically
 * does, and it stays meaningful no matter which items are missing, because
 * every ratio is against that same item elsewhere.
 *
 * Coverage still comes first: only the chains carrying the most of your list
 * are eligible to win, because a shop with half your basket has not answered
 * the question at all. The rest are ranked and shown, so the trade-off stays
 * visible, but they cannot take the headline.
 *
 * The index is what ranks them. On screen the rows show plain money instead:
 * inside one coverage group every chain holds the same items, so the totals are
 * already directly comparable and the difference from the leader says what the
 * index would have taken a paragraph to explain.
 *
 * ## Each group is priced against its own peers
 *
 * The reference is computed separately for the chains that carry the whole
 * list and for those that carry less. Drawing it from everybody let a shop
 * stocking only the cheap staples pull the typical price down on exactly those
 * lines, so every chain carrying the full list looked dearer — on items it had
 * no choice but to include. A group smaller than MIN_GROUP falls back to the
 * whole field, because a median of two is not a typical price.
 */
// A median needs a few opinions to mean anything. Below this the group is
// measured against everyone instead, because a "typical price" drawn from two
// shops is not typical of anything — with exactly two, one is always cheaper
// and the other dearer by the same amount, every time.
const MIN_GROUP = 3;

export function compareBaskets(lines, chains) {
  const foundCounts = chains.map((_, chainIndex) =>
    lines.reduce((count, line) => count + (line.prices[chainIndex] ? 1 : 0), 0),
  );
  const maxFound = foundCounts.reduce((most, count) => Math.max(most, count), 0);

  // Chains that carry the whole of what anyone carries, and the rest.
  const full = [];
  const partial = [];
  foundCounts.forEach((count, chainIndex) => {
    if (count === 0) return;
    (count === maxFound ? full : partial).push(chainIndex);
  });

  // What a line typically costs among a given set of chains.
  const referenceFrom = (members) =>
    lines.map((line) => {
      const prices = members
        .map((chainIndex) => line.prices[chainIndex])
        .filter(Boolean)
        .map((match) => match.price);
      return prices.length > 0 ? median(prices) : null;
    });

  const everyone = referenceFrom(chains.map((_, chainIndex) => chainIndex));
  const reference = {
    full: full.length >= MIN_GROUP ? referenceFrom(full) : everyone,
    partial: partial.length >= MIN_GROUP ? referenceFrom(partial) : everyone,
  };

  const rows = chains.map((chain, chainIndex) => {
    const foundCount = foundCounts[chainIndex];
    // Each group is priced against its own peers. Drawing the reference from
    // everybody let a shop that stocks only the cheap staples pull the typical
    // price down on exactly those lines — and every chain carrying the full
    // list then looked dearer, on items it had no choice but to include.
    const against = reference[foundCount === maxFound && maxFound > 0 ? 'full' : 'partial'];

    let total = 0;
    let spend = 0;
    let typical = 0;

    lines.forEach((line, lineIndex) => {
      const match = line.prices[chainIndex];
      if (!match) return;
      const cost = match.price * line.amount;
      total += cost;
      // A line with no reference cannot be part of the index, but it is still
      // part of what you would pay.
      if (against[lineIndex] !== null) {
        spend += cost;
        typical += against[lineIndex] * line.amount;
      }
    });

    return {
      key: chain.key,
      displayName: chain.displayName,
      storeName: chain.storeName,
      foundCount,
      total: round(total),
      index: typical > 0 ? spend / typical : null,
    };
  });

  // Coverage first, then price. There is exactly one useful order here, so it
  // is applied at the source instead of being offered as a choice: the only
  // other ordering anyone could pick was its reverse, which put "cheapest" in
  // the headline above a list running the other way.
  rows.sort((a, b) => {
    if (a.foundCount !== b.foundCount) return b.foundCount - a.foundCount;
    return (a.index ?? Infinity) - (b.index ?? Infinity);
  });

  const contenders = rows.filter(
    (row) => row.foundCount === maxFound && maxFound > 0 && row.index !== null,
  );

  const winner = contenders[0] ?? null;
  const runnerUp = contenders[1] ?? null;

  // How much more this basket costs than the best one on offer. Only for the
  // chains carrying the same items as the leader — a smaller basket is cheaper
  // for a reason that has nothing to do with price, and subtracting the two
  // would advertise a saving that does not exist.
  if (winner) {
    for (const row of rows) {
      row.overLeader = row.foundCount === maxFound ? round(row.total - winner.total) : null;
    }
  }

  return {
    rows,
    maxFound,
    winner,
    runnerUp,
    // Compared over the items both of them stock. Two chains can share a
    // coverage count without sharing the same items, and subtracting totals
    // that cover different things would invent a number.
    savings: savingsBetween(lines, chains, winner, runnerUp),
  };
}

function savingsBetween(lines, chains, winner, runnerUp) {
  if (!winner || !runnerUp) return 0;
  const a = chains.findIndex((chain) => chain.key === winner.key);
  const b = chains.findIndex((chain) => chain.key === runnerUp.key);
  if (a < 0 || b < 0) return 0;

  let difference = 0;
  lines.forEach((line) => {
    const mine = line.prices[a];
    const theirs = line.prices[b];
    if (!mine || !theirs) return;
    difference += (theirs.price - mine.price) * line.amount;
  });
  return round(Math.max(0, difference));
}
