'use client';

import { useState } from 'react';
import styles from './ConfirmModal.module.css';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  requireText = null,
  loading = false,
}) {
  const [typedText, setTypedText] = useState('');
  // Reseta o campo digitado toda vez que o modal abre, sem useEffect —
  // ajustar state a partir de uma mudança de prop durante o render é o
  // padrão recomendado pelo React para esse caso.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setTypedText('');
  }

  useBackButtonClose(isOpen, onClose);

  if (!isOpen) return null;

  const isBlocked = requireText ? typedText.trim() !== requireText : false;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>

        {requireText && (
          <div className={styles.confirmTextGroup}>
            <label className="label">
              Digite <strong>{requireText}</strong> para confirmar
            </label>
            <input
              className="input"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              autoFocus
              autoCapitalize="characters"
            />
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-danger btn-full ${styles.confirmBtn}`}
            onClick={onConfirm}
            disabled={loading || isBlocked}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
