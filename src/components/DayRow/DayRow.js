'use client';

import styles from './DayRow.module.css';
import { formatCurrency, getBalanceRowBg } from '@/lib/utils';

export default function DayRow({ data, maxBalance, filter, onToggleVerify }) {
  const { day, isPast, isToday, isFuture, isVerified, totalIncome, totalExpense, totalCard, totalFixed, dailyAmount, totalSavings = 0, balance } = data;

  const displayItems = [];

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
      displayItems.push({ value: totalCard, icon: <span className={`${styles.typeIcon} ${styles.card}`}>C</span>, class: styles.card });
      break;
    case 'diarios_cartoes':
      displayItems.push({ value: dailyAmount + totalCard, icon: <span className={`${styles.typeIcon} ${styles.card}`}>D+C</span>, class: styles.card });
      break;
    case 'despesas_totais':
      displayItems.push({ value: dailyAmount + totalCard + totalFixed, icon: <span className={`${styles.typeIcon} ${styles.expense}`}>DC+S</span>, class: styles.expense });
      break;
    case 'todas':
    default:
      if (totalIncome > 0) displayItems.push({ value: totalIncome, icon: <span className={`${styles.typeIcon} ${styles.income}`}>E</span>, class: styles.income });
      if (totalFixed > 0) displayItems.push({ value: totalFixed, icon: <span className={`${styles.typeIcon} ${styles.expense}`}>S</span>, class: styles.expense });
      if (totalCard > 0) displayItems.push({ value: totalCard, icon: <span className={`${styles.typeIcon} ${styles.card}`}>C</span>, class: styles.card });
      if (totalSavings > 0) displayItems.push({ value: totalSavings, icon: <span className={`${styles.typeIcon} ${styles.income}`}>Ec</span>, class: styles.income });
      
      // Mostrar diário sempre se houver valor, ou se nada mais foi puxado nesta linha pro dia não ficar vazio
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
  );
}
