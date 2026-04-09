'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '@/contexts/FinanceContext';
import styles from './page.module.css';

export default function AdicionarPage() {
  const router = useRouter();
  const { addTransaction } = useFinance();

  const [type, setType] = useState('daily');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const types = [
    { key: 'daily', label: 'Diário', emoji: '🛒', color: 'var(--color-daily)' },
    { key: 'expense', label: 'Saída', emoji: '📤', color: 'var(--color-expense)' },
    { key: 'income', label: 'Entrada', emoji: '📥', color: 'var(--color-income)' },
    { key: 'card', label: 'Cartão', emoji: '💳', color: 'var(--color-card)' },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount) return;

    setLoading(true);
    const { error } = await addTransaction({
      type,
      amount: Number(amount),
      description,
      date,
    });

    setLoading(false);
    if (!error) {
      router.push('/');
    } else {
      alert("Erro ao salvar: " + (error.message || "Verifique se você rodou o script de configuração no Supabase."));
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} id="btn-back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className={styles.title}>Adicionar Lançamento</h1>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* Type selector */}
        <div className={styles.typeGrid}>
          {types.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.typeBtn} ${type === t.key ? styles.typeBtnActive : ''}`}
              onClick={() => setType(t.key)}
              style={type === t.key ? { borderColor: t.color, background: `${t.color}15` } : {}}
            >
              <span className={styles.typeEmoji}>{t.emoji}</span>
              <span className={styles.typeLabel}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className={styles.amountField}>
          <span className={styles.amountPrefix}>R$</span>
          <input
            type="number"
            className={styles.amountInput}
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            autoFocus
            required
            id="input-amount"
          />
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className="label">Descrição</label>
          <input
            className="input"
            placeholder="O que foi? (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="input-description"
          />
        </div>

        {/* Date */}
        <div className={styles.field}>
          <label className="label">Data</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            id="input-date"
          />
        </div>

        <button
          type="submit"
          className={`btn btn-primary btn-full ${styles.submitBtn}`}
          disabled={loading || !amount}
          id="btn-submit-transaction"
        >
          {loading ? 'Salvando...' : 'Salvar Lançamento'}
        </button>
      </form>
    </div>
  );
}
