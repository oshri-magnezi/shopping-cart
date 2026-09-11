import { useEffect, useRef, useState } from 'react';

const DURATION = 460;

// Ease-out cubic: most of the distance is covered early, then it settles.
// A linear count reads like a slot machine; this reads like a total landing.
const ease = (t) => 1 - (1 - t) ** 3;

/**
 * Counts from the previous value to the new one instead of jumping.
 *
 * Only worth doing where the number is the answer to something — a basket
 * total, a saving — because the motion is what makes a figure feel recalculated
 * rather than replaced.
 *
 * An interrupted run continues from wherever it had reached, so a shopper
 * tapping a stepper repeatedly sees one continuous figure rather than a value
 * that snaps back to the last settled total on every tap.
 */
export function useAnimatedNumber(value) {
  // Starts at zero so the first value counts up too. A total that is simply
  // present when the page settles reads as a label; one that arrives reads as
  // a result, and this figure is the answer to the whole screen.
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      setDisplay(value);
      return undefined;
    }

    const from = current.current;
    if (from === value) return undefined;

    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / DURATION);
      const at = from + (value - from) * ease(t);
      current.current = at;
      setDisplay(at);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return display;
}
