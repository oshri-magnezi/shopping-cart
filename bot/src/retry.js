/**
 * Runs something again when it fails for a reason that might not repeat.
 *
 * The bot had no retries at all. A chain whose portal timed out once, or
 * answered a single 502, was logged and dropped for the whole night — and
 * because the run is fail-soft, the night still "succeeded" with one shop
 * missing from every basket. That is how חצי חינם came to be absent from
 * ראשון לציון for four consecutive refreshes without anybody being told.
 *
 * Deliberately small. It does not decide what is worth retrying beyond the
 * caller's own `shouldRetry`, it does not retry forever, and it re-throws the
 * last error untouched so the existing handling upstream is unchanged. A run
 * that works today works identically; only a run that would have failed gets
 * another go.
 */

/** Waits, without pinning a timer open if the process wants to exit. */
const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * @param {() => Promise<T>} task
 * @param {object} [options]
 * @param {number} [options.attempts]  total tries, including the first
 * @param {number} [options.delayMs]   wait before the second try
 * @param {number} [options.factor]    multiplier applied to each further wait
 * @param {(error: Error) => boolean} [options.shouldRetry]
 * @param {(error: Error, attempt: number, waitMs: number) => void} [options.onRetry]
 * @param {(ms: number) => Promise<void>} [options.wait]  seam for tests
 * @returns {Promise<T>}
 * @template T
 */
export async function withRetries(task, options = {}) {
  const {
    attempts = 3,
    delayMs = 2_000,
    factor = 2,
    shouldRetry = () => true,
    onRetry = () => {},
    wait = sleep,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- the point is to serialise
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const isLast = attempt >= attempts;
      if (isLast || !shouldRetry(error)) throw error;

      const waitMs = delayMs * factor ** (attempt - 1);
      onRetry(error, attempt, waitMs);
      // eslint-disable-next-line no-await-in-loop
      await wait(waitMs);
    }
  }
  throw lastError;
}

/**
 * Errors worth trying again.
 *
 * A timeout, a dropped socket or a 5xx is the portal having a moment. A 404,
 * a missing branch or a parse failure will say exactly the same thing on the
 * next attempt, and retrying those only makes a failing run take three times
 * as long to admit it.
 */
const TRANSIENT = [
  /timeout|timed out/i,
  /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i,
  /HTTP 5\d\d/,
  /HTTP 429/,
  /net::ERR_/i,
  /navigation|detached|Target closed|Session closed/i,
  /הקובץ שהתקבל ריק/,
];

export function isTransient(error) {
  const message = String(error?.message ?? error);
  return TRANSIENT.some((pattern) => pattern.test(message));
}
