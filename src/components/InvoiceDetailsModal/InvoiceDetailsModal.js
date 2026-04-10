'use client';

import { useState } from 'react';
import styles from './InvoiceDetailsModal.module.css';
import { formatCurrency } from '@/lib/utils';
import { useFinance } from '@/contexts/FinanceContext';

export default function InvoiceDetailsModal({ isOpen, onClose, invoice }) {
  const [payDate, setPayDate] = useState('');
  const { addTransaction } = useFinance();
  const [saving, setSaving] = useState(false);

  if (!isOpen || !invoice) return null;

  const { description, originalTotal, alreadyPaid, amount, items, card_id } = invoice;
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const handlePay = async () => {
    if (!payDate) {
      alert('Selecione uma data para o pagamento.');
      return;
    }
    
    // Validar não pagar mais que o restante
    if (amount <= 0) {
      alert('Esta fatura já está totalmente paga!');
      return;
    }

    setSaving(true);
    const { error } = await addTransaction({
      description: `Pagamento ${description}`,
      amount: amount, 
      date: payDate,
      type: 'invoice_payment',
      card_id: card_id
    });
    
    setSaving(false);
    if (error) {
      alert('Erro ao registrar pagamento: ' + error.message);
    } else {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h3>{description}</h3>
            <div className={styles.subText}>Detalhes da Fatura</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span>Total Fatura</span>
            <strong>{formatCurrency(originalTotal)}</strong>
          </div>
          {alreadyPaid > 0 && (
            <div className={`${styles.summaryItem} ${styles.paidTotal}`}>
              <span>Já Pago</span>
              <strong>- {formatCurrency(alreadyPaid)}</strong>
            </div>
          )}
          <div className={`${styles.summaryItem} ${styles.remainingTotal}`}>
            <span>Restante</span>
            <strong>{formatCurrency(amount)}</strong>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.groupTitle}>Lançamentos ({items ? items.length : 0})</div>
          
          <div className={styles.itemList}>
            {items && items.length > 0 ? items.map((item, i) => {
              const d = new Date(`${item.date}T12:00:00`);
              return (
                <div key={i} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemDesc}>{item.description}</span>
                    <span className={styles.itemDate}>{d.getDate()} de {monthNames[d.getMonth()]}</span>
                  </div>
                  <span className={styles.itemAmount}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              );
            }) : (
              <div className={styles.emptyItems}>Nenhum lançamento encontrado neste ciclo.</div>
            )}
          </div>
        </div>

        {amount > 0 && (
          <div className={styles.paymentSection}>
            <h4>Registrar Pagamento</h4>
            <p>Se você pagou esta fatura antes do dia do vencimento, escolha a data em que o dinheiro saiu da conta abaixo para o sistema descontar corretamente.</p>
            <div className={styles.inputGroup}>
              <input 
                type="date" 
                value={payDate} 
                onChange={(e) => setPayDate(e.target.value)} 
                className={styles.dateInput}
              />
              <button 
                className={styles.payBtn} 
                onClick={handlePay}
                disabled={saving}
              >
                {saving ? '...' : `Pagar ${formatCurrency(amount)}`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
