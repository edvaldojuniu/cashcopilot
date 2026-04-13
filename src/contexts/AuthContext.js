'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(!!supabase);

  // sessionReady becomes true one JS tick after onAuthStateChange fires.
  // FinanceContext waits for this before making any DB queries, which
  // prevents the Supabase internal auth-lock deadlock on page refresh.
  const [sessionReady, setSessionReady] = useState(false);

  const isMountedRef = useRef(true);

  // ─── Auth state listener ─────────────────────────────────────────────────
  // CRITICAL: zero Supabase queries (auth OR database) inside this callback.
  // Every .from() and getSession() call acquires the same internal lock that
  // onAuthStateChange holds — instant deadlock on page refresh.
  // Only set React state here; DB work happens in the effects below.

  useEffect(() => {
    isMountedRef.current = true;

    if (!supabase) {
      setLoading(false);
      return;
    }

    const fallback = setTimeout(() => {
      if (isMountedRef.current) setLoading(false);
    }, 6000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Intentionally synchronous — no await, no Supabase calls.
      if (!isMountedRef.current) return;

      console.log('[Auth]', event, session?.user?.email ?? 'no user');

      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setSessionReady(false);

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        clearTimeout(fallback);
      }
      // If nextUser exists: loading stays true until fetchProfile completes
      // (triggered by the effect below once sessionReady flips to true).
    });

    return () => {
      isMountedRef.current = false;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  // ─── Session ready signal ────────────────────────────────────────────────
  // Pushes sessionReady=true to the NEXT event-loop tick after user changes,
  // giving the Supabase client time to release its internal auth lock.

  useEffect(() => {
    if (!user) {
      setSessionReady(false);
      return;
    }
    const t = setTimeout(() => {
      if (isMountedRef.current) setSessionReady(true);
    }, 0);
    return () => clearTimeout(t);
  }, [user]);

  // ─── Profile fetch ───────────────────────────────────────────────────────
  // Runs only after sessionReady=true — safe to make DB queries here.

  useEffect(() => {
    if (!user || !sessionReady) return;
    fetchProfile(user.id);
  }, [user, sessionReady]);

  async function fetchProfile(userId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!isMountedRef.current) return;

      if (error && error.code === 'PGRST116') {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: userId, name: '', initial_balance: 0 })
          .select()
          .single();
        if (isMountedRef.current) setProfile(newProfile);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  async function updateProfile(updates) {
    if (!user || !supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    if (!error) setProfile(data);
    return { data, error };
  }

  async function signUp(email, password, name) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { data, error };
  }

  async function signIn(email, password) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  }

  async function signOut() {
    if (!supabase) return;

    if (user?.id) {
      try { localStorage.removeItem(`cc_finance_${user.id}_v1`); } catch (_) {}
    }

    // Wipe the token synchronously so a hard-refresh after redirect
    // won't find it and silently re-authenticate.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        ),
      ]);
    } catch (err) {
      console.warn('[Auth] signOut (ignored):', err.message);
    }

    setUser(null);
    setProfile(null);
    setSessionReady(false);
  }

  const value = {
    user,
    profile,
    loading,
    configured,
    sessionReady,
    signUp,
    signIn,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
    isOnboarded:
      profile?.initial_balance != null && profile?.initial_balance !== 0,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}