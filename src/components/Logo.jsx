import './Logo.css';

/**
 * The mark: a price tag with a downward arrow through it.
 *
 * Not a shopping cart. A cart says "list", and every shopping app on the store
 * already uses one — it is the single most generic mark in the category. This
 * app's job is finding the lowest price, so the mark is the tag and the fall.
 *
 * Two colours only, both from the palette, and no stroke thinner than 2.5px at
 * the drawn size — it has to survive a 16px favicon.
 */
export function Logo({ size = 26, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M17.7 3.1a3.2 3.2 0 0 0-2.3-.9H6.6a3.4 3.4 0 0 0-3.4 3.4v8.8c0 .9.3 1.7.9 2.3l11.6 11.6a3.2 3.2 0 0 0 4.6 0l8.8-8.8a3.2 3.2 0 0 0 0-4.6z"
        fill="currentColor"
      />
      {/* The eyelet. Punched through to the page rather than filled, so the mark
          reads the same on paper, on charcoal and on the accent itself. */}
      <circle cx="9.6" cy="9.6" r="2.4" className="logo-eye" />
      {/* The fall: what the tag is for. */}
      <path
        d="M17.6 12.9v6.1m0 0 2.7-2.7m-2.7 2.7-2.7-2.7"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
