/**
 * UI tests for AiChatPanel.
 */

// Mock ChartPanel to avoid canvas/chart.js in jsdom
jest.mock('@/components/ChartPanel', () => ({
  ChartPanel: ({ chartType }: { chartType: string }) => (
    <div data-testid={`chart-${chartType}`} />
  ),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AiChatPanel } from '@/components/AiChatPanel';
import type { Session } from '@supabase/supabase-js';

const MOCK_SESSION = {
  access_token: 'test-jwt',
  user: { id: 'user-1', email: 'test@example.com' },
} as unknown as Session;

const MOCK_BAR_RESPONSE = {
  answer: 'FX-01 had the most failures with 42.',
  sql: "SELECT tests.fixture_id AS fixture FROM tests JOIN boards ON boards.id = tests.board_id JOIN products ON products.id = boards.product_id LEFT JOIN test_errors ON test_errors.test_id = tests.id WHERE tests.start_time >= now() - interval '7 days' GROUP BY tests.fixture_id ORDER BY fail_count DESC LIMIT 5",
  rows: [
    { fixture: 'FX-01', fail_count: 42 },
    { fixture: 'FX-02', fail_count: 17 },
  ],
  rowCount: 2,
  durationMs: 120,
  truncated: false,
  warnings: [],
  visualizationHint: 'bar' as const,
};

const MOCK_TABLE_RESPONSE = {
  ...MOCK_BAR_RESPONSE,
  visualizationHint: 'table' as const,
};

const MOCK_LINE_RESPONSE = {
  ...MOCK_BAR_RESPONSE,
  visualizationHint: 'line' as const,
};

const MOCK_NONE_RESPONSE = {
  ...MOCK_BAR_RESPONSE,
  answer: 'Total tests: 100.',
  rows: [{ total: 100 }],
  rowCount: 1,
  visualizationHint: 'none' as const,
};

function mockFetchResponse(body: object, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

function mockFetchError(errorBody: { error: string }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve(errorBody),
  }) as jest.Mock;
}

function mockFetchNetworkError() {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;
}

describe('AiChatPanel — rendering', () => {
  it('renders the chat input and submit button', () => {
    render(<AiChatPanel session={MOCK_SESSION} />);
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ask/i })).toBeInTheDocument();
  });

  it('submit button is disabled when input is empty', () => {
    render(<AiChatPanel session={MOCK_SESSION} />);
    expect(screen.getByRole('button', { name: /ask/i })).toBeDisabled();
  });

  it('submit button becomes enabled when user types', () => {
    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Top fixtures' },
    });
    expect(screen.getByRole('button', { name: /ask/i })).not.toBeDisabled();
  });
});

describe('AiChatPanel — loading state', () => {
  it('shows loading indicator while request is in flight', async () => {
    // Delay the fetch response so we can assert the loading state
    let resolveResponse!: (v: object) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((res) => {
        resolveResponse = (body) =>
          res({ ok: true, json: () => Promise.resolve(body) });
      })
    ) as jest.Mock;

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Top fixtures' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    // Should show loading state
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeDisabled();

    // Resolve the fetch
    await act(async () => {
      resolveResponse(MOCK_BAR_RESPONSE);
    });
  });

  it('disables input and shows Thinking… button text while loading', async () => {
    let resolveResponse!: (v: object) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((res) => {
        resolveResponse = (body) =>
          res({ ok: true, json: () => Promise.resolve(body) });
      })
    ) as jest.Mock;

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Top fixtures' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    expect(screen.getByRole('button', { name: /thinking/i })).toBeDisabled();

    await act(async () => {
      resolveResponse(MOCK_BAR_RESPONSE);
    });
  });
});

describe('AiChatPanel — successful response', () => {
  beforeEach(() => {
    mockFetchResponse(MOCK_BAR_RESPONSE);
  });

  async function submitQuestion(question = 'Top fixtures') {
    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: question },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });
    await waitFor(() => expect(screen.queryByText(/thinking/i)).toBeNull());
  }

  it('renders the plain-English answer', async () => {
    await submitQuestion();
    expect(screen.getByText('FX-01 had the most failures with 42.')).toBeInTheDocument();
  });

  it('renders the View details button (collapsed by default)', async () => {
    await submitQuestion();
    expect(screen.getByText(/view details/i)).toBeInTheDocument();
  });

  it('SQL drawer is collapsed by default', async () => {
    await submitQuestion();
    // The SQL text should not be visible
    expect(screen.queryByText(/SELECT/)).toBeNull();
  });

  it('SQL drawer expands on click', async () => {
    await submitQuestion();
    fireEvent.click(screen.getByText(/view details/i));
    await waitFor(() => {
      expect(screen.getByText(/view details|hide details/i)).toBeInTheDocument();
    });
    // After expanding, "SQL query" summary should appear
    expect(screen.getByText(/sql query/i)).toBeInTheDocument();
  });

  it('hides details drawer again on second click', async () => {
    await submitQuestion();
    // Open
    fireEvent.click(screen.getByText(/view details/i));
    await waitFor(() => expect(screen.getByText(/sql query/i)).toBeInTheDocument());
    // Close
    fireEvent.click(screen.getByText(/hide details/i));
    await waitFor(() => expect(screen.queryByText(/sql query/i)).toBeNull());
  });

  it('clears previous response when a new question is submitted', async () => {
    await submitQuestion('First question');
    expect(screen.getByText('FX-01 had the most failures with 42.')).toBeInTheDocument();

    // Submit another question
    mockFetchResponse({
      ...MOCK_BAR_RESPONSE,
      answer: 'Second answer',
    });

    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Second question' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });
    await waitFor(() => expect(screen.getByText('Second answer')).toBeInTheDocument());
    expect(screen.queryByText('FX-01 had the most failures with 42.')).toBeNull();
  });
});

describe('AiChatPanel — error response', () => {
  it('renders inline error message on API error', async () => {
    mockFetchError({ error: 'Could not interpret your question. Try rephrasing it.' });

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'What is the weather?' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not interpret/i);
  });

  it('renders inline error on network failure', async () => {
    mockFetchNetworkError();

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Top fixtures' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to reach/i);
  });

  it('clears previous error when a new question is submitted', async () => {
    mockFetchError({ error: 'Some error' });

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Bad question' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Now submit successfully
    mockFetchResponse(MOCK_BAR_RESPONSE);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Good question' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('FX-01 had the most failures with 42.')).toBeInTheDocument();
  });
});

describe('AiChatPanel — visualization hints', () => {
  it('renders a bar chart component when hint is bar', async () => {
    mockFetchResponse(MOCK_BAR_RESPONSE);

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Top fixtures' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-bar')).toBeInTheDocument();
    });
  });

  it('renders a line chart component when hint is line', async () => {
    mockFetchResponse(MOCK_LINE_RESPONSE);

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Trend over time' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-line')).toBeInTheDocument();
    });
  });

  it('renders an HTML table when hint is table', async () => {
    mockFetchResponse(MOCK_TABLE_RESPONSE);

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'Show tests for SN-001' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    // Column headers from row keys
    expect(screen.getByText('fixture')).toBeInTheDocument();
    expect(screen.getByText('fail_count')).toBeInTheDocument();
  });

  it('renders no chart or table when hint is none', async () => {
    mockFetchResponse(MOCK_NONE_RESPONSE);

    render(<AiChatPanel session={MOCK_SESSION} />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'How many total tests?' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ask/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Total tests: 100.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('chart-bar')).toBeNull();
    expect(screen.queryByTestId('chart-line')).toBeNull();
  });
});
