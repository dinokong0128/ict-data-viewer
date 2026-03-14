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
});
