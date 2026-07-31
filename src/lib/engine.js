/**
 * Cash Copilot — Motor de Cálculo Financeiro (V2 Pro)
 *
 * Lê a tabela unificada `movimentacoes` (colunas em português: tipo, valor,
 * descricao, frequencia, data_inicio, data_fim, cartao_id, ativo, e
 * fatura_ano_mes pra compra avulsa/pagamento de cartão) e `cartao_fechamentos`
 * (correções de fechamento por cartão+mês) e devolve objetos por dia com
 * nomes de campo em inglês (description, amount, type, date, balance,
 * totalIncome, ...) — esta é a ÚNICA fronteira de tradução do app; todo o
 * resto da árvore de componentes (DayRow, DayDetailsModal, page.js,
 * totais/page.js, analysisInsights.js) consome o formato de saída em inglês
 * sem saber que o banco está em português.
 */

import { getCycleBounds } from './utils';
import { resolveCardClosing } from './recurrence';

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
 * Decide se uma movimentação (entrada, saída fixa, cartão ou diário/economia
 * — recorrente OU avulsa) tem uma ocorrência no dia `currentLoopDate`. Único
 * lugar com essa matemática — qualquer casamento de recorrência no app
 * precisa passar por aqui, não reimplementar à parte (ver
 * known_bugs_lessons: já tivemos bug de lógica de data duplicada divergindo).
 *
 * `frequencia`:
 *  - 'none'      → casa só no dia exato (data_inicio === data_fim === hoje) —
 *                   é assim que um lançamento avulso é representado
 *  - 'daily'     → qualquer dia dentro do intervalo [data_inicio, data_fim]
 *  - 'weekly'    → mesmo dia da semana do início, dentro do intervalo
 *  - 'monthly' | 'installment' → mesmo dia do mês do início, dentro do intervalo
 */
export function matchesRecurrence(entry, currentLoopDate) {
  if (entry.ativo === false || !entry.data_inicio) return false;

  const start = toLocalMidnight(entry.data_inicio);
  if (currentLoopDate < start) return false;

  if (entry.data_fim) {
    const end = toLocalMidnight(entry.data_fim);
    if (currentLoopDate > end) return false;
  }

  // Ocorrência editada/excluída individualmente via "Atualizar somente
  // esta" — o resto da série continua normal.
  if (entry.exception_dates && entry.exception_dates.length > 0) {
    const dateStr = `${currentLoopDate.getFullYear()}-${String(currentLoopDate.getMonth() + 1).padStart(2, '0')}-${String(currentLoopDate.getDate()).padStart(2, '0')}`;
    if (entry.exception_dates.includes(dateStr)) return false;
  }

  const freq = entry.frequencia || 'none';
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
    .filter((e) => e.ativo !== false)
    .reduce((sum, e) => sum + Number(e.valor_mensal || 0), 0);
  return daysInCycle > 0 ? (total / daysInCycle) : 0;
}

// Traduz uma linha de `movimentacoes` (campos em português) pra um item de
// ocorrência no formato em inglês que o resto do app espera.
function toOccurrence(m, type, dateStr) {
  return { ...m, description: m.descricao, amount: Number(m.valor), type, date: dateStr };
}

// Descrição de uma ocorrência de cartão com o sufixo "(N/M)" (parcelado ou
// mensal com repetições contadas) ou "(assinatura)" (recorrente sem fim) —
// avulsa (frequencia 'none') não leva sufixo nenhum. Único lugar com essa
// lógica — usado tanto pra montar os itens da fatura agregada quanto pra
// ocorrência avulsa mostrada no detalhamento do dia, que antes divergiam
// (a fatura numerava, o detalhamento do dia não).
function describeCardOccurrence(m, occurrenceDate) {
  if (m.frequencia === 'none') return m.descricao || 'Compra';

  const description = m.descricao || 'Parcelamento/Assinatura';
  if (!m.data_fim) return `${description} (assinatura)`;

  const start = toLocalMidnight(m.data_inicio);
  const end = toLocalMidnight(m.data_fim);
  const totalInstallments = monthsBetweenDates(start, end) + 1;
  const currentInstallment = monthsBetweenDates(start, occurrenceDate) + 1;
  return `${description} (${currentInstallment}/${totalInstallments})`;
}

/**
 * Motor central de cálculo do ciclo
 */
export function generateMonthForecast({
  year,
  month,
  initialBalance,
  movements = [],
  variableExpenses = [],
  cards = [],
  cardClosings = [],
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
    const isVerified = verifiedDays.some(d => d.data === dateStr);

    // Entradas do Dia
    const incomes = movements
      .filter(m => m.tipo === 'income' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'income', dateStr));
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

    // Saídas Fixas do Dia
    const expensesFixed = movements
      .filter(m => m.tipo === 'expense' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'expense', dateStr));

    // Faturas de Cartão (Dinâmico)
    const expensesCards = [];
    cards.forEach(c => {
      // Fechamento real de cartão não é fixo todo mês (varia por fim de
      // semana/feriado/decisão do banco) — resolve a data deste mês
      // considerando uma eventual correção salva em cardClosings, caindo no
      // dia padrão do cartão (dia_fechamento) quando não há correção.
      const { closingDate: closeCurrent, mesReferencia } = resolveCardClosing(c, cardClosings, currYear, currMonth);

      // Se a fatura desse cartão fecha neste exato dia (já considerando a
      // correção, se houver)...
      if (closeCurrent.getTime() === currentLoopDate.getTime()) {
        const prevMonthRef = new Date(currYear, currMonth - 1, 1);
        const { closingDate: closePrev } = resolveCardClosing(c, cardClosings, prevMonthRef.getFullYear(), prevMonthRef.getMonth());

        // Compra avulsa: casa pelo mês de fatura escolhido explicitamente no
        // lançamento (fatura_ano_mes), não por estar dentro de uma janela de
        // datas — assim ela sempre aponta pra fatura certa mesmo que o
        // fechamento desse mês seja corrigido depois, e o usuário consegue
        // mover uma compra pra outra fatura editando-a diretamente.
        const singleTransactions = movements.filter(m =>
          m.tipo === 'card' && m.frequencia === 'none' && m.cartao_id === c.id && m.fatura_ano_mes === mesReferencia
        );

        // 2) Procurar parcelamentos e assinaturas ativas para ESTE cartão cuja
        // cobrança cai em ALGUM dia dentro da janela desta fatura — o dia de
        // cobrança de uma assinatura (ex: dia 21) não precisa coincidir com o
        // dia de fechamento do cartão (ex: dia 23). Antes isso só casava
        // quando os dois dias eram iguais, então uma assinatura cobrando em
        // dia diferente do fechamento nunca entrava em fatura nenhuma.
        const installmentsForThisCard = [];
        movements.forEach(cb => {
          if (cb.tipo !== 'card' || cb.frequencia === 'none' || cb.cartao_id !== c.id) return;

          let chargeDate = null;
          for (let d = new Date(closePrev); d < closeCurrent; d.setDate(d.getDate() + 1)) {
            if (matchesRecurrence(cb, d)) { chargeDate = new Date(d); break; }
          }
          if (!chargeDate) return;

          installmentsForThisCard.push({
            ...cb,
            description: describeCardOccurrence(cb, chargeDate),
            amount: Number(cb.valor),
            type: 'card_installment',
            // Dia real da cobrança (não o dia de fechamento) — pra exibir
            // corretamente no detalhamento da fatura.
            date: `${chargeDate.getFullYear()}-${String(chargeDate.getMonth() + 1).padStart(2, '0')}-${String(chargeDate.getDate()).padStart(2, '0')}`
          });
        });

        const invoiceTransactions = [
          // Data da própria compra (não o dia de fechamento da fatura) —
          // era usado dateStr do dia externo do loop aqui, que é sempre o
          // dia de fechamento, fazendo todo item avulso da fatura mostrar a
          // mesma data errada no detalhamento.
          ...singleTransactions.map(m => toOccurrence(m, 'card', m.data_inicio)),
          ...installmentsForThisCard,
        ];

        // Procurar pagamentos antecipados que referenciam ESTE ciclo — mesmo
        // casamento explícito por mês de fatura que a compra avulsa usa.
        const earlyPaymentsForThisInvoice = movements.filter(m =>
          m.tipo === 'invoice_payment' && m.cartao_id === c.id && m.fatura_ano_mes === mesReferencia
        );

        const cardTotal = invoiceTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const alreadyPaid = earlyPaymentsForThisInvoice.reduce((sum, t) => sum + Number(t.valor), 0);
        const remainingToPay = cardTotal - alreadyPaid;

        if (cardTotal > 0) { // Mostrar a fatura mesmo se estiver paga, apenas alterando o amount final e details
          expensesCards.push({
            id: `card-bill-${c.id}-${dateStr}`,
            card_id: c.id,
            description: `Fatura ${c.nome}`,
            amount: remainingToPay > 0 ? remainingToPay : 0,
            originalTotal: cardTotal,
            alreadyPaid: alreadyPaid,
            mes_referencia: mesReferencia, // pra InvoiceDetailsModal marcar o pagamento antecipado no mês certo
            data_fechamento: dateStr, // data de fechamento já resolvida (com correção, se houver) — pra exibir/editar
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

    // Gastos reais avulsos (Pingos Diários deste dia) — frequencia 'none' já
    // casa só na data exata via matchesRecurrence, então cobre avulso puro.
    const dailyTxnsReal = movements
      .filter(m => m.tipo === 'daily' && m.frequencia === 'none' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'daily', dateStr));
    const totalRealDaily = dailyTxnsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Compras avulsas no cartão E assinaturas/parcelas recorrentes no seu
    // próprio dia de cobrança (ex: assinatura que cobra todo dia 21, mesmo
    // com o cartão fechando dia 23) — aparecem aqui além de entrarem
    // agregadas na fatura no fechamento, mesma lógica de dupla exibição que
    // uma compra avulsa já tinha.
    const cardTxnsReal = movements
      .filter(m => m.tipo === 'card' && matchesRecurrence(m, currentLoopDate))
      .map(m => ({ ...toOccurrence(m, 'card', dateStr), description: describeCardOccurrence(m, currentLoopDate) }));
    const totalRealCardDaily = cardTxnsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Pagamentos antecipados de fatura (registrados via InvoiceDetailsModal)
    // — precisam descontar do saldo no dia em que o pagamento de verdade
    // aconteceu. Sem isso, o valor só reduzia o quanto aparecia na fatura no
    // dia do fechamento (via alreadyPaid) mas nunca era descontado em lugar
    // nenhum do saldo — o dinheiro simplesmente sumia da conta.
    const invoicePaymentsReal = movements
      .filter(m => m.tipo === 'invoice_payment' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'invoice_payment', dateStr));
    const totalInvoicePayments = invoicePaymentsReal.reduce((sum, t) => sum + Number(t.amount), 0);

    // Economias (Retiradas para investimento) avulsas
    const savingTxns = movements
      .filter(m => m.tipo === 'saving' && m.frequencia === 'none' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'saving', dateStr));
    const totalSavings = savingTxns.reduce((sum, t) => sum + Number(t.amount), 0);

    // Diário/Economia recorrentes (templates) — tratados como certos, igual
    // saída fixa: somam sempre, independente de passado/futuro. Não entram
    // na troca previsão-vs-real do orçamento variável abaixo.
    const recurringDaily = movements
      .filter(m => m.tipo === 'daily' && m.frequencia !== 'none' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'recurring_daily', dateStr));
    const totalRecurringDaily = recurringDaily.reduce((sum, e) => sum + e.amount, 0);

    const recurringSavings = movements
      .filter(m => m.tipo === 'saving' && m.frequencia !== 'none' && matchesRecurrence(m, currentLoopDate))
      .map(m => toOccurrence(m, 'recurring_saving', dateStr));
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

    balance = balance + totalIncome - totalExpense - dailyValue - totalSavingsAll - totalInvoicePayments;

    // União dos avulsos deste dia exato (usada por DayDetailsModal, que
    // re-filtra por .type internamente) — equivalente ao antigo
    // `transactions.filter(t => t.date === dateStr)`.
    const dayTransactions = [...dailyTxnsReal, ...cardTxnsReal, ...savingTxns, ...invoicePaymentsReal];

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
      totalInvoicePayments,        // Pagamentos antecipados de fatura descontados neste dia
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
    // Expenses (só Fixed) — a "Fatura X" (type==='card') é só a SOMA exibida
    // na tela pra aquele dia de fechamento; os lançamentos que a compõem já
    // entram individualmente logo abaixo (compra avulsa e cobrança de
    // assinatura/parcela no próprio dia). Incluir a fatura agregada aqui
    // TAMBÉM contaria a mesma compra duas vezes nos totais de Totais/Análises.
    d.expenses.forEach(e => { if (e.type !== 'card') logs.push({ ...e, logDate: d.dateStr, group: 'fixed' }); });
    // Transactions (Daily + Card + Savings) — bug pré-existente: compras de
    // cartão dentro de `transactions` caíam todas em "daily" por não terem
    // um branch próprio aqui, sumindo da aba/categoria "Cartão" em Totais e
    // Análises mesmo aparecendo certo na célula do dia. Pagamento de fatura
    // (invoice_payment) fica de fora dos logs: é só o registro de QUANDO o
    // dinheiro saiu da conta pra pagar o cartão (já descontado do saldo),
    // não uma categoria de gasto — a compra em si já é contada aqui como
    // "card" no dia em que foi feita; contar o pagamento também duplicaria.
    d.transactions
      .filter(t => t.type !== 'invoice_payment')
      .forEach(t => logs.push({ ...t, logDate: d.dateStr, group: t.type === 'saving' ? 'saving' : t.type === 'card' ? 'card' : 'daily' }));
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
 * movimentações avulsas/recorrentes de diário/economia/cartão carregam
 * tag_ids; entradas/saídas fixas e faturas agregadas também podem ter tag.
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
 * e devolve o saldo acumulado no início desse mês. `saldo_inicial` no perfil
 * representa o saldo em janeiro de `referenceYear` — todo saldo de qualquer
 * mês futuro é derivado simulando para frente a partir dali (não há snapshot
 * histórico armazenado). Único lugar com essa lógica; usado tanto pelo
 * FinanceContext quanto pelas tools do assistente para não divergir.
 */
export function getBalanceAtMonthStart({
  year,
  month,
  referenceYear,
  initialBalance,
  movements = [],
  variableExpenses = [],
  cards = [],
  cardClosings = [],
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
      movements,
      variableExpenses,
      cards,
      cardClosings,
      verifiedDays,
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
