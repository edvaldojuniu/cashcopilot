/**
 * Cash Copilot — Motor de Cálculo Financeiro (V2 Pro)
 */

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
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

function getIncomeForDay(day, incomeEntries, currYear, currMonth) {
  return incomeEntries
    .filter((e) => {
      if (e.is_active === false || e.due_day !== day) return false;
      
      const checkMonthStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
      
      if (e.start_month && checkMonthStr < e.start_month) return false;
      if (e.end_month && checkMonthStr > e.end_month) return false;
      
      return true;
    })
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
  verifiedDays = [],
  showDailyForecast = true,
  cycleStartDay = 1,
}) {
  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let startDate, endDate;
  if (cycleStartDay > 1) {
    startDate = new Date(year, month - 1, cycleStartDay);
    endDate = new Date(year, month, cycleStartDay - 1);
  } else {
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0); 
  }

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
    const incomes = getIncomeForDay(day, incomeEntries, currYear, currMonth);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

    // Saídas Fixas do Dia
    const expensesFixed = fixedExpenses
      .filter(e => {
        if (e.is_active === false || e.due_day !== day) return false;
        
        const checkMonthStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
        
        if (e.start_month && checkMonthStr < e.start_month) return false;
        if (e.end_month && checkMonthStr > e.end_month) return false;
        
        return true;
      })
      .map(e => ({ ...e, type: 'expense', amount: Number(e.amount) }));

    // Faturas de Cartão (Dinâmico)
    const expensesCards = [];
    cards.forEach(c => {
      // Se a fatura desse cartão vence neste exato dia...
      if (c.due_day === day) {
        let closeCurrent = new Date(currYear, currMonth, c.closing_day);
        let closePrev = new Date(currYear, currMonth - 1, c.closing_day);
        
        // Ex: Vence 05, Fecha 25. A fatura do mês Atual reflete as compras entre 25/m-2 e 25/m-1.
        if (c.closing_day > c.due_day) {
          closeCurrent = new Date(currYear, currMonth - 1, c.closing_day);
          closePrev = new Date(currYear, currMonth - 2, c.closing_day);
        }

        const invoiceTransactions = transactions.filter(t => {
          if (t.type !== 'card' || t.card_id !== c.id) return false;
          const tDate = new Date(`${t.date}T12:00:00`); // Fix time
          return tDate > closePrev && tDate <= closeCurrent;
        });

        const cardTotal = invoiceTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        if (cardTotal > 0) {
          expensesCards.push({
            id: `card-bill-${c.id}-${dateStr}`,
            description: `Fatura ${c.name}`,
            amount: cardTotal,
            type: 'card'
          });
        }
      }
    });

    // Assinaturas e Parcelados de Cartão (credit_card_bills antigos e novos)
    if (cardBills && cardBills.length > 0) {
      cardBills.forEach(cb => {
        if (cb.is_active !== false && cb.due_day === day) {
          const checkMonthStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
          
          if (cb.start_month && checkMonthStr < cb.start_month) return;
          if (cb.end_month && checkMonthStr > cb.end_month) return;

          expensesCards.push({
            ...cb,
            description: cb.description || `Parcela ${cb.card_name}`,
            amount: Number(cb.amount),
            type: 'card'
          });
        }
      });
    }

    const expenses = [...expensesFixed, ...expensesCards];
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalFixed = expensesFixed.reduce((sum, e) => sum + e.amount, 0);
    const totalCard = expensesCards.reduce((sum, e) => sum + e.amount, 0);

    // Gastos reais (Pingos Diários e Avulsos deste dia)
    const dayTransactions = transactions.filter(t => t.date === dateStr);
    const dailyTxnsReal = dayTransactions.filter(t => t.type === 'daily');
    const totalRealDaily = dailyTxnsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Substituição Absoluta do Orçamento (A pedido do Usuário)
    let dailyValue = 0;
    if (isPast || isToday) {
      dailyValue = totalRealDaily;
    } else {
      dailyValue = showDailyForecast ? dailyAmountBudget : 0;
    }

    balance = balance + totalIncome - totalExpense - dailyValue;

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
      totalCard,
      dailyAmount: dailyValue,    // O valor deduzido rigorosamente (Real se Passado, Previsão se Futuro)
      dailyBudget: dailyAmountBudget, // A meta pura (apenas para ui)
      totalRealDaily,             // Total que gastou no dia de verdade (para debug e UI avançada)
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
