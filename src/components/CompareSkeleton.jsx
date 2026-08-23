import './CompareSkeleton.css';

// Enough rows to read as a list without pretending to know how many chains
// the city actually has.
const ROWS = 4;

/**
 * Stands in for the chain table while the city catalogue downloads.
 *
 * A catalogue is several megabytes, so this is on screen for a real second or
 * two. Holding the table's shape means the page does not jump when the data
 * lands, and the wait reads as progress rather than as an empty screen.
 */
export function CompareSkeleton({ label }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: ROWS }, (_, row) => (
        <div className="skeleton-row" key={row} aria-hidden="true">
          <span className="skeleton-bar skeleton-name" />
          <span className="skeleton-bar skeleton-figure" />
        </div>
      ))}
    </div>
  );
}
