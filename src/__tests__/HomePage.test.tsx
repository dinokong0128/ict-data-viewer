/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import HomePage from '@/pages/index';
import type { TestRecord } from '@/lib/testUtils';

jest.mock('@/components/ChartPanel', () => ({
  ChartPanel: () => <div>Chart</div>,
}));

jest.mock('@/components/DetailTable', () => ({
  DetailTable: ({ title, textFilter, onTextFilterChange, onPageChange }: {
    title: string;
    textFilter?: string;
    onTextFilterChange?: (v: string) => void;
    onPageChange?: (page: number) => void;
  }) => (
    <div>
      <div>{title}</div>
      <input
        placeholder="Search SN, product, tester, fixture, operator, errors..."
        value={textFilter ?? ''}
        onChange={(e) => onTextFilterChange?.(e.target.value)}
        aria-label="Filter table rows"
      />
      {textFilter && (
        <button aria-label="Clear filter" onClick={() => onTextFilterChange?.('')}>✕</button>
      )}
      <button onClick={() => onPageChange?.(2)}>Next page</button>
    </div>
  ),
}));

const mockUseAuth = jest.fn();

// Mock auth-context — default: authenticated, ict-manager role
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
  clearGuestMode: jest.fn(),
}));

// Mock next/router — default: no query params, router not seeding
const mockRouterQuery: Record<string, string> = {};
let mockRouterIsReady = true;

jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    replace: jest.fn(),
    push: jest.fn(),
    isReady: mockRouterIsReady,
    query: mockRouterQuery,
  }),
}));

// Mock supabase-browser (sign-out only used in logout handler)
jest.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signOut: jest.fn().mockResolvedValue({}) } }),
}));

// Build a record dated within the last 30 days (default range)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const isoYesterday = yesterday.toISOString().slice(0, 19) + 'Z';
const isoYesterdayDate = isoYesterday.slice(0, 10);

const MOCK_RECORD: TestRecord = {
  id: '1',
  board_id: 'SN-XXXX-000001',
  start_time: isoYesterday,
  end_time: isoYesterday,
  result: 'pass',
  operator_id: 'operator-01',
  fixture_id: 'fixture-01',
  tester: 'tester-01',
  source_file: 'PROD-001_SN-XXXX-000001.log',
  ingested_at: isoYesterday,
  serial_number: 'SN-XXXX-000001',
  mac_address: '020000000001',
  rev: '13',
  product_id: 'PART-REDACTED-001',
  product_name: 'Test Product A',
  part_number: 'PART-REDACTED-001',
  error_locations: [],
  test_errors: [],
};

const MOCK_SUMMARY = {
  byDayFixtureTester: [
    {
      day: isoYesterdayDate,
      fixture_id: 'fixture-01',
      tester: 'tester-01',
      operator_id: 'operator-01',
      total: 1,
      pass: 1,
      fail: 0,
      unique_boards: 1,
    },
  ],
  errorsByDayLocation: [],
};

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session:   { access_token: 'test-jwt', user: { id: 'user-1' } },
    role:      'ict-manager',
    isGuest:   false,
    isLoading: false,
  });

  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/api/products')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ products: [{ id: 'PART-001', product_name: 'Test Product A' }] }),
      });
    }
    if (url.includes('/api/summary')) {
      return Promise.resolve({
        ok: true,
        json: async () => MOCK_SUMMARY,
      });
    }
    // /api/tests default — paginated shape
    return Promise.resolve({
      ok: true,
      json: async () => ({ records: [MOCK_RECORD], total: 1, page: 1, pageSize: 12, demo: false }),
    });
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HomePage', () => {
  it('renders title and summary after loading data', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('ICT Data Viewer')).toBeInTheDocument();
    });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      const totalItem = items.find((el) => /total tests:/i.test(el.textContent ?? ''));
      expect(totalItem?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Total tests: 1');
    });
  });

  it('sends Authorization header when session is present', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    const testsCall = calls.find(([url]) => (url as string).includes('/api/tests'));
    expect(testsCall).toBeDefined();
    const [, options] = testsCall!;
    expect((options?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer test-jwt');
  });

  it('shows guest banner when isGuest is true', async () => {
    mockUseAuth.mockReturnValue({
      session: null, user: null, role: null, isGuest: true, isLoading: false,
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText(/Guest mode/i)).toBeInTheDocument();
    });
  });

  it('does not send Authorization header for guests', async () => {
    mockUseAuth.mockReturnValue({
      session: null, user: null, role: null, isGuest: true, isLoading: false,
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    const testsCall = calls.find(([url]) => (url as string).includes('/api/tests'));
    expect(testsCall).toBeDefined();
    const [, options] = testsCall!;
    expect((options?.headers as Record<string, string>)?.['Authorization']).toBeUndefined();
  });

  it('seeds metric from URL query param on mount', async () => {
    mockRouterQuery['metric'] = 'errors';

    render(<HomePage />);

    await waitFor(() => {
      const metricSelect = document.getElementById('metric-select') as HTMLSelectElement | null;
      expect(metricSelect?.value).toBe('errors');
    });

    delete mockRouterQuery['metric'];
  });

  it('seeds dateFrom/dateTo from URL and calls loadPage with those dates', async () => {
    mockRouterQuery['dateFrom'] = '2026-01-01';
    mockRouterQuery['dateTo'] = '2026-01-07';

    render(<HomePage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    const urlSeededCall = calls.find(([url]) => (url as string).includes('start=2026-01-01'));
    expect(urlSeededCall).toBeDefined();

    delete mockRouterQuery['dateFrom'];
    delete mockRouterQuery['dateTo'];
  });

  it('renders product filter dropdown with All products and fetched options', async () => {
    render(<HomePage />);

    await waitFor(() => {
      const productSelect = document.getElementById('product-select') as HTMLSelectElement | null;
      expect(productSelect).not.toBeNull();
      const options = Array.from(productSelect?.options ?? []).map((o) => o.text);
      expect(options).toContain('All products');
      expect(options).toContain('Test Product A');
    });
  });

  it('product filter shows all products when no selection (default empty value)', async () => {
    render(<HomePage />);

    await waitFor(() => {
      const productSelect = document.getElementById('product-select') as HTMLSelectElement | null;
      expect(productSelect?.value).toBe('');
    });
  });

  it('selecting a product updates the filter select value', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(document.getElementById('product-select')).not.toBeNull();
    });

    const productSelect = document.getElementById('product-select') as HTMLSelectElement;

    await waitFor(() => {
      const options = Array.from(productSelect.options).map((o) => o.value);
      expect(options).toContain('Test Product A');
    });

    fireEvent.change(productSelect, { target: { value: 'Test Product A' } });
    expect(productSelect.value).toBe('Test Product A');
  });

  it('page change triggers a new loadPage fetch with page=2', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText(/Details for selected range/)).toBeInTheDocument();
    });

    // Reset fetch mock call count to isolate the page-change fetch
    (global.fetch as jest.Mock).mockClear();

    fireEvent.click(screen.getByText('Next page'));

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
      const page2Call = calls.find(([url]) => (url as string).includes('page=2'));
      expect(page2Call).toBeDefined();
    });
  });

  describe('U6 — text filter (server-side)', () => {
    const RECORD_A: TestRecord = {
      ...MOCK_RECORD,
      id: '10',
      serial_number: 'SN-ALPHA-001',
      product_name: 'Alpha Board',
      tester: 'tester-alpha',
      fixture_id: 'fix-alpha',
      operator_id: 'op-alpha',
      board_id: 'SN-ALPHA-001',
      error_locations: [],
      test_errors: [],
    };
    const RECORD_B: TestRecord = {
      ...MOCK_RECORD,
      id: '11',
      serial_number: 'SN-BETA-002',
      product_name: 'Beta Board',
      tester: 'tester-beta',
      fixture_id: 'fix-beta',
      operator_id: 'op-beta',
      board_id: 'SN-BETA-002',
      error_locations: [],
      test_errors: [],
    };
    const RECORD_WITH_ERROR: TestRecord = {
      ...MOCK_RECORD,
      id: '12',
      serial_number: 'SN-ERR-003',
      product_name: 'Error Board',
      tester: 'tester-err',
      fixture_id: 'fix-err',
      operator_id: 'op-err',
      board_id: 'SN-ERR-003',
      result: 'fail',
      error_locations: ['resistor-R42'],
      test_errors: [],
    };

    const ALL_RECORDS = [RECORD_A, RECORD_B, RECORD_WITH_ERROR];

    function filterByQ(q: string): TestRecord[] {
      const lower = q.toLowerCase();
      return ALL_RECORDS.filter((r) =>
        r.serial_number.toLowerCase().includes(lower) ||
        r.tester.toLowerCase().includes(lower) ||
        r.fixture_id.toLowerCase().includes(lower) ||
        r.operator_id.toLowerCase().includes(lower) ||
        r.error_locations.some((loc) => loc.toLowerCase().includes(lower)),
      );
    }

    beforeEach(() => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/products')) {
          return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
        }
        if ((url as string).includes('/api/summary')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              byDayFixtureTester: [
                { day: isoYesterdayDate, fixture_id: 'fix-alpha', tester: 'tester-alpha', operator_id: 'op-alpha', total: 1, pass: 1, fail: 0, unique_boards: 1 },
                { day: isoYesterdayDate, fixture_id: 'fix-beta',  tester: 'tester-beta',  operator_id: 'op-beta',  total: 1, pass: 1, fail: 0, unique_boards: 1 },
                { day: isoYesterdayDate, fixture_id: 'fix-err',   tester: 'tester-err',   operator_id: 'op-err',   total: 1, pass: 0, fail: 1, unique_boards: 1 },
              ],
              errorsByDayLocation: [{ day: isoYesterdayDate, location: 'resistor-R42', error_count: 1 }],
            }),
          });
        }
        // /api/tests — filter by ?q= param server-side
        const parsedUrl = new URL(url as string, 'http://localhost');
        const q = parsedUrl.searchParams.get('q') ?? '';
        const filtered = q ? filterByQ(q) : ALL_RECORDS;
        return Promise.resolve({
          ok: true,
          json: async () => ({ records: filtered, total: filtered.length, page: 1, pageSize: 12, demo: false }),
        });
      });
    });

    it('initial load shows all 3 rows in the detail table title', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });
    });

    it('typing a text filter triggers a new fetch with ?q= and table title updates', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);
      fireEvent.change(input, { target: { value: 'ALPHA' } });

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });

      // Verify the fetch was called with the q param
      const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
      const qCall = calls.find(([url]) => (url as string).includes('q=ALPHA'));
      expect(qCall).toBeDefined();
    });

    it('a row matching error location is included; no-match row is excluded', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);
      fireEvent.change(input, { target: { value: 'resistor-R42' } });

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });
    });

    it('clear button resets textFilter and all rows reappear', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);
      fireEvent.change(input, { target: { value: 'ALPHA' } });
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });

      const clearBtn = screen.getByRole('button', { name: 'Clear filter' });
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });
    });

    it('?q=ALPHA URL param seeds textFilter to ALPHA on mount', async () => {
      mockRouterQuery['q'] = 'ALPHA';

      render(<HomePage />);

      await waitFor(() => {
        const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/) as HTMLInputElement;
        expect(input.value).toBe('ALPHA');
      });

      delete mockRouterQuery['q'];
    });

    it('debounce: rapid textFilter changes only trigger fetch after 300ms', async () => {
      jest.useFakeTimers();

      render(<HomePage />);

      // Flush the initial data load
      await act(async () => {
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);

      // Rapid typing
      act(() => { fireEvent.change(input, { target: { value: 'A' } }); });
      act(() => { fireEvent.change(input, { target: { value: 'AL' } }); });
      act(() => { fireEvent.change(input, { target: { value: 'ALPHA' } }); });

      // Before 300ms: table title still shows 3 (debounced fetch hasn't fired)
      expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();

      // After 300ms: debounced fetch fires with q=ALPHA, table title updates to 1
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('error and timeout behaviour', () => {
    it('keeps existing summary data when a subsequent /api/tests fetch fails', async () => {
      // First fetch succeeds — loads summary with 1 record.
      render(<HomePage />);
      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
      });

      // Reload: /api/tests fails, /api/summary succeeds — summary data must remain visible.
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'DB unavailable' }) });
        }
        if ((url as string).includes('/api/summary')) {
          return Promise.resolve({ ok: true, json: async () => MOCK_SUMMARY });
        }
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      const reloadBtn = screen.getByTitle('Reload data');
      fireEvent.click(reloadBtn);

      await waitFor(() => {
        expect(screen.getByText(/Last refresh failed/i)).toBeInTheDocument();
      });

      // Summary from the first successful load must still render.
      const items = screen.getAllByRole('listitem');
      expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
    });

    it('shows error banner (not full-page error) when refresh fails with stale data', async () => {
      render(<HomePage />);
      await waitFor(() => screen.getAllByRole('listitem'));

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'timeout' }) });
        }
        if ((url as string).includes('/api/summary')) {
          return Promise.resolve({ ok: true, json: async () => MOCK_SUMMARY });
        }
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      fireEvent.click(screen.getByTitle('Reload data'));

      await waitFor(() => {
        const banner = screen.getByText(/Last refresh failed/i);
        // Banner must be in a section (non-modal, non-full-page element).
        expect(banner.closest('section')).not.toBeNull();
      });
    });

    it('shows timeout message when fetch is aborted', async () => {
      render(<HomePage />);
      await waitFor(() => screen.getAllByRole('listitem'));

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.reject(
            Object.assign(new DOMException('The user aborted a request.', 'AbortError'), {}),
          );
        }
        if ((url as string).includes('/api/summary')) {
          return Promise.resolve({ ok: true, json: async () => MOCK_SUMMARY });
        }
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      fireEvent.click(screen.getByTitle('Reload data'));

      await waitFor(() => {
        expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      });
    });

    it('clears stale authenticated data when the session signs out', async () => {
      const { rerender } = render(<HomePage />);

      // Wait for initial successful load — summary data should be visible.
      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
      });

      // Simulate sign-out: session becomes null; both APIs return errors.
      mockUseAuth.mockReturnValue({
        session:   null,
        role:      null,
        isGuest:   false,
        isLoading: false,
      });
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'Unauthorized' }) });
        }
        if ((url as string).includes('/api/summary')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'Unauthorized' }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      await act(async () => {
        rerender(<HomePage />);
      });

      // No stale summary data should remain after the identity change clears state.
      await waitFor(() => {
        const items = screen.queryAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(false);
      });

      // Stale-data banner must NOT be shown (hasTableDataRef was reset before the failed fetch).
      expect(screen.queryByText(/showing previous data/i)).toBeNull();
    });
  });
});
