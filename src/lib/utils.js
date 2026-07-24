/**
 * Cash Copilot — Utilitários
 */

/**
 * Formata valor como moeda brasileira (R$)
 */
export function formatCurrency(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata valor como moeda sem símbolo
 */
export function formatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Nomes dos meses em português
 */
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_ABBR = [
  'Jan', 'Fev', 'Mar', 'Abr',
  'Mai', 'Jun', 'Jul', 'Ago',
  'Set', 'Out', 'Nov', 'Dez',
];

export function getMonthName(month) {
  return MONTH_NAMES[month] || '';
}

export function getMonthAbbr(month) {
  return MONTH_ABBR[month] || '';
}

/**
 * Retorna a cor do saldo baseada no valor
 */
export function getBalanceColor(balance, maxBalance) {
  if (balance <= 0) return 'var(--saldo-negative)';
  const ratio = maxBalance > 0 ? balance / maxBalance : 0;
  if (ratio >= 0.7) return 'var(--saldo-very-positive)';
  if (ratio >= 0.5) return 'var(--saldo-positive)';
  if (ratio >= 0.3) return 'var(--saldo-neutral)';
  if (ratio >= 0.1) return 'var(--saldo-low)';
  return 'var(--saldo-negative)';
}

/**
 * Retorna a classe CSS para a linha do dia baseada no saldo
 */
export function getBalanceRowClass(balance, maxBalance) {
  if (balance <= 0) return 'row-negative';
  const ratio = maxBalance > 0 ? balance / maxBalance : 0;
  if (ratio >= 0.7) return 'row-very-positive';
  if (ratio >= 0.5) return 'row-positive';
  if (ratio >= 0.3) return 'row-neutral';
  if (ratio >= 0.1) return 'row-low';
  return 'row-very-low';
}

/**
 * Retorna a cor de fundo da linha baseada no saldo
 */
export function getBalanceRowBg(balance, maxBalance) {
  if (balance <= 0) return 'var(--row-red-2)';
  const ratio = maxBalance > 0 ? balance / maxBalance : 0;
  if (ratio >= 0.7) return 'var(--row-green-1)';
  if (ratio >= 0.5) return 'var(--row-green-2)';
  if (ratio >= 0.3) return 'var(--row-yellow)';
  if (ratio >= 0.1) return 'var(--row-orange)';
  return 'var(--row-red-1)';
}

/**
 * Calcula os limites (início/fim) do ciclo financeiro customizado do usuário
 * para um dado ano/mês. Se cycleStartDay > 1, o ciclo começa nesse dia do mês
 * anterior e termina no dia (cycleStartDay - 1) do mês informado; caso
 * contrário é o mês de calendário puro. Único lugar que deve conter essa
 * matemática — qualquer filtragem por "mês" no app precisa passar por aqui,
 * nunca por corte de calendário puro (ver known_bugs_lessons).
 */
export function getCycleBounds(year, month, cycleStartDay = 1) {
  let startDate, endDate;
  if (cycleStartDay > 1) {
    startDate = new Date(year, month - 1, cycleStartDay);
    endDate = new Date(year, month, cycleStartDay - 1);
  } else {
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0);
  }
  return { startDate, endDate };
}

/**
 * Formata um objeto Date como "YYYY-MM-DD" (formato de coluna DATE do
 * Postgres / <input type="date">), em fuso local — nunca usar
 * toISOString() aqui, que converte pra UTC e pode virar o dia errado.
 */
export function formatDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Rótulo do ciclo financeiro de um mês como intervalo de datas real
 * (ex: "21/jun a 20/jul/26"), em vez do nome do mês — evita a ambiguidade de
 * rotular um período que atravessa dois meses de calendário com apenas um
 * nome de mês quando cycleStartDay != 1. O ano sempre aparece no fim do
 * período (à direita); se o período atravessa a virada do ano (ex:
 * dez→jan), aparece nas duas pontas pra não ficar ambíguo.
 */
export function formatCyclePeriodLabel(year, month, cycleStartDay = 1) {
  const { startDate, endDate } = getCycleBounds(year, month, cycleStartDay);
  const yearsDiffer = startDate.getFullYear() !== endDate.getFullYear();
  const fmt = (d, withYear) => {
    const day = String(d.getDate()).padStart(2, '0');
    const monthAbbr = getMonthAbbr(d.getMonth()).toLowerCase();
    const base = `${day}/${monthAbbr}`;
    return withYear ? `${base}/${String(d.getFullYear()).slice(2)}` : base;
  };
  return `${fmt(startDate, yearsDiffer)} a ${fmt(endDate, true)}`;
}

/**
 * Mapeia a aba de filtro selecionada na tela principal (Entradas, Saídas,
 * Diários, etc.) para o "type" inicial do formulário de novo lançamento —
 * abas que não representam um único tipo (Diário+Cartão, Todas, ...) caem
 * no padrão "diario".
 */
const FILTER_TO_TRANSACTION_TYPE = {
  entradas: 'income',
  saidas: 'expense',
  diarios: 'diario',
  economias: 'saving',
  cartoes: 'card',
};

export function filterToTransactionType(filter) {
  return FILTER_TO_TRANSACTION_TYPE[filter] || 'diario';
}

/**
 * Gera um ID único
 */
export function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);
}

/**
 * Debounce helper
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Classe CSS condicional
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
