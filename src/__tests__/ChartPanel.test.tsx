import { render, waitFor } from '@testing-library/react';
import { ChartPanel } from '@/components/ChartPanel';

const destroyMock = jest.fn();
const chartMock = jest.fn().mockImplementation(() => ({
  destroy: destroyMock
}));

jest.mock('chart.js/auto', () => ({
  __esModule: true,
  default: chartMock
}));

describe('ChartPanel', () => {
  it('initializes chart with provided data', async () => {
    render(
      <ChartPanel
        labels={['2024-05-01']}
        datasets={[{ label: 'Boards', data: [1] }]}
        chartType="bar"
        onSelectDate={() => undefined}
      />
    );

    await waitFor(() => {
      expect(chartMock).toHaveBeenCalled();
    });
  });
});
