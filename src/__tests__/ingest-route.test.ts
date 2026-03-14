/**
 * @jest-environment node
 *
 * ingest-route.test.ts
 *
 * Tests for POST /api/ingest (batched).
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
  serial_number: 'SN-XXXX-000001',
  product_id:    'PART-REDACTED-001',
  product_name:  'Test Product A',
  rev:           '13',
  mac_address:   '',
  result:        'PASS' as const,
  start_time:    new Date(),
  end_time:      new Date(),
  operator_id:   '',
  fixture_id:    '',
  tester:        '',
  source_file:   'a.log',
  errors:        [],
};

// Two-file batch used across most tests
const BATCH = {
  files: [
    { filename: 'a.log', content: 'data1' },
    { filename: 'b.log', content: 'data2' },
  ],
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
  // --- auth ---
  it('returns 401 when x-ingest-secret header is missing', async () => {
    const res = await POST(makeRequest(BATCH, null));
    expect(res.status).toBe(401);
    expect(await res.json()).toHaveProperty('error');
  });

  it('returns 401 when x-ingest-secret is wrong', async () => {
    const res = await POST(makeRequest(BATCH, 'wrong'));
    expect(res.status).toBe(401);
  });

  // --- body validation ---
  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: { 'x-ingest-secret': 'test-secret', 'content-type': 'text/plain' },
      body: 'not json',
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('returns 400 when files array is missing (old single-file shape)', async () => {
    const res = await POST(makeRequest({ filename: 'a.log', content: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when a file entry is missing filename', async () => {
    const res = await POST(makeRequest({ files: [{ content: 'x' }] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when a file entry is missing content', async () => {
    const res = await POST(makeRequest({ files: [{ filename: 'a.log' }] }));
    expect(res.status).toBe(400);
  });

  // --- happy path ---
  it('returns 200 with processed count and empty failed on full success', async () => {
    const res = await POST(makeRequest(BATCH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 2, failed: [] });
  });

  it('calls parseLog and upsertTest for each file in the batch', async () => {
    await POST(makeRequest(BATCH));
    expect(mockParseLog).toHaveBeenCalledTimes(2);
    expect(mockParseLog).toHaveBeenCalledWith('a.log', 'data1');
    expect(mockParseLog).toHaveBeenCalledWith('b.log', 'data2');
    expect(mockUpsertTest).toHaveBeenCalledTimes(2);
  });

  it('returns 200 with processed:0 and empty failed for an empty batch', async () => {
    const res = await POST(makeRequest({ files: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, failed: [] });
  });

  // --- partial failures ---
  it('returns partial success when one file fails to parse', async () => {
    mockParseLog
      .mockReturnValueOnce(PARSED_RESULT)                               // a.log OK
      .mockImplementationOnce(() => { throw new Error('bad format'); }); // b.log fails

    const res = await POST(makeRequest(BATCH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ filename: 'b.log', error: expect.stringContaining('bad format') });
  });

  it('returns partial success when one file fails at DB upsert', async () => {
    mockUpsertTest
      .mockResolvedValueOnce(undefined)                          // a.log OK
      .mockRejectedValueOnce(new Error('DB connection failed')); // b.log fails

    const res = await POST(makeRequest(BATCH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ filename: 'b.log', error: 'DB connection failed' });
  });

  it('returns processed:0 with all files in failed when every file errors', async () => {
    mockParseLog.mockImplementation(() => { throw new Error('parse fail'); });

    const res = await POST(makeRequest(BATCH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.failed).toHaveLength(2);
    expect(body.failed.map((f: { filename: string }) => f.filename)).toEqual(['a.log', 'b.log']);
  });
});
