'use client';

import styles from './RecurrenceScopeModal.module.css';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';

// Pergunta o escopo antes de editar/excluir uma ocorrência de um lançamento
// recorrente (mensal/semanal/diário/parcelado) — a mesma escolha que apps de
// calendário fazem: só esta ocorrência, esta e as próximas, ou cancelar.
export default function RecurrenceScopeModal({
  isOpen,
  onClose,
  onChooseOnly,
  onChooseFuture,
  actionLabel = 'Atualizar',
  loading = false,
}) {
  useBackButtonClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <h3 className={styles.title}>Esse lançamento se repete</h3>
        <p className={styles.message}>O que você quer fazer?</p>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={onChooseOnly}
            disabled={loading}
          >
            {actionLabel} somente esta
          </button>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={onChooseFuture}
            disabled={loading}
          >
            {actionLabel} esta e as próximas
          </button>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
