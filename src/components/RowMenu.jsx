import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal } from 'lucide-react';
import './RowMenu.css';

const WIDTH = 184;
const ITEM_HEIGHT = 44;
const GAP = 6;
const EDGE = 8;

/**
 * The row's secondary actions, folded behind one button.
 *
 * Edit and delete used to sit permanently on every row, which cost roughly a
 * third of the row's width and put a destructive control one mis-tap away on
 * every line. Same actions, same handlers — one level further in.
 *
 * The panel renders in a portal on the body. Anchoring it to the row instead
 * put it inside `.grouped`, which clips its children so the group's rounded
 * corners hold — and the menu was cut off at the edge of the list.
 */
export const RowMenu = forwardRef(function RowMenu(
  { label, items, trigger, triggerClassName = 'row-menu-trigger' },
  ref,
) {
  const [at, setAt] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const menuId = useId();
  const open = at !== null;

  // Closing plays an exit first and only then unmounts. Without it the panel
  // blinks out of existence, which is the single loudest tell that a menu was
  // built for the web rather than designed.
  const close = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAt(null);
      return;
    }
    setLeaving(true);
  }, []);

  // `point` lets a long press open the menu under the finger instead of under
  // the button. Without it the panel would appear across the row from where
  // the gesture happened, which reads as a different control responding.
  const place = useCallback((point) => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const rect = point
      ? { left: point.x, right: point.x, width: 0, top: point.y, bottom: point.y }
      : anchor;

    const height = items.length * ITEM_HEIGHT + 8;
    const below = rect.bottom + GAP;
    // Centred on the trigger and clamped to the viewport, so it lands the same
    // way at either end of a row and in either writing direction.
    const left = Math.min(
      Math.max(EDGE, rect.left + rect.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - EDGE,
    );
    const flipped = below + height > window.innerHeight - EDGE;
    setAt({
      left,
      top: flipped ? rect.top - height - GAP : below,
      // The panel scales out of the button that opened it rather than out of
      // its own middle, so the motion reads as one object unfolding instead of
      // a second one materialising nearby.
      origin: `${rect.left + rect.width / 2 - left}px ${flipped ? '100%' : '0'}`,
    });
  }, [items.length]);

  // Re-placing on scroll must not snap the panel back to the trigger once a
  // long press has anchored it to a point, so the anchor is remembered.
  const anchorPoint = useRef(null);

  // The row opens this menu on a long press, so it needs a handle on it.
  useImperativeHandle(
    ref,
    () => ({
      openAt: (x, y) => {
        anchorPoint.current = { x, y };
        place({ x, y });
      },
    }),
    [place],
  );

  // The flip above uses an estimated height, and an item whose label wraps is
  // taller than the estimate. Once the panel is real, measure it and pull it
  // back on screen if the guess was short.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const overflow = rect.bottom - (window.innerHeight - EDGE);
    if (overflow > 0) setAt((prev) => (prev ? { ...prev, top: prev.top - overflow } : prev));
  }, [at?.top]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      close();
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      close();
      // Send focus back to the trigger, or the row loses the keyboard.
      triggerRef.current?.focus();
    }
    // Fixed coordinates go stale the moment the page moves under them, so the
    // panel is re-placed rather than dismissed. Closing on scroll looks
    // reasonable until a smooth scroll is still settling when the menu opens —
    // then its own trailing scroll events shut it again immediately.
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place(anchorPoint.current ?? undefined);
      });
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, place, close]);

  return (
    <div className="row-menu">
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          anchorPoint.current = null;
          return open ? close() : place();
        }}
      >
        {trigger ?? <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />}
      </button>

      {open
        ? createPortal(
            <div
              className={`row-menu-popover${leaving ? ' row-menu-leaving' : ''}`}
              id={menuId}
              role="menu"
              ref={panelRef}
              style={{
                top: at.top,
                left: at.left,
                width: WIDTH,
                transformOrigin: at.origin,
              }}
              onAnimationEnd={() => {
                if (!leaving) return;
                setLeaving(false);
                setAt(null);
              }}
            >
              {items.map(({ key, label: itemLabel, icon: Icon, danger, selected, onSelect }) => (
                <button
                  key={key}
                  type="button"
                  // A menu that records a choice is a radio group, not a list
                  // of commands, and has to say so.
                  role={selected === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={selected === undefined ? undefined : selected}
                  className={`row-menu-item${danger ? ' row-menu-item-danger' : ''}${
                    selected ? ' row-menu-item-selected' : ''
                  }`}
                  onClick={() => {
                    // The action runs now; the panel sees itself out.
                    close();
                    onSelect();
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{itemLabel}</span>
                  {selected ? <Check className="row-menu-tick" size={15} strokeWidth={2} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
