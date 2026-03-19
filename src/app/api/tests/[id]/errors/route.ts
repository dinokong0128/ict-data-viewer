/**
 * GET /api/tests/:id/errors
 *
 * Returns full error details for a single test (lazy-loaded on expand).
 * Returns { errors: TestErrorRecord[] }
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

type FixtureData = {
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const testId = Number(params.id);
  if (Number.isNaN(testId)) {
    return NextResponse.json({ error: 'Invalid test ID' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');

  // Guest path — return errors from fixture data
  if (!authHeader) {
    const fixture = loadFixture();
    const errors: TestErrorRecord[] = fixture.test_errors
      .filter((e) => e.test_id === testId)
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
    return NextResponse.json({ errors });
  }

  // Authenticated path
  try {
    const sb = getSupabaseForUser(authHeader);
    const { data, error } = await sb
      .from('test_errors')
      .select('error_type, location, subtest, part_spec, unit, measured_raw, nominal_raw, high_limit_raw, low_limit_raw, threshold_raw')
      .eq('test_id', testId);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return NextResponse.json({ errors: (data ?? []) as TestErrorRecord[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
