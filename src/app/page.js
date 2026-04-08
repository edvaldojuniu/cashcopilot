'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import AuthScreen from '@/components/AuthScreen/AuthScreen';
import BottomNav from '@/components/BottomNav/BottomNav';
import MonthNavigator from '@/components/MonthNavigator/MonthNavigator';
import FilterSelector from '@/components/FilterSelector/FilterSelector';
import DayRow from '@/components/DayRow/DayRow';
import styles from './page.module.css';

export default function HomePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    viewMonth, viewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    getMonthForecast, loading: financeLoading,
  } = useFinance();

  const [filter, setFilter] = useState('diarios');
  const todayRef = useRef(null);

  // Calculate forecast
  const { forecast, summary } = useMemo(() => {
    if (!isAuthenticated) return { forecast: [], summary: {} };
    return getMonthForecast(viewYear, viewMonth);
  }, [isAuthenticated, viewYear, viewMonth, getMonthForecast]);

  // Get max balance for color calculations
  const maxBalance = useMemo(() => {
    return Math.max(...forecast.map((d) => d.balance), 1);
  }, [forecast]);

  // Scroll to today
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [viewMonth, viewYear, forecast]);

  // Loading state
  if (authLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingLogo}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Auth screen
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className={styles.page}>
      <MonthNavigator
        month={viewMonth}
        year={viewYear}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onToday={goToCurrentMonth}
      />

      <FilterSelector value={filter} onChange={setFilter} />

      <div className={styles.dayList} id="day-list">
        {financeLoading ? (
          <div className={styles.loadingDays}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : forecast.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Configure suas finanças</h3>
            <p>Vá em <strong>Config</strong> para adicionar entradas, saídas e gastos.</p>
          </div>
        ) : (
          forecast.map((dayData) => (
            <div key={dayData.day} ref={dayData.isToday ? todayRef : null}>
              <DayRow
                data={dayData}
                maxBalance={maxBalance}
                filter={filter}
              />
            </div>
          ))
        )}
      </div>

      {/* Summary bar */}
      {forecast.length > 0 && (
        <div className={styles.summaryBar} id="summary-bar">
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Performance</span>
            <span
              className={styles.summaryValue}
              style={{ color: summary.performance >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}
            >
              {summary.performance >= 0 ? '+' : ''}
              {Number(summary.performance || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
