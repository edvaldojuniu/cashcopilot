/**
 * Cash Copilot — Helpers de recorrência
 *
 * Operam em strings "YYYY-MM-DD" (mesmo formato do <input type="date">).
 * Puros, sem I/O — usados pelo QuickAddModal (montar o payload de
 * frequencia/data_inicio/data_fim) e por engine.js/FaturaPicker
 * (resolveCardClosing).
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
 * Monta { frequencia, data_inicio, data_fim } (nomes de coluna de
 * `movimentacoes`) a partir das escolhas do usuário no QuickAddModal.
 * `count` só importa quando endMode === 'count' ou frequency === 'installment'.
 */
export function buildRecurrencePayload({ frequency, endMode, count, date }) {
  if (frequency === 'none') {
    return { frequencia: 'none', data_inicio: date, data_fim: date };
  }

  if (frequency === 'installment') {
    return { frequencia: 'installment', data_inicio: date, data_fim: addMonths(date, count - 1) };
  }

  // monthly | weekly | daily
  if (endMode === 'infinite') {
    return { frequencia: frequency, data_inicio: date, data_fim: null };
  }

  let endDate;
  if (frequency === 'monthly') endDate = addMonths(date, count - 1);
  else if (frequency === 'weekly') endDate = addDays(date, (count - 1) * 7);
  else endDate = addDays(date, count - 1); // daily

  return { frequencia: frequency, data_inicio: date, data_fim: endDate };
}

/**
 * Formata (ano, mês 0-indexado) como "YYYY-MM" — a chave usada tanto em
 * `cartao_fechamentos.mes_referencia` quanto em `movimentacoes.fatura_ano_mes`.
 */
export function formatMesReferencia(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Resolve o fechamento de fatura de um cartão pra um mês específico: usa a
 * correção salva em `cardClosings` pra esse (cartão, mês) se existir, senão
 * cai no dia padrão do cartão (`cartoes.dia_fechamento`). Fechamento real de
 * cartão não é fixo todo mês (varia por fim de semana, feriado, decisão do
 * banco) — é por isso que essa correção existe, em vez de só usar sempre o
 * dia padrão. Único lugar com essa lógica — usado tanto por engine.js (pra
 * casar lançamentos) quanto pelo FaturaPicker (pra sugerir opções).
 */
export function resolveCardClosing(card, cardClosings, year, month) {
  const mesReferencia = formatMesReferencia(year, month);
  const override = cardClosings.find(
    (f) => f.cartao_id === card.id && f.mes_referencia === mesReferencia
  );
  const closingDate = override
    ? parseDate(override.data_fechamento)
    : new Date(year, month, card.dia_fechamento);
  return { closingDate, mesReferencia, isOverride: !!override };
}

/**
 * Lista as faturas de um cartão perto de uma data de referência (a data do
 * lançamento no formulário) — `before`/`after` meses pra trás/frente,
 * resolvidas via `resolveCardClosing`, em ordem cronológica. Usado pelo
 * FaturaPicker pra montar as opções do combo.
 */
export function nearbyCardClosings(card, cardClosings, referenceDateStr, before = 2, after = 3) {
  const ref = parseDate(referenceDateStr);
  const options = [];
  for (let i = -before; i <= after; i++) {
    const totalMonths = ref.getMonth() + i;
    const year = ref.getFullYear() + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    options.push(resolveCardClosing(card, cardClosings, year, month));
  }
  return options;
}
