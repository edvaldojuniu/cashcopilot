'use client';

import styles from './AnalysisChart.module.css';
import { formatCurrency } from '@/lib/utils';

// Gráfico de barras horizontais por tag. A cor de cada barra é a própria
// cor da tag (já escolhida pelo usuário) — identidade segue a entidade, não
// um ciclo de cores genérico. Já vem ordenado por calculateTagTotals (desc).
export default function AnalysisChart({ tagTotals }) {
  if (!tagTotals || tagTotals.length === 0) {
    return <div className={styles.empty}>Nenhum gasto com tag neste período.</div>;
  }

  const max = tagTotals[0].total;

  return (
    <div className={styles.chart}>
      {tagTotals.map((tag) => (
        <div key={tag.id} className={styles.row}>
          <div className={styles.rowHeader}>
            <span className={styles.dot} style={{ background: tag.cor }} />
            <span className={styles.name}>{tag.nome}</span>
            <span className={styles.value}>{formatCurrency(tag.total)}</span>
          </div>
          <div className={styles.track}>
            <div
              className={styles.bar}
              style={{
                width: `${max > 0 ? (tag.total / max) * 100 : 0}%`,
                background: tag.cor,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
