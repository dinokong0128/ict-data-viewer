/**
 * ict-db.test.ts
 *
 * All Supabase calls are fully mocked — no real DB is touched.
 */

// Must mock before importing ict-db so createClient returns our mock
const mockSelect = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();
const mockInsert = jest.fn();

// Build a chainable mock that always returns the same shape
function makeFrom(overrides: Record<string, jest.Mock> = {}) {
  return {
    upsert: overrides.upsert ?? mockUpsert,
    insert: overrides.insert ?? mockInsert,
    select: overrides.select ?? mockSelect,
    maybeSingle: overrides.maybeSingle ?? mockMaybeSingle,
  };
}

const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

import { upsertTest } from '@/lib/ict-db';
import type { ParsedTest } from '@/lib/ict-parser';

const PARSED: ParsedTest = {
  serial_number: 'SN-XXXX-000001',
  product_id:    'PART-REDACTED-001',
  product_name:  'Test Product A',
  rev:           '13',
  mac_address:   '020000000001',
  result:        'pass',
  start_time:    new Date('2026-03-12T13:10:48Z'),
  end_time:      new Date('2026-03-12T13:12:13Z'),
  operator_id:   'operator-01',
  tester:        'tester-01',
  fixture_id:    'fixture-01',
  source_file:   'PROD-001_SN-XXXX-000001.log',
  errors: [
    {
      error_type:     'analog',
      location:       'c01',
      subtest:        null,
      part_spec:      '1UF',
      unit:           'FARADS',
      measured_raw:   '0.78327u',
      nominal_raw:    '1.0000u',
      high_limit_raw: '1.2000u',
      low_limit_raw:  '0.80000u',
      threshold_raw:  null,
      raw_block:      'c01 HAS FAILED\nC01=1UF Part# PART-REDACTED-002\nMeasured: 0.78327u',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-key';

  // Default happy path:
  // products upsert — chain: .upsert().select().single()
  const productsSingleFn = jest.fn().mockResolvedValue({ data: { id: 'prod-uuid-001' }, error: null });
  const productsSelectFn = jest.fn().mockReturnValue({ single: productsSingleFn });
  const productsUpsertFn = jest.fn().mockReturnValue({ select: productsSelectFn });
  const productsChain = { upsert: productsUpsertFn };
  // boards upsert — chain: .upsert().select().single()
  const boardsSingleFn = jest.fn().mockResolvedValue({ data: { id: 'board-uuid-001' }, error: null });
  const boardsSelectFn = jest.fn().mockReturnValue({ single: boardsSingleFn });
  const boardsUpsertFn = jest.fn().mockReturnValue({ select: boardsSelectFn });
  const boardsChain = { upsert: boardsUpsertFn };
  // tests upsert — chain: .upsert().select().maybeSingle()
  const maybeSingleFn = jest.fn().mockResolvedValue({ data: { id: 42 }, error: null });
  const selectFn = jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const testsUpsertFn = jest.fn().mockReturnValue({ select: selectFn });
  const testsChain = { upsert: testsUpsertFn };
  // test_errors insert
  const errorsChain = { insert: jest.fn().mockResolvedValue({ error: null }) };

  mockFrom
    .mockReturnValueOnce(productsChain)
    .mockReturnValueOnce(boardsChain)
    .mockReturnValueOnce(testsChain)
    .mockReturnValueOnce(errorsChain);
});

describe('upsertTest', () => {
  it('calls from("products").upsert with correct fields', async () => {
    await upsertTest(PARSED);
    const productsCall = mockFrom.mock.calls[0][0];
    expect(productsCall).toBe('products');
    const upsertArg = mockFrom.mock.results[0].value.upsert.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      part_number:  'PART-REDACTED-001',
      product_name: 'Test Product A',
    });
  });

  it('calls from("boards").upsert with correct fields', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[1][0]).toBe('boards');
    const upsertArg = mockFrom.mock.results[1].value.upsert.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      serial_number: 'SN-XXXX-000001',
      product_id:    'prod-uuid-001',
      mac_address:   '020000000001',
      rev:           '13',
    });
  });

  it('calls from("tests").upsert with correct fields', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[2][0]).toBe('tests');
    const upsertArg = mockFrom.mock.results[2].value.upsert.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      board_id:    'board-uuid-001',
      result:      'pass',
      operator_id: 'operator-01',
      source_file: 'PROD-001_SN-XXXX-000001.log',
    });
  });

  it('calls from("test_errors").insert when test is new', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[3][0]).toBe('test_errors');
    const insertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(insertArg).toHaveLength(1);
    expect(insertArg[0]).toMatchObject({
      test_id:    42,
      error_type: 'analog',
      location:   'c01',
      part_spec:  '1UF',
      unit:       'FARADS',
      raw_block:  'c01 HAS FAILED\nC01=1UF Part# PART-REDACTED-002\nMeasured: 0.78327u',
    });
  });

  it('skips test_errors insert when test already existed (ignoreDuplicates → null)', async () => {
    // Re-wire: tests returns null (already existed)
    const productsSingleFn = jest.fn().mockResolvedValue({ data: { id: 'prod-uuid-001' }, error: null });
    const productsSelectFn = jest.fn().mockReturnValue({ single: productsSingleFn });
    const productsUpsertFn = jest.fn().mockReturnValue({ select: productsSelectFn });
    const productsChain = { upsert: productsUpsertFn };
    const boardsSingleFn2 = jest.fn().mockResolvedValue({ data: { id: 'board-uuid-001' }, error: null });
    const boardsSelectFn2 = jest.fn().mockReturnValue({ single: boardsSingleFn2 });
    const boardsUpsertFn2 = jest.fn().mockReturnValue({ select: boardsSelectFn2 });
    const boardsChain = { upsert: boardsUpsertFn2 };
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: null, error: null });
    const selectFn = jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
    const testsUpsertFn = jest.fn().mockReturnValue({ select: selectFn });
    const testsChain = { upsert: testsUpsertFn };

    mockFrom.mockReset();
    mockFrom
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(boardsChain)
      .mockReturnValueOnce(testsChain);

    await upsertTest(PARSED);
    // from() should only have been called 3 times (no test_errors call)
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it('throws when products upsert fails', async () => {
    mockFrom.mockReset();
    const singleFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } });
    const selectFn = jest.fn().mockReturnValue({ single: singleFn });
    const upsertFn = jest.fn().mockReturnValue({ select: selectFn });
    mockFrom.mockReturnValueOnce({ upsert: upsertFn });
    await expect(upsertTest(PARSED)).rejects.toThrow('products upsert failed: DB down');
  });

  it('throws when SUPABASE_URL is missing', async () => {
    // The module-level singleton means getClient() only checks env vars on the
    // first call. Use isolateModulesAsync to load a fresh module instance with
    // no cached client so the env var check is exercised.
    delete process.env.SUPABASE_URL;
    await jest.isolateModulesAsync(async () => {
      const { upsertTest: freshUpsert } = await import('@/lib/ict-db');
      await expect(freshUpsert(PARSED)).rejects.toThrow('SUPABASE_URL');
    });
  });
});
