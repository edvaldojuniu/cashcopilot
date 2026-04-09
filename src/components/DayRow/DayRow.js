'use client';

import styles from './DayRow.module.css';
import { formatCurrency, getBalanceRowBg } from '@/lib/utils';

export default function DayRow({ data, maxBalance, filter, onToggleVerify }) {
  const { day, isPast, isToday, isFuture, isVerified, totalIncome, totalExpense, totalCard, totalFixed, dailyAmount, balance } = data;

  // Determine what to show based on filter
  let displayValue = null;
  let displayType = '';
  let typeIcon = null;

  switch (filter) {
    case 'saldos':
      displayValue = balance;
      break;
    case 'diarios':
      displayValue = dailyAmount;
      displayType = 'daily';
      typeIcon = <span className={`${styles.typeIcon} ${styles.daily}`}>D</span>;
      break;
    case 'diarios_cartoes':
      displayValue = dailyAmount + totalCard;
      displayType = 'card';
      typeIcon = <span className={`${styles.typeIcon} ${styles.card}`}>V</span>; // V de Variáveis
      break;
    case 'gastos_reais': // Diários + Cartões + Saídas
      displayValue = dailyAmount + totalExpense; // totalExpense já tem Cartões e Fixas!
      displayType = 'expense';
      typeIcon = <span className={`${styles.typeIcon} ${styles.expense}`}>S</span>;
      break;
    case 'entradas':
      displayValue = totalIncome;
      displayType = 'income';
      typeIcon = totalIncome > 0 ? <span className={`${styles.typeIcon} ${styles.income}`}>E</span> : null;
      break;
    case 'saidas':
      displayValue = totalFixed; // Mostra apenas as fixas (sem cartões, pois cartão já tem filtro)
      displayType = 'expense';
      typeIcon = totalFixed > 0 ? <span className={`${styles.typeIcon} ${styles.expense}`}>F</span> : null;
      break;
    case 'todos':
    default:
      if (totalIncome > 0) {
        displayValue = totalIncome;
        displayType = 'income';
        typeIcon = <span className={`${styles.typeIcon} ${styles.income}`}>E</span>;
      } else if (totalExpense > 0) {
        displayValue = totalExpense;
        displayType = 'expense';
        typeIcon = <span className={`${styles.typeIcon} ${styles.expense}`}>S</span>;
      } else {
        displayValue = dailyAmount;
        displayType = 'daily';
        typeIcon = <span className={`${styles.typeIcon} ${styles.daily}`}>D</span>;
      }
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
        {typeIcon}
        <span className={`${styles.value} ${displayValue === 0 ? styles.zero : ''} ${isFuture && !isToday ? styles.forecast : ''}`}>
          {formatCurrency(displayValue)}
        </span>
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
  );
}
