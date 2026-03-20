import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailTable } from '@/components/DetailTable';
import type { TestRecord } from '@/lib/testUtils';

function makeRecord(overrides: Partial<TestRecord> & { id: number; serial_number: string }): TestRecord {
  return {
    board_id:     overrides.serial_number,
    start_time:   '2026-03-12T08:00:00Z',
    end_time:     '2026-03-12T08:02:00Z',
    result:       'pass',
    operator_id:  'operator-01',
    fixture_id:   'fixture-01',
    tester:       'tester-01',
    source_file:  'test.log',
    ingested_at:  '2026-03-12T08:02:00Z',
    mac_address:  '020000000001',
    rev:          '13',
    product_id:   'PART-REDACTED-001',
    product_name: 'Test Product A',
    part_number:  'PART-REDACTED-001',
    error_locations: [],
    ...overrides,
  };
}

const rows: TestRecord[] = [
  makeRecord({ id: 1, serial_number: 'SN-XXXX-000001' }),
  makeRecord({ id: 2, serial_number: 'SN-XXXX-000002' }),
];

describe('DetailTable', () => {
  it('renders rows and paginates', () => {
    const onPageChange = jest.fn();
    render(
      <DetailTable
        rows={rows}
        page={1}
        pageSize={1}
        onPageChange={onPageChange}
        title="Details"
      />
    );

    expect(screen.getByText('SN-XXXX-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows PASS result', () => {
    render(
      <DetailTable rows={[makeRecord({ id: 1, serial_number: 'SN-001' })]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />
    );
    expect(screen.getByText('pass')).toBeInTheDocument();
  });

  it('shows FAIL result', () => {
    render(
      <DetailTable rows={[makeRecord({ id: 1, serial_number: 'SN-001', result: 'fail' })]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />
    );
    expect(screen.getByText('fail')).toBeInTheDocument();
  });

  it('calls onFixtureClick with fixture value when fixture cell is clicked', () => {
    const onFixtureClick = jest.fn();
    render(
      <DetailTable
        rows={[makeRecord({ id: 1, serial_number: 'SN-001', fixture_id: 'fixture-42' })]}
        page={1}
        pageSize={10}
        onPageChange={jest.fn()}
        title="Test"
        onFixtureClick={onFixtureClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'fixture-42' }));
    expect(onFixtureClick).toHaveBeenCalledWith('fixture-42');
  });

  it('calls onSnClick with serial number when SN cell is clicked', () => {
    const onSnClick = jest.fn();
    render(
      <DetailTable
        rows={[makeRecord({ id: 1, serial_number: 'SN-999' })]}
        page={1}
        pageSize={10}
        onPageChange={jest.fn()}
        title="Test"
        onSnClick={onSnClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'SN-999' }));
    expect(onSnClick).toHaveBeenCalledWith('SN-999');
  });

  it('calls onTesterClick with tester value when tester cell is clicked', () => {
    const onTesterClick = jest.fn();
    render(
      <DetailTable
        rows={[makeRecord({ id: 1, serial_number: 'SN-001', tester: 'tester-99' })]}
        page={1}
        pageSize={10}
        onPageChange={jest.fn()}
        title="Test"
        onTesterClick={onTesterClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'tester-99' }));
    expect(onTesterClick).toHaveBeenCalledWith('tester-99');
  });

  it('renders fixture as plain text when onFixtureClick is not provided', () => {
    render(
      <DetailTable
        rows={[makeRecord({ id: 1, serial_number: 'SN-001', fixture_id: 'fixture-plain' })]}
        page={1}
        pageSize={10}
        onPageChange={jest.fn()}
        title="Test"
      />
    );

    expect(screen.getByText('fixture-plain')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'fixture-plain' })).not.toBeInTheDocument();
  });

  it('shows error locations for failed board', () => {
    const row = makeRecord({
      id: 1,
      serial_number: 'SN-001',
      result: 'fail',
      error_locations: ['c01'],
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);
    expect(screen.getByText('c01')).toBeInTheDocument();
  });

  it('U7: shows first 3 errors collapsed, toggle shows "Show all" button', () => {
    const row = makeRecord({
      id: 42,
      serial_number: 'SN-005',
      result: 'fail',
      error_locations: ['e01', 'e02', 'e03', 'e04', 'e05'],
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

    // Initially collapsed: first 3 visible, 4th and 5th not
    expect(screen.getByText('e01, e02, e03')).toBeInTheDocument();
    expect(screen.queryByText('e04')).not.toBeInTheDocument();
    expect(screen.queryByText('e05')).not.toBeInTheDocument();

    // Toggle button present
    expect(screen.getByRole('button', { name: 'Show all (5)' })).toBeInTheDocument();
  });

  describe('U6 — text filter input', () => {
    it('renders text filter input when onTextFilterChange is provided', () => {
      render(
        <DetailTable
          rows={rows}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          title="Test"
          textFilter=""
          onTextFilterChange={jest.fn()}
        />
      );
      expect(screen.getByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/)).toBeInTheDocument();
    });

    it('does not render text filter input when onTextFilterChange is not provided', () => {
      render(
        <DetailTable rows={rows} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />
      );
      expect(screen.queryByPlaceholderText(/Search SN, product, tester, fixture, operator, errors/)).not.toBeInTheDocument();
    });

    it('clear button appears when textFilter is non-empty and calls onTextFilterChange with empty string', () => {
      const onTextFilterChange = jest.fn();
      render(
        <DetailTable
          rows={rows}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          title="Test"
          textFilter="ABC"
          onTextFilterChange={onTextFilterChange}
        />
      );

      const clearBtn = screen.getByRole('button', { name: 'Clear filter' });
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);
      expect(onTextFilterChange).toHaveBeenCalledWith('');
    });

    it('clear button is absent when textFilter is empty', () => {
      render(
        <DetailTable
          rows={rows}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          title="Test"
          textFilter=""
          onTextFilterChange={jest.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: 'Clear filter' })).not.toBeInTheDocument();
    });
  });

  it('U7: rows with 3 or fewer errors show all with no toggle', () => {
    const row = makeRecord({
      id: 43,
      serial_number: 'SN-006',
      result: 'fail',
      error_locations: ['f01', 'f02', 'f03'],
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

    expect(screen.getByText('f01, f02, f03')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  describe('lazy-loaded error details on expand', () => {
    beforeEach(() => {
      global.fetch = jest.fn() as jest.Mock;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('fetches and renders full error details when row is expanded', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            { error_type: 'analog', location: 'e01', subtest: null, part_spec: '1UF', unit: 'FARADS', measured_raw: '0.78u', nominal_raw: '1.0u', high_limit_raw: '1.2u', low_limit_raw: '0.8u', threshold_raw: null },
            { error_type: 'analog', location: 'e02', subtest: null, part_spec: '10K', unit: 'OHM', measured_raw: '5K', nominal_raw: '10K', high_limit_raw: '11K', low_limit_raw: '9K', threshold_raw: null },
            { error_type: 'analog', location: 'e03', subtest: null, part_spec: '22UF', unit: 'FARADS', measured_raw: '20u', nominal_raw: '22u', high_limit_raw: '24u', low_limit_raw: '20u', threshold_raw: null },
            { error_type: 'digital', location: 'e04', subtest: null, part_spec: 'IC', unit: '', measured_raw: 'FAIL', nominal_raw: '', high_limit_raw: '', low_limit_raw: '', threshold_raw: null },
            { error_type: 'analog', location: 'e05', subtest: null, part_spec: '4.7K', unit: 'OHM', measured_raw: '3K', nominal_raw: '4.7K', high_limit_raw: '5.2K', low_limit_raw: '4.2K', threshold_raw: null },
          ],
        }),
      });

      const row = makeRecord({
        id: 42,
        serial_number: 'SN-005',
        result: 'fail',
        error_locations: ['e01', 'e02', 'e03', 'e04', 'e05'],
      });
      render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

      // Click "Show all" to expand
      fireEvent.click(screen.getByRole('button', { name: 'Show all (5)' }));

      // Verify fetch was called with correct URL
      expect(global.fetch).toHaveBeenCalledWith('/api/tests/42/errors', expect.any(Object));

      // Wait for details to render
      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'e01' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'e04' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'e05' })).toBeInTheDocument();
      });

      // Verify measurement data rendered (use getAllBy for values appearing in multiple rows)
      expect(screen.getByRole('cell', { name: '0.78u' })).toBeInTheDocument();
      expect(screen.getAllByRole('cell', { name: 'FARADS' }).length).toBeGreaterThanOrEqual(1);
    });

    it('passes Authorization header when authToken is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errors: [] }),
      });

      const row = makeRecord({
        id: 10,
        serial_number: 'SN-AUTH',
        result: 'fail',
        error_locations: ['a01', 'a02', 'a03', 'a04'],
      });
      render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" authToken="my-jwt" />);

      fireEvent.click(screen.getByRole('button', { name: 'Show all (4)' }));

      await waitFor(() => {
        const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer my-jwt');
      });
    });

    it('shows error message when fetch returns non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'DB unavailable' }),
      });

      const row = makeRecord({
        id: 99,
        serial_number: 'SN-ERR',
        result: 'fail',
        error_locations: ['x01', 'x02', 'x03', 'x04'],
      });
      render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

      fireEvent.click(screen.getByRole('button', { name: 'Show all (4)' }));

      await waitFor(() => {
        expect(screen.getByText(/Error loading details/)).toBeInTheDocument();
        expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
      });
    });

    it('shows error message when fetch rejects (network error)', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const row = makeRecord({
        id: 88,
        serial_number: 'SN-NET',
        result: 'fail',
        error_locations: ['n01', 'n02', 'n03', 'n04'],
      });
      render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

      fireEvent.click(screen.getByRole('button', { name: 'Show all (4)' }));

      await waitFor(() => {
        expect(screen.getByText(/Error loading details/)).toBeInTheDocument();
        expect(screen.getByText(/Network failure/)).toBeInTheDocument();
      });
    });
  });
});
