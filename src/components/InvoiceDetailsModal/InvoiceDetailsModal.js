'use client';

import { useState } from 'react';
import styles from './InvoiceDetailsModal.module.css';
import { formatCurrency } from '@/lib/utils';
import { useFinance } from '@/contexts/FinanceContext';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { buildRecurrencePayload } from '@/lib/recurrence';

export default function InvoiceDetailsModal({ isOpen, onClose, invoice }) {
  const [payDate, setPayDate] = useState('');
  const { addMovement, setCardClosing } = useFinance();
  const [saving, setSaving] = useState(false);
  const [isEditingClosing, setIsEditingClosing] = useState(false);
  const [newClosingDate, setNewClosingDate] = useState('');
  const [adjustingClosing, setAdjustingClosing] = useState(false);

  useBackButtonClose(isOpen, onClose);

  if (!isOpen || !invoice) return null;

  const { description, originalTotal, alreadyPaid, amount, items, card_id, mes_referencia, data_fechamento } = invoice;
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const closingDateObj = data_fechamento ? new Date(`${data_fechamento}T12:00:00`) : null;

  const handleStartEditClosing = () => {
    setNewClosingDate(data_fechamento || '');
    setIsEditingClosing(true);
  };

  const handleAdjustClosing = async () => {
    if (!newClosingDate) return;
    setAdjustingClosing(true);
    const { error } = await setCardClosing(card_id, mes_referencia, newClosingDate);
    setAdjustingClosing(false);
    if (error) {
      alert('Erro ao corrigir o fechamento: ' + error.message);
    } else {
      // O conteúdo desta fatura pode ter mudado (lançamentos podem ter
      // migrado pra fatura anterior/seguinte) — fecha pro usuário conferir
      // a tela atualizada em vez de mostrar um snapshot desatualizado.
      onClose();
    }
  };

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
    const { error } = await addMovement({
      tipo: 'invoice_payment',
      descricao: `Pagamento ${description}`,
      valor: amount,
      cartao_id: card_id,
      fatura_ano_mes: mes_referencia,
      ativo: true,
      ...buildRecurrencePayload({ frequency: 'none', date: payDate }),
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
              // Compra avulsa salva o nome do cartão embutido na descrição
              // (útil em listas genéricas, tipo o detalhamento do dia) — aqui
              // dentro da própria fatura isso é redundante, o título já diz
              // qual cartão é. Só compra avulsa tem esse sufixo (item.type
              // === 'card'); parcela/assinatura recorrente (card_installment)
              // já tem seu próprio sufixo "(N/M)"/"(assinatura)", não mexe.
              const displayDesc = item.type === 'card'
                ? item.description.replace(/ \([^)]*\)$/, '')
                : item.description;
              return (
                <div key={i} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemDesc}>{displayDesc}</span>
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
            <p>Se você pagou esta fatura antes do dia do fechamento, escolha a data em que o dinheiro saiu da conta abaixo para o sistema descontar corretamente.</p>
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

        {closingDateObj && (
          <div className={styles.paymentSection}>
            <div className={styles.closingRow}>
              <h4>
                Fechamento: {closingDateObj.getDate()} de {monthNames[closingDateObj.getMonth()]}
              </h4>
              {!isEditingClosing && (
                <button type="button" className={styles.editClosingBtn} onClick={handleStartEditClosing}>
                  Corrigir data
                </button>
              )}
            </div>
            {isEditingClosing && (
              <>
                <p>O fechamento real do cartão nem sempre cai no mesmo dia todo mês. Ajuste aqui pra este mês — as compras que ficaram do lado errado da nova data são movidas automaticamente pra fatura certa.</p>
                <div className={styles.inputGroup}>
                  <input
                    type="date"
                    value={newClosingDate}
                    onChange={(e) => setNewClosingDate(e.target.value)}
                    className={styles.dateInput}
                  />
                  <button
                    className={styles.payBtn}
                    onClick={handleAdjustClosing}
                    disabled={adjustingClosing || !newClosingDate}
                  >
                    {adjustingClosing ? '...' : 'Salvar'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
