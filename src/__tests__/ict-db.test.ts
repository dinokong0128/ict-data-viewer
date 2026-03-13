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
  board_id: '465136J+2609F808HH',
  product_id: '465136J',
  family: 'C2-ROT41',
  part_number: '8215911',
  revision: '13',
  mac_address: 'A8698C613296',
  result: 'PASS',
  start_time: new Date('2026-03-12T13:10:48Z'),
  end_time: new Date('2026-03-12T13:12:13Z'),
  operator_id: '102059',
  tester: 'TESTER-2',
  fixture_id: 'FxSJ_WW3423',
  testplan: 'Released-04-04-2025',
  platform: 'Agilent3070 Rev:8.30',
  errors: [
    {
      component: 'c314_1_c',
      component_value: '1UF',
      part_number: '110-5581-01',
      measured_raw: '0.78327u',
      measured: 7.8327e-7,
      nominal_raw: '1.0000u',
      nominal: 1e-6,
      high_limit_raw: '1.2000u',
      high_limit: 1.2e-6,
      low_limit_raw: '0.80000u',
      low_limit: 8e-7,
      unit: 'FARADS',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  // Default happy path:
  // products upsert
  const productsChain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
  // boards upsert
  const boardsChain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
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
      id: '465136J',
      part_number: '8215911',
      revision: '13',
      family: 'C2-ROT41',
    });
  });

  it('calls from("boards").upsert with correct fields', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[1][0]).toBe('boards');
    const upsertArg = mockFrom.mock.results[1].value.upsert.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      id: '465136J+2609F808HH',
      product_id: '465136J',
      mac_address: 'A8698C613296',
    });
  });

  it('calls from("tests").upsert with correct fields', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[2][0]).toBe('tests');
    const upsertArg = mockFrom.mock.results[2].value.upsert.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      board_id: '465136J+2609F808HH',
      result: 'PASS',
      operator_id: '102059',
    });
  });

  it('calls from("test_errors").insert when test is new', async () => {
    await upsertTest(PARSED);
    expect(mockFrom.mock.calls[3][0]).toBe('test_errors');
    const insertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(insertArg).toHaveLength(1);
    expect(insertArg[0]).toMatchObject({
      test_id: 42,
      component: 'c314_1_c',
      unit: 'FARADS',
    });
  });

  it('skips test_errors insert when test already existed (ignoreDuplicates → null)', async () => {
    // Re-wire: tests returns null (already existed)
    const productsChain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    const boardsChain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
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
    mockFrom.mockReturnValueOnce({
      upsert: jest.fn().mockResolvedValue({ error: { message: 'DB down' } }),
    });
    await expect(upsertTest(PARSED)).rejects.toThrow('products upsert failed: DB down');
  });

  it('throws when SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL;
    await expect(upsertTest(PARSED)).rejects.toThrow('SUPABASE_URL');
  });
});
