import { render, screen, waitFor } from '@testing-library/react';
import HomePage from '@/pages/index';

jest.mock('@/components/ChartPanel', () => ({
  ChartPanel: () => <div>Chart</div>
}));

jest.mock('@/components/DetailTable', () => ({
  DetailTable: ({ title }: { title: string }) => <div>{title}</div>
}));

jest.mock('@/lib/sheet', () => ({
  ...jest.requireActual('@/lib/sheet'),
  SHEET_ID: 'test-sheet-id'
}));

jest.mock('@/lib/adapters', () => {
  const sheetActual = jest.requireActual('@/lib/sheet');
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);
  recentDate.setHours(12, 0, 0, 0);
  const dateStr = sheetActual.formatDate(recentDate) + 'T12:00:00';
  return {
    fetchData: jest.fn().mockResolvedValue({
      columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
      rows: [[dateStr, 'A1', 'T1', '0', 'pass']],
      types: ['date', 'string', 'string', 'string', 'string']
    }),
    getDataSourceType: jest.fn().mockReturnValue('sheet')
  };
});

jest.mock('@/lib/sampleData', () => ({
  generateSampleData: jest.fn()
}));

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
