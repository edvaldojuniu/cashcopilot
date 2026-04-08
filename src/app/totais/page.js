'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import BottomNav from '@/components/BottomNav/BottomNav';
import MonthNavigator from '@/components/MonthNavigator/MonthNavigator';
import { formatCurrency, getMonthName } from '@/lib/utils';
import styles from './page.module.css';

export default function TotaisPage() {
  const { isAuthenticated } = useAuth();
  const {
    viewMonth, viewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    getMonthForecast,
  } = useFinance();

  const { summary, initialBalance } = useMemo(() => {
    if (!isAuthenticated) return { summary: {}, initialBalance: 0 };
    return getMonthForecast(viewYear, viewMonth);
  }, [isAuthenticated, viewYear, viewMonth, getMonthForecast]);

  const cards = [
    {
      label: 'Saldo Inicial',
      value: initialBalance || 0,
      icon: '🏦',
      color: 'var(--accent-primary)',
    },
    {
      label: 'Total Entradas',
      value: summary.totalIncome || 0,
      icon: '📈',
      color: 'var(--color-income)',
    },
    {
      label: 'Total Saídas Fixas',
      value: summary.totalExpense || 0,
      icon: '📉',
      color: 'var(--color-expense)',
      negative: true,
    },
    {
      label: 'Total Diário',
      value: summary.totalDaily || 0,
      icon: '📊',
      color: 'var(--color-daily)',
      negative: true,
    },
    {
      label: 'Saída Total',
      value: summary.totalExpenseAll || 0,
      icon: '💸',
      color: 'var(--color-expense)',
      negative: true,
      highlight: true,
    },
    {
      label: 'Performance',
      value: summary.performance || 0,
      icon: summary.performance >= 0 ? '🚀' : '⚠️',
      color: (summary.performance || 0) >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
      highlight: true,
      showSign: true,
    },
    {
      label: 'Saldo Final',
      value: summary.lastDayBalance || 0,
      icon: '🎯',
      color: (summary.lastDayBalance || 0) >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
      highlight: true,
      showSign: true,
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Totais</h1>
        <p className={styles.subtitle}>{getMonthName(viewMonth)} {viewYear}</p>
      </header>

      <MonthNavigator
        month={viewMonth}
        year={viewYear}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onToday={goToCurrentMonth}
      />

      <div className={styles.cards}>
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`${styles.card} ${card.highlight ? styles.cardHighlight : ''}`}
            style={{
              '--card-color': card.color,
              animationDelay: `${i * 50}ms`,
            }}
          >
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>{card.icon}</span>
              <span className={styles.cardLabel}>{card.label}</span>
            </div>
            <span className={styles.cardValue} style={{ color: card.color }}>
              {card.showSign && card.value > 0 ? '+' : ''}
              {card.negative ? '-' : ''}
              {formatCurrency(Math.abs(card.value))}
            </span>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
