'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Safety timeout: stop loading after 5 seconds no matter what
    const fallbackTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 5000);

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!isMounted) return;
      if (error) console.error("getSession error:", error);

      setUser(session?.user || null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error("getSession failed completely:", err);
      if (isMounted) setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;
        setUser(session?.user || null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimeout);
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

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet, create it
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: userId, name: '', initial_balance: 0 })
          .select()
          .single();
        setProfile(newProfile);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
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

    if (!error) {
      setProfile(data);
    }
    return { data, error };
  }

  async function signUp(email, password, name) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
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
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out', err);
    } finally {
      // Force hard reset — clears React state AND Supabase session cache
      window.location.href = '/';
    }
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
    isOnboarded: profile?.initial_balance != null && profile?.initial_balance !== 0,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
