/**
 * POST /api/ingest
 *
 * Receives a batch of raw ICT log files from the Windows ingest script,
 * parses them, and upserts into Supabase.
 *
 * Request headers:
 *   x-ingest-secret: <INGEST_SECRET env var>
 *
 * Request body (JSON):
 *   { files: Array<{ filename: string, content: string }> }
 *
 * Responses:
 *   200  { processed: number, failed: Array<{ filename: string, error: string }> }
 *   400  { error: string }   — missing/invalid body
 *   401  { error: string }   — bad or missing secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseLog } from '@/lib/ict-parser';
import { upsertTest } from '@/lib/ict-db';

interface IngestFile {
  filename: string;
  content: string;
}

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
    !Array.isArray((body as Record<string, unknown>).files)
  ) {
    return NextResponse.json(
      { error: 'Body must be { files: Array<{ filename: string, content: string }> }' },
      { status: 400 }
    );
  }

  const { files } = body as { files: unknown[] };

  for (const file of files) {
    if (
      typeof file !== 'object' ||
      file === null ||
      typeof (file as Record<string, unknown>).filename !== 'string' ||
      typeof (file as Record<string, unknown>).content !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Each file entry must be { filename: string, content: string }' },
        { status: 400 }
      );
    }
  }

  const validFiles = files as IngestFile[];

  // --- process each file; accumulate results ---
  const failed: Array<{ filename: string; error: string }> = [];
  let processed = 0;

  for (const { filename, content } of validFiles) {
    try {
      const parsed = parseLog(filename, content);
      await upsertTest(parsed);
      processed++;
    } catch (err) {
      failed.push({ filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ processed, failed });
}
