/**
 * Short vibrations that confirm a physical-feeling action.
 *
 * Honest scope: the Vibration API is **not supported by Safari on iOS**. On an
 * iPhone every call here is a no-op, and the interface has to remain complete
 * without it — nothing may depend on the buzz to be understood. On Android and
 * desktop Chrome it fires.
 *
 * Someone who has asked the system to reduce motion has asked for less
 * physical feedback, not more, so the whole module goes quiet for them.
 */
function allowed() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function buzz(pattern) {
  if (!allowed()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers expose vibrate but refuse it outside a user gesture */
  }
}

/** A control engaged: a swipe opening, a segment changing. */
export const tap = () => buzz(8);

/** Something completed: an item checked off, a purchase closed. */
export const success = () => buzz([12, 40, 12]);

/** A destructive threshold reached, before the finger is lifted. */
export const warn = () => buzz(24);
