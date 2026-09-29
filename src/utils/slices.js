/**
 * Runs `work(from, to)` over rows 0..length in chunks, handing the main thread
 * back through `breathe` whenever `budgetMs` has passed since the last breath.
 *
 * The catalogue builds used to breathe once per chain. On a phone one large
 * chain (Tiv Taam, ~23k products) was still a single task of half a second, and
 * it landed while the add-item sheet was opening — the sheet stalled, taps went
 * unanswered, and a run of such tasks read as the whole app lagging. Measured
 * by time rather than by chain, no task runs much past the budget, so the
 * browser keeps drawing frames and answering touches while the work goes on.
 *
 * The work and its result are exactly the same; only where it pauses changes.
 */
export async function inSlices(
  length,
  work,
  breathe,
  { chunk = 400, budgetMs = 8, now = () => performance.now() } = {},
) {
  let since = now();
  for (let from = 0; from < length; from += chunk) {
    work(from, Math.min(length, from + chunk));
    if (now() - since >= budgetMs) {
      // eslint-disable-next-line no-await-in-loop -- yielding is the point
      await breathe();
      since = now();
    }
  }
}
