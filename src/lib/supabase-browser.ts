/**
 * supabase-browser.ts — browser-side Supabase singleton.
 *
 * Uses the public anon key (safe to expose; RLS enforces access).
 * Do NOT import this in server-only modules (API routes, ict-db.ts).
 * For server-side admin operations, see ict-db.ts (service role key).
 */

import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseBrowser = createClient(url, anon);
