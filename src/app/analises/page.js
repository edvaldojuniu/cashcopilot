'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import BottomNav from '@/components/BottomNav/BottomNav';
import MonthNavigator from '@/components/MonthNavigator/MonthNavigator';
import AnalysisChart from '@/components/AnalysisChart/AnalysisChart';
import GoalsModal from '@/components/GoalsModal/GoalsModal';
import TagDetailsModal from '@/components/TagDetailsModal/TagDetailsModal';
import { calculateTagTotals } from '@/lib/engine';
import { filterLogsByGroup, buildInsights } from '@/lib/analysisInsights';
import { formatCurrency, formatCyclePeriodLabel, getCycleBounds, formatDateStr } from '@/lib/utils';
import styles from './page.module.css';

const TABS = [
  { key: 'card', label: 'Cartão', groups: ['card'] },
  { key: 'daily', label: 'Dia a dia', groups: ['daily'] },
  { key: 'fixed', label: 'Fixos', groups: ['fixed'] },
  { key: 'total', label: 'Totais', groups: ['card', 'daily', 'fixed'] },
];

function GoalBar({ label, current, goal, invert = false }) {
  const rawPercent = goal > 0 ? Math.round((current / goal) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, rawPercent));

  let barClass = styles.barOk;
  if (invert) {
    // Economia: quanto mais perto ou acima de 100%, melhor.
    if (rawPercent < 50) barClass = styles.barDanger;
    else if (rawPercent < 100) barClass = styles.barWarn;
  } else {
    // Gasto: quanto mais perto ou acima de 100%, pior.
    if (rawPercent >= 100) barClass = styles.barDanger;
    else if (rawPercent >= 80) barClass = styles.barWarn;
  }

  return (
    <div className={styles.goalRow}>
      <div className={styles.goalRowHeader}>
        <span>{label}</span>
        <span>{formatCurrency(current)} / {formatCurrency(goal)}</span>
      </div>
      <div className={styles.goalTrack}>
        <div className={`${styles.goalFill} ${barClass}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

export default function AnalisesPage() {
  const { profile } = useAuth();
  const {
    viewMonth, viewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    getMonthForecast, getPeriodGoal,
    tags,
  } = useFinance();

  const [activeTab, setActiveTab] = useState('total');
  const [isGoalsModalOpen, setGoalsModalOpen] = useState(false);
  const [goal, setGoal] = useState(null);
  const [goalVersion, setGoalVersion] = useState(0);
  const [selectedTag, setSelectedTag] = useState(null);

  const cycleStartDay = profile?.dia_inicio_ciclo ?? 1;
  const periodLabel = formatCyclePeriodLabel(viewYear, viewMonth, cycleStartDay);

  const { startDate: periodStart, endDate: periodEnd } = getCycleBounds(viewYear, viewMonth, cycleStartDay);
  const periodStartStr = formatDateStr(periodStart);
  const periodEndStr = formatDateStr(periodEnd);

  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;

  const { summary } = useMemo(
    () => getMonthForecast(viewYear, viewMonth),
    [viewYear, viewMonth, getMonthForecast]
  );
  const { summary: previousSummary } = useMemo(
    () => getMonthForecast(prevYear, prevMonth),
    [prevYear, prevMonth, getMonthForecast]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getPeriodGoal(periodStartStr, periodEndStr);
      if (!cancelled) setGoal(data);
    })();
    return () => { cancelled = true; };
  }, [periodStartStr, periodEndStr, getPeriodGoal, goalVersion]);

  const activeTabDef = TABS.find((t) => t.key === activeTab);
  const currentLogs = filterLogsByGroup(summary.logs || [], activeTabDef.groups);
  const previousLogs = filterLogsByGroup(previousSummary.logs || [], activeTabDef.groups);
  const currentTagTotals = calculateTagTotals(currentLogs, tags);
  const previousTagTotals = calculateTagTotals(previousLogs, tags);
  const currentTotal = currentLogs.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const previousTotal = previousLogs.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  const insights = buildInsights({
    tagTotals: currentTagTotals,
    previousTagTotals,
    total: currentTotal,
    previousTotal,
    goal: activeTab === 'total' ? goal?.meta_gasto : null,
  });

  // Total de renda marcada com a tag configurada como "renda" — base pra
  // sugerir meta de economia (10-30%) no GoalsModal.
  const incomeLogs = filterLogsByGroup(summary.logs || [], ['income']);
  const incomeTotal = profile?.etiqueta_renda_id
    ? incomeLogs
        .filter((l) => (l.tag_ids || []).includes(profile.etiqueta_renda_id))
        .reduce((sum, l) => sum + Number(l.amount || 0), 0)
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Análises</h1>
        <p className={styles.subtitle}>Raio-X do seu mês</p>
      </header>

      <MonthNavigator
        month={viewMonth}
        year={viewYear}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onToday={goToCurrentMonth}
        label={periodLabel}
      />

      <div className={styles.content}>
        <div className="card">
          <div className={styles.goalsHeader}>
            <h3>Metas do período</h3>
            <button className={styles.editGoalsBtn} onClick={() => setGoalsModalOpen(true)}>
              Editar metas
            </button>
          </div>

          {goal?.meta_gasto != null || goal?.meta_economia != null ? (
            <div className={styles.goalsList}>
              {goal.meta_gasto != null && (
                <GoalBar label="Gasto" current={summary.custoDeVida || 0} goal={goal.meta_gasto} />
              )}
              {goal.meta_economia != null && (
                <GoalBar label="Economia" current={summary.totalSavings || 0} goal={goal.meta_economia} invert />
              )}
            </div>
          ) : (
            <p className={styles.noGoal}>Nenhuma meta cadastrada pra esse período.</p>
          )}
        </div>

        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="card">
          <AnalysisChart tagTotals={currentTagTotals} onSelectTag={setSelectedTag} />
        </div>

        <div className="card">
          <div className={styles.insightRow}>
            <span>Total do período</span>
            <strong>{formatCurrency(currentTotal)}</strong>
          </div>

          {insights.totalChangePercent != null && (
            <div className={styles.insightRow}>
              <span>Vs. período anterior</span>
              <strong className={insights.totalChangePercent >= 0 ? styles.up : styles.down}>
                {insights.totalChangePercent >= 0 ? '↑' : '↓'} {Math.abs(insights.totalChangePercent)}%
                {' '}({formatCurrency(Math.abs(insights.totalChangeValue))})
              </strong>
            </div>
          )}

          {insights.top3.length > 0 && (
            <div className={styles.topList}>
              <h4>Maiores categorias</h4>
              {insights.top3.map((t) => (
                <div key={t.id} className={styles.insightRow}>
                  <span>{t.nome}</span>
                  <span>{t.percent}% · {formatCurrency(t.total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.recommendations}>
            {insights.recommendations.map((r, i) => <p key={i}>{r}</p>)}
          </div>
        </div>
      </div>

      <GoalsModal
        isOpen={isGoalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        periodStart={periodStartStr}
        periodEnd={periodEndStr}
        currentGoal={goal}
        incomeTotal={incomeTotal}
        onSaved={() => setGoalVersion((v) => v + 1)}
      />

      <TagDetailsModal
        isOpen={!!selectedTag}
        onClose={() => setSelectedTag(null)}
        tag={selectedTag}
        logs={selectedTag ? currentLogs.filter((l) => (l.tag_ids || []).includes(selectedTag.id)) : []}
      />

      <BottomNav />
    </div>
  );
}
