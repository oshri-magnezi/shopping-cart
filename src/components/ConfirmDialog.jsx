import { Modal } from './Modal.jsx';
import { useTranslation } from '../i18n/useTranslation.js';

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }) {
  const { t } = useTranslation();

  return (
    <Modal
      title={title}
      onClose={onClose}
      labelledBy="confirm-title"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('confirm.cancel')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel ?? t('confirm.delete')}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
