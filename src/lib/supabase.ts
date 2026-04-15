import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Returns a Supabase client for the external outreach DB, or null if
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set (e.g., local dev).
 * Uses the service_role key — server-side only, do not import from client code.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
