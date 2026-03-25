/**
 * @jest-environment node
 *
 * test-errors-single-route.test.ts
 *
 * Tests for GET /api/tests/[testId]/errors — error detail for a single test.
 */
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockGetUser = jest.fn();

// Default resolved value for the query chain
let queryResult = { data: [] as any[], error: null as any };

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((_url: string, _key: string) => ({
    auth: { getUser: mockGetUser },
    from: jest.fn().mockReturnValue({
      select: (...args: any[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: any[]) => {
            mockEq(...eqArgs);
            return Promise.resolve(queryResult);
          },
        };
      },
    }),
  })),
}));

// ---------------------------------------------------------------------------
// fs mock — inline fixture data
// ---------------------------------------------------------------------------

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    test_errors: [
      {
        test_id: 1,
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
      {
        test_id: 1,
        error_type: 'digital_pin',
        location: 'U3-pin5',
        subtest: 'logic_high',
        part_spec: '',
        unit: '',
        measured_raw: '0.2V',
        nominal_raw: '3.3V',
        high_limit_raw: '3.6V',
        low_limit_raw: '2.7V',
        threshold_raw: null,
      },
      {
        test_id: 2,
        error_type: 'shorts_report',
        location: 'net-VCC',
        subtest: null,
        part_spec: '',
        unit: 'OHMS',
        measured_raw: '5',
        nominal_raw: '',
        high_limit_raw: '',
        low_limit_raw: '',
        threshold_raw: '50',
      },
    ],
  })),
}));

// Import route handler AFTER mocks
import { GET } from '@/app/api/tests/[testId]/errors/route';

function makeRequest(
  testId: string,
  headers: Record<string, string> = {},
): [NextRequest, { params: Promise<{ testId: string }> }] {
  const url = new URL(`http://localhost/api/tests/${testId}/errors`);
  const req = new NextRequest(url, { headers });
  return [req, { params: Promise.resolve({ testId }) }];
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

describe('GET /api/tests/[testId]/errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResult = { data: [], error: null };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
  });

  describe('validation', () => {
    it('returns 400 for invalid testId format', async () => {
      const [req, ctx] = makeRequest('abc-not-valid');
      const res = await GET(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/invalid testid/i);
    });

    it('returns 400 for decimal number', async () => {
      const [req, ctx] = makeRequest('12.5');
      const res = await GET(req, ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('guest path (no Authorization header)', () => {
    it('returns errors from fixture for numeric testId', async () => {
      const [req, ctx] = makeRequest('1');
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);

      const body = await res.json() as { errors: Array<{ location: string }> };
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0].location).toBe('resistor-R10');
      expect(body.errors[1].location).toBe('U3-pin5');
    });

    it('returns empty array for testId with no matching errors', async () => {
      const [req, ctx] = makeRequest('999');
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);

      const body = await res.json() as { errors: unknown[] };
      expect(body.errors).toHaveLength(0);
    });

    it('returns errors for a different testId', async () => {
      const [req, ctx] = makeRequest('2');
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);

      const body = await res.json() as { errors: Array<{ location: string; error_type: string }> };
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].location).toBe('net-VCC');
      expect(body.errors[0].error_type).toBe('shorts_report');
    });
  });

  describe('authenticated path (with Authorization header)', () => {
    it('accepts UUID format testId', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      queryResult = {
        data: [{
          error_type: 'analog', location: 'C5', subtest: null,
          part_spec: '1UF', unit: 'FARADS', measured_raw: '0.8u',
          nominal_raw: '1u', high_limit_raw: '1.1u', low_limit_raw: '0.9u',
          threshold_raw: null,
        }],
        error: null,
      };

      const [req, ctx] = makeRequest(uuid, { authorization: 'Bearer test-jwt' });
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);

      const body = await res.json() as { errors: Array<{ location: string }> };
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].location).toBe('C5');
    });

    it('queries Supabase with correct test_id', async () => {
      const [req, ctx] = makeRequest('42', { authorization: 'Bearer test-jwt' });
      await GET(req, ctx);

      expect(mockEq).toHaveBeenCalledWith('test_id', '42');
    });

    it('returns 500 on Supabase failure', async () => {
      queryResult = { data: null, error: { message: 'DB error' } };

      const [req, ctx] = makeRequest('42', { authorization: 'Bearer test-jwt' });
      const res = await GET(req, ctx);
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/supabase query failed/i);
    });
  });
});
