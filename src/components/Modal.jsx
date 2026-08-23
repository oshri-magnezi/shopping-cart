import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './Modal.css';

// Everything that can hold focus, in document order. `:not([disabled])`
// matters because a disabled submit button is common in these dialogs.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog shell: scrim, Escape to close, focus moved inside on open,
 * held inside while open, and restored to the trigger on close.
 */
export function Modal({ title, onClose, children, footer, labelledBy = 'modal-title' }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

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
        onClose();
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
  }, [onClose]);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panelRef}>
        <div className="modal-header">
          <h2 id={labelledBy} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('picker.close')}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
