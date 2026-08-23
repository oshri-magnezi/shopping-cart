/**
 * Line art for the three empty screens.
 *
 * Drawn in the same idiom as the rest of the app — rectilinear, 2px strokes,
 * one ochre accent apiece — so an empty screen still looks like this shop
 * rather than like a stock illustration. Each one shows the artefact the
 * screen is about, waiting to be filled in.
 */

const BOX = { width: 104, height: 76, viewBox: '0 0 104 76', fill: 'none', 'aria-hidden': true };
const line = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' };

/** A blank shelf-edge ticket on its rail: the list before anything is on it. */
export function ShelfTicketArt() {
  return (
    <svg {...BOX} className="empty-art">
      <path d="M8 14h88" {...line} />
      <path d="M14 14v6M90 14v6" {...line} />
      <rect x="22" y="20" width="60" height="42" rx="2" {...line} />
      <path d="M30 34h30M30 44h22" {...line} />
      <path d="M64 44h10" {...line} className="empty-art-accent" />
    </svg>
  );
}

/** A till receipt with a torn foot: trips already made. */
export function ReceiptArt() {
  return (
    <svg {...BOX} className="empty-art">
      <path
        d="M32 10h40v52l-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4z"
        {...line}
        strokeLinejoin="round"
      />
      <path d="M40 24h24M40 34h24M40 44h14" {...line} />
      <path d="M58 44h6" {...line} className="empty-art-accent" />
    </svg>
  );
}

/** A balance: the comparison itself, with nothing in the pans yet. */
export function BalanceArt() {
  return (
    <svg {...BOX} className="empty-art">
      <path d="M52 16v42M38 64h28" {...line} />
      <path d="M52 58v6" {...line} />
      <path d="M22 24h60" {...line} />
      <circle cx="52" cy="18" r="3" {...line} />
      <path d="M22 24l-8 14h16z" {...line} strokeLinejoin="round" />
      <path d="M82 24l-8 14h16z" {...line} strokeLinejoin="round" className="empty-art-accent" />
    </svg>
  );
}
