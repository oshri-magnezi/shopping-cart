import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import * as haptics from '../utils/haptics.js';
import './Modal.css';

// Everything that can hold focus, in document order. `:not([disabled])`
// matters because a disabled submit button is common in these dialogs.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Past this share of its own height, letting go dismisses the sheet. Short of
// it the sheet springs back, so a hesitant drag never loses your place.
const DISMISS_AT = 0.25;

/**
 * Shared dialog shell: scrim, Escape to close, focus moved inside on open,
 * held inside while open, and restored to the trigger on close.
 *
 * It also owns its own exit. Every caller renders this conditionally, so
 * unmounting is instantaneous and the panel used to vanish mid-air. Instead of
 * asking six call sites to hold a closing flag, the dialog intercepts its own
 * dismissal: it plays the leaving animation first and only then tells the
 * parent, which is when the parent's `null` finally takes it off screen.
 */
export function Modal({ title, onClose, children, footer, labelledBy = 'modal-title' }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState(0);

  const requestClose = useCallback(() => {
    setLeaving((already) => {
      if (already) return already;
      // No animation to wait for when motion is reduced — leave at once.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        onClose();
        return already;
      }
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTarget = panelRef.current?.querySelector(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    focusTarget?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // aria-modal tells a screen reader the rest of the page is inert, but it
      // does nothing for the Tab key: without this, tabbing walks out of the
      // dialog and into the page behind the scrim, where the focus ring is
      // invisible and the shopper is stranded.
      const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [requestClose]);

  // The grabber is a real handle, not a decoration: the sheet follows the
  // finger down and either leaves or springs back on release.
  const dragState = useRef(null);

  function onGripDown(event) {
    dragState.current = { y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onGripMove(event) {
    if (!dragState.current) return;
    // Downward only. Dragging a sheet up past its own top edge is a stretch
    // gesture iOS does not have here, and it would uncover the scrim.
    const moved = Math.max(0, event.clientY - dragState.current.y);
    dragState.current.moved = moved;
    setDrag(moved);
  }

  function onGripUp() {
    const state = dragState.current;
    dragState.current = null;
    if (!state) return;
    const height = panelRef.current?.offsetHeight ?? 0;
    setDrag(0);
    if (state.moved > height * DISMISS_AT) {
      haptics.tap();
      requestClose();
    }
  }

  return (
    <div
      className={`modal-scrim${leaving ? ' modal-leaving' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      // The panel's own leaving animation is the longer of the two, so the
      // scrim waits for it rather than the other way round.
      onAnimationEnd={(event) => {
        if (leaving && event.target === panelRef.current) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panelRef}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <span
          className="modal-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
        />

        <div className="modal-header">
          <h2 id={labelledBy} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={requestClose}
            aria-label={t('picker.close')}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
