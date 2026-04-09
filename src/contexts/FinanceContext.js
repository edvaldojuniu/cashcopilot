'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { generateMonthForecast, calculateMonthlySummary } from '@/lib/engine';

const FinanceContext = createContext({});

export function FinanceProvider({ children }) {
  const { user, profile } = useAuth();

  const [incomeEntries, setIncomeEntries] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cardBills, setCardBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Current view state
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  // Fetch all data when user is available
  useEffect(() => {
    if (user && supabase) {
      fetchAllData();
    } else {
      resetState();
    }
  }, [user]);

  function resetState() {
    setIncomeEntries([]);
    setFixedExpenses([]);
    setVariableExpenses([]);
    setCardBills([]);
    setTransactions([]);
    setLoading(false);
  }

  async function fetchAllData() {
    if (!supabase || !user) return;
    setLoading(true);
    let isMounted = true;
    
    // Safety timeout: 8 seconds maximum
    const fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        console.error("Timeout do banco de dados excedido (8s)");
        setLoading(false);
      }
    }, 8000);

    try {
      const [incomes, fixed, variable, cards, txns] = await Promise.all([
        supabase.from('income_entries').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('fixed_expenses').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('variable_expenses').select('*').eq('user_id', user.id).order('description'),
        supabase.from('credit_card_bills').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('daily_transactions').select('*').eq('user_id', user.id).order('date'),
      ]);

      if (isMounted) {
        setIncomeEntries(incomes.data || []);
        setFixedExpenses(fixed.data || []);
        setVariableExpenses(variable.data || []);
        setCardBills(cards.data || []);
        setTransactions(txns.data || []);
      }
    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      if (isMounted) {
        setLoading(false);
        clearTimeout(fallbackTimeout);
      }
    }
  }

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
          cardBills,
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
        cardBills,
        transactions: monthTxns,
        showDailyForecast: profile.show_daily_forecast !== false,
        cycleStartDay: profile.cycle_start_day || 1,
      });

      const summary = calculateMonthlySummary(forecast);

      return { forecast, summary, initialBalance: balance };
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cardBills, transactions]
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

  const value = {
    incomeEntries,
    fixedExpenses,
    variableExpenses,
    cardBills,
    transactions,
    loading,
    addIncomeEntry, updateIncomeEntry, deleteIncomeEntry,
    addFixedExpense, updateFixedExpense, deleteFixedExpense,
    addVariableExpense, updateVariableExpense, deleteVariableExpense,
    addCardBill, updateCardBill, deleteCardBill,
    addTransaction, deleteTransaction,
    getMonthForecast,
    viewMonth, viewYear,
    setViewMonth, setViewYear,
    goToNextMonth, goToPrevMonth, goToCurrentMonth,
    refreshData: fetchAllData,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
