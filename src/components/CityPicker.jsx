import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './CityPicker.css';

const GAP = 6;
const EDGE = 8;
const ROW_HEIGHT = 48;

/**
 * The city field: a button that opens a list in the same glass as the search
 * suggestions.
 *
 * It replaced a native <select>, whose list the browser draws itself. That
 * list could not take the glass, and on the dark theme it came out as light
 * names on a white box, next to invisible. On a phone the native control was
 * fine, but one field behaving differently from every other list in the app
 * was the thing that looked wrong.
 *
 * The list renders in a portal on the body, placed under the button: the
 * filter panel it sits in clips its contents so it can fold away, and a list
 * inside it was cut off at the panel's edge.
 */
export function CityPicker({ labelId, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState(null);
  // Closing plays a short shrink before the list unmounts.
  const [leaving, setLeaving] = useState(false);
  // The city just picked, ticked while the list shrinks away, and applied
  // once it has: changing city swaps the whole filter panel for a loading
  // state, which would take the list with it mid-shrink.
  const [picked, setPicked] = useState(null);
  const pending = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const optionId = (index) => `${listId}-${index}`;

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = Math.min(options.length * ROW_HEIGHT, 320);
    const below = rect.bottom + GAP;
    // Opens upward only when there is no room below, as a menu does.
    const flipped = below + height > window.innerHeight - EDGE && rect.top - GAP - height > EDGE;
    setAt({
      left: rect.left,
      width: rect.width,
      top: flipped ? rect.top - GAP - height : below,
      origin: flipped ? 'bottom' : 'top',
    });
  }, [options.length]);

  function show() {
    const current = Math.max(0, options.indexOf(value));
    setActive(current);
    setPicked(null);
    setLeaving(false);
    place();
    setOpen(true);
  }

  // Unmounts the list and applies a pick waiting on it.
  const finish = useCallback(() => {
    setOpen(false);
    setLeaving(false);
    const city = pending.current;
    pending.current = null;
    if (city) onChange(city);
  }, [onChange]);

  const close = useCallback(
    (returnFocus) => {
      if (returnFocus) buttonRef.current?.focus();
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish();
      else setLeaving(true);
    },
    [finish],
  );

  // The tick moves to the chosen city on the tap and the list starts closing
  // at once, shrinking back into the field, like the appearance menu.
  function choose(index) {
    if (leaving) return;
    setPicked(options[index]);
    pending.current = options[index] !== value ? options[index] : null;
    close(true);
  }

  // The list takes the keyboard as soon as it opens, and the chosen city is
  // scrolled into view if the list is long enough to scroll.
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // Only on opening; later moves scroll themselves in onListKeyDown.
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (buttonRef.current?.contains(event.target)) return;
      if (listRef.current?.contains(event.target)) return;
      close(false);
    }
    // Fixed coordinates go stale when the page moves, so the list follows the
    // button instead of being left floating where it was.
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, close, place]);

  function onButtonKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      show();
    }
  }

  function onListKeyDown(event) {
    const last = options.length - 1;
    const move = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    }[event.key];

    if (move !== undefined) {
      event.preventDefault();
      setActive(move);
      document.getElementById(optionId(move))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="city-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="city-picker-value">{value}</span>
        <ChevronDown
          className="city-picker-chevron"
          size={18}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>

      {open && at
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={labelId}
              aria-activedescendant={optionId(active)}
              className={`city-list${leaving ? ' city-list-leaving' : ''}`}
              style={{
                left: at.left,
                top: at.top,
                width: at.width,
                transformOrigin: at.origin,
              }}
              onKeyDown={onListKeyDown}
              onAnimationEnd={(event) => {
                if (leaving && event.target === event.currentTarget) finish();
              }}
            >
              {options.map((name, index) => {
                const selected = picked === null ? name === value : name === picked;
                return (
                  <li
                    key={name}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    className={`city-option${index === active ? ' city-option-active' : ''}`}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(index)}
                  >
                    <span className="city-option-name">{name}</span>
                    {selected ? (
                      <Check className="city-option-check" size={16} strokeWidth={2.5} aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
