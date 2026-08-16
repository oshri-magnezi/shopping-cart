import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import './CompletePurchaseModal.css';

export function CompletePurchaseModal({ onComplete, onClose }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const parsed = Number(amount.replace(',', '.'));
    if (!amount.trim() || Number.isNaN(parsed) || parsed < 0) {
      setError(t('complete.invalidAmount'));
      return;
    }
    onComplete(parsed);
  }

  return (
    <Modal
      title={t('complete.title')}
      onClose={onClose}
      labelledBy="complete-title"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onComplete(null)}>
            {t('complete.skip')}
          </button>
          <button type="submit" form="complete-form" className="btn btn-primary">
            {t('complete.save')}
          </button>
        </>
      }
    >
      <div className="complete-hero">
        <span className="complete-icon" aria-hidden="true">
          <CircleCheck size={28} strokeWidth={2} />
        </span>
        <p className="complete-subtitle">{t('complete.subtitle')}</p>
      </div>

      <form id="complete-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">{t('complete.amountLabel')}</span>
          <div className="amount-input">
            <span className="amount-currency" aria-hidden="true">
              ₪
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="text-input tabular"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (error) setError('');
              }}
              placeholder={t('complete.amountPlaceholder')}
              autoComplete="off"
            />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </label>
      </form>
    </Modal>
  );
}
