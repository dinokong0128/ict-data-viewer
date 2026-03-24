/**
 * GET /api/test-errors?testIds=1,2,3
 *
 * Returns full error detail (readings) for a list of test IDs.
 * Called on-demand when a user expands a row in the detail table.
 *
 * Auth: same pattern as /api/tests
 *   - Authenticated (Authorization: Bearer <jwt>) → Supabase with RLS
 *   - Guest (no header) → fixture data filtered by testIds
 *
 * Response: { errors: Record<string, TestErrorRecord[]> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import type { TestErrorRecord } from '@/lib/testUtils';

function getSupabaseForUser(authHeader: string): SupabaseClient {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  }) as SupabaseClient;
}

function parseTestIds(raw: string | null): number[] | null {
  if (!raw) return null;
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n <= 0) return null;
    ids.push(n);
  }
  return ids.length > 0 ? ids : null;
}

async function fetchFromSupabase(
  sb: SupabaseClient,
  testIds: number[],
): Promise<Record<string, TestErrorRecord[]>> {
  const { data, error } = await sb
    .from('test_errors')
    .select('test_id, error_type, location, subtest, part_spec, unit, measured_raw, nominal_raw, high_limit_raw, low_limit_raw, threshold_raw')
    .in('test_id', testIds);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const result: Record<string, TestErrorRecord[]> = {};
  for (const id of testIds) result[id] = [];
  for (const row of data ?? []) {
    const key = String(row.test_id);
    if (!result[key]) result[key] = [];
    result[key].push({
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
    });
  }
  return result;
}

type FixtureData = {
  test_errors: Array<{
    test_id: number; error_type: string; location: string; subtest: string | null;
    part_spec: string; unit: string; measured_raw: string; nominal_raw: string;
    high_limit_raw: string; low_limit_raw: string; threshold_raw: string | null;
  }>;
};

function fetchFromFixture(testIds: number[]): Record<string, TestErrorRecord[]> {
  const filePath = path.join(process.cwd(), 'src', 'fixtures', 'guest-data.json');
  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf8')) as FixtureData;

  const idSet = new Set(testIds);
  const result: Record<string, TestErrorRecord[]> = {};
  for (const id of testIds) result[id] = [];

  for (const e of fixture.test_errors) {
    if (!idSet.has(e.test_id)) continue;
    const key = String(e.test_id);
    if (!result[key]) result[key] = [];
    result[key].push({
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
  }
  return result;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const testIds = parseTestIds(searchParams.get('testIds'));

  if (!testIds) {
    return NextResponse.json(
      { error: 'testIds query param is required (comma-separated integers)' },
      { status: 400 },
    );
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    const errors = fetchFromFixture(testIds);
    return NextResponse.json({ errors });
  }

  try {
    const sb = getSupabaseForUser(authHeader);
    const errors = await fetchFromSupabase(sb, testIds);
    return NextResponse.json({ errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
