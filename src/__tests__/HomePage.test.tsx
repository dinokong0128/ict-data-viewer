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
  DetailTable: ({ title, textFilter, onTextFilterChange }: {
    title: string;
    textFilter?: string;
    onTextFilterChange?: (v: string) => void;
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

const MOCK_RECORD: TestRecord = {
  id: 1,
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
  test_errors: [],
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
    return Promise.resolve({
      ok: true,
      json: async () => ({ records: [MOCK_RECORD], demo: false }),
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

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
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

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
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

  it('seeds dateFrom/dateTo from URL and calls loadData with those dates', async () => {
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

  describe('U6 — text filter', () => {
    const RECORD_A: TestRecord = {
      ...MOCK_RECORD,
      id: 10,
      serial_number: 'SN-ALPHA-001',
      product_name: 'Alpha Board',
      tester: 'tester-alpha',
      fixture_id: 'fix-alpha',
      operator_id: 'op-alpha',
      board_id: 'SN-ALPHA-001',
      test_errors: [],
    };
    const RECORD_B: TestRecord = {
      ...MOCK_RECORD,
      id: 11,
      serial_number: 'SN-BETA-002',
      product_name: 'Beta Board',
      tester: 'tester-beta',
      fixture_id: 'fix-beta',
      operator_id: 'op-beta',
      board_id: 'SN-BETA-002',
      test_errors: [],
    };
    const RECORD_WITH_ERROR: TestRecord = {
      ...MOCK_RECORD,
      id: 12,
      serial_number: 'SN-ERR-003',
      product_name: 'Error Board',
      tester: 'tester-err',
      fixture_id: 'fix-err',
      operator_id: 'op-err',
      board_id: 'SN-ERR-003',
      result: 'fail',
      test_errors: [{
        error_type: 'analog',
        location: 'resistor-R42',
        subtest: null,
        part_spec: '10K',
        unit: 'OHM',
        measured_raw: '5K',
        nominal_raw: '10K',
        high_limit_raw: '11K',
        low_limit_raw: '9K',
        threshold_raw: null,
      }],
    };

    beforeEach(() => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if ((url as string).includes('/api/products')) {
          return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ records: [RECORD_A, RECORD_B, RECORD_WITH_ERROR], demo: false }),
        });
      });
    });

    it('textFilter defaults to empty; setting it filters detail table rows immediately', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);
      fireEvent.change(input, { target: { value: 'ALPHA' } });

      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });
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

    it('textFilter and fixture filter apply together with AND logic', async () => {
      render(<HomePage />);
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(3 rows\)/)).toBeInTheDocument();
      });

      // Typing 'ALPHA' already narrows to 1 row; also apply via URL by re-mounting with fixture
      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);

      // Filter by text that matches both A and B: 'tester'
      fireEvent.change(input, { target: { value: 'tester-alpha' } });
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(1 rows?\)/)).toBeInTheDocument();
      });

      // Now also change to text that matches neither → 0 rows
      fireEvent.change(input, { target: { value: 'tester-alpha tester-beta' } });
      await waitFor(() => {
        expect(screen.getByText(/Details for selected range \(0 rows\)/)).toBeInTheDocument();
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

    it('debounce: rapid textFilter changes propagate to range summary only after 300ms', async () => {
      jest.useFakeTimers();

      render(<HomePage />);

      // Flush the initial data load (uses real async in fake timer env)
      await act(async () => {
        jest.runAllTimers();
      });

      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        const totalItem = items.find((el) => /total tests:/i.test(el.textContent ?? ''));
        expect(totalItem).toBeDefined();
      });

      const input = screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/);

      // Rapid typing — table title changes immediately
      act(() => { fireEvent.change(input, { target: { value: 'A' } }); });
      act(() => { fireEvent.change(input, { target: { value: 'AL' } }); });
      act(() => { fireEvent.change(input, { target: { value: 'ALPHA' } }); });

      // Before 300ms: summary still shows original count (debounce hasn't fired)
      const itemsBefore = screen.getAllByRole('listitem');
      const totalBefore = itemsBefore.find((el) => /total tests:/i.test(el.textContent ?? ''));
      expect(totalBefore?.textContent).toMatch(/3/);

      // After 300ms: summary updates
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        const totalItem = items.find((el) => /total tests:/i.test(el.textContent ?? ''));
        expect(totalItem?.textContent).toMatch(/1/);
      });

      jest.useRealTimers();
    });
  });

  describe('error and timeout behaviour', () => {
    it('keeps existing records when a subsequent fetch fails', async () => {
      // First fetch succeeds — loads one record.
      render(<HomePage />);
      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
      });

      // Second fetch (reload) fails — records must stay visible.
      (global.fetch as jest.Mock).mockImplementationOnce((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: 'DB unavailable' }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      const reloadBtn = screen.getByTitle('Reload data');
      fireEvent.click(reloadBtn);

      await waitFor(() => {
        expect(screen.getByText(/Last refresh failed/i)).toBeInTheDocument();
      });

      // Record from the first successful load must still render.
      const items = screen.getAllByRole('listitem');
      expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
    });

    it('shows error banner (not full-page error) when refresh fails with stale data', async () => {
      render(<HomePage />);
      await waitFor(() => screen.getAllByRole('listitem'));

      (global.fetch as jest.Mock).mockImplementationOnce((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'timeout' }) });
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

      (global.fetch as jest.Mock).mockImplementationOnce((url: string) => {
        if ((url as string).includes('/api/tests')) {
          return Promise.reject(
            Object.assign(new DOMException('The user aborted a request.', 'AbortError'), {}),
          );
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

      // Wait for initial successful load — record should be visible.
      await waitFor(() => {
        const items = screen.getAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(true);
      });

      // Simulate sign-out: session becomes null; API now returns 401 (realistic — the
      // server rejects unauthenticated requests).  This also exercises the path where
      // hasDataRef has been reset to false, so the error message is the raw error (not
      // the "showing previous data" stale-data message).
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
        return Promise.resolve({ ok: true, json: async () => ({ products: [] }) });
      });

      // Re-render triggers the identity-change useEffect (records cleared, hasDataRef reset)
      // and the rangePreset effect (new loadData due to session change → fetch fails → raw error,
      // NOT the "showing previous data" banner, because hasDataRef was already reset).
      await act(async () => {
        rerender(<HomePage />);
      });

      // No stale records should remain in the DOM after the sign-out.
      await waitFor(() => {
        const items = screen.queryAllByRole('listitem');
        expect(items.some((el) => /Total tests: 1/i.test(el.textContent ?? ''))).toBe(false);
      });

      // Stale-data banner must NOT be shown (hasDataRef was reset before the failed fetch).
      expect(screen.queryByText(/showing previous data/i)).toBeNull();
    });
  });
});
