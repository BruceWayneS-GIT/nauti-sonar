import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let cachedCold: SupabaseClient | null = null;

/**
 * Supabase client for the leads DB (ckuxsozjfehuzomiojzy).
 * Returns null if env vars aren't set — server-side only.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/**
 * Supabase client for the cold outreach / sales logs DB (juqhewatlcpmzwcbiifc).
 * Returns null if env vars aren't set — server-side only.
 */
export function getColdSupabase(): SupabaseClient | null {
  if (cachedCold) return cachedCold;
  const url = process.env.SUPABASE_COLD_URL;
  const key = process.env.SUPABASE_COLD_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedCold = createClient(url, key, { auth: { persistSession: false } });
  return cachedCold;
}
