import { useEffect, useRef, useState } from 'react';
import * as haptics from '../utils/haptics.js';
import './SwipeRow.css';

// Roughly two 74px action buttons. The row rests here when opened.
const REVEAL = 148;
// Drag this far and letting go runs the destructive action outright, the way
// a long swipe in Mail deletes without waiting for a second tap.
const COMMIT = 260;
// Horizontal travel required before the gesture is taken from the scroller.
// Too small and a slightly diagonal flick stops the page dead.
const INTENT = 10;
const LONG_PRESS_MS = 500;

/**
 * Reveals a row's actions on a swipe, and opens its menu on a long press.
 *
 * Touch only. With a mouse there is no swipe to make, and the row's own menu
 * button is already one click away — so on a fine pointer this contributes
 * nothing but a chance to misfire, and stands down entirely.
 *
 * The buttons underneath are deliberately unreachable by keyboard: they are a
 * second route to actions the menu already offers, and putting them in the tab
 * order would make every row cost three stops instead of one.
 */
export function SwipeRow({ actions, onLongPress, children }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const surfaceRef = useRef(null);
  const gesture = useRef(null);
  const warned = useRef(false);

  // The gesture's own copy of where the row is. Releasing has to decide from
  // the last position the finger reached, and React state may not have flushed
  // yet — several pointermoves can land inside one task, and then the pointerup
  // that follows them would read a stale zero and snap the row shut.
  const travelRef = useRef(0);

  function moveTo(next) {
    travelRef.current = next;
    setOffset(next);
  }

  // Direction is read from the document, not hard-coded. The actions are
  // pinned to the row's inline-end, so the surface travels away from that
  // edge: rightwards in Hebrew, leftwards in English.
  const direction = useRef(1);
  useEffect(() => {
    direction.current =
      getComputedStyle(document.documentElement).direction === 'rtl' ? 1 : -1;
  }, []);

  function cancelLongPress() {
    if (!gesture.current?.timer) return;
    clearTimeout(gesture.current.timer);
    gesture.current.timer = 0;
  }

  /**
   * Stops the click that a finished swipe would otherwise deliver.
   *
   * A swipe can legitimately start on top of the stepper — the middle of the
   * row is mostly stepper — and the gesture has to win once it is clearly
   * horizontal. But the browser still synthesises a click for that press, and
   * without this the row would slide open *and* change the quantity.
   */
  function swallowNextClick() {
    const once = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    surfaceRef.current?.addEventListener('click', once, { capture: true, once: true });
    // If no click follows — the common case on a clean swipe — drop the trap
    // rather than leaving it armed for the next real tap.
    setTimeout(() => surfaceRef.current?.removeEventListener('click', once, true), 350);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse') return;

    // A long press on a control is that control's business, so only a press
    // that starts on the row itself opens the menu. The swipe, by contrast,
    // may start anywhere.
    const onControl = Boolean(event.target.closest('button'));

    const timer = onLongPress && !onControl
      ? setTimeout(() => {
          if (!gesture.current || gesture.current.axis === 'x') return;
          gesture.current.longPressed = true;
          haptics.tap();
          onLongPress(event.clientX, event.clientY);
        }, LONG_PRESS_MS)
      : 0;

    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      start: travelRef.current,
      axis: null,
      timer,
      longPressed: false,
      onControl,
    };
    warned.current = false;
  }

  function onPointerMove(event) {
    const g = gesture.current;
    if (!g || g.longPressed) return;

    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;

    if (g.axis === null) {
      if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      cancelLongPress();
      if (g.axis === 'x') {
        if (g.onControl) swallowNextClick();
        try {
          surfaceRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // The pointer can already be gone by the time we claim it — a fast
          // flick, or a synthetic event. Losing capture costs us nothing but
          // events outside the row, and throwing here would kill the gesture.
        }
        setDragging(true);
      }
    }
    if (g.axis !== 'x') return;

    // Measured along the reveal direction, so it is positive for an opening
    // drag in either language.
    const travel = Math.max(0, g.start + dx * direction.current);
    if (travel > COMMIT && !warned.current) {
      warned.current = true;
      haptics.warn();
    }
    moveTo(travel);
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    cancelLongPress();
    setDragging(false);
    if (!g || g.axis !== 'x') return;

    const travel = travelRef.current;
    const destructive = actions.find((action) => action.danger);
    if (travel > COMMIT && destructive) {
      moveTo(0);
      destructive.onSelect();
      return;
    }
    const open = travel > REVEAL / 2;
    if (open && g.start === 0) haptics.tap();
    moveTo(open ? REVEAL : 0);
  }

  const shift = offset * direction.current;

  return (
    <div className="swipe-row">
      <div className="swipe-actions" aria-hidden="true">
        {actions.map(({ key, label, icon: Icon, danger, onSelect }) => (
          <button
            key={key}
            type="button"
            tabIndex={-1}
            className={`swipe-action${danger ? ' swipe-action-danger' : ''}`}
            onClick={() => {
              moveTo(0);
              onSelect();
            }}
          >
            <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div
        ref={surfaceRef}
        className={`swipe-surface${dragging ? ' swipe-dragging' : ''}`}
        style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
