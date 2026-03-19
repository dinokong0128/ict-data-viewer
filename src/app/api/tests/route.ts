/**
 * GET /api/tests?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Data routing:
 *   - Authenticated request (Authorization: Bearer <jwt>):
 *       Queries Supabase using the user's JWT + anon key → RLS enforced.
 *   - Guest request (no Authorization header):
 *       Returns src/fixtures/guest-data.json (no Supabase call made).
 *
 * Returns { records: TestRecord[], demo: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import type { TestRecord } from '@/lib/testUtils';

// ---------------------------------------------------------------------------
// Supabase live path (RLS-enforced via user JWT + anon key)
// ---------------------------------------------------------------------------

function getSupabaseForUser(authHeader: string): SupabaseClient {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  }) as SupabaseClient;
}

async function fetchFromSupabase(sb: SupabaseClient, start: string, end: string): Promise<TestRecord[]> {
  const BATCH = 5000;
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from('tests_with_errors')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end + 'T23:59:59Z')
      .order('start_time', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + BATCH - 1);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  return allRows.map((row: any): TestRecord => ({
    id:             row.id,
    board_id:       row.board_id,
    start_time:     row.start_time,
    end_time:       row.end_time,
    result:         row.result,
    operator_id:    row.operator_id  ?? '',
    fixture_id:     row.fixture_id   ?? '',
    tester:         row.tester       ?? '',
    source_file:    row.source_file  ?? '',
    ingested_at:    row.ingested_at  ?? '',
    serial_number:  row.serial_number ?? row.board_id,
    mac_address:    row.mac_address  ?? '',
    rev:            row.rev          ?? '',
    product_id:     row.product_id   ?? '',
    product_name:   row.product_name ?? '',
    part_number:    row.part_number  ?? '',
    error_locations: row.error_locations ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Fixture / guest path
// ---------------------------------------------------------------------------

type FixtureData = {
  products: Array<{ part_number: string; product_name: string }>;
  boards: Array<{
    serial_number: string; mac_address: string; rev: string; product_id: string;
  }>;
  tests: Array<{
    id: number; board_id: string; start_time: string; end_time: string;
    result: 'pass' | 'fail'; operator_id: string; fixture_id: string;
    tester: string; source_file: string; ingested_at: string;
  }>;
  test_errors: Array<{
    test_id: number; error_type: string; location: string; subtest: string | null;
    part_spec: string; unit: string; measured_raw: string; nominal_raw: string;
    high_limit_raw: string; low_limit_raw: string; threshold_raw: string | null;
  }>;
};

function loadFixture(): FixtureData {
  const filePath = path.join(process.cwd(), 'src', 'fixtures', 'guest-data.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as FixtureData;
}

function fetchFromFixture(start: string, end: string): TestRecord[] {
  const fixture = loadFixture();

  // Build lookup maps
  const boardMap = new Map(fixture.boards.map((b) => [b.serial_number, b]));
  const productMap = new Map(fixture.products.map((p) => [p.part_number, p]));

  // Build error locations by test_id (just location strings)
  const locationsByTestId = new Map<number, string[]>();
  fixture.test_errors.forEach((e) => {
    const list = locationsByTestId.get(e.test_id) ?? [];
    list.push(e.location);
    locationsByTestId.set(e.test_id, list);
  });

  // Offset all timestamps so the latest test appears as today
  const latestMs = Math.max(...fixture.tests.map((t) => new Date(t.start_time).getTime()));
  const nowMs = Date.now();
  const offsetMs = nowMs - latestMs;
  const offsetDays = Math.floor(offsetMs / 86_400_000);
  const offsetMsRounded = offsetDays * 86_400_000;

  function shiftISO(iso: string): string {
    return new Date(new Date(iso).getTime() + offsetMsRounded).toISOString();
  }

  const filterStart = new Date(start + 'T00:00:00Z').getTime();
  const filterEnd   = new Date(end   + 'T23:59:59Z').getTime();

  const records: TestRecord[] = [];
  for (const test of fixture.tests) {
    const shiftedStart = new Date(test.start_time).getTime() + offsetMsRounded;
    if (shiftedStart < filterStart || shiftedStart > filterEnd) continue;

    const board   = boardMap.get(test.board_id);
    const product = board ? productMap.get(board.product_id) : undefined;

    records.push({
      id:             test.id,
      board_id:       test.board_id,
      start_time:     shiftISO(test.start_time),
      end_time:       shiftISO(test.end_time),
      result:         test.result,
      operator_id:    test.operator_id,
      fixture_id:     test.fixture_id,
      tester:         test.tester,
      source_file:    test.source_file,
      ingested_at:    test.ingested_at,
      serial_number:  board?.serial_number ?? test.board_id,
      mac_address:    board?.mac_address    ?? '',
      rev:            board?.rev            ?? '',
      product_id:     board?.product_id     ?? '',
      product_name:   product?.product_name ?? '',
      part_number:    product?.part_number  ?? '',
      error_locations: locationsByTestId.get(test.id) ?? [],
    });
  }

  return records.sort((a, b) => b.start_time.localeCompare(a.start_time));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end   = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params are required (YYYY-MM-DD)' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    const records = fetchFromFixture(start, end);
    return NextResponse.json({ records, demo: true });
  }

  try {
    const sb = getSupabaseForUser(authHeader);
    const records = await fetchFromSupabase(sb, start, end);
    return NextResponse.json({ records, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
