'use client';

import styles from './FilterSelector.module.css';

const FILTERS = [
  { key: 'diarios', label: 'Diários', icon: 'D', color: 'var(--color-daily)' },
  { key: 'entradas', label: 'Entradas', icon: 'E', color: 'var(--color-income)' },
  { key: 'saidas', label: 'Saídas', icon: 'S', color: 'var(--color-expense)' },
  { key: 'todos', label: 'Todos', icon: '⊞', color: 'var(--accent-primary)' },
];

export default function FilterSelector({ value, onChange }) {
  return (
    <div className={styles.container} id="filter-selector">
      <div className={styles.header}>
        <span className={styles.headerLabel}>Dia</span>
        <div className={styles.filters}>
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              className={`${styles.pill} ${value === filter.key ? styles.active : ''}`}
              onClick={() => onChange(filter.key)}
              style={value === filter.key ? { '--pill-color': filter.color } : {}}
              id={`filter-${filter.key}`}
            >
              <span
                className={styles.pillIcon}
                style={{ background: `${filter.color}30`, color: filter.color }}
              >
                {filter.icon}
              </span>
              <span className={styles.pillLabel}>{filter.label}</span>
            </button>
          ))}
        </div>
        <span className={styles.headerLabel}>Saldos</span>
      </div>
    </div>
  );
}
