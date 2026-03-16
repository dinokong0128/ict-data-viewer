/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
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

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/', replace: jest.fn(), push: jest.fn() }),
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

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [MOCK_RECORD], demo: false }),
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
      expect(screen.getByText(/Total tests: 1/i)).toBeInTheDocument();
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
});
