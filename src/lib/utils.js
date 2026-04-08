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
