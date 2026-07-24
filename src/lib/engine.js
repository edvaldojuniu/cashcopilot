/**
 * Cash Copilot — Motor de Cálculo Financeiro (V2 Pro)
 */

import { getCycleBounds } from './utils';

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Converte uma data "YYYY-MM-DD" do banco em meia-noite local, sem
 * ambiguidade de timezone (mesma convenção do resto do arquivo: passa por
 * T12:00:00 antes de zerar a hora, pra nunca cair no dia errado por causa
 * de horário de verão).
 */
function toLocalMidnight(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Diferença em meses inteiros entre duas datas locais (mesmo dia do mês ou
 * não — só considera ano/mês).
 */
function monthsBetweenDates(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Decide se um template recorrente (entrada, saída fixa, fatura de cartão
 * ou diário/economia recorrente) tem uma ocorrência no dia `currentLoopDate`.
 * Único lugar com essa matemática — qualquer casamento de recorrência no
 * app precisa passar por aqui, não reimplementar à parte (ver
 * known_bugs_lessons: já tivemos bug de lógica de data duplicada divergindo).
 *
 * `frequency`:
 *  - 'none'      → casa só no dia exato (start_date === end_date === hoje)
 *  - 'daily'     → qualquer dia dentro do intervalo [start_date, end_date]
 *  - 'weekly'    → mesmo dia da semana do início, dentro do intervalo
 *  - 'monthly' | 'installment' → mesmo dia do mês do início, dentro do intervalo
 */
export function matchesRecurrence(entry, currentLoopDate) {
  if (entry.is_active === false || !entry.start_date) return false;

  const start = toLocalMidnight(entry.start_date);
  if (currentLoopDate < start) return false;

  if (entry.end_date) {
    const end = toLocalMidnight(entry.end_date);
    if (currentLoopDate > end) return false;
  }

  const freq = entry.frequency || 'none';
  if (freq === 'none') return currentLoopDate.getTime() === start.getTime();
  if (freq === 'daily') return true;
  if (freq === 'weekly') {
    const diffDays = Math.round((currentLoopDate - start) / (1000 * 60 * 60 * 24));
    return diffDays % 7 === 0;
  }
  // 'monthly' | 'installment'
  return currentLoopDate.getDate() === start.getDate();
}

/**
 * Calcula o valor diário disponível
 */
export function calcDailyAmount(variableExpenses, daysInCycle) {
  const total = variableExpenses
    .filter((e) => e.is_active !== false)
    .reduce((sum, e) => sum + Number(e.monthly_amount || 0), 0);
  return daysInCycle > 0 ? (total / daysInCycle) : 0;
}

function getIncomeForDay(currentLoopDate, incomeEntries) {
  return incomeEntries
    .filter((e) => matchesRecurrence(e, currentLoopDate))
    .map((e) => ({
      ...e,
      description: e.description,
      amount: Number(e.amount),
      type: 'income',
    }));
}

/**
 * Motor central de cálculo do ciclo
 */
export function generateMonthForecast({
  year,
  month,
  initialBalance,
  incomeEntries = [],
  fixedExpenses = [],
  variableExpenses = [],
  transactions = [],
  cards = [],
  cardBills = [],
  recurringDailyEntries = [],
  verifiedDays = [],
  showDailyForecast = true,
  cycleStartDay = 1,
}) {
  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const { startDate, endDate } = getCycleBounds(year, month, cycleStartDay);

  const daysInCycle = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const dailyAmountBudget = calcDailyAmount(variableExpenses, daysInCycle);

  let balance = Number(initialBalance);
  const days = [];

  for (let i = 0; i < daysInCycle; i++) {
    const currentLoopDate = new Date(startDate);
    currentLoopDate.setDate(startDate.getDate() + i);

    const day = currentLoopDate.getDate();
    const currYear = currentLoopDate.getFullYear();
    const currMonth = currentLoopDate.getMonth();

    const dateStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const isPast = currentLoopDate < todayNormalized;
    const isToday = currentLoopDate.getTime() === todayNormalized.getTime();
    const isFuture = currentLoopDate > todayNormalized;
    const isVerified = verifiedDays.some(d => d.date === dateStr);

    // Entradas do Dia
    const incomes = getIncomeForDay(currentLoopDate, incomeEntries);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

    // Saídas Fixas do Dia
    const expensesFixed = fixedExpenses
      .filter(e => matchesRecurrence(e, currentLoopDate))
      .map(e => ({ ...e, type: 'expense', amount: Number(e.amount) }));

    // Faturas de Cartão (Dinâmico)
    const expensesCards = [];
    cards.forEach(c => {
      // Se a fatura desse cartão vence neste exato dia...
      if (c.due_day === day) {
        // Padronizamos o fechamento para 7 dias antes do vencimento
        let invoiceCloseDay = c.due_day > 7 ? c.due_day - 7 : 28 + c.due_day - 7;

        let closeCurrent = new Date(currYear, currMonth, invoiceCloseDay);
        let closePrev = new Date(currYear, currMonth - 1, invoiceCloseDay);

        if (invoiceCloseDay > c.due_day) {
          closeCurrent = new Date(currYear, currMonth - 1, invoiceCloseDay);
          closePrev = new Date(currYear, currMonth - 2, invoiceCloseDay);
        }

        const singleTransactions = transactions.filter(t => {
          if (t.type !== 'card' || t.card_id !== c.id) return false;
          const tDate = new Date(`${t.date}T12:00:00`); // Fix time
          return tDate > closePrev && tDate <= closeCurrent;
        });

        // 2) Procurar parcelamentos e assinaturas ativas para ESTE cartão que vencem neste dia
        // (Cartão só admite frequency 'none'/'monthly'/'installment' — nunca
        // semanal/diário — então cada template casa no máximo uma vez por mês.)
        const installmentsForThisCard = [];
        if (cardBills && cardBills.length > 0) {
          cardBills.forEach(cb => {
            if (cb.card_id !== c.id) return;
            if (!matchesRecurrence(cb, currentLoopDate)) return;

            let description = cb.description || `Parcelamento/Assinatura`;
            // Só numera parcelamento de verdade (tem fim). Assinatura sem
            // fim (end_date null) não ganha "(n/total)".
            if (cb.frequency === 'installment' && cb.end_date) {
              const start = toLocalMidnight(cb.start_date);
              const end = toLocalMidnight(cb.end_date);
              const totalInstallments = monthsBetweenDates(start, end) + 1;
              const currentInstallment = monthsBetweenDates(start, currentLoopDate) + 1;
              description = `${description} (${currentInstallment}/${totalInstallments})`;
            }

            installmentsForThisCard.push({
              ...cb,
              description,
              amount: Number(cb.amount),
              type: 'card_installment',
              date: dateStr // Para exibição no modal
            });
          });
        }

        const invoiceTransactions = [...singleTransactions, ...installmentsForThisCard];

        // Procurar pagamentos antecipados que referenciam ESTE ciclo
        const earlyPaymentsForThisInvoice = transactions.filter(t => {
          if (t.type !== 'invoice_payment' || t.card_id !== c.id) return false;
          const tDate = new Date(`${t.date}T12:00:00`);
          // Pagamentos feitos desde o fechamento anterior ATÉ o dia do vencimento abatem esta fatura
          const dueDayDate = new Date(currYear, currMonth, c.due_day);
          return tDate > closePrev && tDate <= dueDayDate;
        });

        const cardTotal = invoiceTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const alreadyPaid = earlyPaymentsForThisInvoice.reduce((sum, t) => sum + Number(t.amount), 0);
        const remainingToPay = cardTotal - alreadyPaid;

        if (cardTotal > 0) { // Mostrar a fatura mesmo se estiver paga, apenas alterando o amount final e details
          expensesCards.push({
            id: `card-bill-${c.id}-${dateStr}`,
            card_id: c.id,
            description: `Fatura ${c.name}`,
            amount: remainingToPay > 0 ? remainingToPay : 0,
            originalTotal: cardTotal,
            alreadyPaid: alreadyPaid,
            type: 'card', // is an invoice
            items: invoiceTransactions // injecting the items!
          });
        }
      }
    });

    const expenses = [...expensesFixed, ...expensesCards];
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalFixed = expensesFixed.reduce((sum, e) => sum + e.amount, 0);
    const totalCard = expensesCards.reduce((sum, e) => sum + e.amount, 0);

    // Gastos reais (Pingos Diários e Avulsos deste dia)
    const dayTransactions = transactions.filter(t => t.date === dateStr);
    const dailyTxnsReal = dayTransactions.filter(t => t.type === 'daily');
    const totalRealDaily = dailyTxnsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Gastos reais avulsos no cartão (Pingo Diário do Cartão)
    const cardTxnsReal = dayTransactions.filter(t => t.type === 'card');
    const totalRealCardDaily = cardTxnsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Economias (Retiradas para investimento)
    const savingTxns = dayTransactions.filter(t => t.type === 'saving');
    const totalSavings = savingTxns.reduce((sum, t) => sum + Number(t.amount), 0);

    // Diário/Economia recorrentes (templates) — tratados como certos, igual
    // saída fixa: somam sempre, independente de passado/futuro. Não entram
    // na troca previsão-vs-real do orçamento variável abaixo.
    const recurringDaily = recurringDailyEntries
      .filter(e => e.kind === 'daily' && matchesRecurrence(e, currentLoopDate))
      .map(e => ({ ...e, type: 'recurring_daily', amount: Number(e.amount), date: dateStr }));
    const totalRecurringDaily = recurringDaily.reduce((sum, e) => sum + e.amount, 0);

    const recurringSavings = recurringDailyEntries
      .filter(e => e.kind === 'saving' && matchesRecurrence(e, currentLoopDate))
      .map(e => ({ ...e, type: 'recurring_saving', amount: Number(e.amount), date: dateStr }));
    const totalRecurringSaving = recurringSavings.reduce((sum, e) => sum + e.amount, 0);

    const totalSavingsAll = totalSavings + totalRecurringSaving;

    // Substituição Absoluta do Orçamento (A pedido do Usuário)
    // Dias com gasto diário real lançado (passado, hoje ou futuro) mostram a
    // soma real no lugar da previsão; sem lançamento, a previsão volta a valer.
    let dailyValue = 0;
    if (isPast || isToday || dailyTxnsReal.length > 0) {
      dailyValue = totalRealDaily;
    } else {
      dailyValue = showDailyForecast ? dailyAmountBudget : 0;
    }
    dailyValue += totalRecurringDaily;

    balance = balance + totalIncome - totalExpense - dailyValue - totalSavingsAll;

    days.push({
      day,
      date: currentLoopDate,
      dateStr,
      isPast,
      isToday,
      isFuture,
      isVerified,
      incomes,
      expenses,
      totalIncome,
      totalExpense,
      totalFixed,
      totalCard,                  // Apenas a FATURA que cai neste dia (Invoice)
      totalDailyCard: totalRealCardDaily, // Compras unitárias no cartão neste dia
      dailyAmount: dailyValue,    // O valor deduzido rigorosamente (Real se Passado, Previsão se Futuro)
      dailyBudget: dailyAmountBudget, // A meta pura (apenas para ui)
      totalRealDaily,             // Total que gastou no dia de verdade no dinheiro/débito
      totalSavings: totalSavingsAll,
      recurringDaily,             // Ocorrências de templates recorrentes de diário neste dia
      recurringSavings,           // Ocorrências de templates recorrentes de economia neste dia
      balance: Math.round(balance * 100) / 100,
      transactions: dayTransactions,
      hasRealData: dayTransactions.length > 0,
    });
  }

  return days;
}

export function calculateMonthlySummary(forecast) {
  const totalIncome = forecast.reduce((sum, d) => sum + d.totalIncome, 0);
  const totalExpense = forecast.reduce((sum, d) => sum + d.totalExpense, 0);
  const totalFixed = forecast.reduce((sum, d) => sum + d.totalFixed, 0);
  const totalCard = forecast.reduce((sum, d) => sum + d.totalCard, 0);
  const totalDaily = forecast.reduce((sum, d) => sum + d.dailyAmount, 0);
  const totalSavings = forecast.reduce((sum, d) => sum + d.totalSavings, 0);

  const custoDeVida = totalExpense + totalDaily;
  const totalExpenseAll = custoDeVida + totalSavings;
  const performance = totalIncome - totalExpenseAll;
  const lastDayBalance = forecast[forecast.length - 1]?.balance || 0;

  // Médias
  const daysInMonth = forecast.length || 1;
  const averageDaily = forecast.reduce((sum, d) => sum + d.totalRealDaily, 0) / daysInMonth;
  const averageCard = totalCard / daysInMonth;
  const averageDailyCard = (totalCard + forecast.reduce((sum, d) => sum + d.totalRealDaily, 0)) / daysInMonth;
  const averageDailyCardFixed = (custoDeVida) / daysInMonth; // fixed + card + daily

  // Geração de Logs planos (Flattened Log Array para Aba Totais)
  const logs = [];
  forecast.forEach(d => {
    // Incomes
    d.incomes.forEach(i => logs.push({ ...i, logDate: d.dateStr, group: 'income' }));
    // Expenses (Fixed + Card)
    d.expenses.forEach(e => logs.push({ ...e, logDate: d.dateStr, group: e.type === 'card' ? 'card' : 'fixed' }));
    // Transactions (Daily + Savings)
    d.transactions.forEach(t => logs.push({ ...t, logDate: d.dateStr, group: t.type === 'saving' ? 'saving' : 'daily' }));
    // Diário/Economia recorrentes (templates)
    d.recurringDaily.forEach(e => logs.push({ ...e, logDate: d.dateStr, group: 'daily' }));
    d.recurringSavings.forEach(e => logs.push({ ...e, logDate: d.dateStr, group: 'saving' }));
  });

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalFixed: Math.round(totalFixed * 100) / 100,
    totalCard: Math.round(totalCard * 100) / 100,
    totalDaily: Math.round(totalDaily * 100) / 100,
    totalSavings: Math.round(totalSavings * 100) / 100,
    custoDeVida: Math.round(custoDeVida * 100) / 100,
    totalExpenseAll: Math.round(totalExpenseAll * 100) / 100,
    performance: Math.round(performance * 100) / 100,
    lastDayBalance: Math.round(lastDayBalance * 100) / 100,
    averages: {
      daily: Math.round(averageDaily * 100) / 100,
      card: Math.round(averageCard * 100) / 100,
      dailyCard: Math.round(averageDailyCard * 100) / 100,
      dailyCardFixed: Math.round(averageDailyCardFixed * 100) / 100,
    },
    logs
  };
}

/**
 * Soma os lançamentos de um período (logs já flatten de calculateMonthlySummary)
 * agrupados por tag. Um lançamento com múltiplas tags conta o valor cheio em
 * cada uma (sem rateio) — é o comportamento esperado para "quanto gastei em
 * cada categoria", não uma partição contábil. Apenas logs vindos de
 * daily_transactions carregam tag_ids; entradas/saídas fixas e faturas
 * agregadas não têm tag e são ignoradas automaticamente.
 */
export function calculateTagTotals(logs, tags) {
  const totalsByTagId = {};
  logs.forEach((log) => {
    (log.tag_ids || []).forEach((tagId) => {
      totalsByTagId[tagId] = (totalsByTagId[tagId] || 0) + Number(log.amount || 0);
    });
  });

  return tags
    .map((tag) => ({
      ...tag,
      total: Math.round((totalsByTagId[tag.id] || 0) * 100) / 100,
    }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Simula mês a mês, a partir de `referenceYear`/janeiro, até o mês/ano alvo,
 * e devolve o saldo acumulado no início desse mês. `initial_balance` no
 * profile representa o saldo em janeiro de `referenceYear` — todo saldo de
 * qualquer mês futuro é derivado simulando para frente a partir dali (não há
 * snapshot histórico armazenado). Único lugar com essa lógica; usado tanto
 * pelo FinanceContext quanto pelas tools do assistente para não divergir.
 */
export function getBalanceAtMonthStart({
  year,
  month,
  referenceYear,
  initialBalance,
  incomeEntries = [],
  fixedExpenses = [],
  variableExpenses = [],
  transactions = [],
  cards = [],
  cardBills = [],
  recurringDailyEntries = [],
  verifiedDays = [],
  showDailyForecast = true,
  cycleStartDay = 1,
}) {
  let balance = Number(initialBalance ?? 0);
  const targetIdx = (year - referenceYear) * 12 + month;
  for (let i = 0; i < targetIdx; i++) {
    const m = i % 12;
    const y = referenceYear + Math.floor(i / 12);
    const fc = generateMonthForecast({
      year: y,
      month: m,
      initialBalance: balance,
      incomeEntries,
      fixedExpenses,
      variableExpenses,
      cards,
      cardBills,
      recurringDailyEntries,
      verifiedDays,
      transactions,
      showDailyForecast,
      cycleStartDay,
    });
    balance = fc[fc.length - 1]?.balance ?? 0;
  }
  return balance;
}

/**
 * Forecast + resumo de um único mês, já resolvendo o saldo inicial via
 * getBalanceAtMonthStart. Usado pelas tools do assistente (servidor) — a UI
 * usa a versão em FinanceContext.getMonthForecast, que faz o mesmo cálculo
 * reaproveitando esta mesma função de base.
 */
export function computeMonthForecast(params) {
  const referenceYear = params.referenceYear ?? new Date().getFullYear();
  const initialBalance = getBalanceAtMonthStart({ ...params, referenceYear });
  const forecast = generateMonthForecast({ ...params, initialBalance });
  return { forecast, summary: calculateMonthlySummary(forecast), initialBalance };
}

export function generateMultiMonthForecast(params) {
  const allMonths = [];
  let currentBalance = Number(params.initialBalance);

  for (let i = 0; i < params.months; i++) {
    let m = params.startMonth + i;
    let y = params.startYear + Math.floor(m / 12);
    m = m % 12;

    const forecast = generateMonthForecast({
      ...params,
      year: y,
      month: m,
      initialBalance: currentBalance,
    });

    const summary = calculateMonthlySummary(forecast);

    allMonths.push({
      year: y,
      month: m,
      forecast,
      summary,
      initialBalance: currentBalance,
    });

    currentBalance = forecast[forecast.length - 1]?.balance || 0;
  }

  return allMonths;
}
