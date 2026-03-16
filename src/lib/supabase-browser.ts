/**
 * supabase-browser.ts — browser-side Supabase singleton.
 *
 * Uses the public anon key (safe to expose; RLS enforces access).
 * Do NOT import this in server-only modules (API routes, ict-db.ts).
 * For server-side admin operations, see ict-db.ts (service role key).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _instance: SupabaseClient | null = null;

/**
 * Returns the browser-side Supabase singleton (created on first call).
 * Returns null when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are not set — callers should treat null as "no auth available" (guest mode).
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!_instance) {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    _instance = createClient(url, anon);
  }
  return _instance;
}
