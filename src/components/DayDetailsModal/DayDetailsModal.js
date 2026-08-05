'use client';

import styles from './DayDetailsModal.module.css';
import { formatCurrency } from '@/lib/utils';
import { useFinance } from '@/contexts/FinanceContext';
import QuickAddModal from '../QuickAddModal/QuickAddModal';
import { useState } from 'react';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';

export default function DayDetailsModal({ isOpen, onClose, dayData, initialType = 'diario', sectionFilter = null }) {
  const { cards } = useFinance();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  useBackButtonClose(isOpen, onClose);

  if (!isOpen || !dayData) return null;

  // Abre um lançamento já existente para edição/exclusão no QuickAddModal.
  // forcedType remapeia o "type" salvo no banco (ex: 'daily') para o valor
  // esperado pelo <select> do formulário (ex: 'diario').
  function openEdit(item, forcedType) {
    setEditingItem({ ...item, type: forcedType || item.type });
  }

  // Nome do cartão sempre buscado fresco por cartao_id, nunca mexendo na
  // descrição em si — ela já pode carregar o sufixo "(N/M)"/"(assinatura)"
  // vindo do engine.js pra parcela/assinatura recorrente, e tentar
  // strip+reanexar o nome do cartão ali confundiria os dois sufixos. Mostra
  // o cartão junto do tipo (ex: "Assinatura/Recorrente · Nubank") em vez
  // disso — funciona igual pra avulsa e recorrente, sem string parsing.
  function cardName(txn) {
    return cards.find((c) => c.id === txn.cartao_id)?.nome;
  }

  const { dateStr, day, incomes, expenses, transactions, recurringDaily = [], recurringSavings = [] } = dayData;

  // Separate components for easier rendering
  const fixedExpenses = expenses.filter(e => e.type !== 'card');
  const cardExpenses = expenses.filter(e => e.type === 'card'); // fatura/parcela (lump sum, só no dia de fechamento)
  const cardTxns = transactions.filter(t => t.type === 'card'); // compras avulsas no cartão neste dia
  const dailyTxns = transactions.filter(t => t.type === 'daily');
  const savingTxns = transactions.filter(t => t.type === 'saving');
  const invoicePayments = transactions.filter(t => t.type === 'invoice_payment');

  // Clicar numa coluna específica da tabela densa (desktop) abre só a seção
  // daquele tipo — sectionFilter null (clique genérico no dia) mostra tudo,
  // igual sempre foi.
  const groupVisible = (type) => !sectionFilter || sectionFilter === type;

  const isEmpty =
    (!groupVisible('income') || incomes.length === 0)
    && (!groupVisible('expense') || fixedExpenses.length === 0)
    && (!groupVisible('card') || (cardExpenses.length === 0 && invoicePayments.length === 0 && cardTxns.length === 0))
    && (!groupVisible('diario') || (dailyTxns.length === 0 && recurringDaily.length === 0))
    && (!groupVisible('saving') || (savingTxns.length === 0 && recurringSavings.length === 0));

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
                {groupVisible('income') && incomes.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Entradas</div>
                    <div className={styles.itemList}>
                      {incomes.map((inc, i) => (
                        <div
                          key={`inc-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit(inc)}
                        >
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

                {groupVisible('saving') && savingTxns.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Economias (Investimentos)</div>
                    <div className={styles.itemList}>
                      {savingTxns.map((sav, i) => (
                        <div
                          key={`sav-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit(sav)}
                        >
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

                {groupVisible('expense') && fixedExpenses.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Saídas Fixas</div>
                    <div className={styles.itemList}>
                      {fixedExpenses.map((exp, i) => (
                        <div
                          key={`exp-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit(exp)}
                        >
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

                {groupVisible('card') && cardExpenses.length > 0 && (
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

                {groupVisible('card') && invoicePayments.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Pagamento de Fatura</div>
                    <div className={styles.itemList}>
                      {invoicePayments.map((pay, i) => (
                        <div key={`pay-${i}`} className={styles.item}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{pay.description}</span>
                            <span className={styles.itemType}>Saiu da conta</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountCard}`}>
                            {formatCurrency(pay.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {groupVisible('card') && cardTxns.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Compras no Cartão (Neste dia)</div>
                    <div className={styles.itemList}>
                      {cardTxns.map((txn, i) => {
                        const typeLabel = txn.frequencia === 'none' ? 'Compra Avulsa' : 'Assinatura/Recorrente';
                        const card = cardName(txn);
                        return (
                        <div
                          key={`crd-txn-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit(txn)}
                        >
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{txn.description}</span>
                            <span className={styles.itemType}>{card ? `${typeLabel} · ${card}` : typeLabel}</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountCard}`}>
                            {formatCurrency(txn.amount)}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {groupVisible('diario') && dailyTxns.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Gastos Diários (Dinheiro/Débito)</div>
                    <div className={styles.itemList}>
                      {dailyTxns.map((txn, i) => (
                        <div
                          key={`txn-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit(txn, 'diario')}
                        >
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
                {groupVisible('diario') && recurringDaily.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Gastos Diários Recorrentes</div>
                    <div className={styles.itemList}>
                      {recurringDaily.map((item, i) => (
                        <div
                          key={`rec-daily-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit({ ...item, isTemplate: true }, 'diario')}
                        >
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{item.description}</span>
                            <span className={styles.itemType}>Recorrente</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountDaily}`}>
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {groupVisible('saving') && recurringSavings.length > 0 && (
                  <div className={styles.group}>
                    <div className={styles.groupTitle}>Economias Recorrentes</div>
                    <div className={styles.itemList}>
                      {recurringSavings.map((item, i) => (
                        <div
                          key={`rec-saving-${i}`}
                          className={`${styles.item} ${styles.itemClickable}`}
                          onClick={() => openEdit({ ...item, isTemplate: true }, 'saving')}
                        >
                          <div className={styles.itemInfo}>
                            <span className={styles.itemDesc}>{item.description}</span>
                            <span className={styles.itemType}>Recorrente</span>
                          </div>
                          <span className={`${styles.itemAmount} ${styles.amountIncome}`}>
                            {formatCurrency(item.amount)}
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
        initialType={initialType}
      />

      <QuickAddModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        editData={editingItem}
      />
    </>
  );
}
