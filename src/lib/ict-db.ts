/**
 * ict-db.ts — Supabase upsert logic for ICT test data.
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY   (service role, not anon key)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ParsedTest } from './ict-parser';

// Untyped client — we don't use Supabase's generated schema types.
type UntypedClient = SupabaseClient<any, any, any>;

// Module-level singleton — one client per Vercel function instance,
// reused across all upsertTest() calls in the same request batch.
let _client: UntypedClient | null = null;

function getClient(): UntypedClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  _client = createClient(url, key) as UntypedClient;
  return _client;
}

/**
 * Upsert a fully-parsed test session into Supabase.
 *
 * Order:
 *   1. products  (upsert on part_number)
 *   2. boards    (upsert on serial_number)
 *   3. tests     (upsert with dedup key; capture id)
 *   4. test_errors (insert only when test row was newly created)
 */
export async function upsertTest(parsed: ParsedTest): Promise<void> {
  const sb = getClient();

  // 1. products
  const { data: productData, error: prodErr } = await sb
    .from('products')
    .upsert(
      {
        part_number:  parsed.product_id,
        product_name: parsed.product_name,
      },
      { onConflict: 'part_number' }
    )
    .select('id')
    .single();
  if (prodErr) throw new Error(`products upsert failed: ${prodErr.message}`);
  const productId = productData!.id as string;

  // 2. boards
  const { data: boardData, error: boardErr } = await sb
    .from('boards')
    .upsert(
      {
        serial_number: parsed.serial_number,
        product_id:    productId,
        mac_address:   parsed.mac_address,
        rev:           parsed.rev,
      },
      { onConflict: 'serial_number' }
    )
    .select('id')
    .single();
  if (boardErr) throw new Error(`boards upsert failed: ${boardErr.message}`);
  const boardId = boardData!.id as string;

  // 3. tests — upsert with ignoreDuplicates so we can detect new vs existing
  const locations = parsed.errors.map((e) => e.location);
  const { data: testData, error: testErr } = await sb
    .from('tests')
    .upsert(
      {
        board_id:    boardId,
        start_time:  parsed.start_time.toISOString(),
        end_time:    parsed.end_time.toISOString(),
        result:      parsed.result,
        operator_id: parsed.operator_id,
        fixture_id:  parsed.fixture_id,
        tester:      parsed.tester,
        source_file: parsed.source_file,
        error_locations: locations,
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
      test_id:        testId,
      error_type:     e.error_type,
      location:       e.location,
      subtest:        e.subtest,
      part_spec:      e.part_spec,
      unit:           e.unit,
      measured_raw:   e.measured_raw,
      nominal_raw:    e.nominal_raw,
      high_limit_raw: e.high_limit_raw,
      low_limit_raw:  e.low_limit_raw,
      threshold_raw:   e.threshold_raw,
      threshold_value: e.threshold_value,
      raw_block:       e.raw_block,
    }))
  );
  if (errErr) throw new Error(`test_errors insert failed: ${errErr.message}`);
}
