import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// During build time, Supabase credentials may not be available.
// We create a dummy client that will be replaced at runtime.
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http');

export const supabase = isValidUrl
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Get the Supabase client, throwing a helpful error if not configured
 */
export function getSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
  }
  return supabase;
}
