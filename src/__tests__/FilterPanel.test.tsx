import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/components/FilterPanel';

describe('FilterPanel', () => {
  it('fires change handlers', () => {
    const onReload = jest.fn();
    const onGidChange = jest.fn();
    const onMetricChange = jest.fn();

    render(
      <FilterPanel
        gid="123"
        onGidChange={onGidChange}
        onReload={onReload}
        rangePreset="7"
        onRangePresetChange={() => undefined}
        startDate="2024-05-01"
        endDate="2024-05-02"
        onStartDateChange={() => undefined}
        onEndDateChange={() => undefined}
        metric="boards"
        onMetricChange={onMetricChange}
        categoryOptions={[]}
        categorySelection="top"
        onCategoryChange={() => undefined}
        errorOptions={[]}
        selectedErrors={new Set()}
        onErrorToggle={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('Sheet GID'), { target: { value: '456' } });
    expect(onGidChange).toHaveBeenCalledWith('456');

    fireEvent.click(screen.getByRole('button', { name: /reload data/i }));
    expect(onReload).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'errors' } });
    expect(onMetricChange).toHaveBeenCalledWith('errors');
  });
});
