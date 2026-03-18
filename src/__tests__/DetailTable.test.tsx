import { render, screen, fireEvent } from '@testing-library/react';
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
    test_errors:  [],
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
      test_errors: [
        { error_type: 'analog', location: 'c01', subtest: null, part_spec: '1UF', unit: 'FARADS', measured_raw: '0.78327u', nominal_raw: '1.0000u', high_limit_raw: '1.2000u', low_limit_raw: '0.80000u', threshold_raw: null },
      ],
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);
    expect(screen.getByText('c01')).toBeInTheDocument();
  });

  it('U7: shows first 3 errors collapsed, all 5 after toggle', () => {
    const makeError = (loc: string) => ({
      error_type: 'analog',
      location: loc,
      subtest: null,
      part_spec: '1UF',
      unit: 'FARADS',
      measured_raw: '0.78u',
      nominal_raw: '1.0u',
      high_limit_raw: '1.2u',
      low_limit_raw: '0.8u',
      threshold_raw: null,
    });
    const row = makeRecord({
      id: 42,
      serial_number: 'SN-005',
      result: 'fail',
      test_errors: ['e01', 'e02', 'e03', 'e04', 'e05'].map(makeError),
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

    // Initially collapsed: first 3 visible, 4th and 5th not
    expect(screen.getByText('e01, e02, e03')).toBeInTheDocument();
    expect(screen.queryByText('e04')).not.toBeInTheDocument();
    expect(screen.queryByText('e05')).not.toBeInTheDocument();

    // Expand via toggle button
    fireEvent.click(screen.getByRole('button', { name: 'Show all (5)' }));

    // All 5 now visible as table rows
    expect(screen.getByRole('cell', { name: 'e01' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'e04' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'e05' })).toBeInTheDocument();
  });

  it('U7: rows with 3 or fewer errors show all with no toggle', () => {
    const makeError = (loc: string) => ({
      error_type: 'analog',
      location: loc,
      subtest: null,
      part_spec: '1UF',
      unit: 'FARADS',
      measured_raw: '0.78u',
      nominal_raw: '1.0u',
      high_limit_raw: '1.2u',
      low_limit_raw: '0.8u',
      threshold_raw: null,
    });
    const row = makeRecord({
      id: 43,
      serial_number: 'SN-006',
      result: 'fail',
      test_errors: ['f01', 'f02', 'f03'].map(makeError),
    });
    render(<DetailTable rows={[row]} page={1} pageSize={10} onPageChange={jest.fn()} title="Test" />);

    expect(screen.getByText('f01, f02, f03')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });
});
