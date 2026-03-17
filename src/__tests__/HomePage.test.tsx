/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    session:   { access_token: 'test-jwt' },
    user:      { id: 'user-1' },
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
});
