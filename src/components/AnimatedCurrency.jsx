import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';
import { formatCurrency } from '../utils/format.js';

/**
 * A money figure that counts to its new value.
 *
 * A component rather than a bare hook because these figures appear inside
 * lists, and a hook cannot be called from a map callback. Each row rendering
 * its own instance is also what lets every total settle independently.
 *
 * `dir="ltr"` is not optional: a currency sign next to a number reverses in an
 * RTL paragraph, and ₪48.15 would read as 48.15₪.
 */
export function AnimatedCurrency({ value, locale, className = '' }) {
  const shown = useAnimatedNumber(value);

  return (
    <span className={className} dir="ltr">
      {formatCurrency(shown, locale)}
    </span>
  );
}
