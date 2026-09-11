import { useEffect, useRef } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './UndoBar.css';

// Long enough to notice and reach, short enough that it is gone before it
// becomes furniture.
const LIFETIME = 6000;

/**
 * Says what was just removed, and offers it back.
 *
 * This replaces the confirmation dialog that used to guard deletion. A dialog
 * taxes every deletion, including the hundreds that are correct, to protect
 * against the rare one that is not; an undo taxes none of them and still
 * protects against all of them. It is also the faster path — one tap instead
 * of two.
 *
 * It is a `status`, not an `alert`: the deletion already happened and nothing
 * here is urgent enough to interrupt what a screen reader is saying.
 */
export function UndoBar({ message, onUndo, onDismiss }) {
  const { t } = useTranslation();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    // Keyed on the message, so deleting a second item restarts the clock
    // rather than inheriting whatever was left of the first one's.
    const timer = setTimeout(() => dismissRef.current(), LIFETIME);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="undo-bar" role="status" aria-live="polite">
      <div className="undo-bar-inner">
        <Trash2 className="undo-bar-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="undo-bar-text">{message}</span>
        <button type="button" className="undo-bar-action" onClick={onUndo}>
          <Undo2 size={15} strokeWidth={1.5} aria-hidden="true" />
          {t('undo.action')}
        </button>
        {/* The hairline drains as the offer expires. Purely informative, so it
            is hidden from assistive technology rather than narrated. */}
        <span className="undo-bar-timer" aria-hidden="true" />
      </div>
    </div>
  );
}
