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
  // Use a date within the default 7-day range (local noon to avoid TZ shifts)
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);
  recentDate.setHours(12, 0, 0, 0);
  const dateStr = actual.formatDate(recentDate) + 'T12:00:00';
  return {
    ...actual,
    fetchAllSheetData: jest.fn().mockResolvedValue({
      columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
      rows: [[dateStr, 'A1', 'T1', '0', 'pass']],
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
