'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import {
  generateMonthForecast,
  calculateMonthlySummary,
} from '@/lib/engine';
import QuickAddModal from '@/components/QuickAddModal/QuickAddModal';

const FinanceContext = createContext({});

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v1';
const getCacheKey = (userId) => `cc_finance_${userId}_${CACHE_VERSION}`;

function saveToCache(userId, data) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(data));
  } catch (_) { }
}

function loadFromCache(userId) {
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearCache(userId) {
  try {
    localStorage.removeItem(getCacheKey(userId));
  } catch (_) { }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FinanceProvider({ children }) {
  const { user, profile, loading: authLoading } = useAuth();

  const [incomeEntries, setIncomeEntries] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardBills, setCardBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [verifiedDays, setVerifiedDays] = useState([]);

  // loading starts false — AuthContext already handles the global loading gate.
  // FinanceContext only shows its own loading spinner while actively fetching
  // with no cache available.
  const [loading, setLoading] = useState(false);

  const [isQuickAddOpen, setQuickAddOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  // Guards against concurrent fetches triggered by rapid re-renders.
  const isFetchingRef = useRef(false);
  // Track which user's data is currently loaded so we can detect user changes.
  const loadedUserIdRef = useRef(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function applyData(data) {
    setIncomeEntries(data.incomeEntries ?? []);
    setFixedExpenses(data.fixedExpenses ?? []);
    setVariableExpenses(data.variableExpenses ?? []);
    setCards(data.cards ?? []);
    setTransactions(data.transactions ?? []);
    setVerifiedDays(data.verifiedDays ?? []);
    setCardBills(data.cardBills ?? []);
  }

  function clearData() {
    setIncomeEntries([]);
    setFixedExpenses([]);
    setVariableExpenses([]);
    setCards([]);
    setCardBills([]);
    setTransactions([]);
    setVerifiedDays([]);
    setLoading(false);
    isFetchingRef.current = false;
    loadedUserIdRef.current = null;
  }

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchAllData = useCallback(
    async ({ silent = false } = {}) => {
      if (!supabase || !user) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (!silent) setLoading(true);

      // Hard timeout so a stalled fetch never leaves the UI stuck.
      const fallback = setTimeout(() => {
        console.warn('[Finance] fetchAllData timeout');
        isFetchingRef.current = false;
        setLoading(false);
      }, 8000);

      try {
        // Verify the session is still alive before hitting the DB.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          console.warn('[Finance] No active session — aborting fetch');
          return;
        }

        const results = await Promise.allSettled([
          supabase
            .from('income_entries')
            .select('*')
            .eq('user_id', user.id)
            .order('due_day'),
          supabase
            .from('fixed_expenses')
            .select('*')
            .eq('user_id', user.id)
            .order('due_day'),
          supabase
            .from('variable_expenses')
            .select('*')
            .eq('user_id', user.id)
            .order('description'),
          supabase
            .from('cards')
            .select('*')
            .eq('user_id', user.id)
            .order('name'),
          supabase
            .from('daily_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date'),
          supabase
            .from('verified_days')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('credit_card_bills')
            .select('*')
            .eq('user_id', user.id)
            .order('due_day'),
        ]);

        const extract = (i) => {
          const r = results[i];
          return r.status === 'fulfilled' && !r.value.error
            ? r.value.data ?? []
            : [];
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
        saveToCache(user.id, freshData);
        loadedUserIdRef.current = user.id;
      } catch (err) {
        console.error('[Finance] fetchAllData error:', err);
      } finally {
        clearTimeout(fallback);
        isFetchingRef.current = false;
        setLoading(false);
      }
    },
    [user]
  );

  // ─── Bootstrap effect ─────────────────────────────────────────────────────
  // Runs when auth resolves. Strategy:
  //   • If we already have data for this user in state — do nothing extra
  //     (CRUD mutations keep state fresh in real-time).
  //   • If the cache exists — paint it immediately (zero latency), then
  //     silently refetch in the background to catch any server-side changes.
  //   • If no cache — show loading and fetch fresh.
  //   • If user logs out — wipe state immediately (no delay).

  useEffect(() => {
    // Wait until AuthContext has finished resolving the session.
    if (authLoading) return;

    if (!user) {
      // User signed out or no session — clear everything immediately.
      clearData();
      return;
    }

    // If we already have fresh data for this user in memory, just do a
    // silent background refresh (catches server-side changes from other devices).
    if (loadedUserIdRef.current === user.id) {
      fetchAllData({ silent: true });
      return;
    }

    // New user or hard refresh — try the cache first.
    const cached = loadFromCache(user.id);
    if (cached) {
      // Show cached data instantly, then reconcile with server in background.
      applyData(cached);
      loadedUserIdRef.current = user.id;
      setLoading(false);
      fetchAllData({ silent: true });
    } else {
      // No cache — full blocking fetch.
      fetchAllData({ silent: false });
    }
  }, [user, authLoading]); // intentionally NOT including fetchAllData to avoid loops

  // ─── Persist cache whenever state changes ─────────────────────────────────

  useEffect(() => {
    if (!user || loading || authLoading) return;

    // Don't overwrite a warm cache with an empty slate (e.g. during logout).
    const hasAnyData =
      incomeEntries.length > 0 ||
      fixedExpenses.length > 0 ||
      variableExpenses.length > 0 ||
      cards.length > 0 ||
      transactions.length > 0 ||
      verifiedDays.length > 0 ||
      cardBills.length > 0;

    if (!hasAnyData) return;

    saveToCache(user.id, {
      incomeEntries,
      fixedExpenses,
      variableExpenses,
      cards,
      transactions,
      verifiedDays,
      cardBills,
    });
  }, [
    incomeEntries,
    fixedExpenses,
    variableExpenses,
    cards,
    transactions,
    verifiedDays,
    cardBills,
  ]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async function addIncomeEntry(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('income_entries')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error)
      setIncomeEntries((p) =>
        [...p, data].sort((a, b) => a.due_day - b.due_day)
      );
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
    if (!error) setIncomeEntries((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteIncomeEntry(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('income_entries')
      .delete()
      .eq('id', id);
    if (!error) setIncomeEntries((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addFixedExpense(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('fixed_expenses')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error)
      setFixedExpenses((p) =>
        [...p, data].sort((a, b) => a.due_day - b.due_day)
      );
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
    if (!error) setFixedExpenses((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteFixedExpense(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('fixed_expenses')
      .delete()
      .eq('id', id);
    if (!error) setFixedExpenses((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addVariableExpense(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('variable_expenses')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setVariableExpenses((p) => [...p, data]);
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
    if (!error)
      setVariableExpenses((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteVariableExpense(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('variable_expenses')
      .delete()
      .eq('id', id);
    if (!error) setVariableExpenses((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addCard(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('cards')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setCards((p) => [...p, data]);
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
    if (!error) setCards((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteCard(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (!error) setCards((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addCardBill(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('credit_card_bills')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setCardBills((p) => [...p, data]);
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
    if (!error) setCardBills((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteCardBill(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('credit_card_bills')
      .delete()
      .eq('id', id);
    if (!error) setCardBills((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addTransaction(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('daily_transactions')
      .insert({ ...entry, user_id: user.id })
      .select()
      .single();
    if (!error) setTransactions((p) => [...p, data]);
    return { data, error };
  }

  async function deleteTransaction(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('daily_transactions')
      .delete()
      .eq('id', id);
    if (!error) setTransactions((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function toggleVerifiedDay(dateStr) {
    if (!supabase) return { error: 'Not configured' };
    const existing = verifiedDays.find((d) => d.date === dateStr);
    if (existing) {
      const { error } = await supabase
        .from('verified_days')
        .delete()
        .eq('id', existing.id);
      if (!error)
        setVerifiedDays((p) => p.filter((d) => d.id !== existing.id));
      return { error, newState: false };
    } else {
      const { data, error } = await supabase
        .from('verified_days')
        .insert({ date: dateStr, user_id: user.id })
        .select()
        .single();
      if (!error) setVerifiedDays((p) => [...p, data]);
      return { data, error, newState: true };
    }
  }

  // ─── Forecast ─────────────────────────────────────────────────────────────

  const getMonthForecast = useCallback(
    (year, month) => {
      if (!profile) return { forecast: [], summary: {} };
      const startYear = new Date().getFullYear();
      let balance = Number(profile.initial_balance ?? 0);
      const targetIdx = (year - startYear) * 12 + month;
      for (let i = 0; i < targetIdx; i++) {
        const m = i % 12;
        const y = startYear + Math.floor(i / 12);
        const monthTxns = transactions.filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });
        const fc = generateMonthForecast({
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
          cycleStartDay: profile.cycle_start_day ?? 1,
        });
        balance = fc[fc.length - 1]?.balance ?? 0;
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
        cycleStartDay: profile.cycle_start_day ?? 1,
      });
      return { forecast, summary: calculateMonthlySummary(forecast), initialBalance: balance };
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  const getMultiMonthForecastFn = useCallback(
    (startYear, startMonth, numMonths = 6) => {
      if (!profile) return [];
      const startOfHistoryYear = new Date().getFullYear();
      let balance = Number(profile.initial_balance ?? 0);
      const targetIdx = (startYear - startOfHistoryYear) * 12 + startMonth;
      for (let i = 0; i < targetIdx; i++) {
        const m = i % 12;
        const y = startOfHistoryYear + Math.floor(i / 12);
        const monthTxns = transactions.filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });
        const fc = generateMonthForecast({
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
          cycleStartDay: profile.cycle_start_day ?? 1,
        });
        balance = fc[fc.length - 1]?.balance ?? 0;
      }
      let currentBalance = balance;
      return Array.from({ length: numMonths }, (_, i) => {
        const m = (startMonth + i) % 12;
        const y = startYear + Math.floor((startMonth + i) / 12);
        const monthTxns = transactions.filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });
        const forecast = generateMonthForecast({
          year: y,
          month: m,
          initialBalance: currentBalance,
          incomeEntries,
          fixedExpenses,
          variableExpenses,
          cards,
          cardBills,
          verifiedDays,
          transactions: monthTxns,
          showDailyForecast: profile.show_daily_forecast !== false,
          cycleStartDay: profile.cycle_start_day ?? 1,
        });
        const result = {
          year: y,
          month: m,
          forecast,
          summary: calculateMonthlySummary(forecast),
          initialBalance: currentBalance,
        };
        currentBalance = forecast[forecast.length - 1]?.balance ?? 0;
        return result;
      });
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, verifiedDays, transactions]
  );

  // ─── Navigation ───────────────────────────────────────────────────────────

  function goToNextMonth() {
    viewMonth === 11
      ? (setViewMonth(0), setViewYear((y) => y + 1))
      : setViewMonth((m) => m + 1);
  }
  function goToPrevMonth() {
    viewMonth === 0
      ? (setViewMonth(11), setViewYear((y) => y - 1))
      : setViewMonth((m) => m - 1);
  }
  function goToCurrentMonth() {
    setViewMonth(new Date().getMonth());
    setViewYear(new Date().getFullYear());
  }

  async function refetchVariableExpenses() {
    if (!supabase) return;
    const { data } = await supabase
      .from('variable_expenses')
      .select('*')
      .eq('user_id', user.id);
    if (data) setVariableExpenses(data);
  }

  // ─── Context value ────────────────────────────────────────────────────────

  const value = {
    incomeEntries,
    fixedExpenses,
    variableExpenses,
    cards,
    cardBills,
    transactions,
    verifiedDays,
    loading,
    addIncomeEntry,
    updateIncomeEntry,
    deleteIncomeEntry,
    addFixedExpense,
    updateFixedExpense,
    deleteFixedExpense,
    addVariableExpense,
    updateVariableExpense,
    deleteVariableExpense,
    addCard,
    updateCard,
    deleteCard,
    addCardBill,
    updateCardBill,
    deleteCardBill,
    addTransaction,
    deleteTransaction,
    toggleVerifiedDay,
    getMonthForecast,
    getMultiMonthForecast: getMultiMonthForecastFn,
    isQuickAddOpen,
    setQuickAddOpen,
    viewMonth,
    viewYear,
    setViewMonth,
    setViewYear,
    goToNextMonth,
    goToPrevMonth,
    goToCurrentMonth,
    refetchVariableExpenses,
    refetch: () => fetchAllData({ silent: false }),
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
  if (!context)
    throw new Error('useFinance must be used within a FinanceProvider');
  return context;
}