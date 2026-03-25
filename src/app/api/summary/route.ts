/**
 * GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD[&product=...&fixture=...&tester=...]
 *
 * Returns pre-aggregated summary data for the dashboard chart and summary panel.
 * Two materialized views (both filterable by product/fixture/tester):
 *   byDayFixtureTester  — reads mv_summary_by_day
 *   errorsByDayLocation — reads mv_error_counts_by_day
 *
 * Data routing:
 *   - Authenticated request (Authorization: Bearer <jwt>):
 *       Queries Supabase materialized views using the service role key.
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
  tester?: string;
};

async function fetchSummaryFromSupabase(
  start: string,
  end: string,
  filters: SummaryFilters,
): Promise<SummaryResponse> {
  const sb = getSupabaseServiceClient();

  // Query A — mv_summary_by_day (pre-aggregated by day/fixture/tester/operator/product)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qA: any = sb.from('mv_summary_by_day').select('*')
    .gte('day', start).lte('day', end);
  if (filters.fixture) qA = qA.eq('fixture_id', filters.fixture);
  if (filters.tester)  qA = qA.eq('tester', filters.tester);
  if (filters.product) qA = qA.eq('product_name', filters.product);

  // Query B — mv_error_counts_by_day (pre-aggregated by day/location/fixture/tester/product)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qB: any = sb.from('mv_error_counts_by_day').select('*')
    .gte('day', start).lte('day', end);
  if (filters.fixture) qB = qB.eq('fixture_id', filters.fixture);
  if (filters.tester)  qB = qB.eq('tester', filters.tester);
  if (filters.product) qB = qB.eq('product_name', filters.product);

  const [resultA, resultB] = await Promise.all([qA, qB]);

  if (resultA.error) throw new Error(`Summary query failed: ${resultA.error.message}`);
  if (resultB.error) throw new Error(`Error counts query failed: ${resultB.error.message}`);

  const byDayFixtureTester: SummaryRow[] = (resultA.data ?? []).map((r: any) => ({
    day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
    fixture_id: r.fixture_id ?? '',
    tester: r.tester ?? '',
    operator_id: r.operator_id ?? '',
    total: Number(r.total),
    pass: Number(r.pass),
    fail: Number(r.fail),
    unique_boards: Number(r.unique_boards),
  }));

  const errorsByDayLocation: ErrorCountRow[] = (resultB.data ?? []).map((r: any) => ({
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

  // Build error counts by day (from test_errors joined to matching tests, filtered)
  const matchingTestIds = new Set<number>();
  for (const test of fixture.tests) {
    const shiftedMs = new Date(test.start_time).getTime() + offsetMs;
    if (shiftedMs < filterStart || shiftedMs > filterEnd) continue;

    const board   = boardMap.get(test.board_id);
    const product = board ? productMap.get(board.product_id) : undefined;

    // Apply same filters as byDayFixtureTester
    if (filters.fixture && test.fixture_id !== filters.fixture) continue;
    if (filters.tester  && test.tester      !== filters.tester)  continue;
    if (filters.product && product?.product_name !== filters.product) continue;

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
