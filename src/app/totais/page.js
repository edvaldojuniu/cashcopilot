'use client';

import { useMemo, useState } from 'react';
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

  const [activeTab, setActiveTab] = useState('todos');

  const { summary, initialBalance } = useMemo(() => {
    if (!isAuthenticated) return { summary: {}, initialBalance: 0 };
    return getMonthForecast(viewYear, viewMonth);
  }, [isAuthenticated, viewYear, viewMonth, getMonthForecast]);

  const cards = [
    {
      label: 'Performance do Período',
      value: summary.performance || 0,
      icon: summary.performance >= 0 ? '🚀' : '⚠️',
      color: (summary.performance || 0) >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
      highlight: true,
      showSign: true,
    },
    {
      label: 'Total Economizado (Guardado)',
      value: summary.totalSavings || 0,
      icon: '🛡️',
      color: 'var(--color-income)',
      subtitle: summary.totalIncome > 0 ? `(${((summary.totalSavings / summary.totalIncome) * 100).toFixed(0)}% das Entradas)` : '(0%)'
    },
    {
      label: 'Custo de Vida (Mês)',
      value: summary.custoDeVida || 0,
      icon: '📉',
      color: 'var(--color-expense)',
      negative: true,
    },
    {
      label: 'Diário Médio',
      value: summary.averages?.daily || 0,
      icon: '📊',
      color: 'var(--color-daily)',
      negative: true,
    },
    {
      label: 'Cartão Médio',
      value: summary.averages?.card || 0,
      icon: '💳',
      color: 'var(--color-card)',
      negative: true,
    },
    {
      label: 'Diário + Cartão Médio',
      value: summary.averages?.dailyCard || 0,
      icon: '🛒',
      color: 'var(--color-expense)',
      negative: true,
    },
    {
      label: 'Custo de Vida Médio / Dia',
      value: summary.averages?.dailyCardFixed || 0,
      icon: '📅',
      color: 'var(--color-expense)',
      negative: true,
    },
  ];

  const logFilters = [
    { key: 'todos', label: 'Todas' },
    { key: 'income', label: 'Entradas' },
    { key: 'fixed', label: 'Saídas' },
    { key: 'daily', label: 'Diários' },
    { key: 'saving', label: 'Economias' },
    { key: 'card', label: 'Gastos com cartão' },
  ];

  const logs = summary.logs || [];
  const filteredLogs = activeTab === 'todos' ? logs : logs.filter(l => l.group === activeTab);
  
  // Sort from oldest to newest by date string 
  // Then reverse to show newest first? User didn't specify. Let's do newest first.
  filteredLogs.sort((a,b) => b.logDate.localeCompare(a.logDate));

  const getLogColor = (group) => {
    switch(group) {
      case 'income': return 'var(--color-income)';
      case 'fixed': return 'var(--color-expense)';
      case 'daily': return 'var(--color-daily)';
      case 'saving': return 'var(--color-income)';
      case 'card': return 'var(--color-card)';
      default: return 'var(--text-primary)';
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Hub de Controle</h1>
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
            <div>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>{card.icon}</span>
                <span className={styles.cardLabel}>{card.label}</span>
              </div>
              {card.subtitle && <div className={styles.cardSubtitle}>{card.subtitle}</div>}
            </div>
            <span className={styles.cardValue} style={{ color: card.color }}>
              {card.showSign && card.value > 0 ? '+' : ''}
              {card.negative && card.value > 0 ? '-' : ''}
              {formatCurrency(Math.abs(card.value))}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.logsSection}>
        <h2 className={styles.logsTitle}>Movimentações no Período</h2>
        <div className={styles.tabsWrapper}>
          <div className={styles.tabsScroll}>
            {logFilters.map(lf => (
              <button 
                key={lf.key} 
                className={`${styles.tabBtn} ${activeTab === lf.key ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(lf.key)}
              >
                {lf.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.logsContainer}>
          {filteredLogs.length === 0 ? (
            <div className={styles.emptyLogs}>Nenhuma movimentação neste filtro.</div>
          ) : (
            filteredLogs.map((log, idx) => {
               const dParts = log.logDate.split('-');
               const niceDate = `${dParts[2]}/${dParts[1]}`;
               
               return (
                 <div key={idx} className={styles.logItem} style={{ borderLeftColor: getLogColor(log.group) }}>
                   <div className={styles.logDate}>{niceDate}</div>
                   <div className={styles.logMain}>
                     <div className={styles.logDesc}>{log.description}</div>
                     <div className={styles.logTypeTag}>{
                        logFilters.find(f => f.key === log.group)?.label
                     }</div>
                   </div>
                   <div className={styles.logAmount} style={{ color: getLogColor(log.group) }}>
                     {log.group !== 'income' && log.group !== 'saving' ? '-' : ''}
                     {formatCurrency(Number(log.amount))}
                   </div>
                 </div>
               )
            })
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
