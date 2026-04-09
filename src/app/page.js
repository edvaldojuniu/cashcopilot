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
    getMonthForecast, getMultiMonthForecast, loading: financeLoading, toggleVerifiedDay
  } = useFinance();

  const [filter, setFilter] = useState('diarios');
  const todayRef = useRef(null);

  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxMonths = windowWidth >= 1024 ? 4 : 1;

  // Calculate forecast
  const { monthsData, summary } = useMemo(() => {
    if (!isAuthenticated || maxMonths === 0) return { monthsData: [], summary: {} };
    if (maxMonths > 1) {
      const ms = getMultiMonthForecast(viewYear, viewMonth, maxMonths);
      return { monthsData: ms, summary: ms[0]?.summary || {} };
    } else {
      const mo = getMonthForecast(viewYear, viewMonth);
      return { monthsData: [{ ...mo, year: viewYear, month: viewMonth }], summary: mo.summary };
    }
  }, [isAuthenticated, viewYear, viewMonth, maxMonths, getMonthForecast, getMultiMonthForecast]);

  // Get max balance for color calculations
  const maxBalance = useMemo(() => {
    if (!monthsData.length) return 1;
    let max = 1;
    monthsData.forEach(m => {
      m.forecast.forEach(d => {
        if (d.balance > max) max = d.balance;
      });
    });
    return max;
  }, [monthsData]);

  // Scroll to today
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [viewMonth, viewYear, monthsData]);

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

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
        ) : monthsData.length === 0 || monthsData[0].forecast.length === 0 ? (
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
          <div className={styles.monthColumns}>
            {monthsData.map((mData, index) => (
              <div key={`${mData.year}-${mData.month}`} className={styles.monthColumn}>
                {maxMonths > 1 && (
                  <div className={styles.monthHeader}>
                    {monthNames[mData.month]} {mData.year}
                  </div>
                )}
                {mData.forecast.map((dayData) => (
                  <div key={dayData.dateStr || dayData.day} ref={dayData.isToday && index === 0 ? todayRef : null}>
                    <DayRow
                      data={dayData}
                      maxBalance={maxBalance}
                      filter={filter}
                      onToggleVerify={() => toggleVerifiedDay(dayData.dateStr)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
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
