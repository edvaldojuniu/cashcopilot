'use client';

import { useState, useEffect } from 'react';
import styles from './QuickAddModal.module.css';
import { useFinance } from '@/contexts/FinanceContext';

export default function QuickAddModal({ isOpen, onClose, initialType = 'diario', editData = null, defaultDate = null }) {
  const {
    addTransaction, addFixedExpense, addIncomeEntry, addCardBill,
    updateTransaction, updateFixedExpense, updateIncomeEntry, updateCardBill,
    cards
  } = useFinance();

  const [type, setType] = useState(initialType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [dueDay, setDueDay] = useState(new Date().getDate());
  
  const [cardId, setCardId] = useState('');
  
  const [recurrence, setRecurrence] = useState('unica'); // unica, fixa, parcelada
  const [installments, setInstallments] = useState(1);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setType(editData.type || initialType);
        setDescription(editData.description || '');
        setAmount(editData.amount?.toString() || '');
        if (editData.date) setDate(editData.date);
        if (editData.due_day) setDueDay(editData.due_day);
        if (editData.card_id) setCardId(editData.card_id);
        
        if (editData.start_month && editData.end_month) {
          setRecurrence('parcelada');
          // Approximates installments, just for UI mapping
          setInstallments(12); // Actually hard to reverse-calc properly without dates, MVP limitation
        } else if (editData.start_month && !editData.end_month) {
          setRecurrence('fixa');
        } else {
          setRecurrence('unica');
        }
      } else {
        setType(initialType);
        setDescription('');
        setAmount('');
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setDueDay(defaultDate ? parseInt(defaultDate.split('-')[2]) : new Date().getDate());
        setRecurrence('unica');
        setInstallments(1);
        if (cards.length > 0) setCardId(cards[0].id);
      }
    }
  }, [isOpen, initialType, editData, cards, defaultDate]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);

    const val = parseFloat(amount.replace(',', '.'));
    
    try {
      if (type === 'diario' || type === 'saving') {
         await addTransaction({
            description,
            amount: val,
            date,
            type: type === 'saving' ? 'saving' : 'daily'
         });
      }
      else if (type === 'expense' || type === 'income') {
         const now = new Date();
         const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
         
         let payload = {
           description,
           amount: val,
           due_day: parseInt(dueDay),
           is_active: true
         };

         if (recurrence === 'fixa') {
           payload.start_month = monthStr;
           payload.end_month = null;
         } else if (recurrence === 'parcelada') {
           payload.start_month = monthStr;
           const d = new Date(now.getFullYear(), now.getMonth() + parseInt(installments) - 1, 1);
           payload.end_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
         } else {
           // Única = fixed expense que começa e termina no mesmo mês
           payload.start_month = monthStr;
           payload.end_month = monthStr;
         }

         if (type === 'expense') await addFixedExpense(payload);
         else await addIncomeEntry(payload);
      }
      else if (type === 'card') {
         if (cards.length === 0) {
           alert('Você não possui cartões cadastrados. Vá em Config → Cartões.');
           return;
         }
         const selCard = cards.find(c => c.id === cardId);
         const cName = selCard ? selCard.name : 'Cartão';
         
         if (recurrence === 'unica') {
            // Lançamento pontual: vai pro diário para aparecer no dia da compra e somar na fatura dinamicamente
            await addTransaction({
              description: `${description} (${cName})`,
              amount: val,
              date,
              type: 'card', // IMPORTANTE: tipo card fará o engine somá-lo na fatura dinamicamente
              card_id: cardId
            });
         } else {
            // Lançamento recorrente/parcelado: vai para a tabela de faturas fixas/parceladas
            const purchaseDate = new Date(date + 'T12:00:00');
            const startMonthStr = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;
            
            let payload = {
              card_name: cName,
              card_id: cardId,
              description,
              amount: val,
              due_day: selCard ? selCard.due_day : parseInt(dueDay),
              is_active: true,
              start_month: startMonthStr,
            };
            
            if (recurrence === 'parcelada') {
              const d = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + parseInt(installments) - 1, 1);
              payload.end_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
              payload.end_month = null;
            }
            
            await addCardBill(payload);
         }
      }
      
      onClose();
    } catch(err) {
      console.error(err);
      alert('Erro ao salvar. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  }

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
            <select value={type} onChange={e => setType(e.target.value)} disabled={!!editData}>
              <option value="diario">Gasto no Dia-a-Dia</option>
              <option value="saving">Economia (Retirada)</option>
              <option value="card">Gasto no Cartão de Crédito</option>
              <option value="expense">Saída Fixa (Mês a Mês)</option>
              <option value="income">Entrada (Dinheiro novo)</option>
            </select>
          </div>

          <div className={styles.valueGroup}>
             <span className={styles.currency}>R$</span>
             <input type="number" step="0.01" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>

          <div className={styles.formGroup}>
            <label>Descrição</label>
            <input type="text" required value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Mercado, Uber, Salário..." />
          </div>

          {(type === 'diario' || type === 'saving' || type === 'card') && (
            <div className={styles.formGroup}>
              <label>{type === 'card' ? 'Data da Compra' : 'Data'}</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}

          {type === 'card' && (
            <div className={styles.formGroup}>
              <label>Cartão</label>
              <select value={cardId} onChange={e => setCardId(e.target.value)} required>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {(type === 'expense' || type === 'income') && (
            <div className={styles.formGroup}>
              <label>Dia do Vencimento</label>
              <input type="number" min="1" max="31" required value={dueDay} onChange={e => setDueDay(e.target.value)} />
            </div>
          )}

          {type === 'card' && (
            <div className={styles.formGroup}>
              <label>Repetição</label>
              <select value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                <option value="unica">Compra Única (só neste mês)</option>
                <option value="parcelada">Parcelada (termina)</option>
                <option value="fixa">Assinatura Mensal (sem fim)</option>
              </select>
            </div>
          )}

          {(type === 'expense' || type === 'income') && (
            <div className={styles.formGroup}>
              <label>Repetição</label>
              <select value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                <option value="unica">Única (só este mês)</option>
                <option value="fixa">Recorrente (sem fim)</option>
                <option value="parcelada">Parcelada (termina)</option>
              </select>
            </div>
          )}

          {recurrence === 'parcelada' && (
            <div className={styles.formGroup}>
              <label>Quantidade de Parcelas</label>
              <input type="number" min="2" max="120" required value={installments} onChange={e => setInstallments(e.target.value)} />
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>
    </div>
  );
}
