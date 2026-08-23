import './LiveRegion.css';

/**
 * Announces a change that is otherwise only visible.
 *
 * Adding an item, removing one, or a comparison finishing all redraw part of
 * the screen silently; without this, someone using a screen reader gets no
 * confirmation that anything happened at all.
 */
export function LiveRegion({ message }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message}
    </p>
  );
}
