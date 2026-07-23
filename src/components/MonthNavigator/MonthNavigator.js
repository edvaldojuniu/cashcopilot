'use client';

import styles from './MonthNavigator.module.css';
import { getMonthAbbr } from '@/lib/utils';

export default function MonthNavigator({ month, year, onPrev, onNext, onToday, label }) {
  const monthStr = getMonthAbbr(month);
  const yearStr = String(year).slice(2); // "26"
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  return (
    <div className={styles.container} id="month-navigator">
      {/* Novo botão "Hoje" com design de mini-calendário */}
      <button className={styles.todayBtn} onClick={onToday} title="Ir para o mês atual" id="btn-today">
        <div className={styles.calendarIcon}>
          <div className={styles.calendarTop}>Hoje</div>
          <div className={styles.calendarBody}>{today.getDate()}</div>
        </div>
      </button>

      <div className={styles.nav}>
        <button className={styles.arrow} onClick={onPrev} id="btn-prev-month" aria-label="Mês anterior">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className={styles.monthLabel}>
          {label || `${monthStr}/${yearStr}`}
        </span>

        <button className={styles.arrow} onClick={onNext} id="btn-next-month" aria-label="Próximo mês">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
