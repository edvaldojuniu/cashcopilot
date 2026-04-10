'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { generateMonthForecast, calculateMonthlySummary } from '@/lib/engine';
import QuickAddModal from '@/components/QuickAddModal/QuickAddModal';

const FinanceContext = createContext({});

export function FinanceProvider({ children }) {
  const { user, profile } = useAuth();

  const [incomeEntries, setIncomeEntries] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardBills, setCardBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [verifiedDays, setVerifiedDays] = useState([]);
  const [loading, setLoading] = useState(true);

  // Global UI State
  const [isQuickAddOpen, setQuickAddOpen] = useState(false);

  // Current view state
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

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

  const fetchAllData = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);

    const fallbackTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    try {
      const queries = [
        supabase.from('income_entries').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('fixed_expenses').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('variable_expenses').select('*').eq('user_id', user.id).order('description'),
        supabase.from('cards').select('*').eq('user_id', user.id).order('name'),
        supabase.from('daily_transactions').select('*').eq('user_id', user.id).order('date'),
        supabase.from('verified_days').select('*').eq('user_id', user.id),
        supabase.from('credit_card_bills').select('*').eq('user_id', user.id).order('due_day')
      ];

      const results = await Promise.allSettled(queries);

      const extract = (index) => {
        const res = results[index];
        if (res.status === 'fulfilled' && !res.value.error) return res.value.data || [];
        if (res.status === 'fulfilled' && res.value.error) {
          console.warn(`Query ${index} failed:`, res.value.error.message);
        }
        return [];
      };

      setIncomeEntries(extract(0));
      setFixedExpenses(extract(1));
      setVariableExpenses(extract(2));
      setCards(extract(3));
      setTransactions(extract(4));
      setVerifiedDays(extract(5));
      setCardBills(extract(6));
    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      setLoading(false);
      clearTimeout(fallbackTimeout);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when user changes
  useEffect(() => {
    if (user && supabase) {
      fetchAllData();
    } else {
      resetState();
    }
  }, [user, fetchAllData]);

  // Refetch when app becomes visible/focused
  useEffect(() => {
    if (!user || !supabase) return;

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') fetchAllData();
    }
    function handleFocus() {
      fetchAllData();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, fetchAllData]);

  // --- CRUD Operations ---

  async function addIncomeEntry(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('income_entries')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setIncomeEntries((prev) => [...prev, data].sort((a, b) => a.due_day - b.due_day));
    return { data, error };
  }

  async function updateIncomeEntry(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('income_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
    const { data, error } = await supabase
      .from('fixed_expenses')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setFixedExpenses((prev) => [...prev, data].sort((a, b) => a.due_day - b.due_day));
    return { data, error };
  }

  async function updateFixedExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('fixed_expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
    const { data, error } = await supabase
      .from('variable_expenses')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setVariableExpenses((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateVariableExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('variable_expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
    const { data, error } = await supabase
      .from('cards')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setCards((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateCard(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('cards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
    const { data, error } = await supabase
      .from('credit_card_bills')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setCardBills((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateCardBill(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('credit_card_bills')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
    const { data, error } = await supabase
      .from('daily_transactions')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
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

    const existing = verifiedDays.find(d => d.date === dateStr);

    if (existing) {
      const { error } = await supabase.from('verified_days').delete().eq('id', existing.id);
      if (!error) setVerifiedDays(prev => prev.filter(d => d.id !== existing.id));
      return { error, newState: false };
    } else {
      const { data, error } = await supabase
        .from('verified_days')
        .insert({ date: dateStr, user_id: user.id })
        .select()
        .single();
      if (!error) setVerifiedDays(prev => [...prev, data]);
      return { data, error, newState: true };
    }
  }

  // --- Forecast Calculation ---

  const getMonthForecast = useCallback(
    (year, month) => {
      if (!profile) return { forecast: [], summary: {} };

      const startYear = new Date().getFullYear();
      const startMonth = 0;
      let balance = Number(profile.initial_balance || 0);

      const targetMonthIndex = (year - startYear) * 12 + month;

      for (let i = 0; i < targetMonthIndex; i++) {
        let m = startMonth + i;
        let y = startYear + Math.floor(m / 12);
        m = m % 12;

        const monthTxns = transactions.filter((t) => {
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
          cards,
          cardBills,
          verifiedDays,
          transactions: monthTxns,
          showDailyForecast: profile.show_daily_forecast !== false,
          cycleStartDay: profile.cycle_start_day || 1,
        });

        balance = forecast[forecast.length - 1]?.balance || 0;
      }

      const monthTxns = transactions.filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });

      const forecast = generateMonthForecast({
        year,
        month,
        initialBalance: balance,
        incomeEntries,
        fixedExpenses,
        variableExpenses,
        cards,
        cardBills,
        verifiedDays,
        transactions: monthTxns,
        showDailyForecast: profile.show_daily_forecast !== false,
        cycleStartDay: profile.cycle_start_day || 1,
      });

      const summary = calculateMonthlySummary(forecast);

      return { forecast, summary, initialBalance: balance };
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  const getMultiMonthForecastFn = useCallback(
    (startYear, startMonth, numMonths = 6) => {
      // Find initial balance exactly like getMonthForecast
      if (!profile) return [];

      const startOfHistoryYear = new Date().getFullYear();
      let balance = Number(profile.initial_balance || 0);
      const targetMonthIndex = (startYear - startOfHistoryYear) * 12 + startMonth;

      for (let i = 0; i < targetMonthIndex; i++) {
        let m = i % 12;
        let y = startOfHistoryYear + Math.floor(i / 12);

        const monthTxns = transactions.filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });

        const forecast = generateMonthForecast({
          year: y, month: m, initialBalance: balance,
          incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays,
          transactions: monthTxns,
          showDailyForecast: profile.show_daily_forecast !== false,
          cycleStartDay: profile.cycle_start_day || 1,
        });

        balance = forecast[forecast.length - 1]?.balance || 0;
      }

      // Now generate N months forward
      const allMonths = [];
      let currentBalance = balance;
      for (let i = 0; i < numMonths; i++) {
        let m = (startMonth + i) % 12;
        let y = startYear + Math.floor((startMonth + i) / 12);

        const monthTxns = transactions.filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });

        const forecast = generateMonthForecast({
          year: y, month: m, initialBalance: currentBalance,
          incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays,
          transactions: monthTxns,
          showDailyForecast: profile.show_daily_forecast !== false,
          cycleStartDay: profile.cycle_start_day || 1,
        });

        const summary = calculateMonthlySummary(forecast);

        allMonths.push({
          year: y, month: m, forecast, summary, initialBalance: currentBalance
        });

        currentBalance = forecast[forecast.length - 1]?.balance || 0;
      }

      return allMonths;
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  // Navigation
  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToCurrentMonth() {
    setViewMonth(new Date().getMonth());
    setViewYear(new Date().getFullYear());
  }

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
    addCard, deleteCard,
    addCardBill, updateCardBill, deleteCardBill,
    addTransaction, deleteTransaction,
    toggleVerifiedDay,
    getMonthForecast,
    getMultiMonthForecast: getMultiMonthForecastFn,
    isQuickAddOpen, setQuickAddOpen,
    viewMonth, viewYear,
    setViewMonth, setViewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    refetchVariableExpenses,
    refetch: fetchAllData,
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialType="diario"
      />
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
