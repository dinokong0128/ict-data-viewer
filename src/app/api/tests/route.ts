/**
 * GET /api/tests?start=YYYY-MM-DD&end=YYYY-MM-DD[&page=1&pageSize=50&...]
 *
 * Data routing:
 *   - Authenticated request (Authorization: Bearer <jwt>):
 *       Queries Supabase using the user's JWT + anon key → RLS enforced.
 *   - Guest request (no Authorization header):
 *       Returns src/fixtures/guest-data.json (no Supabase call made).
 *
 * Query params:
 *   start, end  — required, YYYY-MM-DD
 *   page        — 1-based page number (default 1)
 *   pageSize    — rows per page (default 50, max 200)
 *   product     — exact match on product_name
 *   fixture     — exact match on fixture_id
 *   sn          — exact match on board_id / serial_number
 *   tester      — exact match on tester
 *   result      — 'pass' or 'fail'
 *   q           — free-text ILIKE against serial_number, tester, fixture_id, operator_id
 *                 (product_name search is not supported via PostgREST .or() — use product= instead)
 *   errors      — comma-separated location codes; filters to tests with matching error_locations
 *
 * Returns { records: TestRecord[], total: number, page: number, pageSize: number, demo: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import type { TestRecord, TestErrorRecord, TestsPageResponse } from '@/lib/testUtils';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Supabase live path (RLS-enforced via user JWT + anon key)
// ---------------------------------------------------------------------------

function getSupabaseForUser(authHeader: string): SupabaseClient {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  }) as SupabaseClient;
}

type TestsFilters = {
  product?: string;
  fixture?: string;
  sn?: string;
  tester?: string;
  result?: string;
  q?: string;
  errors?: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, start: string, end: string, filters: TestsFilters): any {
  let q = query
    .gte('start_time', start)
    .lte('start_time', end + 'T23:59:59Z');

  if (filters.fixture) q = q.eq('fixture_id', filters.fixture);
  if (filters.tester)  q = q.eq('tester', filters.tester);
  if (filters.sn)      q = q.eq('board_id', filters.sn);
  if (filters.result)  q = q.eq('result', filters.result);

  if (filters.q) {
    const escaped = filters.q.replace(/[%_]/g, '\\$&');
    q = q.or(
      [
        `serial_number.ilike.%${escaped}%`,
        `tester.ilike.%${escaped}%`,
        `fixture_id.ilike.%${escaped}%`,
        `operator_id.ilike.%${escaped}%`,
      ].join(','),
    );
    // Note: product_name search is not included here because it requires a join
    // through boards → products. Use the ?product= filter for product filtering.
  }

  if (filters.errors && filters.errors.length > 0) {
    // error_locations is a denormalized array column on tests
    q = q.overlaps('error_locations', filters.errors);
  }

  return q;
}

async function fetchFromSupabase(
  sb: SupabaseClient,
  start: string,
  end: string,
  page: number,
  pageSize: number,
  filters: TestsFilters,
): Promise<{ records: TestRecord[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const selectFields = `
    id, board_id, start_time, end_time, result, operator_id, fixture_id, tester,
    source_file, ingested_at, error_locations,
    boards!inner ( serial_number, mac_address, rev, product_id,
      products!inner ( product_name, part_number ) )
  `;

  const [countResult, dataResult] = await Promise.all([
    applyFilters(
      sb.from('tests').select('*', { count: 'exact', head: true }),
      start, end, filters,
    ),
    applyFilters(
      sb.from('tests').select(selectFields),
      start, end, filters,
    )
      .order('start_time', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1),
  ]);

  if (countResult.error) throw new Error(`Count query failed: ${countResult.error.message}`);
  if (dataResult.error)  throw new Error(`Data query failed: ${dataResult.error.message}`);

  const records = (dataResult.data ?? []).map((row: any): TestRecord => ({
    id:           row.id,
    board_id:     row.board_id,
    start_time:   row.start_time,
    end_time:     row.end_time,
    result:       row.result,
    operator_id:  row.operator_id  ?? '',
    fixture_id:   row.fixture_id   ?? '',
    tester:       row.tester       ?? '',
    source_file:  row.source_file  ?? '',
    ingested_at:  row.ingested_at  ?? '',
    serial_number: row.boards?.serial_number ?? row.board_id,
    mac_address:  row.boards?.mac_address    ?? '',
    rev:          row.boards?.rev            ?? '',
    product_id:   row.boards?.product_id     ?? '',
    product_name: row.boards?.products?.product_name ?? '',
    part_number:  row.boards?.products?.part_number  ?? '',
    error_locations: (row.error_locations ?? []) as string[],
    test_errors:  [],
  }));

  return { records, total: countResult.count ?? 0 };
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

function matchesTextFilter(
  record: TestRecord,
  q: string,
): boolean {
  const lower = q.toLowerCase();
  return (
    record.serial_number.toLowerCase().includes(lower) ||
    record.product_name.toLowerCase().includes(lower) ||
    record.tester.toLowerCase().includes(lower) ||
    record.fixture_id.toLowerCase().includes(lower) ||
    record.operator_id.toLowerCase().includes(lower) ||
    record.error_locations.some((loc) => loc.toLowerCase().includes(lower))
  );
}

function fetchFromFixture(
  start: string,
  end: string,
  page: number,
  pageSize: number,
  filters: TestsFilters,
): { records: TestRecord[]; total: number } {
  const fixture = loadFixture();

  const boardMap = new Map(fixture.boards.map((b) => [b.serial_number, b]));
  const productMap = new Map(fixture.products.map((p) => [p.part_number, p]));
  const errorsByTestId = new Map<number, TestErrorRecord[]>();
  fixture.test_errors.forEach((e) => {
    const list = errorsByTestId.get(e.test_id) ?? [];
    list.push({
      error_type:     e.error_type,
      location:       e.location,
      subtest:        e.subtest,
      part_spec:      e.part_spec,
      unit:           e.unit,
      measured_raw:   e.measured_raw,
      nominal_raw:    e.nominal_raw,
      high_limit_raw: e.high_limit_raw,
      low_limit_raw:  e.low_limit_raw,
      threshold_raw:  e.threshold_raw,
    });
    errorsByTestId.set(e.test_id, list);
  });

  // Offset timestamps so the latest test appears as today
  const latestMs = Math.max(...fixture.tests.map((t) => new Date(t.start_time).getTime()));
  const offsetDays = Math.floor((Date.now() - latestMs) / 86_400_000);
  const offsetMs = offsetDays * 86_400_000;

  function shiftISO(iso: string): string {
    return new Date(new Date(iso).getTime() + offsetMs).toISOString();
  }

  const filterStart = new Date(start + 'T00:00:00Z').getTime();
  const filterEnd   = new Date(end   + 'T23:59:59Z').getTime();

  const allRecords: TestRecord[] = [];
  for (const test of fixture.tests) {
    const shiftedStart = new Date(test.start_time).getTime() + offsetMs;
    if (shiftedStart < filterStart || shiftedStart > filterEnd) continue;

    const board   = boardMap.get(test.board_id);
    const product = board ? productMap.get(board.product_id) : undefined;

    const record: TestRecord = {
      id:           test.id,
      board_id:     test.board_id,
      start_time:   shiftISO(test.start_time),
      end_time:     shiftISO(test.end_time),
      result:       test.result,
      operator_id:  test.operator_id,
      fixture_id:   test.fixture_id,
      tester:       test.tester,
      source_file:  test.source_file,
      ingested_at:  test.ingested_at,
      serial_number: board?.serial_number ?? test.board_id,
      mac_address:  board?.mac_address    ?? '',
      rev:          board?.rev            ?? '',
      product_id:   board?.product_id     ?? '',
      product_name: product?.product_name ?? '',
      part_number:  product?.part_number  ?? '',
      error_locations: (errorsByTestId.get(test.id) ?? []).map((e) => e.location),
      test_errors:  [],
    };

    // Apply optional filters
    if (filters.fixture && record.fixture_id !== filters.fixture) continue;
    if (filters.tester  && record.tester      !== filters.tester)  continue;
    if (filters.sn      && record.board_id    !== filters.sn)       continue;
    if (filters.result  && record.result      !== filters.result)   continue;
    if (filters.product && record.product_name !== filters.product) continue;
    if (filters.q       && !matchesTextFilter(record, filters.q))   continue;
    if (filters.errors  && filters.errors.length > 0) {
      if (!filters.errors.some((loc) => record.error_locations.includes(loc))) continue;
    }

    allRecords.push(record);
  }

  // Descending by start_time
  allRecords.sort((a, b) => b.start_time.localeCompare(a.start_time));

  const total = allRecords.length;
  const offset = (page - 1) * pageSize;
  const records = allRecords.slice(offset, offset + pageSize);

  return { records, total };
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

  const rawPage     = parseInt(searchParams.get('page') ?? '1', 10);
  const rawPageSize = parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10);
  const page     = Math.max(1, isNaN(rawPage)     ? 1                : rawPage);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(rawPageSize) ? DEFAULT_PAGE_SIZE : rawPageSize));

  const errorsParam = searchParams.get('errors');
  const filters: TestsFilters = {
    product: searchParams.get('product') ?? undefined,
    fixture: searchParams.get('fixture') ?? undefined,
    sn:      searchParams.get('sn')      ?? undefined,
    tester:  searchParams.get('tester')  ?? undefined,
    result:  searchParams.get('result')  ?? undefined,
    q:       searchParams.get('q')       ?? undefined,
    errors:  errorsParam ? errorsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  };

  const authHeader = req.headers.get('authorization');

  // Guest path — no auth header → return fixture, no Supabase call made
  if (!authHeader) {
    const { records, total } = fetchFromFixture(start, end, page, pageSize, filters);
    return NextResponse.json({ records, total, page, pageSize, demo: true } satisfies TestsPageResponse);
  }

  // Authenticated path — use user JWT with anon key so RLS is enforced
  try {
    const sb = getSupabaseForUser(authHeader);
    const { records, total } = await fetchFromSupabase(sb, start, end, page, pageSize, filters);
    return NextResponse.json({ records, total, page, pageSize, demo: false } satisfies TestsPageResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
