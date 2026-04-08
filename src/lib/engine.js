/**
 * Cash Copilot — Motor de Cálculo Financeiro
 *
 * Replica toda a lógica da planilha "Termômetro":
 *   Saldo[dia] = Saldo[dia-1] + Entrada[dia] - Saída[dia] - Diário[dia]
 */

/**
 * Retorna quantos dias tem um mês
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Calcula o valor diário (gastos variáveis ÷ dias do mês)
 */
export function calcDailyAmount(variableExpenses, year, month) {
  const total = variableExpenses
    .filter((e) => e.is_active !== false)
    .reduce((sum, e) => sum + Number(e.monthly_amount || 0), 0);
  const days = getDaysInMonth(year, month);
  return total / days;
}

/**
 * Verifica se uma fatura de cartão está ativa em um mês/ano específico
 */
function isCardBillActive(bill, year, month) {
  if (!bill.is_active) return false;

  const startDate = new Date(bill.start_month);
  const endDate = new Date(bill.end_month);
  const checkDate = new Date(year, month, 1);

  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  return checkDate >= startMonth && checkDate <= endMonth;
}

/**
 * Obtém as saídas de um dia específico (fixas + cartões)
 */
function getExpensesForDay(day, month, year, fixedExpenses, cardBills) {
  const fixedForDay = fixedExpenses
    .filter((e) => e.is_active !== false && e.due_day === day)
    .map((e) => ({
      description: e.description,
      amount: Number(e.amount),
      type: 'expense',
    }));

  const cardsForDay = cardBills
    .filter((c) => c.due_day === day && isCardBillActive(c, year, month))
    .map((c) => ({
      description: `${c.card_name}${c.description ? ' - ' + c.description : ''}`,
      amount: Number(c.amount),
      type: 'card',
    }));

  return [...fixedForDay, ...cardsForDay];
}

/**
 * Obtém as entradas de um dia específico
 */
function getIncomeForDay(day, incomeEntries) {
  return incomeEntries
    .filter((e) => e.is_active !== false && e.due_day === day)
    .map((e) => ({
      description: e.description,
      amount: Number(e.amount),
      type: 'income',
    }));
}

/**
 * Gera a previsão completa de um mês
 *
 * @param {Object} params
 * @param {number} params.year - Ano
 * @param {number} params.month - Mês (0-11)
 * @param {number} params.initialBalance - Saldo inicial do mês
 * @param {Array} params.incomeEntries - Entradas recorrentes
 * @param {Array} params.fixedExpenses - Saídas fixas
 * @param {Array} params.variableExpenses - Gastos variáveis
 * @param {Array} params.cardBills - Faturas de cartão
 * @param {Array} params.transactions - Lançamentos reais do mês
 * @param {boolean} params.showDailyForecast - Mostrar previsão de diário em dias futuros
 * @param {number} params.cycleStartDay - Dia que inicia o ciclo (default 1)
 * @returns {Array} Array de objetos com dados de cada dia
 */
export function generateMonthForecast({
  year,
  month,
  initialBalance,
  incomeEntries = [],
  fixedExpenses = [],
  variableExpenses = [],
  cardBills = [],
  transactions = [],
  showDailyForecast = true,
  cycleStartDay = 1,
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const dailyAmount = calcDailyAmount(variableExpenses, year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const currentDay = today.getDate();

  let balance = Number(initialBalance);
  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const isPast = isCurrentMonth ? day < currentDay : new Date(year, month, day) < today;
    const isToday = isCurrentMonth && day === currentDay;
    const isFuture = isCurrentMonth ? day > currentDay : new Date(year, month, day) > today;

    // Entradas do dia
    const incomes = getIncomeForDay(day, incomeEntries);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

    // Saídas do dia (fixas + cartões)
    const expenses = getExpensesForDay(day, month, year, fixedExpenses, cardBills);
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Gastos reais do dia
    const dayTransactions = transactions.filter((t) => {
      const tDate = new Date(t.date);
      return tDate.getDate() === day;
    });
    const totalRealDaily = dayTransactions
      .filter((t) => t.type === 'daily')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Diário: usar gasto real se existir, senão previsão
    let dailyValue;
    if (isPast || isToday) {
      // Dias passados ou hoje: usar gasto real se houver, senão o previsto
      dailyValue = totalRealDaily > 0 ? totalRealDaily : dailyAmount;
    } else {
      // Dias futuros: usar previsão ou 0 conforme config
      dailyValue = showDailyForecast ? dailyAmount : 0;
    }

    // Fórmula: Saldo = Saldo anterior + Entradas - Saídas - Diário
    balance = balance + totalIncome - totalExpense - dailyValue;

    days.push({
      day,
      date: new Date(year, month, day),
      isPast,
      isToday,
      isFuture,
      incomes,
      expenses,
      totalIncome,
      totalExpense,
      dailyAmount: dailyValue,
      dailyBudget: dailyAmount,
      balance: Math.round(balance * 100) / 100,
      transactions: dayTransactions,
      hasRealData: totalRealDaily > 0 || dayTransactions.length > 0,
    });
  }

  return days;
}

/**
 * Calcula o resumo mensal (como linhas 37-44 da planilha)
 */
export function calculateMonthlySummary(forecast) {
  const totalIncome = forecast.reduce((sum, d) => sum + d.totalIncome, 0);
  const totalExpense = forecast.reduce((sum, d) => sum + d.totalExpense, 0);
  const totalDaily = forecast.reduce((sum, d) => sum + d.dailyAmount, 0);
  const totalExpenseAll = totalExpense + totalDaily;
  const performance = totalIncome - totalExpenseAll;
  const lastDayBalance = forecast[forecast.length - 1]?.balance || 0;

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalDaily: Math.round(totalDaily * 100) / 100,
    totalExpenseAll: Math.round(totalExpenseAll * 100) / 100,
    performance: Math.round(performance * 100) / 100,
    lastDayBalance: Math.round(lastDayBalance * 100) / 100,
  };
}

/**
 * Calcula a previsão de múltiplos meses (para carry-over de saldo)
 */
export function generateMultiMonthForecast({
  startYear,
  startMonth,
  months = 12,
  initialBalance,
  incomeEntries,
  fixedExpenses,
  variableExpenses,
  cardBills,
  transactions,
  showDailyForecast,
  cycleStartDay,
}) {
  const allMonths = [];
  let balance = Number(initialBalance);

  for (let i = 0; i < months; i++) {
    let m = startMonth + i;
    let y = startYear + Math.floor(m / 12);
    m = m % 12;

    const monthTransactions = transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });

    const forecast = generateMonthForecast({
      year: y,
      month: m,
      initialBalance: balance,
      incomeEntries,
      fixedExpenses,
      variableExpenses,
      cardBills,
      transactions: monthTransactions,
      showDailyForecast,
      cycleStartDay,
    });

    const summary = calculateMonthlySummary(forecast);

    allMonths.push({
      year: y,
      month: m,
      forecast,
      summary,
      initialBalance: balance,
    });

    // Carry-over: saldo do último dia é o saldo inicial do próximo mês
    balance = forecast[forecast.length - 1]?.balance || 0;
  }

  return allMonths;
}
