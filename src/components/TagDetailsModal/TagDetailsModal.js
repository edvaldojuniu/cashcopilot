'use client';

import styles from './TagDetailsModal.module.css';
import { formatCurrency } from '@/lib/utils';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';

const GROUP_LABELS = {
  income: 'Entrada',
  fixed: 'Saída Fixa',
  daily: 'Diário',
  saving: 'Economia',
  card: 'Cartão',
};

const GROUP_COLORS = {
  income: 'var(--color-income)',
  fixed: 'var(--color-expense)',
  daily: 'var(--color-daily)',
  saving: 'var(--color-income)',
  card: 'var(--color-card)',
};

// Detalhamento dos lançamentos que formam o total de uma tag no período —
// aberto ao clicar num card em "Gastos por Tag" (Totais).
export default function TagDetailsModal({ isOpen, onClose, tag, logs = [] }) {
  useBackButtonClose(isOpen, onClose);

  if (!isOpen || !tag) return null;

  const sortedLogs = [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate));

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>

        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h3>
              <span className={styles.tagDot} style={{ background: tag.cor }} />
              {tag.nome}
            </h3>
            <div className={styles.subText}>Detalhamento no período</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span>Total da Tag</span>
            <strong style={{ color: tag.cor }}>{formatCurrency(tag.total)}</strong>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.groupTitle}>Lançamentos ({sortedLogs.length})</div>

          <div className={styles.itemList}>
            {sortedLogs.length > 0 ? sortedLogs.map((log, i) => {
              const d = new Date(`${log.logDate}T12:00:00`);
              const niceDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
              return (
                <div key={i} className={styles.item} style={{ borderLeftColor: GROUP_COLORS[log.group] }}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemDesc}>{log.description}</span>
                    <span className={styles.itemMeta}>{niceDate} · {GROUP_LABELS[log.group] || log.group}</span>
                  </div>
                  <span className={styles.itemAmount} style={{ color: GROUP_COLORS[log.group] }}>
                    {formatCurrency(Number(log.amount))}
                  </span>
                </div>
              );
            }) : (
              <div className={styles.emptyItems}>Nenhum lançamento encontrado.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
