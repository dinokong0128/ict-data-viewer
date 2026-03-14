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

// Build a record dated within the last 30 days (default range)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const isoYesterday = yesterday.toISOString().slice(0, 19) + 'Z';

const MOCK_RECORD: TestRecord = {
  id: 1,
  board_id: 'SN-XXXX-000001',
  start_time: isoYesterday,
  end_time: isoYesterday,
  result: 'PASS',
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

  it('shows demo banner when API returns demo:true', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [MOCK_RECORD], demo: true }),
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText(/Demo mode/i)).toBeInTheDocument();
    });
  });
});
