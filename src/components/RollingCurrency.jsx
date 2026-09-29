import { useEffect, useState } from 'react';
import { formatCurrency } from '../utils/format.js';
import './RollingCurrency.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A money figure whose digits roll into place, the way Apple Wallet shows a
 * balance (SwiftUI calls it a numeric-text transition).
 *
 * Each digit is a column holding 0 to 9, slid to the right one on a spring, so
 * a changing total visibly turns over rather than being retyped. It replaces a
 * count-up that re-rendered the component on every animation frame; this one
 * renders once per value and leaves the motion to CSS.
 *
 * Columns are keyed from the right, so when a total grows from 99.50 to
 * 104.20 the units stay in the units column and only the new hundreds column
 * arrives. The figure rolls up from zero when it first appears — a total that
 * is simply there reads as a label; one that lands reads as a result.
 *
 * The rolling strips are hidden from assistive technology, which reads the
 * whole formatted amount instead of forty loose digits.
 */
export function RollingCurrency({ value, locale, className = '' }) {
  // False for the first frame, so every column paints at zero and then rolls
  // to its digit. Two frames, because the first one may be the same frame the
  // columns were inserted in, and a transition needs a painted start.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const text = formatCurrency(value, locale);
  const chars = [...text];

  return (
    <span className={`rolling ${className}`.trim()} dir="ltr">
      <span className="sr-only">{text}</span>
      <span className="rolling-figure" aria-hidden="true">
        {chars.map((char, index) => {
          const fromRight = chars.length - index;
          if (!/\d/.test(char)) {
            const sign = /\p{Sc}/u.test(char);
            return (
              <span key={`c${fromRight}`} className={`rolling-char${sign ? ' currency-sign' : ''}`}>
                {char}
              </span>
            );
          }
          return (
            <span
              key={`d${fromRight}`}
              className="rolling-digit"
              style={{ '--digit': ready ? Number(char) : 0, '--column': fromRight }}
            >
              <span className="rolling-strip">
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
