import { render, screen, waitFor } from '@testing-library/react';
import HomePage from '@/pages/index';

jest.mock('@/components/ChartPanel', () => ({
  ChartPanel: () => <div>Chart</div>
}));

jest.mock('@/components/DetailTable', () => ({
  DetailTable: ({ title }: { title: string }) => <div>{title}</div>
}));

jest.mock('@/lib/sheet', () => {
  const actual = jest.requireActual('@/lib/sheet');
  return {
    ...actual,
    fetchSheetData: jest.fn().mockResolvedValue({
      columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
      rows: [['2024-05-01', 'A1', 'T1', '0', 'pass']],
      types: ['date', 'string', 'string', 'string', 'string']
    })
  };
});

describe('HomePage', () => {
  it('renders summary after loading data', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('ICT Data Viewer')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Total tests: 1/i)).toBeInTheDocument();
    });
  });
});
