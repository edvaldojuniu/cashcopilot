'use client';

import styles from './DayDetailsModal.module.css';
import { formatCurrency } from '@/lib/utils';
import { useFinance } from '@/contexts/FinanceContext';
import QuickAddModal from '../QuickAddModal/QuickAddModal';
import { useState } from 'react';

export default function DayDetailsModal({ isOpen, onClose, dayData }) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  if (!isOpen || !dayData) return null;

  const { dateStr, day, incomes, expenses, transactions } = dayData;

  // Separate components for easier rendering
  const fixedExpenses = expenses.filter(e => e.type !== 'card');
  const cardExpenses = expenses.filter(e => e.type === 'card');
  const dailyTxns = transactions.filter(t => t.type === 'daily');
  const savingTxns = transactions.filter(t => t.type === 'saving');

  const isEmpty = incomes.length === 0 && fixedExpenses.length === 0 && cardExpenses.length === 0 && dailyTxns.length === 0 && savingTxns.length === 0;

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const dateObj = new Date(dateStr + "T12:00:00");
  const formattedDate = `${day} de ${monthNames[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

  return (
    <>
      <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={styles.modal}>
          
          <div className={styles.header}>
            <div className={styles.titleArea}>
              <h3>Detalhes do Dia</h3>
              <div className={styles.dateDisplay}>{formattedDate}</div>
            </div>
            <button className={styles.closeBtn} onClick={onClose}>×</button>
          </div>

          <div className={styles.content}>
            {isEmpty ? (
              <div className={styles.emptyState}>
                Nenhuma movimentação neste dia.
              </div>
            ) : (
              <>
                {incomes.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Entradas</div>
                    <div className={styles.itemList}>
                      {incomes.map((inc, i) => (
                        <div key={`inc-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{inc.description}</span>
                            <span className={styles.itemType}>Receita</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountIncome}`}>
                            {formatCurrency(inc.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {savingTxns.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Economias (Investimentos)</div>
                    <div className={styles.itemList}>
                      {savingTxns.map((sav, i) => (
                        <div key={`sav-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{sav.description}</span>
                            <span className={styles.itemType}>Retirada Voluntária</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountIncome}`}>
                            {formatCurrency(sav.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fixedExpenses.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Saídas Fixas</div>
                    <div className={styles.itemList}>
                      {fixedExpenses.map((exp, i) => (
                        <div key={`exp-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{exp.description}</span>
                            <span className={styles.itemType}>Fixa</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountExpense}`}>
                            {formatCurrency(exp.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {cardExpenses.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Fechamento de Faturas (Cartão)</div>
                    <div className={styles.itemList}>
                      {cardExpenses.map((exp, i) => (
                        <div key={`crd-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{exp.description}</span>
                            <span className={styles.itemType}>Fatura / Parcela</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountCard}`}>
                            {formatCurrency(exp.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {transactions.filter(t => t.type === 'card').length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Compras no Cartão (Neste dia)</div>
                    <div className={styles.itemList}>
                      {transactions.filter(t => t.type === 'card').map((txn, i) => (
                        <div key={`crd-txn-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{txn.description}</span>
                            <span className={styles.itemType}>Compra Avulsa</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountCard}`}>
                            {formatCurrency(txn.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dailyTxns.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Gastos Diários (Dinheiro/Débito)</div>
                    <div className={styles.itemList}>
                      {dailyTxns.map((txn, i) => (
                        <div key={`txn-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{txn.description}</span>
                            <span className={styles.itemType}>Avulso</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountDaily}`}>
                            {formatCurrency(txn.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.footer}>
            <button className={styles.addBtn} onClick={() => setIsQuickAddOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Adicionar neste dia
            </button>
          </div>

        </div>
      </div>

      <QuickAddModal 
        isOpen={isQuickAddOpen} 
        onClose={() => setIsQuickAddOpen(false)} 
        defaultDate={dateStr}
      />
    </>
  );
}
