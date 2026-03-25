/**
 * @jest-environment node
 *
 * summary-route.test.ts
 *
 * Tests for GET /api/summary — pre-aggregated summary data endpoint.
 */
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase mock — service-role client uses .rpc(), anon-key uses auth.getUser()
// ---------------------------------------------------------------------------

const mockRpc = jest.fn();

// Mock for auth.getUser() on the anon-key client (JWT validation)
const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((_url: string, key: string) => {
    // Anon-key client — used only for JWT verification
    if (key !== 'test-service-key') {
      return { auth: { getUser: mockGetUser } };
    }
    // Service-role client — uses .rpc() for aggregated queries
    return { rpc: mockRpc };
  }),
}));

// ---------------------------------------------------------------------------
// fs mock — inline fixture data (MUST be inline; jest.mock is hoisted)
// ---------------------------------------------------------------------------

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    products: [
      { part_number: 'PART-001', product_name: 'Product Alpha' },
      { part_number: 'PART-002', product_name: 'Product Beta' },
    ],
    boards: [
      { serial_number: 'SN-001', mac_address: '020000000001', rev: '1', product_id: 'PART-001' },
      { serial_number: 'SN-002', mac_address: '020000000002', rev: '1', product_id: 'PART-002' },
    ],
    tests: [
      // Timestamps set to year 2000 — the route shifts them to "today"
      {
        id: 1,
        board_id: 'SN-001',
        start_time: '2000-01-01T08:00:00Z',
        end_time:   '2000-01-01T08:01:00Z',
        result: 'pass',
        operator_id: 'op-01',
        fixture_id: 'fix-01',
        tester: 'tester-01',
        source_file: 'test.log',
        ingested_at: '2000-01-01T08:01:00Z',
      },
      {
        id: 2,
        board_id: 'SN-002',
        start_time: '2000-01-01T09:00:00Z',
        end_time:   '2000-01-01T09:01:00Z',
        result: 'fail',
        operator_id: 'op-02',
        fixture_id: 'fix-02',
        tester: 'tester-02',
        source_file: 'test2.log',
        ingested_at: '2000-01-01T09:01:00Z',
      },
    ],
    test_errors: [
      {
        test_id: 2,
        error_type: 'analog',
        location: 'resistor-R10',
        subtest: null,
        part_spec: '10K',
        unit: 'OHMS',
        measured_raw: '15K',
        nominal_raw: '10K',
        high_limit_raw: '11K',
        low_limit_raw: '9K',
        threshold_raw: null,
      },
    ],
  })),
}));

// Import route handler AFTER mocks are set up
import { GET } from '@/app/api/summary/route';

function makeRequest(searchParams: Record<string, string>, headers: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/summary?${new URLSearchParams(searchParams).toString()}`);
  return new NextRequest(url, { headers });
}

// The fixture tests shift timestamps to "today", so we need today's date
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Set env vars so the mock can distinguish anon vs service-role clients
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

describe('GET /api/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: RPC calls return empty arrays
    mockRpc.mockResolvedValue({ data: [], error: null });
    // Default: valid user
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
  });

  describe('validation', () => {
    it('returns 400 when start is missing', async () => {
      const req = makeRequest({ end: '2026-03-24' });
      const res = await GET(req);
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/start and end/i);
    });

    it('returns 400 when end is missing', async () => {
      const req = makeRequest({ start: '2026-03-01' });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('guest path (no Authorization header)', () => {
    it('returns SummaryResponse shape with byDayFixtureTester and errorsByDayLocation', async () => {
      const today = getToday();
      const req = makeRequest({ start: today, end: today });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { byDayFixtureTester: unknown[]; errorsByDayLocation: unknown[] };
      expect(Array.isArray(body.byDayFixtureTester)).toBe(true);
      expect(Array.isArray(body.errorsByDayLocation)).toBe(true);
    });

    it('aggregates 2 fixture tests: total=2, pass=1, fail=1', async () => {
      const today = getToday();
      const req = makeRequest({ start: today, end: today });
      const res = await GET(req);
      const body = await res.json() as { byDayFixtureTester: Array<{ total: number; pass: number; fail: number }> };

      const totalTests = body.byDayFixtureTester.reduce((s, r) => s + r.total, 0);
      const totalPass  = body.byDayFixtureTester.reduce((s, r) => s + r.pass, 0);
      const totalFail  = body.byDayFixtureTester.reduce((s, r) => s + r.fail, 0);

      expect(totalTests).toBe(2);
      expect(totalPass).toBe(1);
      expect(totalFail).toBe(1);
    });

    it('includes resistor-R10 error in errorsByDayLocation', async () => {
      const today = getToday();
      const req = makeRequest({ start: today, end: today });
      const res = await GET(req);
      const body = await res.json() as { errorsByDayLocation: Array<{ location: string; error_count: number }> };

      const r10 = body.errorsByDayLocation.find((e) => e.location === 'resistor-R10');
      expect(r10).toBeDefined();
      expect(r10?.error_count).toBe(1);
    });

    it('product filter narrows byDayFixtureTester to matching product only', async () => {
      const today = getToday();
      const req = makeRequest({ start: today, end: today, product: 'Product Alpha' });
      const res = await GET(req);
      const body = await res.json() as { byDayFixtureTester: Array<{ total: number; fixture_id: string }> };

      const totalTests = body.byDayFixtureTester.reduce((s, r) => s + r.total, 0);
      expect(totalTests).toBe(1);
      expect(body.byDayFixtureTester[0].fixture_id).toBe('fix-01');
    });

    it('product filter also narrows errorsByDayLocation', async () => {
      const today = getToday();
      // Product Alpha only has passing tests (id=1), so no errors
      const req = makeRequest({ start: today, end: today, product: 'Product Alpha' });
      const res = await GET(req);
      const body = await res.json() as { errorsByDayLocation: Array<{ location: string }> };

      expect(body.errorsByDayLocation).toHaveLength(0);
    });

    it('returns empty arrays when no records match the date range', async () => {
      const req = makeRequest({ start: '1990-01-01', end: '1990-01-01' });
      const res = await GET(req);
      const body = await res.json() as { byDayFixtureTester: unknown[]; errorsByDayLocation: unknown[] };

      expect(body.byDayFixtureTester).toHaveLength(0);
      expect(body.errorsByDayLocation).toHaveLength(0);
    });
  });

  describe('authenticated path (with Authorization header)', () => {
    it('returns 401 when JWT is invalid', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24' },
        { authorization: 'Bearer invalid-jwt' },
      );
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/invalid|expired/i);
    });

    it('calls both RPC functions with correct parameters', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24', fixture: 'fix-01', product: 'Product Alpha' },
        { authorization: 'Bearer test-jwt' },
      );
      await GET(req);

      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockRpc).toHaveBeenCalledWith('summary_by_day_fixture_tester', {
        p_start: '2026-03-22T00:00:00Z',
        p_end: '2026-03-24T23:59:59Z',
        p_fixture: 'fix-01',
        p_tester: null,
        p_sn: null,
        p_product: 'Product Alpha',
      });
      expect(mockRpc).toHaveBeenCalledWith('error_counts_by_day_location', {
        p_start: '2026-03-22T00:00:00Z',
        p_end: '2026-03-24T23:59:59Z',
        p_fixture: 'fix-01',
        p_tester: null,
        p_sn: null,
        p_product: 'Product Alpha',
      });
    });

    it('aggregates byDayFixtureTester from RPC result', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'summary_by_day_fixture_tester') {
          return Promise.resolve({
            data: [
              { day: '2026-03-22', fixture_id: 'fix-01', tester: 'tester-01', operator_id: 'op-01', total: 2, pass: 1, fail: 1, unique_boards: 2 },
              { day: '2026-03-23', fixture_id: 'fix-02', tester: 'tester-02', operator_id: 'op-02', total: 1, pass: 1, fail: 0, unique_boards: 1 },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24' },
        { authorization: 'Bearer test-jwt' },
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { byDayFixtureTester: Array<{ day: string; fixture_id: string; total: number; pass: number; fail: number }> };
      const totalTests = body.byDayFixtureTester.reduce((s, r) => s + r.total, 0);
      expect(totalTests).toBe(3);

      const fix01Row = body.byDayFixtureTester.find((r) => r.fixture_id === 'fix-01' && r.day === '2026-03-22');
      expect(fix01Row?.total).toBe(2);
      expect(fix01Row?.pass).toBe(1);
      expect(fix01Row?.fail).toBe(1);
    });

    it('returns errorsByDayLocation from RPC result', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'error_counts_by_day_location') {
          return Promise.resolve({
            data: [{ day: '2026-03-22', location: 'resistor-R10', error_count: 2 }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24' },
        { authorization: 'Bearer test-jwt' },
      );
      const res = await GET(req);
      const body = await res.json() as { errorsByDayLocation: Array<{ day: string; location: string; error_count: number }> };

      expect(body.errorsByDayLocation).toHaveLength(1);
      expect(body.errorsByDayLocation[0].location).toBe('resistor-R10');
      expect(body.errorsByDayLocation[0].error_count).toBe(2);
    });

    it('returns 500 when summary RPC fails', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'summary_by_day_fixture_tester') {
          return Promise.resolve({ data: null, error: { message: 'DB error' } });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24' },
        { authorization: 'Bearer test-jwt' },
      );
      const res = await GET(req);
      expect(res.status).toBe(500);
    });

    it('returns 500 when error counts RPC fails', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'error_counts_by_day_location') {
          return Promise.resolve({ data: null, error: { message: 'RPC error' } });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const req = makeRequest(
        { start: '2026-03-22', end: '2026-03-24' },
        { authorization: 'Bearer test-jwt' },
      );
      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });
});
