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

// ─── Cache helpers ────────────────────────────────────────────────────────────

const FOCUS_REFRESH_THROTTLE_MS = 20000;

// v2: schema unificado (movimentacoes) — muda o formato do blob salvo, então
// um cache antigo (v1, 5 arrays de movimento separados) precisa ser
// ignorado, nunca interpretado com o formato errado.
const CACHE_VERSION = 'v2';
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

  const [movements, setMovements] = useState([]);
  const [variableExpenses, setVariableExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardClosings, setCardClosings] = useState([]);
  const [verifiedDays, setVerifiedDays] = useState([]);
  const [tags, setTags] = useState([]);

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
    setMovements(data.movements ?? []);
    setVariableExpenses(data.variableExpenses ?? []);
    setCards(data.cards ?? []);
    setCardClosings(data.cardClosings ?? []);
    setVerifiedDays(data.verifiedDays ?? []);
    setTags(data.tags ?? []);
  }

  function clearData() {
    setMovements([]);
    setVariableExpenses([]);
    setCards([]);
    setCardClosings([]);
    setVerifiedDays([]);
    setTags([]);
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
            .from('movimentacoes')
            .select('*, movimentacao_etiquetas(etiqueta_id)')
            .eq('usuario_id', user.id)
            .order('data_inicio'),
          supabase
            .from('gastos_variaveis')
            .select('*')
            .eq('usuario_id', user.id)
            .order('descricao'),
          supabase
            .from('cartoes')
            .select('*')
            .eq('usuario_id', user.id)
            .order('nome'),
          supabase
            .from('cartao_fechamentos')
            .select('*')
            .eq('usuario_id', user.id),
          supabase
            .from('dias_verificados')
            .select('*')
            .eq('usuario_id', user.id),
          supabase
            .from('etiquetas')
            .select('*')
            .eq('usuario_id', user.id)
            .order('nome'),
          // Exceções de recorrência ("Atualizar/Excluir somente esta") numa
          // query PRÓPRIA, nunca embutida na query de movimentacoes acima:
          // se por algum motivo essa tabela não existir, o Postgrest
          // rejeitaria a query INTEIRA (mãe + join), esvaziando
          // silenciosamente todas as movimentações na tela. Em queries
          // separadas, só a exceção (recurso à parte) fica de fora.
          supabase.from('movimentacao_excecoes').select('movimentacao_id, data_excecao').eq('usuario_id', user.id),
        ]);

        const extract = (i) => {
          const r = results[i];
          return r.status === 'fulfilled' && !r.value.error
            ? r.value.data ?? []
            : [];
        };

        // Achata a relação N:N de tags (movimentacao_etiquetas) em um array
        // simples tag_ids, para o resto do app não lidar com o shape
        // aninhado do Supabase.
        const withFlatTagIds = (rows) =>
          rows.map((r) => ({
            ...r,
            tag_ids: (r.movimentacao_etiquetas ?? []).map((j) => j.etiqueta_id),
            movimentacao_etiquetas: undefined,
          }));

        // Agrupa a lista plana de exceções por movimentacao_id, e anexa
        // exception_dates: string[] em cada linha.
        const withExceptions = (rows, exceptionRows) => {
          const byMovId = new Map();
          exceptionRows.forEach((ex) => {
            const list = byMovId.get(ex.movimentacao_id) ?? [];
            list.push(ex.data_excecao);
            byMovId.set(ex.movimentacao_id, list);
          });
          return rows.map((r) => ({ ...r, exception_dates: byMovId.get(r.id) ?? [] }));
        };

        const freshData = {
          movements: withExceptions(withFlatTagIds(extract(0)), extract(6)),
          variableExpenses: extract(1),
          cards: extract(2),
          cardClosings: extract(3),
          verifiedDays: extract(4),
          tags: extract(5),
        };

        // Safety guard: if every query came back empty it almost certainly
        // means the Supabase session wasn't fully committed yet (a timing
        // race on page refresh).  Don't overwrite good cached data with an
        // empty result — just silently discard it and let the cache stand.
        // This is safe because a genuine "user has zero records" state is
        // extremely unlikely across all six tables simultaneously.
        const totalRecords =
          freshData.movements.length +
          freshData.variableExpenses.length +
          freshData.cards.length +
          freshData.cardClosings.length +
          freshData.verifiedDays.length +
          freshData.tags.length;

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
      movements.length > 0 ||
      variableExpenses.length > 0 ||
      cards.length > 0 ||
      verifiedDays.length > 0 ||
      tags.length > 0;

    if (!hasAnyData) return;

    saveToCache(user.id, {
      movements,
      variableExpenses,
      cards,
      cardClosings,
      verifiedDays,
      tags,
    });
  }, [movements, variableExpenses, cards, cardClosings, verifiedDays, tags]);

  // ─── CRUD — Movimentações ───────────────────────────────────────────────────

  // Grava o conjunto de tags de uma movimentação, substituindo o anterior
  // por completo (delete + insert é mais simples que diff, e o volume por
  // lançamento é sempre pequeno).
  async function setMovementTags(movementId, tagIds = []) {
    if (!supabase) return { error: 'Not configured' };
    await supabase.from('movimentacao_etiquetas').delete().eq('movimentacao_id', movementId);
    if (tagIds.length > 0) {
      const { error } = await supabase.from('movimentacao_etiquetas').insert(
        tagIds.map((tagId) => ({ movimentacao_id: movementId, etiqueta_id: tagId, usuario_id: user.id }))
      );
      if (error) return { error };
    }
    return { error: null };
  }

  async function addMovement(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = entry;
    const { data, error } = await supabase
      .from('movimentacoes')
      .insert({ ...rest, usuario_id: user.id })
      .select()
      .single();
    if (error) return { data, error };

    if (tagIds && tagIds.length > 0) {
      const { error: tagError } = await setMovementTags(data.id, tagIds);
      if (tagError) return { data, error: tagError };
    }

    const withTags = { ...data, tag_ids: tagIds ?? [] };
    setMovements((p) => [...p, withTags]);
    return { data: withTags, error: null };
  }

  async function updateMovement(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { tagIds, ...rest } = updates;
    const { data, error } = await supabase
      .from('movimentacoes')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) return { data, error };

    let finalTagIds = tagIds;
    if (tagIds !== undefined) {
      const { error: tagError } = await setMovementTags(id, tagIds);
      if (tagError) return { data, error: tagError };
    } else {
      finalTagIds = movements.find((m) => m.id === id)?.tag_ids ?? [];
    }

    const withTags = { ...data, tag_ids: finalTagIds };
    setMovements((p) => p.map((m) => (m.id === id ? withTags : m)));
    return { data: withTags, error: null };
  }

  async function deleteMovement(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase
      .from('movimentacoes')
      .delete()
      .eq('id', id);
    if (!error) setMovements((p) => p.filter((m) => m.id !== id));
    return { error };
  }

  // Marca uma ocorrência específica de uma movimentação recorrente como
  // exceção — usado por "Atualizar/Excluir somente esta" no QuickAddModal.
  // Ao contrário das tags (substituídas por completo a cada salvamento),
  // exceções só acumulam, uma por edição/exclusão pontual.
  async function addMovementException(movementId, exceptionDate) {
    if (!supabase || !user) return { error: 'Not configured' };
    const { error } = await supabase
      .from('movimentacao_excecoes')
      .insert({ movimentacao_id: movementId, data_excecao: exceptionDate, usuario_id: user.id });
    if (error) return { error };

    setMovements((p) =>
      p.map((m) =>
        m.id === movementId
          ? { ...m, exception_dates: [...(m.exception_dates || []), exceptionDate] }
          : m
      )
    );
    return { error: null };
  }

  // ─── CRUD — Gastos Variáveis / Cartões / Dias Verificados / Tags ──────────

  async function addVariableExpense(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('gastos_variaveis')
      .insert({ ...entry, usuario_id: user.id })
      .select()
      .single();
    if (!error) setVariableExpenses((p) => [...p, data]);
    return { data, error };
  }

  async function updateVariableExpense(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('gastos_variaveis')
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
      .from('gastos_variaveis')
      .delete()
      .eq('id', id);
    if (!error) setVariableExpenses((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  async function addCard(entry) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('cartoes')
      .insert({ ...entry, usuario_id: user.id })
      .select()
      .single();
    if (!error) setCards((p) => [...p, data]);
    return { data, error };
  }

  async function updateCard(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('cartoes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) setCards((p) => p.map((e) => (e.id === id ? data : e)));
    return { data, error };
  }

  async function deleteCard(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('cartoes').delete().eq('id', id);
    if (!error) setCards((p) => p.filter((e) => e.id !== id));
    return { error };
  }

  // Corrige o fechamento de um cartão pra um mês específico (fechamento real
  // não é fixo todo mês — varia por fim de semana/feriado/decisão do banco).
  // Upsert: grava imediatamente ao ser chamada, mesmo padrão do addTag no
  // TagPicker — não espera o formulário inteiro salvar.
  async function setCardClosing(cartaoId, mesReferencia, dataFechamento) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('cartao_fechamentos')
      .upsert(
        { cartao_id: cartaoId, mes_referencia: mesReferencia, data_fechamento: dataFechamento, usuario_id: user.id },
        { onConflict: 'cartao_id,mes_referencia' }
      )
      .select()
      .single();
    if (error) return { data, error };

    setCardClosings((p) => {
      const exists = p.some((f) => f.cartao_id === cartaoId && f.mes_referencia === mesReferencia);
      return exists
        ? p.map((f) => (f.cartao_id === cartaoId && f.mes_referencia === mesReferencia ? data : f))
        : [...p, data];
    });
    return { data, error: null };
  }

  async function toggleVerifiedDay(dateStr) {
    if (!supabase) return { error: 'Not configured' };
    const existing = verifiedDays.find((d) => d.data === dateStr);
    if (existing) {
      const { error } = await supabase
        .from('dias_verificados')
        .delete()
        .eq('id', existing.id);
      if (!error)
        setVerifiedDays((p) => p.filter((d) => d.id !== existing.id));
      return { error, newState: false };
    } else {
      const { data, error } = await supabase
        .from('dias_verificados')
        .insert({ data: dateStr, usuario_id: user.id })
        .select()
        .single();
      if (!error) setVerifiedDays((p) => [...p, data]);
      return { data, error, newState: true };
    }
  }

  async function addTag(name, color) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('etiquetas')
      .insert({ nome: name, cor: color, usuario_id: user.id })
      .select()
      .single();
    if (!error) setTags((p) => [...p, data].sort((a, b) => a.nome.localeCompare(b.nome)));
    return { data, error };
  }

  async function updateTag(id, updates) {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('etiquetas')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) setTags((p) => p.map((t) => (t.id === id ? data : t)));
    return { data, error };
  }

  async function deleteTag(id) {
    if (!supabase) return { error: 'Not configured' };
    const { error } = await supabase.from('etiquetas').delete().eq('id', id);
    if (!error) {
      setTags((p) => p.filter((t) => t.id !== id));
      // Cascade real no banco (FK movimentacao_etiquetas.etiqueta_id) já
      // cuida do lado servidor — isso só mantém o cache local em dia.
      setMovements((p) =>
        p.map((m) =>
          m.tag_ids?.includes(id) ? { ...m, tag_ids: m.tag_ids.filter((tid) => tid !== id) } : m
        )
      );
    }
    return { error };
  }

  // ─── Forecast ─────────────────────────────────────────────────────────────

  const getMonthForecast = useCallback(
    (year, month) => {
      if (!profile) return { forecast: [], summary: {} };
      const startYear = new Date().getFullYear();
      // Passa todas as movimentações — generateMonthForecast filtra por
      // recorrência internamente. Pré-filtrar por mês de calendário aqui
      // quebraria dias que caem em outro "balde" quando dia_inicio_ciclo != 1.
      const balance = getBalanceAtMonthStart({
        year,
        month,
        referenceYear: startYear,
        initialBalance: profile.saldo_inicial,
        movements,
        variableExpenses,
        cards,
        cardClosings,
        verifiedDays,
        showDailyForecast: profile.mostrar_previsao_diaria !== false,
        cycleStartDay: profile.dia_inicio_ciclo ?? 1,
      });
      const forecast = generateMonthForecast({
        year,
        month,
        initialBalance: balance,
        movements,
        variableExpenses,
        cards,
        cardClosings,
        verifiedDays,
        showDailyForecast: profile.mostrar_previsao_diaria !== false,
        cycleStartDay: profile.dia_inicio_ciclo ?? 1,
      });
      return { forecast, summary: calculateMonthlySummary(forecast), initialBalance: balance };
    },
    [profile, movements, variableExpenses, cards, cardClosings, verifiedDays]
  );

  const getMultiMonthForecastFn = useCallback(
    (startYear, startMonth, numMonths = 6) => {
      if (!profile) return [];
      const startOfHistoryYear = new Date().getFullYear();
      let currentBalance = getBalanceAtMonthStart({
        year: startYear,
        month: startMonth,
        referenceYear: startOfHistoryYear,
        initialBalance: profile.saldo_inicial,
        movements,
        variableExpenses,
        cards,
        cardClosings,
        verifiedDays,
        showDailyForecast: profile.mostrar_previsao_diaria !== false,
        cycleStartDay: profile.dia_inicio_ciclo ?? 1,
      });
      return Array.from({ length: numMonths }, (_, i) => {
        const m = (startMonth + i) % 12;
        const y = startYear + Math.floor((startMonth + i) / 12);
        const forecast = generateMonthForecast({
          year: y,
          month: m,
          initialBalance: currentBalance,
          movements,
          variableExpenses,
          cards,
          cardClosings,
          verifiedDays,
          showDailyForecast: profile.mostrar_previsao_diaria !== false,
          cycleStartDay: profile.dia_inicio_ciclo ?? 1,
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
    [profile, movements, variableExpenses, cards, cardClosings, verifiedDays]
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
      .from('gastos_variaveis')
      .select('*')
      .eq('usuario_id', user.id);
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
        .from('metas_periodo')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('periodo_inicio', periodStart)
        .eq('periodo_fim', periodEnd)
        .maybeSingle();
      return { data, error };
    },
    [user]
  );

  async function upsertPeriodGoal({ periodStart, periodEnd, metaGasto, metaEconomia }) {
    if (!supabase || !user) return { error: 'Not configured' };
    const { data, error } = await supabase
      .from('metas_periodo')
      .upsert(
        {
          usuario_id: user.id,
          periodo_inicio: periodStart,
          periodo_fim: periodEnd,
          meta_gasto: metaGasto,
          meta_economia: metaEconomia,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'usuario_id,periodo_inicio,periodo_fim' }
      )
      .select()
      .single();
    return { data, error };
  }

  // Apaga todos os dados financeiros do usuário (mantém o login/conta).
  // Usado pela opção "Zerar minha conta" em Config → Geral — o reset de
  // saldo_inicial/dia_inicio_ciclo fica a cargo de quem chama (precisa do
  // updateProfile do AuthContext, que este contexto não tem acesso).
  async function resetAccount() {
    if (!supabase || !user) return { error: 'Not configured' };

    const tables = [
      'movimentacoes',
      'gastos_variaveis',
      'cartoes',
      'dias_verificados',
      'etiquetas',
      'mensagens_assistente',
      'metas_periodo',
    ];

    const results = await Promise.allSettled(
      tables.map((t) => supabase.from(t).delete().eq('usuario_id', user.id))
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
    movements,
    variableExpenses,
    cards,
    cardClosings,
    verifiedDays,
    tags,
    loading,
    addMovement,
    updateMovement,
    deleteMovement,
    addMovementException,
    addVariableExpense,
    updateVariableExpense,
    deleteVariableExpense,
    addCard,
    updateCard,
    deleteCard,
    setCardClosing,
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
