'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './QuickAddModal.module.css';
import { useFinance } from '@/contexts/FinanceContext';
import TagPicker from '@/components/TagPicker/TagPicker';
import QuantityStepper from './QuantityStepper';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { buildRecurrencePayload, diffMonths, diffDays } from '@/lib/recurrence';
import { formatCurrency } from '@/lib/utils';

const FULL_FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Não repete' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'installment', label: 'Parcelado' },
];

// Cartão não admite semanal/diário — só faz sentido casar fatura por mês.
const CARD_FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Não repete' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'installment', label: 'Parcelado' },
];

const DATE_LABELS = {
  card: 'Data da Compra',
  income: 'Data da Entrada',
  expense: 'Data da Saída',
  diario: 'Data',
  saving: 'Data',
};

const RECURRING_END_TYPES = ['monthly', 'weekly', 'daily'];

export default function QuickAddModal({ isOpen, onClose, initialType = 'diario', editData = null, defaultDate = null }) {
  const {
    addTransaction, addFixedExpense, addIncomeEntry, addCardBill,
    addRecurringDailyEntry, updateRecurringDailyEntry, deleteRecurringDailyEntry,
    updateTransaction, updateFixedExpense, updateIncomeEntry,
    deleteTransaction, deleteFixedExpense, deleteIncomeEntry,
    cards
  } = useFinance();

  useBackButtonClose(isOpen, onClose);

  const [type, setType] = useState(initialType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);

  const [cardId, setCardId] = useState('');
  const [tagIds, setTagIds] = useState([]);

  const [frequency, setFrequency] = useState('none'); // none, monthly, weekly, daily, installment
  const [endMode, setEndMode] = useState('infinite'); // infinite, count
  const [count, setCount] = useState(2);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const amountInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        const editType = editData.type || initialType;
        setType(editType);
        // Compras no cartão salvam a descrição como "Descrição (Cartão)" — remove o
        // sufixo ao carregar para edição, senão ele se acumula a cada salvamento.
        const rawDesc = editData.description || '';
        setDescription(
          editType === 'card' ? rawDesc.replace(/ \([^)]*\)$/, '') : rawDesc
        );
        setTagIds(editData.tag_ids ?? []);
        if (editData.card_id) setCardId(editData.card_id);

        // Lançamento avulso de verdade (daily_transactions, sem template por
        // trás) — cartão só é editável nessa forma; diário/economia podem
        // ser avulsos OU ocorrência de um template recorrente (isTemplate).
        const isOneOff =
          !editData.isTemplate &&
          editData.date &&
          (editType === 'diario' || editType === 'saving' || editType === 'card');

        if (isOneOff) {
          setDate(editData.date);
          setAmount(editData.amount?.toString() || '');
          setFrequency('none');
          setEndMode('infinite');
          setCount(2);
        } else {
          // income_entries / fixed_expenses / recurring_daily_entries —
          // todos usam start_date/end_date/frequency.
          const freq = editData.frequency || 'none';
          const startDate = editData.start_date;
          const endDate = editData.end_date;
          const rawAmount = Number(editData.amount) || 0;

          setDate(startDate || new Date().toISOString().split('T')[0]);
          setFrequency(freq);

          if (freq === 'installment') {
            const n = startDate && endDate ? diffMonths(startDate, endDate) + 1 : 2;
            setCount(Math.max(n, 2));
            setEndMode('count');
            // O valor digitado originalmente era o TOTAL — reconstrói pra edição.
            setAmount((rawAmount * n).toString());
          } else if (freq === 'none' || !endDate) {
            setAmount(rawAmount.toString());
            setEndMode('infinite');
            setCount(2);
          } else {
            let n;
            if (freq === 'monthly') n = diffMonths(startDate, endDate) + 1;
            else if (freq === 'weekly') n = Math.round(diffDays(startDate, endDate) / 7) + 1;
            else n = diffDays(startDate, endDate) + 1; // daily
            setCount(Math.max(n, 2));
            setEndMode('count');
            setAmount(rawAmount.toString());
          }
        }
      } else {
        setType(initialType);
        setDescription('');
        setAmount('');
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setFrequency('none');
        setEndMode('infinite');
        setCount(2);
        setTagIds([]);
        if (cards.length > 0) setCardId(cards[0].id);
      }
      // O componente fica montado mesmo fechado (só retorna null), então
      // autoFocus não dispara de novo a cada reabertura — foca manualmente.
      amountInputRef.current?.focus();
    }
  }, [isOpen, initialType, editData, cards, defaultDate]);

  if (!isOpen) return null;

  function handleTypeChange(newType) {
    setType(newType);
    // Cartão não admite semanal/diário — se veio de outro tipo com uma
    // dessas escolhidas, volta pro padrão.
    if (newType === 'card' && (frequency === 'weekly' || frequency === 'daily')) {
      setFrequency('none');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);

    const val = parseFloat(amount.replace(',', '.'));
    const isEdit = !!editData;
    const finalAmount = frequency === 'installment' ? val / count : val;
    let result;

    try {
      if (type === 'income') {
        const payload = {
          description,
          amount: finalAmount,
          is_active: true,
          tagIds,
          ...buildRecurrencePayload({ frequency, endMode, count, date }),
        };
        result = isEdit ? await updateIncomeEntry(editData.id, payload) : await addIncomeEntry(payload);
      }
      else if (type === 'expense') {
        const payload = {
          description,
          amount: finalAmount,
          is_active: true,
          tagIds,
          ...buildRecurrencePayload({ frequency, endMode, count, date }),
        };
        result = isEdit ? await updateFixedExpense(editData.id, payload) : await addFixedExpense(payload);
      }
      else if (type === 'diario' || type === 'saving') {
        const targetsTemplate = isEdit ? editData.isTemplate : frequency !== 'none';
        if (!targetsTemplate) {
          const payload = {
            description,
            amount: val,
            date,
            type: type === 'saving' ? 'saving' : 'daily',
            tagIds,
          };
          result = isEdit ? await updateTransaction(editData.id, payload) : await addTransaction(payload);
        } else {
          const payload = {
            kind: type === 'saving' ? 'saving' : 'daily',
            description,
            amount: finalAmount,
            is_active: true,
            tagIds,
            ...buildRecurrencePayload({ frequency, endMode, count, date }),
          };
          result = isEdit
            ? await updateRecurringDailyEntry(editData.id, payload)
            : await addRecurringDailyEntry(payload);
        }
      }
      else if (type === 'card') {
        if (cards.length === 0) {
          alert('Você não possui cartões cadastrados. Vá em Config → Cartões.');
          return;
        }
        const selCard = cards.find(c => c.id === cardId);
        const cName = selCard ? selCard.name : 'Cartão';

        if (isEdit) {
          // Edição só é permitida para compras avulsas (tabela daily_transactions);
          // faturas/parcelas recorrentes não são editáveis por este modal.
          result = await updateTransaction(editData.id, {
            description: `${description} (${cName})`,
            amount: val,
            date,
            card_id: cardId,
            tagIds,
          });
        } else if (frequency === 'none') {
          // Lançamento pontual: vai pro diário para aparecer no dia da compra e somar na fatura dinamicamente
          result = await addTransaction({
            description: `${description} (${cName})`,
            amount: val,
            date,
            type: 'card', // IMPORTANTE: tipo card fará o engine somá-lo na fatura dinamicamente
            card_id: cardId,
            tagIds,
          });
        } else {
          // Lançamento recorrente/parcelado: vai para a tabela de faturas fixas/parceladas
          const payload = {
            card_name: cName,
            card_id: cardId,
            description,
            amount: finalAmount,
            is_active: true,
            tagIds,
            ...buildRecurrencePayload({ frequency, endMode, count, date }),
          };
          result = await addCardBill(payload);
        }
      }

      if (result?.error) {
        console.error('[QuickAddModal] save failed:', result.error);
        alert('Erro ao salvar: ' + (result.error.message || 'verifique os dados e tente novamente.'));
        return;
      }

      onClose();
    } catch(err) {
      console.error(err);
      alert('Erro ao salvar. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editData) return;
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;

    setIsDeleting(true);
    try {
      let result;
      if (type === 'card') {
        result = await deleteTransaction(editData.id);
      } else if (type === 'diario' || type === 'saving') {
        result = editData.isTemplate
          ? await deleteRecurringDailyEntry(editData.id)
          : await deleteTransaction(editData.id);
      } else if (type === 'expense') {
        result = await deleteFixedExpense(editData.id);
      } else if (type === 'income') {
        result = await deleteIncomeEntry(editData.id);
      }

      if (result?.error) {
        console.error('[QuickAddModal] delete failed:', result.error);
        alert('Erro ao excluir: ' + (result.error.message || 'tente novamente.'));
        return;
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir. Verifique sua conexão.');
    } finally {
      setIsDeleting(false);
    }
  }

  // Repetição só é editável em: lançamento novo, entrada/saída (sempre
  // usam tabela de template independente da frequência), ou uma ocorrência
  // de template recorrente de diário/economia. Cartão só permite escolher
  // ao criar (edição é sempre de compra avulsa).
  const showFrequencySelect = type === 'card'
    ? !editData
    : (!editData || type === 'income' || type === 'expense' || editData.isTemplate);

  const frequencyOptions = type === 'card' ? CARD_FREQUENCY_OPTIONS : FULL_FREQUENCY_OPTIONS;
  const showEndModeSelect = showFrequencySelect && RECURRING_END_TYPES.includes(frequency);
  const showStepper =
    showFrequencySelect &&
    (frequency === 'installment' || (RECURRING_END_TYPES.includes(frequency) && endMode === 'count'));

  const rawTotal = parseFloat((amount || '0').replace(',', '.')) || 0;
  const stepperLabel = frequency === 'installment'
    ? `${count} de ${formatCurrency(rawTotal)}/${count}`
    : `${count} de ${formatCurrency(rawTotal)}`;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>{editData ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.formContainer}>

          <div className={styles.formGroup}>
            <label>Tipo</label>
            <select value={type} onChange={e => handleTypeChange(e.target.value)} disabled={!!editData}>
              <option value="diario">Gasto no Dia-a-Dia</option>
              <option value="saving">Economia (Retirada)</option>
              <option value="card">Gasto no Cartão de Crédito</option>
              <option value="expense">Saída Fixa (Mês a Mês)</option>
              <option value="income">Entrada (Dinheiro novo)</option>
            </select>
          </div>

          <div className={styles.valueGroup}>
             <span className={styles.currency}>R$</span>
             <input ref={amountInputRef} type="number" step="0.01" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>

          <div className={styles.formGroup}>
            <label>Descrição</label>
            <input type="text" required value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Mercado, Uber, Salário..." />
          </div>

          <div className={styles.formGroup}>
            <label>{DATE_LABELS[type]}</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {type === 'card' && (
            <div className={styles.formGroup}>
              <label>Cartão</label>
              <select value={cardId} onChange={e => setCardId(e.target.value)} required>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {showFrequencySelect && (
            <div className={styles.formGroup}>
              <label>Repetição</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)}>
                {frequencyOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {showEndModeSelect && (
            <div className={styles.formGroup}>
              <label>Duração</label>
              <select value={endMode} onChange={e => setEndMode(e.target.value)}>
                <option value="infinite">Recorrente (sem fim)</option>
                <option value="count">Número de repetições</option>
              </select>
            </div>
          )}

          {showStepper && (
            <div className={styles.formGroup}>
              <label>Quantidade</label>
              <QuantityStepper count={count} onChange={setCount} label={stepperLabel} />
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Tags</label>
            <TagPicker selectedIds={tagIds} onChange={setTagIds} />
          </div>

          <div className={styles.actionsRow}>
            {editData && (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || isDeleting}>
              {isSubmitting ? 'Salvando...' : editData ? 'Salvar Alterações' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
