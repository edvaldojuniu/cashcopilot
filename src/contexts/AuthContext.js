'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // Starts as true — remains true until the first auth event is processed.
  // This prevents any route guard from acting before Supabase has resolved
  // the stored session on a hard refresh.
  const [loading, setLoading] = useState(true);
  const [configured] = useState(!!supabase);
  // Becomes true one JS tick after onAuthStateChange resolves,
  // ensuring the Supabase client has released its internal lock
  // before FinanceContext starts firing DB queries.
  const [sessionReady, setSessionReady] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!supabase) {
      setLoading(false);
      return;
    }

    // Safety valve — if onAuthStateChange never fires (e.g. network issues)
    // we still unblock the UI after 6 s.
    const fallback = setTimeout(() => {
      if (isMountedRef.current) setLoading(false);
    }, 6000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return;

      console.log('[Auth]', event, session?.user?.email ?? 'no user');

      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setSessionReady(false); // reset while we process

      if (nextUser) {
        await fetchProfile(nextUser.id);
      } else {
        setProfile(null);
        setLoading(false);
      }

      // Push sessionReady to the next event-loop tick.
      // This guarantees that the Supabase client has fully released its
      // internal auth lock before FinanceContext starts making DB queries.
      // Queries that run inside the same tick as onAuthStateChange hang
      // indefinitely because they queue behind the still-held lock.
      setTimeout(() => {
        if (isMountedRef.current) setSessionReady(!!nextUser);
      }, 0);

      clearTimeout(fallback);
    });

    return () => {
      isMountedRef.current = false;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

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
        // Profile doesn't exist yet — create it
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

    // 1. Clear the finance cache BEFORE signing out so the next login
    //    doesn't accidentally serve stale data from a different session.
    if (user?.id) {
      try {
        localStorage.removeItem(`cc_finance_${user.id}_v1`);
      } catch (_) { }
    }

    // 2. Wipe the Supabase token from localStorage immediately — this is
    //    synchronous and guarantees the session is gone before the redirect.
    //    Then fire signOut() on the server but race it against a 3s timeout
    //    so a slow/hanging RPC never blocks the UI.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) { }

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

    // 3. Clear React state (onAuthStateChange fires SIGNED_OUT and does
    //    the same, but doing it here too is instant feedback for the UI).
    setUser(null);
    setProfile(null);
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