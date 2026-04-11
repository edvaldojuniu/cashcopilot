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

      if (nextUser) {
        await fetchProfile(nextUser.id);
      } else {
        setProfile(null);
        setLoading(false);
      }

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

    // 2. Await the Supabase sign-out so the session cookie / localStorage
    //    token are wiped BEFORE the caller redirects.  Without this await
    //    a hard-refresh after navigation would find the token still alive
    //    and re-authenticate the user silently.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] signOut error:', err);
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