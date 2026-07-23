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
      <div className={styles.scrollArea}>
        <div className={styles.filterTrack}>
          {FILTERS.map((filter) => {
            const isActive = value === filter.key;
            return (
              <button
                key={filter.key}
                className={`${styles.tab} ${isActive ? styles.activeTab : ''}`}
                onClick={() => onChange(filter.key)}
                style={{ '--tab-color': filter.color }}
                id={`filter-${filter.key}`}
              >
                <span className={styles.tabLabel}>{filter.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

