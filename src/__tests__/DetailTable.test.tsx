import { render, screen, fireEvent } from '@testing-library/react';
import { DetailTable } from '@/components/DetailTable';
import type { SheetRow } from '@/lib/sheet';

const rows: SheetRow[] = [
  { raw: ['2024-05-01', 'A1'], date: new Date('2024-05-01'), dateKey: '2024-05-01', errors: [] },
  { raw: ['2024-05-02', 'A2'], date: new Date('2024-05-02'), dateKey: '2024-05-02', errors: [] }
];

const columns = [
  { index: 0, label: 'Date' },
  { index: 1, label: 'SN' }
];

describe('DetailTable', () => {
  it('renders rows and paginates', () => {
    const onPageChange = jest.fn();
    render(
      <DetailTable
        rows={rows}
        columns={columns}
        page={1}
        pageSize={1}
        onPageChange={onPageChange}
        title="Details"
      />
    );

    expect(screen.getByText('A1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
