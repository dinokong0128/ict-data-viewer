import React, { useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChartPanel, type ChartDataset } from '@/components/ChartPanel';
import type { ChatResponse, VisualizationHint } from '@/lib/chat/types';

type Props = {
  session: Session | null;
};

// Derive chart labels and datasets from the first two columns of rows
function deriveChartData(
  rows: unknown[],
  hint: VisualizationHint
): { labels: string[]; datasets: ChartDataset[]; chartType: 'bar' | 'line' } | null {
  if (!rows.length || (hint !== 'bar' && hint !== 'line')) return null;

  const first = rows[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  if (keys.length < 2) return null;

  const xKey = keys[0];
  const yKey = keys[1];

  const labels = rows.map((r) => String((r as Record<string, unknown>)[xKey] ?? ''));
  const data = rows.map((r) => Number((r as Record<string, unknown>)[yKey] ?? 0));

  const datasets: ChartDataset[] = [
    {
      label: yKey,
      data,
      backgroundColor:
        hint === 'bar' ? 'rgba(37, 99, 235, 0.7)' : 'rgba(37, 99, 235, 0.4)',
      borderColor: hint === 'line' ? '#2563eb' : undefined,
    },
  ];

  return { labels, datasets, chartType: hint as 'bar' | 'line' };
}

export function AiChatPanel({ session }: Props) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    // Clear previous state before each submission
    setResponse(null);
    setError(null);
    setDetailsOpen(false);
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: q }),
      });

      const body = (await res.json()) as ChatResponse & { error?: string };

      if (!res.ok || body.error) {
        setError(body.error ?? `Request failed (${res.status})`);
      } else {
        setResponse(body);
      }
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const chartData = response
    ? deriveChartData(response.rows, response.visualizationHint)
    : null;

  return (
    <section className="card" style={{ margin: '0 0 16px' }}>
      <h2 style={{ marginBottom: '10px' }}>AI analytics</h2>

      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', gap: '8px' }}>
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => { setQuestion(e.target.value); }}
          placeholder="Ask a question about your ICT data..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '7px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#1e293b',
            background: loading ? '#f8fafc' : '#fff',
          }}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{
            padding: '7px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !question.trim() ? 0.6 : 1,
          }}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {/* Loading indicator */}
      {loading && (
        <p style={{ marginTop: '10px', fontSize: '13px', color: '#6b7280' }}>
          Analyzing your data…
        </p>
      )}

      {/* Inline error */}
      {error && (
        <p
          role="alert"
          style={{
            marginTop: '10px',
            fontSize: '13px',
            color: '#dc2626',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '8px 12px',
          }}
        >
          {error}
        </p>
      )}

      {/* Answer */}
      {response && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.6 }}>
            {response.answer}
          </p>

          {/* Visualization */}
          {chartData && (
            <div style={{ marginTop: '16px', height: '220px' }}>
              <ChartPanel
                labels={chartData.labels}
                datasets={chartData.datasets}
                chartType={chartData.chartType}
                onSelectDate={() => { /* no-op in chat panel */ }}
              />
            </div>
          )}

          {response.visualizationHint === 'table' && response.rows.length > 0 && (
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr>
                    {Object.keys(response.rows[0] as Record<string, unknown>).map((col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: 'left',
                          padding: '6px 10px',
                          borderBottom: '2px solid #e2e8f0',
                          color: '#374151',
                          fontWeight: 600,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {response.rows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {Object.values(row as Record<string, unknown>).map((val, vi) => (
                        <td
                          key={vi}
                          style={{ padding: '5px 10px', color: '#374151' }}
                        >
                          {String(val ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* View details drawer */}
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => { setDetailsOpen((v) => !v); }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '12px',
                color: '#6b7280',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {detailsOpen ? 'Hide details ▲' : 'View details ▼'}
            </button>

            {detailsOpen && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#374151',
                }}
              >
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Rows:</strong> {response.rowCount}
                  {response.truncated && (
                    <span style={{ color: '#d97706', marginLeft: '6px' }}>
                      (results truncated to {response.rowCount})
                    </span>
                  )}
                  {'  '}
                  <strong>Duration:</strong> {response.durationMs} ms
                </p>

                {response.warnings.length > 0 && (
                  <ul style={{ margin: '0 0 8px', paddingLeft: '16px' }}>
                    {response.warnings.map((w, i) => (
                      <li key={i} style={{ color: '#d97706' }}>{w}</li>
                    ))}
                  </ul>
                )}

                <details>
                  <summary style={{ cursor: 'pointer', color: '#6b7280', marginBottom: '4px' }}>
                    SQL query
                  </summary>
                  <code
                    style={{
                      display: 'block',
                      padding: '8px',
                      background: '#1e293b',
                      color: '#e2e8f0',
                      borderRadius: '4px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '11px',
                      lineHeight: 1.5,
                    }}
                  >
                    {response.sql}
                  </code>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
