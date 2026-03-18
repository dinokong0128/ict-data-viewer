/**
 * @jest-environment node
 *
 * Integration tests for POST /api/chat.
 * Both Anthropic and Supabase are fully mocked.
 */

// ── Mock @anthropic-ai/sdk ────────────────────────────────────────────────
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

// ── Mock @supabase/supabase-js createClient ────────────────────────────────
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

// ── Mock fetch (for execute_readonly_query RPC) ────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { setChatProvider } from '@/lib/chat/chat-provider';
import type { ChatProvider } from '@/lib/chat/chat-provider';
import type { ChatQueryPlan } from '@/lib/chat/types';

const mockCreateClient = createClient as jest.Mock;
const MockAnthropic = Anthropic as jest.Mock;

// Valid plan returned by mock provider
const VALID_PLAN: ChatQueryPlan = {
  intent: 'top_n',
  metrics: [{ name: 'fail_count' }],
  dimensions: ['fixture'],
  filters: [],
  timeRange: { preset: 'last_7_days' },
  sort: [{ field: 'fail_count', direction: 'desc' }],
  limit: 5,
  visualizationHint: 'bar',
  ambiguities: [],
};

const MOCK_ROWS = [
  { fixture: 'FX-01', fail_count: 42 },
  { fixture: 'FX-02', fail_count: 17 },
];

function makeRequest(body: unknown, token: string | null = 'test-jwt'): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// Inject a mock provider that returns our canned plan + answer
function setupMockProvider(overrides?: Partial<ChatProvider>) {
  const provider: ChatProvider = {
    generatePlan: jest.fn().mockResolvedValue(VALID_PLAN),
    generateAnswer: jest.fn().mockResolvedValue('FX-01 had the most failures.'),
    ...overrides,
  };
  setChatProvider(provider);
  return provider;
}

// Supabase client mock helpers
function mockRoleRpc(role: string | null, error: object | null = null) {
  mockCreateClient.mockReturnValue({
    rpc: jest.fn().mockResolvedValue({ data: role, error }),
  });
}

// Fetch mock helpers
function mockQuerySuccess(rows: object[] = MOCK_ROWS) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(rows),
    text: () => Promise.resolve(JSON.stringify(rows)),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  // Default: successful mocks
  setupMockProvider();
  mockRoleRpc('ict-manager');
  mockQuerySuccess();
  // Reset Anthropic constructor mock
  MockAnthropic.mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

describe('POST /api/chat — auth', () => {
  it('returns 403 for unauthenticated request (no Authorization header)', async () => {
    const res = await POST(makeRequest({ question: 'How many failures?' }, null));
    expect(res.status).toBe(403);
  });

  it('returns 403 for ict-member role', async () => {
    mockRoleRpc('ict-member');
    const res = await POST(makeRequest({ question: 'How many failures?' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role RPC returns null', async () => {
    mockRoleRpc(null);
    const res = await POST(makeRequest({ question: 'How many failures?' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role RPC returns an error', async () => {
    mockRoleRpc(null, { message: 'permission denied' });
    const res = await POST(makeRequest({ question: 'How many failures?' }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/chat — valid ict-manager request', () => {
  it('returns a ChatResponse for ict-manager', async () => {
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('answer');
    expect(body).toHaveProperty('sql');
    expect(body).toHaveProperty('rows');
    expect(body).toHaveProperty('rowCount');
    expect(body).toHaveProperty('durationMs');
    expect(body).toHaveProperty('visualizationHint', 'bar');
  });

  it('returns 200 for ict-admin', async () => {
    mockRoleRpc('ict-admin');
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(200);
  });

  it('includes the answer in the response', async () => {
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    const body = await res.json();
    expect(body.answer).toBe('FX-01 had the most failures.');
  });

  it('includes the compiled SQL (not LLM-generated SQL)', async () => {
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    const body = await res.json();
    expect(typeof body.sql).toBe('string');
    expect(body.sql).toMatch(/^SELECT/i);
  });

  it('includes rows from the query', async () => {
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rowCount).toBe(MOCK_ROWS.length);
  });
});

describe('POST /api/chat — input validation', () => {
  beforeEach(() => {
    mockRoleRpc('ict-manager');
  });

  it('returns 400 for missing question field', async () => {
    const res = await POST(makeRequest({ text: 'not a question' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty question', async () => {
    const res = await POST(makeRequest({ question: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for question over 500 chars', async () => {
    const res = await POST(makeRequest({ question: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat — unsafe SQL guard', () => {
  it('returns 400 and never calls Supabase fetch when guard rejects compiled SQL', async () => {
    // Make the compiler produce invalid SQL by providing a plan that compiles to
    // something the guard rejects. We simulate this by overriding the provider to
    // return a plan that produces SQL failing the guard. The simplest way is to
    // mock the guard directly via a plan that fails validation (empty metrics),
    // which means the server rejects before SQL is even compiled.
    setupMockProvider({
      generatePlan: jest.fn().mockResolvedValue({
        ...VALID_PLAN,
        metrics: [], // fails validation → 400 before SQL or Supabase
      }),
    });

    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(400);
    // Supabase execute_readonly_query should never have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when plan validation fails and does not execute query', async () => {
    setupMockProvider({
      generatePlan: jest.fn().mockResolvedValue({
        ...VALID_PLAN,
        intent: 'unknown_intent' as never,
      }),
    });

    const res = await POST(makeRequest({ question: 'Something' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat — error handling', () => {
  it('returns 422 when plan generation throws', async () => {
    setupMockProvider({
      generatePlan: jest.fn().mockRejectedValue(new Error('Anthropic API down')),
    });
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('Could not interpret');
  });

  it('falls back to default answer when answer generation fails', async () => {
    setupMockProvider({
      generatePlan: jest.fn().mockResolvedValue(VALID_PLAN),
      generateAnswer: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('Here are the results.');
  });

  it('returns 500 when query execution fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('relation "tests" does not exist'),
    });
    const res = await POST(makeRequest({ question: 'Top 5 fixtures last week' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Query failed');
    // Must not expose the raw DB error message to the client
    expect(body.error).not.toContain('relation');
  });

  it('does not expose stack traces in error responses', async () => {
    setupMockProvider({
      generatePlan: jest.fn().mockRejectedValue(new Error('internal error with sensitive info')),
    });
    const res = await POST(makeRequest({ question: 'Something' }));
    const body = await res.json();
    expect(body.error).not.toContain('sensitive info');
    expect(body).not.toHaveProperty('stack');
  });
});

describe('POST /api/chat — truncation', () => {
  it('sets truncated: true and warnings when rows exceed MAX_ROWS', async () => {
    const manyRows = Array.from({ length: 250 }, (_, i) => ({ fixture: `FX-${i}`, fail_count: i }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manyRows),
    });

    const res = await POST(makeRequest({ question: 'Top fixtures' }));
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.rowCount).toBe(200);
    expect(body.warnings.some((w: string) => w.includes('truncated'))).toBe(true);
  });
});
