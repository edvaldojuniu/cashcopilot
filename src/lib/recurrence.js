/**
 * Cash Copilot — Helpers de recorrência
 *
 * Operam em strings "YYYY-MM-DD" (mesmo formato do <input type="date">),
 * independentes de engine.js — usados pelo QuickAddModal para montar o
 * payload de start_date/end_date/frequency a partir das escolhas do usuário.
 */

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/**
 * Soma meses preservando o dia quando possível; se o mês de destino não tem
 * esse dia (ex: 31 de fevereiro), usa o último dia válido daquele mês —
 * evita o "estouro" padrão do JS (Date.setMonth rolaria pro mês seguinte).
 */
export function addMonths(dateStr, months) {
  const d = parseDate(dateStr);
  const totalMonths = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d.getDate(), daysInTargetMonth);
  return formatDate(new Date(targetYear, targetMonth, day));
}

export function diffDays(fromStr, toStr) {
  return Math.round((parseDate(toStr) - parseDate(fromStr)) / (1000 * 60 * 60 * 24));
}

export function diffMonths(fromStr, toStr) {
  const a = parseDate(fromStr);
  const b = parseDate(toStr);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Monta { frequency, start_date, end_date } a partir das escolhas do
 * usuário no QuickAddModal. `count` só importa quando endMode === 'count'
 * ou frequency === 'installment'.
 */
export function buildRecurrencePayload({ frequency, endMode, count, date }) {
  if (frequency === 'none') {
    return { frequency: 'none', start_date: date, end_date: date };
  }

  if (frequency === 'installment') {
    return { frequency: 'installment', start_date: date, end_date: addMonths(date, count - 1) };
  }

  // monthly | weekly | daily
  if (endMode === 'infinite') {
    return { frequency, start_date: date, end_date: null };
  }

  let endDate;
  if (frequency === 'monthly') endDate = addMonths(date, count - 1);
  else if (frequency === 'weekly') endDate = addDays(date, (count - 1) * 7);
  else endDate = addDays(date, count - 1); // daily

  return { frequency, start_date: date, end_date: endDate };
}
