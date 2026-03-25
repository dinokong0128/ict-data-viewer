/**
 * @jest-environment node
 *
 * test-errors-route.test.ts
 *
 * Tests for GET /api/test-errors — on-demand error detail endpoint.
 */
import { NextRequest } from 'next/server';

// Mock Supabase
const mockIn = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ in: mockIn });
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

// Mock fs for fixture loading
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    test_errors: [
      {
        test_id: 1,
        error_type: 'analog',
        location: 'c01',
        subtest: null,
        part_spec: '1UF',
        unit: 'FARADS',
        measured_raw: '0.78u',
        nominal_raw: '1.0u',
        high_limit_raw: '1.2u',
        low_limit_raw: '0.8u',
        threshold_raw: null,
      },
      {
        test_id: 2,
        error_type: 'digital',
        location: 'u05',
        subtest: 'pin3',
        part_spec: 'IC',
        unit: 'VOLTS',
        measured_raw: '0.5',
        nominal_raw: '3.3',
        high_limit_raw: '3.6',
        low_limit_raw: '3.0',
        threshold_raw: null,
      },
      {
        test_id: 1,
        error_type: 'analog',
        location: 'r10',
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

import { GET } from '@/app/api/test-errors/route';

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), {
    headers: headers ?? {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

describe('GET /api/test-errors', () => {
  describe('validation', () => {
    it('returns 400 when testIds is missing', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/testIds/);
    });

    it('returns 400 when testIds contains non-integers', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors?testIds=abc,2'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when testIds is empty', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors?testIds='));
      expect(res.status).toBe(400);
    });
  });

  describe('guest path (fixture)', () => {
    it('returns filtered errors from fixture by testIds', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors?testIds=1'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.errors['1']).toHaveLength(2);
      expect(body.errors['1'][0].location).toBe('c01');
      expect(body.errors['1'][1].location).toBe('r10');
    });

    it('returns empty array for testIds with no errors', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors?testIds=999'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.errors['999']).toEqual([]);
    });

    it('handles multiple testIds', async () => {
      const res = await GET(makeRequest('http://localhost/api/test-errors?testIds=1,2'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.errors['1']).toHaveLength(2);
      expect(body.errors['2']).toHaveLength(1);
      expect(body.errors['2'][0].location).toBe('u05');
    });
  });

  describe('authenticated path (Supabase)', () => {
    it('queries Supabase with testIds and returns mapped errors', async () => {
      mockIn.mockResolvedValue({
        data: [
          {
            test_id: 5,
            error_type: 'analog',
            location: 'c01',
            subtest: null,
            part_spec: '1UF',
            unit: 'FARADS',
            measured_raw: '0.78u',
            nominal_raw: '1.0u',
            high_limit_raw: '1.2u',
            low_limit_raw: '0.8u',
            threshold_raw: null,
          },
        ],
        error: null,
      });

      const res = await GET(makeRequest(
        'http://localhost/api/test-errors?testIds=5',
        { authorization: 'Bearer test-jwt' },
      ));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.errors['5']).toHaveLength(1);
      expect(body.errors['5'][0].location).toBe('c01');

      expect(mockFrom).toHaveBeenCalledWith('test_errors');
      expect(mockIn).toHaveBeenCalledWith('test_id', [5]);
    });

    it('returns 500 when Supabase query fails', async () => {
      mockIn.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      const res = await GET(makeRequest(
        'http://localhost/api/test-errors?testIds=1',
        { authorization: 'Bearer test-jwt' },
      ));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/DB error/);
    });
  });
});
