'use client';

import styles from './FilterSelector.module.css';

const FILTERS = [
  { key: 'entradas', label: 'Entradas', icon: 'E', color: 'var(--color-income)' },
  { key: 'saidas', label: 'Saídas', icon: 'S', color: 'var(--color-expense)' },
  { key: 'diarios', label: 'Diários', icon: 'D', color: 'var(--color-daily)' },
  { key: 'economias', label: 'Economias', icon: 'Ec', color: 'var(--color-income)' },
  { key: 'cartoes', label: 'Gastos com cartão', icon: 'C', color: 'var(--color-card)' },
  { key: 'diarios_cartoes', label: 'Diários + Cartão', icon: 'D+C', color: 'var(--color-card)' },
  { key: 'despesas_totais', label: 'Diário + Cartão + Saídas', icon: 'DC+S', color: 'var(--color-expense)' },
  { key: 'todas', label: 'Todas', icon: '⊞', color: 'var(--accent-primary)' },
];

export default function FilterSelector({ value, onChange }) {
  return (
    <div className={styles.container} id="filter-selector">
      <div className={styles.header}>
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
      </div>
    </div>
  );
}
