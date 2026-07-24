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
  getBalanceAtMonthStart,
} from '@/lib/engine';
import QuickAddModal from '@/components/QuickAddModal/QuickAddModal';

const FinanceContext = createContext({});

const EXCEPTION_TABLE_BY_TYPE = {
  income: 'income_entry_exceptions',
  expense: 'fixed_expense_exceptions',
  card_bill: 'card_bill_exceptions',
  recurring_daily: 'recurring_daily_entry_exceptions',
};

// ─── Cache helpers ────────────────────────────────────────────────────────────

const FOCUS_REFRESH_THROTTLE_MS = 20000;

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
  const { user, profile, loading: authLoading, sessionReady } = useAuth();

  const [incomeEntries, setIncomeEntries] = useState([]);
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardBills, setCardBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [verifiedDays, setVerifiedDays] = useState([]);
  const [tags, setTags] = useState([]);
  const [recurringDailyEntries, setRecurringDailyEntries] = useState([]);

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
  // Throttle guard for the focus/visibility-triggered refresh below.
  const lastFetchAtRef = useRef(0);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function applyData(data) {
    setIncomeEntries(data.incomeEntries ?? []);
    setFixedExpenses(data.fixedExpenses ?? []);
    setVariableExpenses(data.variableExpenses ?? []);
    setCards(data.cards ?? []);
    setTransactions(data.transactions ?? []);
    setVerifiedDays(data.verifiedDays ?? []);
    setCardBills(data.cardBills ?? []);
    setTags(data.tags ?? []);
    setRecurringDailyEntries(data.recurringDailyEntries ?? []);
  }

  function clearData() {
    setIncomeEntries([]);
    setFixedExpenses([]);
    setVariableExpenses([]);
    setCards([]);
    setCardBills([]);
    setTransactions([]);
    setVerifiedDays([]);
    setTags([]);
    setRecurringDailyEntries([]);
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
      lastFetchAtRef.current = Date.now();
      if (!silent) setLoading(true);

      // Hard timeout so a stalled fetch never leaves the UI stuck.
      const fallback = setTimeout(() => {
        console.warn('[Finance] fetchAllData timeout');
        isFetchingRef.current = false;
        setLoading(false);
      }, 8000);

      try {
        // NOTE: intentionally NOT calling getSession() here.
        // Calling it inside onAuthStateChange callbacks (or code triggered
        // by them) causes a deadlock in the Supabase JS client — the
        // getSession promise never resolves, which is what caused the 8s
        // timeout.  The user object from AuthContext already guarantees a
        // valid session; no extra check needed.

        const results = await Promise.allSettled([
          supabase
            .from('income_entries')
            .select('*, income_entry_tags(tag_id), income_entry_exceptions(exception_date)')
            .eq('user_id', user.id)
            .order('start_date'),
          supabase
            .from('fixed_expenses')
            .select('*, fixed_expense_tags(tag_id), fixed_expense_exceptions(exception_date)')
            .eq('user_id', user.id)
            .order('start_date'),
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
            .select('*, transaction_tags(tag_id)')
            .eq('user_id', user.id)
            .order('date'),
          supabase
            .from('verified_days')
            .select('*')
            .eq('user_id', user.id),
          supabase
            .from('credit_card_bills')
            .select('*, card_bill_tags(tag_id), card_bill_exceptions(exception_date)')
            .eq('user_id', user.id)
            .order('start_date'),
          supabase
            .from('tags')
            .select('*')
            .eq('user_id', user.id)
            .order('name'),
          supabase
            .from('recurring_daily_entries')
            .select('*, recurring_daily_entry_tags(tag_id), recurring_daily_entry_exceptions(exception_date)')
            .eq('user_id', user.id)
            .order('start_date'),
        ]);

        const extract = (i) => {
          const r = results[i];
          return r.status === 'fulfilled' && !r.value.error
            ? r.value.data ?? []
            : [];
        };

        // Achata a relação N:N de tags (transaction_tags / *_tags) em um
        // array simples tag_ids, para o resto do app não lidar com o shape
        // aninhado do Supabase.
        const withFlatTagIds = (rows, joinKey) =>
          rows.map((r) => ({
            ...r,
            tag_ids: (r[joinKey] ?? []).map((j) => j.tag_id),
            [joinKey]: undefined,
          }));

        // Mesma ideia pras exceções de recorrência ("Atualizar somente
        // esta") — achata em exception_dates: string[].
        const withFlatExceptions = (rows, joinKey) =>
          rows.map((r) => ({
            ...r,
            exception_dates: (r[joinKey] ?? []).map((j) => j.exception_date),
            [joinKey]: undefined,
          }));

        const withRecurrenceExtras = (rows, tagsKey, exceptionsKey) =>
          withFlatExceptions(withFlatTagIds(rows, tagsKey), exceptionsKey);

        const transactionsWithTagIds = withFlatTagIds(extract(4), 'transaction_tags');

        const freshData = {
          incomeEntries: withRecurrenceExtras(extract(0), 'income_entry_tags', 'income_entry_exceptions'),
          fixedExpenses: withRecurrenceExtras(extract(1), 'fixed_expense_tags', 'fixed_expense_exceptions'),
          variableExpenses: extract(2),
          cards: extract(3),
          transactions: transactionsWithTagIds,
          verifiedDays: extract(5),
          cardBills: withRecurrenceExtras(extract(6), 'card_bill_tags', 'card_bill_exceptions'),
          tags: extract(7),
          recurringDailyEntries: withRecurrenceExtras(extract(8), 'recurring_daily_entry_tags', 'recurring_daily_entry_exceptions'),
        };

        // Safety guard: if every query came back empty it almost certainly
        // means the Supabase session wasn't fully committed yet (a timing
        // race on page refresh).  Don't overwrite good cached data with an
        // empty result — just silently discard it and let the cache stand.
        // This is safe because a genuine "user has zero records" state is
        // extremely unlikely across ALL nine tables simultaneously.
        const totalRecords =
          freshData.incomeEntries.length +
          freshData.fixedExpenses.length +
          freshData.variableExpenses.length +
          freshData.cards.length +
          freshData.transactions.length +
          freshData.verifiedDays.length +
          freshData.cardBills.length +
          freshData.tags.length +
          freshData.recurringDailyEntries.length;

        const hasCachedData = !!loadFromCache(user.id);

        if (totalRecords === 0 && hasCachedData) {
          console.warn('[Finance] fetch returned all-empty — keeping cache to avoid blank screen');
          return;
        }

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
      // User signed out — clear immediately, no need to wait for sessionReady.
      clearData();
      return;
    }

    // Wait for the Supabase client's internal auth lock to be released.
    // sessionReady becomes true one JS tick after onAuthStateChange resolves,
    // which is the earliest point where DB queries won't hang.
    if (!sessionReady) return;

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
  }, [user, authLoading, sessionReady]); // intentionally NOT including fetchAllData to avoid loops

  // ─── Refresh on focus/visibility ───────────────────────────────────────────
  // Volta pro app (celular em background, ou troca de aba no desktop) sempre
  // deve mostrar dado atualizado, como uma planilha do Google Sheets. A tela
  // já mostra o que tem em memória instantaneamente — isso só sincroniza em
  // segundo plano (sem loading) quando o app volta a ficar visível.
  // Throttle evita rajada de requests se o usuário ficar trocando de
  // aba/app repetidamente em pouco tempo.
  useEffect(() => {
    if (!user) return;

    function refreshIfStale() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      fetchAllData({ silent: true });
    }

    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
    };
  }, [user, fetchAllData]);

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
      cardBills.length > 0 ||
      tags.length > 0 ||
      recurringDailyEntries.length > 0;

    if (!hasAnyData) return;

    saveToCache(user.id, {
      incomeEntries,
      fixedExpenses,
      variableExpenses,
      cards,
      transactions,
      verifiedDays,
      cardBills,
      tags,
      recurringDailyEntries,
    });
  }, [
    incomeEntries,
    fixedExpenses,
    variableExpenses,
    cards,
    transactions,
    verifiedDays,
    cardBills,
    tags,
    recurringDailyEntries,
  ]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  // Grava o conjunto de tags de um template recorrente (entrada, saída
  // fixa, fatura de cartão ou diário/economia recorrente), substituindo o
  // anterior por completo — mesmo padrão de setTransactionTags, generalizado
  // pra qualquer uma das 4 tabelas de junção dedicadas.
  async function setEntryTags(junctionTable, entryId, tagIds = []) {
    if (!supabase) return { error: 'Not configured' };
    await supabase.from(junctionTable).delete().eq('entry_id', entryId);
    if (tagIds.length > 0) {
      const { error } = await supabase.from(junctionTable).insert(
        tagIds.map((tagId) => ({ entry_id: entryId, tag_id: tagId, user_id: user.id }))
      );
      if (error) return { error };
    }
    return { error: null };
  }

  async function addIncomeEntry(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('income_entries')
      .insert({ ...rest, user_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setEntryTags('income_entry_tags', data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setIncomeEntries((p) =>
      [...p, withTags].sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
    return { data: withTags, error: null };
  }

  async function updateIncomeEntry(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('income_entries')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setEntryTags('income_entry_tags', id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = incomeEntries.find((e) => e.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setIncomeEntries((p) => p.map((e) => (e.id === id ? withTags : e)));
    return { data: withTags, error: null };
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
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('fixed_expenses')
      .insert({ ...rest, user_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setEntryTags('fixed_expense_tags', data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setFixedExpenses((p) =>
      [...p, withTags].sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
    return { data: withTags, error: null };
  }

  async function updateFixedExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('fixed_expenses')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setEntryTags('fixed_expense_tags', id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = fixedExpenses.find((e) => e.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setFixedExpenses((p) => p.map((e) => (e.id === id ? withTags : e)));
    return { data: withTags, error: null };
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
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('credit_card_bills')
      .insert({ ...rest, user_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setEntryTags('card_bill_tags', data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setCardBills((p) => [...p, withTags]);
    return { data: withTags, error: null };
  }

  async function updateCardBill(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('credit_card_bills')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setEntryTags('card_bill_tags', id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = cardBills.find((e) => e.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setCardBills((p) => p.map((e) => (e.id === id ? withTags : e)));
    return { data: withTags, error: null };
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

  async function addRecurringDailyEntry(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('recurring_daily_entries')
      .insert({ ...rest, user_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setEntryTags('recurring_daily_entry_tags', data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setRecurringDailyEntries((p) =>
      [...p, withTags].sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
    return { data: withTags, error: null };
  }

  async function updateRecurringDailyEntry(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('recurring_daily_entries')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setEntryTags('recurring_daily_entry_tags', id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = recurringDailyEntries.find((e) => e.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setRecurringDailyEntries((p) => p.map((e) => (e.id === id ? withTags : e)));
    return { data: withTags, error: null };
  }

  async function deleteRecurringDailyEntry(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('recurring_daily_entries')
      .delete()
      .eq('id', id);
    if (!error) setRecurringDailyEntries((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  // Marca uma ocorrência específica de um template recorrente como exceção
  // — usado por "Atualizar/Excluir somente esta" no QuickAddModal. Ao
  // contrário das tags (que são substituídas por completo a cada salvamento),
  // exceções só acumulam, uma por edição/exclusão pontual.
  async function addRecurrenceException(entryType, entryId, exceptionDate) {
    if (!supabase || !user) return { error: 'Not configured' };
    const table = EXCEPTION_TABLE_BY_TYPE[entryType];
    if (!table) return { error: `Tipo de recorrência desconhecido: ${entryType}` };

    const { error } = await supabase
      .from(table)
      .insert({ entry_id: entryId, exception_date: exceptionDate, user_id: user.id });
    if (error) return { error };

    const appendException = (setter) =>
      setter((p) =>
        p.map((e) =>
          e.id === entryId
            ? { ...e, exception_dates: [...(e.exception_dates || []), exceptionDate] }
            : e
        )
      );

    if (entryType === 'income') appendException(setIncomeEntries);
    else if (entryType === 'expense') appendException(setFixedExpenses);
    else if (entryType === 'card_bill') appendException(setCardBills);
    else if (entryType === 'recurring_daily') appendException(setRecurringDailyEntries);

    return { error: null };
  }

  // Grava o conjunto de tags de uma transação, substituindo o anterior por
  // completo (delete + insert é mais simples que diff e o volume por
  // lançamento é sempre pequeno).
  async function setTransactionTags(transactionId, tagIds = []) {
    if (!supabase) return { error: 'Not configured' };
    await supabase
      .from('transaction_tags')
      .delete()
      .eq('transaction_id', transactionId);
    if (tagIds.length > 0) {
      const { error } = await supabase.from('transaction_tags').insert(
        tagIds.map((tagId) => ({
          transaction_id: transactionId,
          tag_id: tagId,
          user_id: user.id,
        }))
      );
      if (error) return { error };
    }
    return { error: null };
  }

  async function addTransaction(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('daily_transactions')
      .insert({ ...rest, user_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setTransactionTags(data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setTransactions((p) => [...p, withTags]);
    return { data: withTags, error: null };
  }

  async function updateTransaction(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('daily_transactions')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setTransactionTags(id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = transactions.find((t) => t.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setTransactions((p) => p.map((e) => (e.id === id ? withTags : e)));
    return { data: withTags, error: null };
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

  async function addTag(name, color) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('tags')
      .insert({ name, color, user_id: user.id })
      .select()
      .single();
    if (!error) setTags((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    return { data, error };
  }

  async function updateTag(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) setTags((p) => p.map((t) => (t.id === id ? data : t)));
    return { data, error };
  }

  async function deleteTag(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (!error) {
      const stripTag = (setter) =>
        setter((p) =>
          p.map((e) =>
            e.tag_ids?.includes(id)
              ? { ...e, tag_ids: e.tag_ids.filter((tid) => tid !== id) }
              : e
          )
        );
      setTags((p) => p.filter((t) => t.id !== id));
      // Cascade real no banco (FK income_entry_tags.tag_id etc.) já cuida
      // do lado servidor — isso só mantém o cache local em dia.
      stripTag(setTransactions);
      stripTag(setIncomeEntries);
      stripTag(setFixedExpenses);
      stripTag(setCardBills);
      stripTag(setRecurringDailyEntries);
    }
    return { error };
  }

  // ─── Forecast ─────────────────────────────────────────────────────────────

  const getMonthForecast = useCallback(
    (year, month) => {
      if (!profile) return { forecast: [], summary: {} };
      const startYear = new Date().getFullYear();
      // Passa todas as transações — generateMonthForecast filtra por data
      // exata internamente. Pré-filtrar por mês de calendário aqui quebrava
      // dias que caem em outro "balde" quando cycle_start_day != 1.
      const balance = getBalanceAtMonthStart({
        year,
        month,
        referenceYear: startYear,
        initialBalance: profile.initial_balance,
        incomeEntries,
        fixedExpenses,
        variableExpenses,
        cards,
        cardBills,
        recurringDailyEntries,
        verifiedDays,
        transactions,
        showDailyForecast: profile.show_daily_forecast !== false,
        cycleStartDay: profile.cycle_start_day ?? 1,
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
        recurringDailyEntries,
        verifiedDays,
        transactions,
        showDailyForecast: profile.show_daily_forecast !== false,
        cycleStartDay: profile.cycle_start_day ?? 1,
      });
      return { forecast, summary: calculateMonthlySummary(forecast), initialBalance: balance };
    },
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, recurringDailyEntries, verifiedDays, transactions]
  );

  const getMultiMonthForecastFn = useCallback(
    (startYear, startMonth, numMonths = 6) => {
      if (!profile) return [];
      const startOfHistoryYear = new Date().getFullYear();
      let currentBalance = getBalanceAtMonthStart({
        year: startYear,
        month: startMonth,
        referenceYear: startOfHistoryYear,
        initialBalance: profile.initial_balance,
        incomeEntries,
        fixedExpenses,
        variableExpenses,
        cards,
        cardBills,
        recurringDailyEntries,
        verifiedDays,
        transactions,
        showDailyForecast: profile.show_daily_forecast !== false,
        cycleStartDay: profile.cycle_start_day ?? 1,
      });
      return Array.from({ length: numMonths }, (_, i) => {
        const m = (startMonth + i) % 12;
        const y = startYear + Math.floor((startMonth + i) / 12);
        const forecast = generateMonthForecast({
          year: y,
          month: m,
          initialBalance: currentBalance,
          incomeEntries,
          fixedExpenses,
          variableExpenses,
          cards,
          cardBills,
          recurringDailyEntries,
          verifiedDays,
          transactions,
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
    [profile, incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, recurringDailyEntries, verifiedDays, transactions]
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

  // Metas por período (aba Análises) — não entram no fetchAllData/cache
  // geral por serem específicas de um período pedido sob demanda pela
  // própria página, ao contrário do resto do estado financeiro.
  // useCallback (só depende de user) porque a página de Análises usa isso
  // como dependência de um useEffect — sem memoizar, qualquer re-render do
  // FinanceProvider (que envolve o app inteiro) geraria uma referência nova
  // e disparia um refetch desnecessário.
  const getPeriodGoal = useCallback(
    async (periodStart, periodEnd) => {
      if (!supabase || !user) return { data: null, error: null };
      const { data, error } = await supabase
        .from('period_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle();
      return { data, error };
    },
    [user]
  );

  async function upsertPeriodGoal({ periodStart, periodEnd, metaGasto, metaEconomia }) {
    if (!supabase || !user) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('period_goals')
      .upsert(
        {
          user_id: user.id,
          period_start: periodStart,
          period_end: periodEnd,
          meta_gasto: metaGasto,
          meta_economia: metaEconomia,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,period_start,period_end' }
      )
      .select()
      .single();
    return { data, error };
  }

  // Apaga todos os dados financeiros do usuário (mantém o login/conta).
  // Usado pela opção "Zerar minha conta" no Menu — o reset de
  // initial_balance/cycle_start_day fica a cargo de quem chama (precisa do
  // updateProfile do AuthContext, que este contexto não tem acesso).
  async function resetAccount() {
    if (!supabase || !user) return { error: 'Not configured' };

    const tables = [
      'income_entries',
      'fixed_expenses',
      'variable_expenses',
      'cards',
      'credit_card_bills',
      'daily_transactions',
      'verified_days',
      'tags',
      'assistant_messages',
      'recurring_daily_entries',
      'period_goals',
    ];

    const results = await Promise.allSettled(
      tables.map((t) => supabase.from(t).delete().eq('user_id', user.id))
    );
    const failed = results.find(
      (r) => r.status === 'rejected' || r.value?.error
    );
    if (failed) {
      return { error: failed.status === 'rejected' ? failed.reason : failed.value.error };
    }

    clearCache(user.id);
    applyData({});
    return { error: null };
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
    tags,
    recurringDailyEntries,
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
    addRecurringDailyEntry,
    updateRecurringDailyEntry,
    deleteRecurringDailyEntry,
    addRecurrenceException,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    toggleVerifiedDay,
    addTag,
    updateTag,
    deleteTag,
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
    getPeriodGoal,
    upsertPeriodGoal,
    refetch: () => fetchAllData({ silent: false }),
    // Sem spinner de tela cheia — usado para sincronizar depois de uma
    // escrita feita fora do FinanceContext (ex: o assistente de IA gravando
    // direto no Supabase a partir da rota /api/assistant).
    refetchSilent: () => fetchAllData({ silent: true }),
    resetAccount,
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

