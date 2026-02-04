import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/components/FilterPanel';

describe('FilterPanel', () => {
  it('fires change handlers', () => {
    const onReload = jest.fn();
    const onMetricChange = jest.fn();

    render(
      <FilterPanel
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

    fireEvent.click(screen.getByRole('button', { name: /reload data/i }));
    expect(onReload).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'errors' } });
    expect(onMetricChange).toHaveBeenCalledWith('errors');
  });

  it('shows date pickers only for custom range', () => {
    const { rerender } = render(
      <FilterPanel
        onReload={() => undefined}
        rangePreset="7"
        onRangePresetChange={() => undefined}
        startDate="2024-05-01"
        endDate="2024-05-02"
        onStartDateChange={() => undefined}
        onEndDateChange={() => undefined}
        metric="boards"
        onMetricChange={() => undefined}
        categoryOptions={[]}
        categorySelection="top"
        onCategoryChange={() => undefined}
        errorOptions={[]}
        selectedErrors={new Set()}
        onErrorToggle={() => undefined}
      />
    );

    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();

    rerender(
      <FilterPanel
        onReload={() => undefined}
        rangePreset="custom"
        onRangePresetChange={() => undefined}
        startDate="2024-05-01"
        endDate="2024-05-02"
        onStartDateChange={() => undefined}
        onEndDateChange={() => undefined}
        metric="boards"
        onMetricChange={() => undefined}
        categoryOptions={[]}
        categorySelection="top"
        onCategoryChange={() => undefined}
        errorOptions={[]}
        selectedErrors={new Set()}
        onErrorToggle={() => undefined}
      />
    );

    expect(screen.getByLabelText('Start')).toBeInTheDocument();
    expect(screen.getByLabelText('End')).toBeInTheDocument();
  });
});
