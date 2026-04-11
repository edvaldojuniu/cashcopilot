'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { generateMonthForecast, calculateMonthlySummary } from '@/lib/engine';
import QuickAddModal from '@/components/QuickAddModal/QuickAddModal';

const FinanceContext = createContext({});

// --- Cache helpers ---
const CACHE_VERSION = 'v1';
const getCacheKey = (userId) => `cc_finance_${userId}_${CACHE_VERSION}`;

function saveToCache(userId, data) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(data));
  } catch (e) { }
}

function loadFromCache(userId) {
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearCache(userId) {
  try {
    localStorage.removeItem(getCacheKey(userId));
  } catch (e) { }
}

export function FinanceProvider({ children }) {
  const { user, profile, loading: authLoading } = useAuth();

  const [incomeEntries, setIncomeEntries] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardBills, setCardBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [verifiedDays, setVerifiedDays] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isQuickAddOpen, setQuickAddOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  function applyData(data) {
    setIncomeEntries(data.incomeEntries || []);
    setFixedExpenses(data.fixedExpenses || []);
    setVariableExpenses(data.variableExpenses || []);
    setCards(data.cards || []);
    setTransactions(data.transactions || []);
    setVerifiedDays(data.verifiedDays || []);
    setCardBills(data.cardBills || []);
  }

  function resetState() {
    setIncomeEntries([]);
    setFixedExpenses([]);
    setVariableExpenses([]);
    setCards([]);
    setCardBills([]);
    setTransactions([]);
    setVerifiedDays([]);
    setLoading(false);
  }

  // Busca dados do banco.
  // silent=true → atualiza estado sem mostrar loading (background refresh)
  // silent=false → mostra loading (primeira vez sem cache)
  const fetchAllData = useCallback(async ({ silent = false } = {}) => {
    if (!supabase || !user) return;
    if (!silent) setLoading(true);

    try {
      const results = await Promise.allSettled([
        supabase.from('income_entries').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('fixed_expenses').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('variable_expenses').select('*').eq('user_id', user.id).order('description'),
        supabase.from('cards').select('*').eq('user_id', user.id).order('name'),
        supabase.from('daily_transactions').select('*').eq('user_id', user.id).order('date'),
        supabase.from('verified_days').select('*').eq('user_id', user.id),
        supabase.from('credit_card_bills').select('*').eq('user_id', user.id).order('due_day'),
      ]);

      const extract = (i) => {
        const r = results[i];
        if (r.status === 'fulfilled' && !r.value.error) return r.value.data || [];
        return [];
      };

      const freshData = {
        incomeEntries: extract(0),
        fixedExpenses: extract(1),
        variableExpenses: extract(2),
        cards: extract(3),
        transactions: extract(4),
        verifiedDays: extract(5),
        cardBills: extract(6),
      };

      applyData(freshData);
      saveToCache(user.id, freshData); // ← persiste para próxima abertura
    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  // Ao logar ou trocar de usuário:
  // 1. Carrega cache instantaneamente (sem loading se tiver cache)
  // 2. Busca dados frescos em background silenciosamente
  useEffect(() => {
    if (authLoading) return; // ← aguarda o Supabase resolver a sessão

    if (!user || !supabase) {
      resetState();
      return;
    }

    const cached = loadFromCache(user.id);
    if (cached) {
      applyData(cached);
      setLoading(false);
      fetchAllData({ silent: true });
    } else {
      fetchAllData({ silent: false });
    }
  }, [user, authLoading, fetchAllData]);

  // SEM listeners de visibilitychange ou focus
  // Trocar de aba não faz nada — mostra o que está na memória

  // Auto-salva cache sempre que dados mudam (por CRUD)
  useEffect(() => {
    if (!user || loading || authLoading) return; // ← adiciona authLoading
    saveToCache(user.id, {
      incomeEntries, fixedExpenses, variableExpenses,
      cards, transactions, verifiedDays, cardBills,
    });
  }, [incomeEntries, fixedExpenses, variableExpenses, cards, transactions, verifiedDays, cardBills]);
  // --- CRUD Operations ---

  async function addIncomeEntry(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('income_entries').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setIncomeEntries((prev) => [...prev, data].sort((a, b) => a.due_day - b.due_day));
    return { data, error };
  }

  async function updateIncomeEntry(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('income_entries').update(updates).eq('id', id).select().single();
    if (!error) setIncomeEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteIncomeEntry(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('income_entries').delete().eq('id', id);
    if (!error) setIncomeEntries((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function addFixedExpense(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('fixed_expenses').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setFixedExpenses((prev) => [...prev, data].sort((a, b) => a.due_day - b.due_day));
    return { data, error };
  }

  async function updateFixedExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('fixed_expenses').update(updates).eq('id', id).select().single();
    if (!error) setFixedExpenses((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteFixedExpense(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('fixed_expenses').delete().eq('id', id);
    if (!error) setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function addVariableExpense(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('variable_expenses').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setVariableExpenses((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateVariableExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('variable_expenses').update(updates).eq('id', id).select().single();
    if (!error) setVariableExpenses((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteVariableExpense(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('variable_expenses').delete().eq('id', id);
    if (!error) setVariableExpenses((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function addCard(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('cards').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setCards((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateCard(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('cards').update(updates).eq('id', id).select().single();
    if (!error) setCards((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteCard(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (!error) setCards((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function addCardBill(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('credit_card_bills').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setCardBills((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateCardBill(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('credit_card_bills').update(updates).eq('id', id).select().single();
    if (!error) setCardBills((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteCardBill(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('credit_card_bills').delete().eq('id', id);
    if (!error) setCardBills((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function addTransaction(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.from('daily_transactions').insert({ ...entry, user_id: user.id }).select().single();
    if (!error) setTransactions((prev) => [...prev, data]);
    return { data, error };
  }

  async function deleteTransaction(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('daily_transactions').delete().eq('id', id);
    if (!error) setTransactions((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }

  async function toggleVerifiedDay(dateStr) {
    if (!supabase) return { error: 'Not configured' };
    const existing = verifiedDays.find((d) => d.date === dateStr);
    if (existing) {
      const { error } = await supabase.from('verified_days').delete().eq('id', existing.id);
      if (!error) setVerifiedDays((prev) => prev.filter((d) => d.id !== existing.id));
      return { error, newState: false };
    } else {
      const { data, error } = await supabase.from('verified_days').insert({ date: dateStr, user_id: user.id }).select().single();
      if (!error) setVerifiedDays((prev) => [...prev, data]);
      return { data, error, newState: true };
    }
  }

  // --- Forecast ---

  const getMonthForecast = useCallback(
    (year, month) => {
      if (!profile) return { forecast: [], summary: {} };
      const startYear = new Date().getFullYear();
      let balance = Number(profile.initial_balance || 0);
      const targetMonthIndex = (year - startYear) * 12 + month;

      for (let i = 0; i < targetMonthIndex; i++) {
        let m = i % 12, y = startYear + Math.floor(i / 12);
        const monthTxns = transactions.filter((t) => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === m; });
        const forecast = generateMonthForecast({ year: y, month: m, initialBalance: balance, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions: monthTxns, showDailyForecast: profile.show_daily_forecast !== false, cycleStartDay: profile.cycle_start_day || 1 });
        balance = forecast[forecast.length - 1]?.balance || 0;
      }

      const monthTxns = transactions.filter((t) => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month; });
      const forecast = generateMonthForecast({ year, month, initialBalance: balance, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions: monthTxns, showDailyForecast: profile.show_daily_forecast !== false, cycleStartDay: profile.cycle_start_day || 1 });
      return { forecast, summary: calculateMonthlySummary(forecast), initialBalance: balance };
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  const getMultiMonthForecastFn = useCallback(
    (startYear, startMonth, numMonths = 6) => {
      if (!profile) return [];
      const startOfHistoryYear = new Date().getFullYear();
      let balance = Number(profile.initial_balance || 0);
      const targetMonthIndex = (startYear - startOfHistoryYear) * 12 + startMonth;

      for (let i = 0; i < targetMonthIndex; i++) {
        let m = i % 12, y = startOfHistoryYear + Math.floor(i / 12);
        const monthTxns = transactions.filter((t) => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === m; });
        const forecast = generateMonthForecast({ year: y, month: m, initialBalance: balance, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions: monthTxns, showDailyForecast: profile.show_daily_forecast !== false, cycleStartDay: profile.cycle_start_day || 1 });
        balance = forecast[forecast.length - 1]?.balance || 0;
      }

      const allMonths = [];
      let currentBalance = balance;
      for (let i = 0; i < numMonths; i++) {
        let m = (startMonth + i) % 12, y = startYear + Math.floor((startMonth + i) / 12);
        const monthTxns = transactions.filter((t) => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === m; });
        const forecast = generateMonthForecast({ year: y, month: m, initialBalance: currentBalance, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions: monthTxns, showDailyForecast: profile.show_daily_forecast !== false, cycleStartDay: profile.cycle_start_day || 1 });
        allMonths.push({ year: y, month: m, forecast, summary: calculateMonthlySummary(forecast), initialBalance: currentBalance });
        currentBalance = forecast[forecast.length - 1]?.balance || 0;
      }
      return allMonths;
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  // --- Navigation ---
  function goToNextMonth() { viewMonth === 11 ? (setViewMonth(0), setViewYear((y) => y + 1)) : setViewMonth((m) => m + 1); }
  function goToPrevMonth() { viewMonth === 0 ? (setViewMonth(11), setViewYear((y) => y - 1)) : setViewMonth((m) => m - 1); }
  function goToCurrentMonth() { setViewMonth(new Date().getMonth()); setViewYear(new Date().getFullYear()); }

  async function refetchVariableExpenses() {
    if (!supabase) return;
    const { data } = await supabase.from('variable_expenses').select('*').eq('user_id', user.id);
    if (data) setVariableExpenses(data);
  }

  const value = {
    incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, transactions, verifiedDays, loading,
    addIncomeEntry, updateIncomeEntry, deleteIncomeEntry,
    addFixedExpense, updateFixedExpense, deleteFixedExpense,
    addVariableExpense, updateVariableExpense, deleteVariableExpense,
    addCard, updateCard, deleteCard,
    addCardBill, updateCardBill, deleteCardBill,
    addTransaction, deleteTransaction,
    toggleVerifiedDay,
    getMonthForecast,
    getMultiMonthForecast: getMultiMonthForecastFn,
    isQuickAddOpen, setQuickAddOpen,
    viewMonth, viewYear, setViewMonth, setViewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    refetchVariableExpenses,
    refetch: () => fetchAllData({ silent: false }), // força reload com loading
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
      <QuickAddModal isOpen={isQuickAddOpen} onClose={() => setQuickAddOpen(false)} initialType="diario" />
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within a FinanceProvider');
  return context;
}