import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/components/FilterPanel';

describe('FilterPanel', () => {
  it('fires change handlers', () => {
    const onMetricChange = jest.fn();

    render(
      <FilterPanel
        onReload={() => undefined}
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

    fireEvent.change(screen.getByLabelText('Metrics'), { target: { value: 'errors' } });
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

    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();

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

    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });
});
