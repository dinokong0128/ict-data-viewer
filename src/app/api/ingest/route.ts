/**
 * POST /api/ingest
 *
 * Receives a raw ICT log file from the Windows ingest script,
 * parses it, and upserts it into Supabase.
 *
 * Request headers:
 *   x-ingest-secret: <INGEST_SECRET env var>
 *
 * Request body (JSON):
 *   { filename: string, content: string }
 *
 * Responses:
 *   200  { ok: true, board_id: string, result: "PASS" | "FAIL" }
 *   400  { error: string }   — missing/invalid body
 *   401  { error: string }   — bad or missing secret
 *   500  { error: string }   — parse or DB failure
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseLog } from '@/lib/ict-parser';
import { upsertTest } from '@/lib/ict-db';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- auth ---
  const secret = process.env.INGEST_SECRET;
  if (!secret || req.headers.get('x-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- parse body ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).filename !== 'string' ||
    typeof (body as Record<string, unknown>).content !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Body must be { filename: string, content: string }' },
      { status: 400 }
    );
  }

  const { filename, content } = body as { filename: string; content: string };

  // --- parse log ---
  let parsed;
  try {
    parsed = parseLog(filename, content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Parse error: ${msg}` }, { status: 500 });
  }

  // --- upsert to Supabase ---
  try {
    await upsertTest(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `DB error: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, board_id: parsed.board_id, result: parsed.result });
}
