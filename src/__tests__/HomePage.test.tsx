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
  DetailTable: ({ title }: { title: string }) => <div>{title}</div>,
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
