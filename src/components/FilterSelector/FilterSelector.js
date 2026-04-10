'use client';

import styles from './FilterSelector.module.css';
import { formatCurrency } from '@/lib/utils';

const FILTERS = [
  { key: 'entradas', label: 'Entradas', color: 'var(--color-income)' },
  { key: 'saidas', label: 'Saídas', color: 'var(--color-expense)' },
  { key: 'diarios', label: 'Diários', color: 'var(--color-daily)' },
  { key: 'economias', label: 'Economias', color: 'var(--color-income)' },
  { key: 'cartoes', label: 'Cartão', color: 'var(--color-card)' },
  { key: 'diarios_cartoes', label: 'Diário+Cartão', color: 'var(--color-card)' },
  { key: 'despesas_totais', label: 'D+C+Saídas', color: 'var(--color-expense)' },
  { key: 'todas', label: 'Todas', color: 'var(--accent-primary)' },
];

export default function FilterSelector({ value, onChange, performance }) {
  const isPositive = (performance || 0) >= 0;
  return (
    <div className={styles.container} id="filter-selector">
      <div className={styles.row}>
        <div className={styles.filtersWrapper}>
          <div className={styles.filters}>
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                className={`${styles.pill} ${value === filter.key ? styles.active : ''}`}
                onClick={() => onChange(filter.key)}
                style={value === filter.key ? { '--pill-color': filter.color } : {}}
                id={`filter-${filter.key}`}
              >
                <span className={styles.pillLabel}>{filter.label}</span>
              </button>
            ))}
          </div>
        </div>
        {performance !== undefined && (
          <div className={styles.performanceChip} style={{ color: isPositive ? 'var(--color-income)' : 'var(--color-expense)' }}>
            <span className={styles.perfLabel}>Perf.</span>
            <span className={styles.perfValue}>
              {isPositive ? '+' : ''}
              {formatCurrency(performance || 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

