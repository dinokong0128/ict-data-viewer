import Anthropic from '@anthropic-ai/sdk';
import type { ChatQueryPlan, ChatResponse } from './types';
import { APPROVED_DIMENSIONS, APPROVED_METRICS } from './semantic-layer';

export interface ChatProvider {
  generatePlan(question: string, context: string): Promise<ChatQueryPlan>;
  generateAnswer(
    question: string,
    plan: ChatQueryPlan,
    sql: string,
    rows: unknown[]
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const INTENTS = ['summary', 'trend', 'top_n', 'compare', 'lookup'];
const HINTS = ['none', 'table', 'line', 'bar'];

function buildPlanSystemPrompt(): string {
  const dimensions = Array.from(APPROVED_DIMENSIONS).join(', ');
  const metrics = Array.from(APPROVED_METRICS).join(', ');
  const intents = INTENTS.join(', ');
  const hints = HINTS.join(', ');

  return `You are an analytics query planner for an ICT (In-Circuit Test) board test system.

Your job is to translate a natural-language question into a structured JSON query plan. Return ONLY valid JSON matching the ChatQueryPlan schema below. No markdown, no code fences, no explanation. The first character of your response must be "{".

SCHEMA:
{
  "intent": one of [${intents}],
  "metrics": [{"name": one of [${metrics}]}],
  "dimensions": array of dimension names from [${dimensions}],
  "filters": [{"field": dimension, "operator": "eq"|"in"|"contains"|"gte"|"lte"|"between", "value": string|number|array|{from,to}}],
  "timeRange": {"preset": one of ["today","yesterday","last_7_days","last_14_days","last_30_days","this_month"]} OR {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"} OR null,
  "sort": [{"field": dimension or metric name, "direction": "asc"|"desc"}],
  "limit": integer <= 200,
  "visualizationHint": one of [${hints}],
  "ambiguities": [string]
}

RULES:
- metrics must be non-empty; use at least one metric always
- dimensions lists the columns to group or display by
- visualizationHint: "line" for time-series trends, "bar" for categorical rankings, "table" for row listings, "none" for single-number summaries
- If the question is ambiguous or references a field not in the approved list, add a note to "ambiguities" and make a best-effort plan
- If no time range is mentioned, default to last_30_days

EXAMPLES:

Q: Top 5 fixtures by fail count last 7 days
{"intent":"top_n","metrics":[{"name":"fail_count"}],"dimensions":["fixture"],"filters":[],"timeRange":{"preset":"last_7_days"},"sort":[{"field":"fail_count","direction":"desc"}],"limit":5,"visualizationHint":"bar","ambiguities":[]}

Q: Daily fail rate for the last 2 weeks
{"intent":"trend","metrics":[{"name":"fail_rate"}],"dimensions":["day"],"filters":[],"timeRange":{"preset":"last_14_days"},"sort":[{"field":"day","direction":"asc"}],"limit":14,"visualizationHint":"line","ambiguities":[]}

Q: All tests for serial number ABC123
{"intent":"lookup","metrics":[{"name":"test_count"}],"dimensions":["serial_number","date","result","tester"],"filters":[{"field":"serial_number","operator":"eq","value":"ABC123"}],"timeRange":null,"sort":[{"field":"date","direction":"desc"}],"limit":50,"visualizationHint":"table","ambiguities":[]}`;
}

const ANSWER_SYSTEM_PROMPT = `You are a data analyst summarising ICT board test query results for hardware engineers.

RULES:
1. Answer in plain English based ONLY on the provided rows. Never invent data not in the rows.
2. Be concise — 1 to 3 sentences.
3. If rows are empty, say so explicitly and suggest a possible reason (wrong filter, no data in the time range, no failures in the period).
4. If ambiguities were flagged in the plan, acknowledge them briefly.
5. Call out clear patterns (e.g. a single fixture dominating failures, unusually high error counts).`;

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-20250514';

export class AnthropicChatProvider implements ChatProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async generatePlan(question: string, context: string): Promise<ChatQueryPlan> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: buildPlanSystemPrompt() + (context ? `\n\nAdditional context:\n${context}` : ''),
      messages: [{ role: 'user', content: question }],
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected non-text response from plan generation');
    }

    const text = block.text.trim();
    try {
      return JSON.parse(text) as ChatQueryPlan;
    } catch {
      throw new Error(`Failed to parse query plan JSON: ${text.slice(0, 200)}`);
    }
  }

  async generateAnswer(
    question: string,
    plan: ChatQueryPlan,
    sql: string,
    rows: unknown[]
  ): Promise<string> {
    const ambiguityNote =
      plan.ambiguities.length > 0
        ? `\nAmbiguities noted: ${plan.ambiguities.join('; ')}`
        : '';

    const userMessage = `Question: ${question}${ambiguityNote}

SQL executed:
${sql}

Rows returned (${rows.length}):
${JSON.stringify(rows.slice(0, 50), null, 2)}`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: ANSWER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected non-text response from answer generation');
    }

    return block.text.trim();
  }
}

// Semantic context string passed to generatePlan for additional grounding
export function buildSemanticContext(): string {
  const dimensions = Array.from(APPROVED_DIMENSIONS).join(', ');
  const metrics = Array.from(APPROVED_METRICS).join(', ');
  return `Approved dimensions: ${dimensions}\nApproved metrics: ${metrics}`;
}

// Singleton provider (lazy-initialised)
let _provider: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (!_provider) {
    _provider = new AnthropicChatProvider();
  }
  return _provider;
}

// Allow injection in tests
export function setChatProvider(provider: ChatProvider): void {
  _provider = provider;
}

export type { ChatResponse };
