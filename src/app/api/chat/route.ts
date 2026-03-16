import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  PASS1_SYSTEM_PROMPT,
  PASS2_SYSTEM_PROMPT,
  buildPass2UserMessage,
} from '@/lib/ict-prompt';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

const MUTATION_RE =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE)\b/i;

const OUT_OF_SCOPE_RESPONSE = {
  answer:
    'I can only answer questions about board test data — boards, tests, failures, errors, fixtures, testers, or operators.',
  chartable: false,
  chart_type: 'none' as const,
  chart_config: { x_key: '', y_key: '', highlight_key: null },
  rows: [] as object[],
};

const RETRY_RESPONSE = {
  answer:
    "I wasn't able to answer that question. Please try rephrasing it.",
  chartable: false,
  chart_type: 'none' as const,
  chart_config: { x_key: '', y_key: '', highlight_key: null },
  rows: [] as object[],
};

async function callPass1(messages: Anthropic.MessageParam[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: PASS1_SYSTEM_PROMPT,
    messages,
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Pass 1');
  return block.text.trim();
}

function guardSql(sql: string): void {
  if (!/^SELECT\b/i.test(sql)) {
    throw new Error(`SQL safety guard failed: query does not start with SELECT`);
  }
  if (MUTATION_RE.test(sql)) {
    throw new Error(`SQL safety guard failed: query contains a forbidden keyword`);
  }
}

async function runQuery(sql: string): Promise<object[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/execute_readonly_query`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text);
  }

  return resp.json() as Promise<object[]>;
}

interface Pass2Result {
  answer: string;
  chartable: boolean;
  chart_type: 'bar' | 'line' | 'none';
  chart_config: {
    x_key: string;
    y_key: string;
    highlight_key: string | null;
  };
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).question !== 'string' ||
    !(body as Record<string, unknown>).question
  ) {
    return NextResponse.json(
      { error: 'Request body must include a non-empty "question" string' },
      { status: 400 }
    );
  }

  const question = ((body as Record<string, unknown>).question as string).trim();
  const isDev = process.env.NODE_ENV === 'development';

  // ── Pass 1: generate SQL ──────────────────────────────────────────────────
  let sql: string;
  try {
    sql = await callPass1([{ role: 'user', content: question }]);
  } catch (err) {
    return NextResponse.json(
      { error: `Pass 1 failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // ── CANNOT_ANSWER shortcircuit ────────────────────────────────────────────
  if (sql === 'CANNOT_ANSWER') {
    return NextResponse.json(OUT_OF_SCOPE_RESPONSE);
  }

  // ── Safety guard ──────────────────────────────────────────────────────────
  try {
    guardSql(sql);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // ── Execute query (with one self-healing retry) ───────────────────────────
  let rows: object[];
  try {
    rows = await runQuery(sql);
  } catch (firstErr) {
    const errorMessage = (firstErr as Error).message;

    // Self-healing: ask Claude for a corrected query
    let retrySql: string;
    try {
      retrySql = await callPass1([
        { role: 'user', content: question },
        { role: 'assistant', content: sql },
        {
          role: 'user',
          content: `Question: ${question}\n\nThe previous SQL attempt failed with this error:\n${errorMessage}\n\nPlease generate a corrected SQL query.`,
        },
      ]);
    } catch {
      return NextResponse.json(RETRY_RESPONSE);
    }

    if (retrySql === 'CANNOT_ANSWER') {
      return NextResponse.json(OUT_OF_SCOPE_RESPONSE);
    }

    try {
      guardSql(retrySql);
    } catch {
      return NextResponse.json(RETRY_RESPONSE);
    }

    try {
      rows = await runQuery(retrySql);
      sql = retrySql;
    } catch {
      return NextResponse.json(RETRY_RESPONSE);
    }
  }

  // ── Pass 2: generate answer + chart config ────────────────────────────────
  let pass2Result: Pass2Result;
  try {
    const pass2Response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PASS2_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildPass2UserMessage({ question, sql, rows }),
        },
      ],
    });

    const block = pass2Response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from Pass 2');

    const cleaned = stripFences(block.text);
    pass2Result = JSON.parse(cleaned) as Pass2Result;
  } catch (err) {
    // If Pass 2 or JSON parse fails, return raw text with safe defaults
    const rawText =
      err instanceof SyntaxError
        ? 'Unable to parse structured response.'
        : (err as Error).message;
    return NextResponse.json({
      answer: rawText,
      chartable: false,
      chart_type: 'none' as const,
      chart_config: { x_key: '', y_key: '', highlight_key: null },
      rows: isDev ? rows! : [],
      ...(isDev ? { sql } : {}),
    });
  }

  return NextResponse.json({
    answer: pass2Result.answer,
    chartable: pass2Result.chartable,
    chart_type: pass2Result.chart_type,
    chart_config: pass2Result.chart_config,
    rows,
    ...(isDev ? { sql } : {}),
  });
}
