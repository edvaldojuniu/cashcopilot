/**
 * Cash Copilot — Insights da aba Análises
 *
 * Funções puras, sem I/O. Reaproveitam calculateTagTotals (engine.js) — só
 * filtram os logs pelo "group" da sub-aba antes de agrupar por tag. Texto
 * determinístico (thresholds simples), sem custo de API — fase 1 do plano;
 * uma versão com IA pode vir depois reaproveitando /api/assistant.
 */

import { formatCurrency } from './utils';

export function filterLogsByGroup(logs, groups) {
  return logs.filter((l) => groups.includes(l.group));
}

function percentOf(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

// null = sem base de comparação (categoria não existia no período anterior).
function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * @param {object} params
 * @param {Array} params.tagTotals - calculateTagTotals do período atual (já ordenado desc)
 * @param {Array} [params.previousTagTotals] - calculateTagTotals do período anterior
 * @param {number} params.total - total do grupo no período atual
 * @param {number} params.previousTotal - total do grupo no período anterior
 * @param {number|null} [params.goal] - meta de gasto do período (só relevante na aba Totais)
 */
export function buildInsights({ tagTotals, previousTagTotals = [], total, previousTotal, goal }) {
  const top3 = tagTotals.slice(0, 3).map((t) => ({
    ...t,
    percent: percentOf(t.total, total),
  }));

  const totalChangePercent = percentChange(total, previousTotal);
  const totalChangeValue = Math.round((total - previousTotal) * 100) / 100;

  const previousById = Object.fromEntries(previousTagTotals.map((t) => [t.id, t.total]));
  const tagTrends = tagTotals.map((t) => ({
    ...t,
    changePercent: percentChange(t.total, previousById[t.id] ?? 0),
  }));

  let goalStatus = null;
  if (goal != null && goal > 0) {
    const usedPercent = percentOf(total, goal);
    goalStatus = {
      usedPercent,
      status: usedPercent >= 100 ? 'estourou' : usedPercent >= 80 ? 'perto' : 'dentro',
      remaining: Math.round((goal - total) * 100) / 100,
    };
  }

  const recommendations = [];

  if (top3[0] && top3[0].percent >= 40) {
    recommendations.push(
      `"${top3[0].nome}" sozinha responde por ${top3[0].percent}% do total — vale olhar de perto se dá pra reduzir.`
    );
  }

  const grownTag = tagTrends
    .filter((t) => t.changePercent != null && t.changePercent >= 20)
    .sort((a, b) => b.changePercent - a.changePercent)[0];
  if (grownTag) {
    recommendations.push(
      `"${grownTag.nome}" cresceu ${grownTag.changePercent}% em relação ao período anterior.`
    );
  }

  if (goalStatus?.status === 'estourou') {
    recommendations.push(
      `Você já passou da meta em ${formatCurrency(Math.abs(goalStatus.remaining))} — dá pra segurar o restante do período.`
    );
  } else if (goalStatus?.status === 'perto') {
    recommendations.push(
      `Faltam só ${formatCurrency(goalStatus.remaining)} pra bater a meta — cuidado nos próximos dias.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Nada fora do padrão neste período — seus gastos estão estáveis.');
  }

  return {
    top3,
    totalChangePercent,
    totalChangeValue,
    tagTrends,
    goalStatus,
    recommendations: recommendations.slice(0, 3),
  };
}
