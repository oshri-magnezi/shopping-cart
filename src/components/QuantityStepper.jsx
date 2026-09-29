import { useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './QuantityStepper.css';

export function QuantityStepper({ value, onChange, size = 'md' }) {
  const { t } = useTranslation();

  // Which way the number last moved, so the new digit comes in from below on
  // the way up and from above on the way down, like a counter turning over.
  // Worked out while rendering, from the value the last render saw; nothing
  // moves on the first paint.
  const previous = useRef(value);
  const direction = useRef(null);
  if (value !== previous.current) {
    direction.current = value > previous.current ? 'up' : 'down';
    previous.current = value;
  }

  return (
    <div className={`stepper stepper-${size}`}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={t('item.decrease')}
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <span className="stepper-value tabular" aria-label={t('item.quantity')}>
        <span
          key={value}
          className={
            direction.current ? `stepper-digit stepper-digit-${direction.current}` : undefined
          }
        >
          {value}
        </span>
      </span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.min(99, value + 1))}
        disabled={value >= 99}
        aria-label={t('item.increase')}
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
