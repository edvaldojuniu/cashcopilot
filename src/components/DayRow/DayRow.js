'use client';

import styles from './DayRow.module.css';
import { formatCurrency, getBalanceRowBg } from '@/lib/utils';

export default function DayRow({ data, maxBalance, filter, onToggleVerify }) {
  const { day, isPast, isToday, isFuture, isVerified, totalIncome, totalExpense, totalCard, totalFixed, dailyAmount, totalSavings = 0, balance, totalDailyCard = 0 } = data;

  const displayItems = [];
  const fullCardAmount = totalCard + totalDailyCard;

  switch (filter) {
    case 'saldos':
      displayItems.push({ value: balance, icon: null, class: '' });
      break;
    case 'entradas':
      displayItems.push({ value: totalIncome, icon: <span className={`${styles.typeIcon} ${styles.income}`}>E</span>, class: styles.income });
      break;
    case 'saidas':
      displayItems.push({ value: totalFixed, icon: <span className={`${styles.typeIcon} ${styles.expense}`}>S</span>, class: styles.expense });
      break;
    case 'diarios':
      displayItems.push({ value: dailyAmount, icon: <span className={`${styles.typeIcon} ${styles.daily}`}>D</span>, class: styles.daily });
      break;
    case 'economias':
      displayItems.push({ value: totalSavings, icon: <span className={`${styles.typeIcon} ${styles.income}`}>Ec</span>, class: styles.income });
      break;
    case 'cartoes':
      if (fullCardAmount > 0 || displayItems.length === 0) displayItems.push({ value: fullCardAmount, icon: <span className={`${styles.typeIcon} ${styles.card}`}>C</span>, class: styles.card });
      break;
    case 'diarios_cartoes':
      displayItems.push({ value: dailyAmount + fullCardAmount, icon: <span className={`${styles.typeIcon} ${styles.card}`}>D+C</span>, class: styles.card });
      break;
    case 'despesas_totais':
      displayItems.push({ value: dailyAmount + fullCardAmount + totalFixed, icon: <span className={`${styles.typeIcon} ${styles.expense}`}>DC+S</span>, class: styles.expense });
      break;
    case 'todas':
    default:
      if (totalIncome > 0) displayItems.push({ value: totalIncome, icon: <span className={`${styles.typeIcon} ${styles.income}`}>E</span>, class: styles.income });
      if (totalFixed > 0) displayItems.push({ value: totalFixed, icon: <span className={`${styles.typeIcon} ${styles.expense}`}>S</span>, class: styles.expense });
      if (fullCardAmount > 0) displayItems.push({ value: fullCardAmount, icon: <span className={`${styles.typeIcon} ${styles.card}`}>C</span>, class: styles.card });
      if (totalSavings > 0) displayItems.push({ value: totalSavings, icon: <span className={`${styles.typeIcon} ${styles.income}`}>Ec</span>, class: styles.income });
      
      if (dailyAmount !== 0 || displayItems.length === 0) displayItems.push({ value: dailyAmount, icon: <span className={`${styles.typeIcon} ${styles.daily}`}>D</span>, class: styles.daily });
      break;
  }

  const rowBg = getBalanceRowBg(balance, maxBalance);

  const rowClasses = [
    styles.row,
    isToday ? styles.today : '',
    isPast ? styles.past : '',
    isFuture ? styles.future : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={rowClasses}
        style={{ '--row-bg': rowBg }}
        id={`day-row-${day}`}
      >
        {/* Day number with manual toggle */}
        <div 
          className={styles.dayCell} 
          onClick={onToggleVerify ? onToggleVerify : undefined}
          style={{ cursor: onToggleVerify ? 'pointer' : 'default' }}
        >
          <span className={styles.dayNumber}>{day}</span>
          {isVerified && (
            <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-income)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        {/* Type + Value */}
        <div className={styles.typeCell}>
          <div className={styles.typeCellContainer}>
            {displayItems.map((item, idx) => (
              <div key={idx} className={styles.typeCellItem}>
                {item.icon}
                <span className={`${styles.value} ${item.value === 0 ? styles.zero : ''} ${isFuture && !isToday ? styles.forecast : ''} ${item.class}`}>
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Balance */}
        <div className={styles.balanceCell}>
          <span
            className={`${styles.balance} ${balance < 0 ? styles.negative : ''}`}
            style={{ color: balance < 0 ? 'var(--color-expense)' : undefined }}
          >
            {formatCurrency(balance)}
          </span>
        </div>
      </div>

      {/* Invoice Sub-lines */}
      {data.expenses && data.expenses.filter(e => e.type === 'card').map((invoice, idx) => (
        <div 
          key={`invoice-${day}-${idx}`} 
          className={styles.invoiceRow}
          onClick={(e) => {
            e.stopPropagation();
            if (data.onOpenInvoiceDetails) {
              data.onOpenInvoiceDetails(invoice);
            }
          }}
        >
          <div className={styles.invoiceInfo}>
            <span className={styles.invoiceIcon}>💳</span>
            <span className={styles.invoiceName}>{invoice.description}</span>
          </div>
          <div className={styles.invoiceAmounts}>
            {invoice.amount === 0 ? (
              <span className={styles.invoicePaid}>Paga</span>
            ) : (
              <span className={styles.invoiceValue}>{formatCurrency(invoice.amount)}</span>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      ))}
    </>
  );
}
