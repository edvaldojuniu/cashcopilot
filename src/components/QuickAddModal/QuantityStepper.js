'use client';

import styles from './QuantityStepper.module.css';

export default function QuantityStepper({ count, onChange, label, min = 2, max = 120 }) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.arrow}
        onClick={() => onChange(Math.max(min, count - 1))}
        disabled={count <= min}
        aria-label="Diminuir"
      >
        ‹
      </button>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.arrow}
        onClick={() => onChange(Math.min(max, count + 1))}
        disabled={count >= max}
        aria-label="Aumentar"
      >
        ›
      </button>
    </div>
  );
}
