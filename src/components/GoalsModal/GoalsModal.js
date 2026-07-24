'use client';

import { useState } from 'react';
import styles from './GoalsModal.module.css';
import { useFinance } from '@/contexts/FinanceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { formatCurrency } from '@/lib/utils';

export default function GoalsModal({ isOpen, onClose, periodStart, periodEnd, currentGoal, incomeTotal, onSaved }) {
  const { upsertPeriodGoal, tags } = useFinance();
  const { profile, updateProfile } = useAuth();

  const [metaGasto, setMetaGasto] = useState('');
  const [metaEconomia, setMetaEconomia] = useState('');
  const [incomeTagId, setIncomeTagId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Repovoa os campos toda vez que o modal abre, sem useEffect — ajustar
  // state a partir de uma mudança de prop durante o render é o padrão
  // recomendado pelo React pra esse caso (evita a regra "no setState em effect").
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setMetaGasto(currentGoal?.meta_gasto != null ? String(currentGoal.meta_gasto) : '');
      setMetaEconomia(currentGoal?.meta_economia != null ? String(currentGoal.meta_economia) : '');
      setIncomeTagId(profile?.income_tag_id || '');
    }
  }

  useBackButtonClose(isOpen, onClose);

  if (!isOpen) return null;

  const suggestedMin = incomeTotal ? Math.round(incomeTotal * 0.10 * 100) / 100 : null;
  const suggestedMax = incomeTotal ? Math.round(incomeTotal * 0.30 * 100) / 100 : null;

  async function handleSave() {
    setIsSaving(true);
    try {
      if (incomeTagId !== (profile?.income_tag_id || '')) {
        await updateProfile({ income_tag_id: incomeTagId || null });
      }

      const { error } = await upsertPeriodGoal({
        periodStart,
        periodEnd,
        metaGasto: metaGasto ? parseFloat(metaGasto.replace(',', '.')) : null,
        metaEconomia: metaEconomia ? parseFloat(metaEconomia.replace(',', '.')) : null,
      });

      if (error) {
        alert('Erro ao salvar metas: ' + (error.message || 'tente novamente.'));
        return;
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar metas. Verifique sua conexão.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Editar Metas</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.formGroup}>
          <label>Meta de gasto do período (R$)</label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={metaGasto}
            onChange={(e) => setMetaGasto(e.target.value)}
            placeholder="Ex: 6000"
          />
        </div>

        <div className={styles.formGroup}>
          <label>Meta de economia do período (R$)</label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={metaEconomia}
            onChange={(e) => setMetaEconomia(e.target.value)}
            placeholder="Ex: 1000"
          />
          {suggestedMin != null && !metaEconomia && (
            <button
              type="button"
              className={styles.suggestion}
              onClick={() => setMetaEconomia(String(suggestedMin))}
            >
              Sugestão: {formatCurrency(suggestedMin)} a {formatCurrency(suggestedMax)} (10-30% da renda)
            </button>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>Tag que identifica sua renda</label>
          <select value={incomeTagId} onChange={(e) => setIncomeTagId(e.target.value)}>
            <option value="">Nenhuma</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className={styles.hint}>
            Marque suas entradas de renda com essa tag para o Cash Copilot calcular
            automaticamente uma sugestão de meta de economia (10% a 30% da sua renda)
            e comparar seus gastos com o que você realmente ganha no período.
          </span>
        </div>

        <button
          className={`btn btn-primary btn-full ${styles.saveBtn}`}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Salvando...' : 'Salvar Metas'}
        </button>
      </div>
    </div>
  );
}
