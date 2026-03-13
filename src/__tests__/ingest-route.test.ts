/**
 * @jest-environment node
 *
 * ingest-route.test.ts
 *
 * Tests for POST /api/ingest.
 * Both the parser and DB layer are fully mocked — no real I/O.
 */

// Mock ict-parser and ict-db before importing the route
jest.mock('@/lib/ict-parser', () => ({
  parseLog: jest.fn(),
}));

jest.mock('@/lib/ict-db', () => ({
  upsertTest: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ingest/route';
import { parseLog } from '@/lib/ict-parser';
import { upsertTest } from '@/lib/ict-db';

const mockParseLog = parseLog as jest.Mock;
const mockUpsertTest = upsertTest as jest.Mock;

const PARSED_RESULT = {
  board_id: '465136J+2609F808HH',
  product_id: '465136J',
  result: 'PASS' as const,
  family: 'C2-ROT41',
  part_number: '8215911',
  revision: '13',
  mac_address: '',
  start_time: new Date(),
  end_time: new Date(),
  operator_id: '',
  tester: '',
  fixture_id: '',
  testplan: '',
  platform: '',
  errors: [],
};

function makeRequest(body: unknown, secret: string | null = 'test-secret'): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-ingest-secret'] = secret;
  return new NextRequest('http://localhost/api/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INGEST_SECRET = 'test-secret';
  mockParseLog.mockReturnValue(PARSED_RESULT);
  mockUpsertTest.mockResolvedValue(undefined);
});

describe('POST /api/ingest', () => {
  it('returns 401 when x-ingest-secret header is missing', async () => {
    const res = await POST(makeRequest({ filename: 'a.log', content: 'x' }, null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 401 when x-ingest-secret is wrong', async () => {
    const res = await POST(makeRequest({ filename: 'a.log', content: 'x' }, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: { 'x-ingest-secret': 'test-secret', 'content-type': 'text/plain' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when filename is missing from body', async () => {
    const res = await POST(makeRequest({ content: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is missing from body', async () => {
    const res = await POST(makeRequest({ filename: 'a.log' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with board_id and result on success', async () => {
    const res = await POST(makeRequest({ filename: '465136J_2609F808HH.log', content: 'data' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, board_id: '465136J+2609F808HH', result: 'PASS' });
  });

  it('calls parseLog with filename and content', async () => {
    await POST(makeRequest({ filename: 'test.log', content: 'raw content' }));
    expect(mockParseLog).toHaveBeenCalledWith('test.log', 'raw content');
  });

  it('calls upsertTest with parsed result', async () => {
    await POST(makeRequest({ filename: 'test.log', content: 'raw' }));
    expect(mockUpsertTest).toHaveBeenCalledWith(PARSED_RESULT);
  });

  it('returns 500 when parseLog throws', async () => {
    mockParseLog.mockImplementation(() => { throw new Error('bad format'); });
    const res = await POST(makeRequest({ filename: 'bad.log', content: 'garbage' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/bad format/);
  });

  it('returns 500 when upsertTest rejects', async () => {
    mockUpsertTest.mockRejectedValue(new Error('DB connection failed'));
    const res = await POST(makeRequest({ filename: 'test.log', content: 'data' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/DB connection failed/);
  });
});
