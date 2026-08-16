import { Minus, Plus } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './QuantityStepper.css';

export function QuantityStepper({ value, onChange, size = 'md' }) {
  const { t } = useTranslation();

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
        {value}
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
