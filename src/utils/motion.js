import { useLayoutEffect, useRef } from 'react';

/**
 * Motion helpers, on the Web Animations API — no library.
 *
 * Everything here answers the same question for the shopper: where did that
 * go? A row that is checked off slides to its new place instead of vanishing
 * from one spot and appearing in another; a ranking that changes reorders in
 * front of you instead of blinking. That technique is FLIP: record where each
 * element is (First), let React move it (Last), then play it back from the
 * old place with a transform (Invert, Play). Only transform and opacity are
 * animated, so all of it stays on the compositor.
 */

/** The same springs as tokens.css, for animations started from script. */
export const SPRING = {
  smooth: {
    duration: 510,
    easing:
      'linear(0, 0.041, 0.135, 0.249, 0.366, 0.475, 0.572, 0.655, 0.724, 0.782, 0.828, 0.866, 0.896, 0.919, 0.938, 0.952, 0.963, 0.972, 0.979, 0.984, 0.988, 0.991, 0.993, 0.995, 1)',
    fallback: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
  snappy: {
    duration: 380,
    easing:
      'linear(0, 0.04, 0.135, 0.257, 0.385, 0.508, 0.619, 0.714, 0.792, 0.855, 0.903, 0.94, 0.966, 0.985, 0.997, 1.005, 1.009, 1.011, 1.011, 1.01, 1.009, 1.008, 1.007, 1.005, 1)',
    fallback: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

const supportsLinear =
  typeof CSS !== 'undefined' && Boolean(CSS.supports?.('transition-timing-function', 'linear(0, 1)'));

/** Timing options for element.animate, falling back where linear() is missing. */
export function springTiming(name = 'smooth', extra = {}) {
  const spring = SPRING[name];
  return {
    duration: spring.duration,
    easing: supportsLinear ? spring.easing : spring.fallback,
    ...extra,
  };
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Slides a list's rows to their new places whenever its order changes.
 *
 * Every row carries `data-flip="<stable key>"`. Positions are recorded after
 * each commit, relative to the container, so the next change has a "before"
 * to play from — and a page that scrolled in between is not mistaken for rows
 * that moved. Only a change of `order` plays anything; other re-renders just
 * refresh the record. New rows are left to their own entrance.
 */
export function useFlipList(containerRef, order) {
  const last = useRef({ order, positions: null });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect();
    const rows = [...container.querySelectorAll('[data-flip]')];
    const positions = new Map(
      rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return [row.dataset.flip, { x: rect.left - origin.left, y: rect.top - origin.top }];
      }),
    );

    const before = last.current;
    last.current = { order, positions };
    if (before.order === order || !before.positions || prefersReducedMotion()) return;

    const timing = springTiming('smooth');
    for (const row of rows) {
      const was = before.positions.get(row.dataset.flip);
      const now = positions.get(row.dataset.flip);
      if (!was) continue;
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing);
    }
  });
}

/**
 * Folds an element away — height, spacing and opacity to nothing — and then
 * calls `done`, which removes it for real.
 *
 * A row that simply vanished made everything under it jump up a row's height
 * in one frame; folded, the rows below slide up into the space as it closes.
 * With reduced motion, or no element to fold, `done` runs at once.
 */
export function collapse(element, done) {
  if (!element || prefersReducedMotion()) {
    done();
    return;
  }
  const style = getComputedStyle(element);
  element.style.overflow = 'hidden';
  const animation = element.animate(
    [
      {
        height: `${element.offsetHeight}px`,
        minHeight: '0px',
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        opacity: 1,
      },
      {
        height: '0px',
        minHeight: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        marginTop: '0px',
        marginBottom: '0px',
        opacity: 0,
      },
    ],
    // Eased in and out, not the sheet's fast-out curve: that one closed most
    // of the gap in the first hundred milliseconds and read as a blink.
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  );
  animation.onfinish = done;
}

/**
 * Shrinks a flex item out of its row — its share of the width, its minimum
 * and the gap after it — over the same stretch as `collapse`, so its
 * neighbours spread into the space instead of jumping. Returns the running
 * animation, which the caller cancels once the element has really gone; null
 * when there is nothing to animate.
 */
export function shrinkAway(element, gap = '2px') {
  if (!element || prefersReducedMotion()) return null;
  return element.animate(
    [
      { flexGrow: 1, minWidth: getComputedStyle(element).minWidth, marginInlineEnd: '0px' },
      { flexGrow: 0, minWidth: '0px', marginInlineEnd: `-${gap}` },
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  );
}
