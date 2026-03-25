/**
 * GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD[&product=...&fixture=...&sn=...&tester=...]
 *
 * Returns pre-aggregated summary data for the dashboard chart and summary panel.
 * Two tiers:
 *   byDayFixtureTester — live query (~200–600ms), filtered by optional params
 *   errorsByDayLocation — reads mv_error_counts_by_day (~fast), NOT filtered by
 *                         product/fixture/sn/tester (materialized view carries no
 *                         those fields — accepted approximation)
 *
 * Data routing:
 *   - Authenticated request (Authorization: Bearer <jwt>):
 *       Queries Supabase using the service role key for server-side aggregation.
 *   - Guest request (no Authorization header):
 *       Computes in-memory from src/fixtures/guest-data.json.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import type { SummaryResponse, SummaryRow, ErrorCountRow } from '@/lib/testUtils';

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

/** Anon-key client scoped to the caller's JWT — used only to verify identity. */
function getSupabaseForUser(authHeader: string): SupabaseClient {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  }) as SupabaseClient;
}

/** Service-role client for server-side aggregation (no per-row RLS). */
function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type SummaryFilters = {
  product?: string;
  fixture?: string;
  sn?: string;
  tester?: string;
};

async function fetchSummaryFromSupabase(
  start: string,
  end: string,
  filters: SummaryFilters,
): Promise<SummaryResponse> {
  const sb = getSupabaseServiceClient();
  const endTs = end + 'T23:59:59Z';

  // Query A — live row-level query; aggregated in JS since PostgREST can't GROUP BY.
  // Note: product_name filtering goes through the join: boards.products.product_name
  let qA = sb
    .from('tests')
    .select(
      `start_time, fixture_id, tester, operator_id, result, board_id,
       boards!inner ( serial_number, product_id,
         products!inner ( product_name ) )`,
    )
    .gte('start_time', start)
    .lte('start_time', endTs);

  if (filters.fixture) qA = qA.eq('fixture_id', filters.fixture);
  if (filters.tester)  qA = qA.eq('tester', filters.tester);
  if (filters.sn)      qA = qA.eq('board_id', filters.sn);
  if (filters.product) qA = qA.eq('boards.products.product_name', filters.product);

  // Query B — read materialized view (no extra filters)
  const qB = sb
    .from('mv_error_counts_by_day')
    .select('day, location, error_count')
    .gte('day', start)
    .lte('day', end);

  const [resultA, resultB] = await Promise.all([qA, qB]);

  if (resultA.error) throw new Error(`Summary query A failed: ${resultA.error.message}`);
  if (resultB.error) throw new Error(`Summary query B failed: ${resultB.error.message}`);

  // Aggregate Query A rows in JS (PostgREST can't GROUP BY)
  type RawRow = {
    start_time: string;
    fixture_id: string;
    tester: string;
    operator_id: string;
    result: string;
    board_id: string;
    boards: { serial_number: string; product_id: string; products: { product_name: string } } | null;
  };

  const rawRows = (resultA.data ?? []) as unknown as RawRow[];
  const grouped = new Map<string, SummaryRow>();
  for (const r of rawRows) {
    const day = r.start_time.slice(0, 10);
    const key = `${day}|${r.fixture_id ?? ''}|${r.tester ?? ''}|${r.operator_id ?? ''}`;
    const existing = grouped.get(key) ?? {
      day,
      fixture_id: r.fixture_id ?? '',
      tester: r.tester ?? '',
      operator_id: r.operator_id ?? '',
      total: 0,
      pass: 0,
      fail: 0,
      unique_boards: 0,
    };
    existing.total += 1;
    if (r.result === 'pass') existing.pass += 1;
    else existing.fail += 1;
    grouped.set(key, existing);
  }

  // Compute unique_boards per group
  const boardSets = new Map<string, Set<string>>();
  for (const r of rawRows) {
    const day = r.start_time.slice(0, 10);
    const key = `${day}|${r.fixture_id ?? ''}|${r.tester ?? ''}|${r.operator_id ?? ''}`;
    if (!boardSets.has(key)) boardSets.set(key, new Set());
    boardSets.get(key)!.add(r.board_id);
  }
  for (const [key, row] of grouped) {
    row.unique_boards = boardSets.get(key)?.size ?? 0;
  }

  const byDayFixtureTester = Array.from(grouped.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  type MvRow = { day: string; location: string; error_count: number };
  const errorsByDayLocation: ErrorCountRow[] = ((resultB.data ?? []) as MvRow[]).map((r) => ({
    day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
    location: r.location,
    error_count: Number(r.error_count),
  }));

  return { byDayFixtureTester, errorsByDayLocation };
}

// ---------------------------------------------------------------------------
// Fixture / guest path
// ---------------------------------------------------------------------------

type FixtureData = {
  products: Array<{ part_number: string; product_name: string }>;
  boards: Array<{ serial_number: string; mac_address: string; rev: string; product_id: string }>;
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

function fetchSummaryFromFixture(
  start: string,
  end: string,
  filters: SummaryFilters,
): SummaryResponse {
  const fixture = loadFixture();

  const boardMap = new Map(fixture.boards.map((b) => [b.serial_number, b]));
  const productMap = new Map(fixture.products.map((p) => [p.part_number, p]));

  // Shift all timestamps so the latest test appears as today (mirrors /api/tests logic)
  const latestMs = Math.max(...fixture.tests.map((t) => new Date(t.start_time).getTime()));
  const offsetDays = Math.floor((Date.now() - latestMs) / 86_400_000);
  const offsetMs = offsetDays * 86_400_000;

  const filterStart = new Date(start + 'T00:00:00Z').getTime();
  const filterEnd   = new Date(end   + 'T23:59:59Z').getTime();

  // Group by (day, fixture_id, tester, operator_id)
  const grouped = new Map<string, SummaryRow>();
  const boardSets = new Map<string, Set<string>>();
  const errorsByDay = new Map<string, Map<string, number>>();

  for (const test of fixture.tests) {
    const shiftedMs = new Date(test.start_time).getTime() + offsetMs;
    if (shiftedMs < filterStart || shiftedMs > filterEnd) continue;

    const board   = boardMap.get(test.board_id);
    const product = board ? productMap.get(board.product_id) : undefined;

    // Apply optional filters
    if (filters.fixture && test.fixture_id !== filters.fixture) continue;
    if (filters.tester  && test.tester      !== filters.tester)  continue;
    if (filters.sn      && test.board_id    !== filters.sn)       continue;
    if (filters.product && product?.product_name !== filters.product) continue;

    const day = new Date(shiftedMs).toISOString().slice(0, 10);
    const key = `${day}|${test.fixture_id}|${test.tester}|${test.operator_id}`;

    const existing = grouped.get(key) ?? {
      day, fixture_id: test.fixture_id, tester: test.tester,
      operator_id: test.operator_id, total: 0, pass: 0, fail: 0, unique_boards: 0,
    };
    existing.total += 1;
    if (test.result === 'pass') existing.pass += 1;
    else existing.fail += 1;
    grouped.set(key, existing);

    if (!boardSets.has(key)) boardSets.set(key, new Set());
    boardSets.get(key)!.add(test.board_id);
  }

  for (const [key, row] of grouped) {
    row.unique_boards = boardSets.get(key)?.size ?? 0;
  }

  // Build error counts by day (from test_errors joined to matching tests)
  const matchingTestIds = new Set<number>();
  for (const test of fixture.tests) {
    const shiftedMs = new Date(test.start_time).getTime() + offsetMs;
    if (shiftedMs < filterStart || shiftedMs > filterEnd) continue;
    matchingTestIds.add(test.id);
  }

  for (const err of fixture.test_errors) {
    if (!matchingTestIds.has(err.test_id)) continue;
    const test = fixture.tests.find((t) => t.id === err.test_id);
    if (!test) continue;
    const shiftedMs = new Date(test.start_time).getTime() + offsetMs;
    const day = new Date(shiftedMs).toISOString().slice(0, 10);

    if (!errorsByDay.has(day)) errorsByDay.set(day, new Map());
    const dayMap = errorsByDay.get(day)!;
    dayMap.set(err.location, (dayMap.get(err.location) ?? 0) + 1);
  }

  const errorsByDayLocation: ErrorCountRow[] = [];
  for (const [day, locationMap] of errorsByDay) {
    for (const [location, error_count] of locationMap) {
      errorsByDayLocation.push({ day, location, error_count });
    }
  }
  errorsByDayLocation.sort((a, b) => a.day.localeCompare(b.day) || b.error_count - a.error_count);

  const byDayFixtureTester = Array.from(grouped.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  return { byDayFixtureTester, errorsByDayLocation };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end   = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json(
      { error: 'start and end query params are required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const filters: SummaryFilters = {
    product: searchParams.get('product') ?? undefined,
    fixture: searchParams.get('fixture') ?? undefined,
    sn:      searchParams.get('sn')      ?? undefined,
    tester:  searchParams.get('tester')  ?? undefined,
  };

  const authHeader = req.headers.get('authorization');

  // Guest path — no auth header → derive from fixture, no Supabase call
  if (!authHeader) {
    const result = fetchSummaryFromFixture(start, end, filters);
    return NextResponse.json(result satisfies SummaryResponse);
  }

  // Authenticated path — verify the caller's JWT before running service-role queries
  try {
    const userSb = getSupabaseForUser(authHeader);
    const { data: { user }, error: authError } = await userSb.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const result = await fetchSummaryFromSupabase(start, end, filters);
    return NextResponse.json(result satisfies SummaryResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
