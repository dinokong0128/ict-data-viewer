/**
 * POST /api/chat
 *
 * Accepts: { question: string }
 * Returns: ChatResponse
 *
 * Auth: ict-manager or ict-admin only (checked via Supabase RLS / get_my_role RPC).
 *
 * Pipeline:
 *   1. Auth check (JWT → role)
 *   2. Validate question
 *   3. LLM → ChatQueryPlan
 *   4. Validate plan
 *   5. Compile SQL (deterministic — never use LLM-generated SQL)
 *   6. Guard SQL
 *   7. Execute query (read-only, anon key, timeout)
 *   8. LLM → grounded answer
 *   9. Return ChatResponse
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validatePlan } from '@/lib/chat/plan-validator';
import { compilePlan } from '@/lib/chat/sql-compiler';
import { guardSql } from '@/lib/chat/sql-guard';
import { getChatProvider, buildSemanticContext } from '@/lib/chat/chat-provider';
import { MAX_ROWS, QUERY_TIMEOUT_MS } from '@/lib/chat/semantic-layer';
import type { ChatResponse } from '@/lib/chat/types';

const ALLOWED_ROLES = new Set(['ict-manager', 'ict-admin']);

// ---------------------------------------------------------------------------
// Auth helper — creates Supabase client with user JWT (RLS enforced)
// ---------------------------------------------------------------------------

function getSupabaseForUser(authHeader: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Query execution — uses execute_readonly_query RPC with anon key
// ---------------------------------------------------------------------------

async function executeQuery(sql: string, signal: AbortSignal): Promise<unknown[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_readonly_query`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Query execution failed: ${text}`);
  }

  return resp.json() as Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Auth check ─────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const sb = getSupabaseForUser(authHeader);
      const { data: role, error } = await sb.rpc('get_my_role');
      if (error || !role || !ALLOWED_ROLES.has(role as string)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // ── 2. Validate question ──────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).question !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include a non-empty "question" string' },
      { status: 400 }
    );
  }

  const question = ((body as Record<string, unknown>).question as string).trim();
  if (!question || question.length > 500) {
    return NextResponse.json(
      { error: 'Question must be a non-empty string under 500 characters' },
      { status: 400 }
    );
  }

  // ── 3. Generate plan ──────────────────────────────────────────────────────
  const provider = getChatProvider();
  const semanticContext = buildSemanticContext();

  let plan;
  try {
    plan = await provider.generatePlan(question, semanticContext);
  } catch (err) {
    console.error('[chat] Plan generation failed:', err);
    return NextResponse.json(
      { error: 'Could not interpret your question. Try rephrasing it.' },
      { status: 422 }
    );
  }

  // ── 4. Validate plan ──────────────────────────────────────────────────────
  const validation = validatePlan(plan);
  if (!validation.valid) {
    console.error('[chat] Plan validation failed:', validation.reason);
    return NextResponse.json(
      { error: `Could not build a valid query: ${validation.reason}` },
      { status: 400 }
    );
  }

  // ── 5. Compile SQL ────────────────────────────────────────────────────────
  let sql: string;
  try {
    sql = compilePlan(plan);
  } catch (err) {
    console.error('[chat] SQL compilation failed:', err);
    return NextResponse.json(
      { error: `Could not build a valid query: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  // ── 6. Guard SQL ──────────────────────────────────────────────────────────
  const guard = guardSql(sql);
  if (!guard.safe) {
    console.error('[chat] SQL guard rejected compiled SQL:', guard.reason, '\nSQL:', sql);
    return NextResponse.json(
      { error: 'Query failed. The data team has been notified.' },
      { status: 400 }
    );
  }

  // ── 7. Execute query ──────────────────────────────────────────────────────
  const startMs = Date.now();
  let allRows: unknown[];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    allRows = await executeQuery(sql, controller.signal);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[chat] Query execution failed:', err);
    return NextResponse.json(
      { error: 'Query failed. The data team has been notified.' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startMs;

  // ── 8. Cap rows ───────────────────────────────────────────────────────────
  const truncated = allRows.length > MAX_ROWS;
  const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;

  const warnings: string[] = [];
  if (truncated) warnings.push(`Results truncated to ${MAX_ROWS} rows`);
  if (plan.ambiguities.length > 0) warnings.push(...plan.ambiguities);

  // ── 9. Generate answer ────────────────────────────────────────────────────
  let answer = 'Here are the results.';
  try {
    answer = await provider.generateAnswer(question, plan, sql, rows);
  } catch (err) {
    console.error('[chat] Answer generation failed:', err);
    // Fallback — return rows with default answer
  }

  // ── 10. Return response ───────────────────────────────────────────────────
  const response: ChatResponse = {
    answer,
    sql,
    rows,
    rowCount: rows.length,
    durationMs,
    truncated,
    warnings,
    visualizationHint: plan.visualizationHint,
  };

  return NextResponse.json(response);
}
