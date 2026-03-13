/**
 * ict-db.ts — Supabase upsert logic for ICT test data.
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role, not anon key)
 */

import { createClient } from '@supabase/supabase-js';
import type { ParsedTest } from './ict-parser';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key);
}

/**
 * Upsert a fully-parsed test session into Supabase.
 *
 * Order:
 *   1. products  (upsert)
 *   2. boards    (upsert)
 *   3. tests     (upsert with dedup key; capture id)
 *   4. test_errors (insert only when test row was newly created)
 */
export async function upsertTest(parsed: ParsedTest): Promise<void> {
  const sb = getClient();

  // 1. products
  const { error: prodErr } = await sb
    .from('products')
    .upsert(
      {
        id: parsed.product_id,
        part_number: parsed.part_number,
        revision: parsed.revision,
        family: parsed.family,
      },
      { onConflict: 'id' }
    );
  if (prodErr) throw new Error(`products upsert failed: ${prodErr.message}`);

  // 2. boards
  const { error: boardErr } = await sb
    .from('boards')
    .upsert(
      {
        id: parsed.board_id,
        product_id: parsed.product_id,
        mac_address: parsed.mac_address,
      },
      { onConflict: 'id' }
    );
  if (boardErr) throw new Error(`boards upsert failed: ${boardErr.message}`);

  // 3. tests — upsert with ignoreDuplicates so we can detect new vs existing
  const { data: testData, error: testErr } = await sb
    .from('tests')
    .upsert(
      {
        board_id: parsed.board_id,
        start_time: parsed.start_time.toISOString(),
        end_time: parsed.end_time.toISOString(),
        result: parsed.result,
        operator_id: parsed.operator_id,
        tester: parsed.tester,
        fixture_id: parsed.fixture_id,
        testplan: parsed.testplan,
        platform: parsed.platform,
      },
      { onConflict: 'board_id,start_time,end_time', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();
  if (testErr) throw new Error(`tests upsert failed: ${testErr.message}`);

  // If null the row already existed (ignoreDuplicates); skip errors to avoid duplication
  if (!testData) return;

  const testId = testData.id as number;

  // 4. test_errors
  if (parsed.errors.length === 0) return;

  const { error: errErr } = await sb.from('test_errors').insert(
    parsed.errors.map((e) => ({
      test_id: testId,
      component: e.component,
      component_value: e.component_value,
      part_number: e.part_number,
      measured_raw: e.measured_raw,
      measured: e.measured,
      nominal_raw: e.nominal_raw,
      nominal: e.nominal,
      high_limit_raw: e.high_limit_raw,
      high_limit: e.high_limit,
      low_limit_raw: e.low_limit_raw,
      low_limit: e.low_limit,
      unit: e.unit,
    }))
  );
  if (errErr) throw new Error(`test_errors insert failed: ${errErr.message}`);
}
