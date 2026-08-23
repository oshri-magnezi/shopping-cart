import { Minus, Plus } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatWeight } from '../utils/format.js';
import './WeightStepper.css';

// Counter staff work in round hundreds of grams, so that is the step. The
// floor is one step rather than zero: an item weighing nothing is not an
// order, it is a mistake.
const STEP = 0.1;
const MIN = 0.1;
const MAX = 20;

const round = (kg) => Math.round(kg * 1000) / 1000;

/**
 * Picks a weight in kilograms, shown in whichever unit reads naturally —
 * grams below a kilo, kilos above it.
 */
export function WeightStepper({ value, onChange, size = 'md' }) {
  const { t } = useTranslation();

  return (
    <div className={`stepper stepper-${size}`}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(round(Math.max(MIN, value - STEP)))}
        disabled={value <= MIN}
        aria-label={t('item.decreaseWeight')}
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <span className="stepper-value weight-value tabular" aria-label={t('picker.weight')}>
        {formatWeight(value, t)}
      </span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(round(Math.min(MAX, value + STEP)))}
        disabled={value >= MAX}
        aria-label={t('item.increaseWeight')}
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
