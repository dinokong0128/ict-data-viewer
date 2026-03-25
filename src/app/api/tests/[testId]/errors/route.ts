/**
 * GET /api/tests/:testId/errors
 *
 * Returns full error detail (readings) for a single test.
 * Called on-demand when a user expands a row in the detail table.
 *
 * Auth: same pattern as /api/tests
 *   - Authenticated (Authorization: Bearer <jwt>) -> Supabase with RLS
 *   - Guest (no header) -> fixture data filtered by testId
 *
 * Response: { errors: TestErrorRecord[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import type { TestErrorRecord } from '@/lib/testUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

function isValidTestId(id: string): boolean {
  return UUID_RE.test(id) || NUMERIC_RE.test(id);
}

function getSupabaseForUser(authHeader: string): SupabaseClient {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  }) as SupabaseClient;
}

async function fetchFromSupabase(
  sb: SupabaseClient,
  testId: string,
): Promise<TestErrorRecord[]> {
  const { data, error } = await sb
    .from('test_errors')
    .select('error_type, location, subtest, part_spec, unit, measured_raw, nominal_raw, high_limit_raw, low_limit_raw, threshold_raw')
    .eq('test_id', testId);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    error_type:     row.error_type,
    location:       row.location,
    subtest:        row.subtest,
    part_spec:      row.part_spec,
    unit:           row.unit,
    measured_raw:   row.measured_raw,
    nominal_raw:    row.nominal_raw,
    high_limit_raw: row.high_limit_raw,
    low_limit_raw:  row.low_limit_raw,
    threshold_raw:  row.threshold_raw,
  }));
}

type FixtureData = {
  test_errors: Array<{
    test_id: number; error_type: string; location: string; subtest: string | null;
    part_spec: string; unit: string; measured_raw: string; nominal_raw: string;
    high_limit_raw: string; low_limit_raw: string; threshold_raw: string | null;
  }>;
};

function fetchFromFixture(testId: string): TestErrorRecord[] {
  const filePath = path.join(process.cwd(), 'src', 'fixtures', 'guest-data.json');
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8')) as FixtureData;

  // Fixture uses numeric IDs; match by string comparison
  return fixture.test_errors
    .filter((e) => String(e.test_id) === testId)
    .map((e) => ({
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
    }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { testId: string } },
): Promise<NextResponse> {
  const { testId } = params;

  if (!testId || !isValidTestId(testId)) {
    return NextResponse.json(
      { error: 'Invalid testId — expected a UUID or numeric ID' },
      { status: 400 },
    );
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    const errors = fetchFromFixture(testId);
    return NextResponse.json({ errors });
  }

  try {
    const sb = getSupabaseForUser(authHeader);
    const errors = await fetchFromSupabase(sb, testId);
    return NextResponse.json({ errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
