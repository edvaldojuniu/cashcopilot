'use client';

import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { nearbyCardClosings, formatMesReferencia } from '@/lib/recurrence';
import styles from './FaturaPicker.module.css';

function formatShort(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Escolhe em qual fatura (mês de fechamento) uma compra avulsa de cartão
// cai — fechamento real de cartão não é fixo todo mês, então em vez de só
// inferir por data, o usuário escolhe explicitamente, e pode corrigir o
// fechamento real daquele mês aqui mesmo se o padrão não bater.
export default function FaturaPicker({ cardId, value, onChange, referenceDate }) {
  const { cards, cardClosings, setCardClosing } = useFinance();
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [saving, setSaving] = useState(false);

  const card = cards.find((c) => c.id === cardId);
  if (!card) return null;

  const options = nearbyCardClosings(card, cardClosings, referenceDate || new Date().toISOString().split('T')[0]);

  async function handleCustomConfirm() {
    if (!customDate) return;
    setSaving(true);
    const [y, m] = customDate.split('-').map(Number);
    const mesReferencia = formatMesReferencia(y, m - 1);
    const { error } = await setCardClosing(cardId, mesReferencia, customDate);
    setSaving(false);
    if (!error) {
      onChange(mesReferencia);
      setCustomDate('');
      setIsAdjusting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        {options.map((opt) => {
          const active = value === opt.mesReferencia;
          return (
            <button
              key={opt.mesReferencia}
              type="button"
              className={styles.chip}
              onClick={() => onChange(opt.mesReferencia)}
              style={active ? { background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', color: 'white' } : undefined}
            >
              Fecha {formatShort(opt.closingDate)}
              {opt.isOverride && <span className={styles.adjustedTag}>ajustado</span>}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.addChip}
          onClick={() => setIsAdjusting((v) => !v)}
        >
          + ajustar fechamento
        </button>
      </div>

      {isAdjusting && (
        <div className={styles.adjustRow}>
          <input
            type="date"
            className="input"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCustomConfirm}
            disabled={saving || !customDate}
          >
            {saving ? 'Salvando...' : 'Usar esta data'}
          </button>
        </div>
      )}
    </div>
  );
}
