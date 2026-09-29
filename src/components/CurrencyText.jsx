import { formatCurrencyParts } from '../utils/format.js';

/**
 * An amount with its currency sign drawn quieter than the digits
 * (`.currency-sign`), so the eye lands on the number. The text is exactly what
 * formatCurrency produces; only the sign is wrapped.
 */
export function CurrencyText({ value, locale }) {
  return formatCurrencyParts(value, locale).map((part, index) =>
    part.sign ? (
      <span key={index} className="currency-sign">
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}
