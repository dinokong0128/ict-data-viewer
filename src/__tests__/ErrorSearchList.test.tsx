import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/components/FilterPanel';

const ERROR_OPTIONS = ['U1_analog', 'U2_digital', 'R5_shorts', 'C3_analog', 'X9_digital'];

function renderWithErrors(metric = 'errors') {
  return render(
    <FilterPanel
      onReload={() => undefined}
      rangePreset="7"
      onRangePresetChange={() => undefined}
      startDate="2024-05-01"
      endDate="2024-05-02"
      onStartDateChange={() => undefined}
      onEndDateChange={() => undefined}
      metric={metric}
      onMetricChange={() => undefined}
      categoryOptions={[]}
      categorySelection="top"
      onCategoryChange={() => undefined}
      errorOptions={ERROR_OPTIONS}
      selectedErrors={new Set()}
      onErrorToggle={() => undefined}
    />
  );
}

describe('ErrorSearchList (U5)', () => {
  it('shows search input when metric is errors', () => {
    renderWithErrors();
    expect(screen.getByPlaceholderText('Search errors...')).toBeInTheDocument();
  });

  it('shows all errors initially', () => {
    renderWithErrors();
    for (const name of ERROR_OPTIONS) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('filters to matching errors only (case-insensitive substring)', () => {
    renderWithErrors();
    fireEvent.change(screen.getByPlaceholderText('Search errors...'), { target: { value: 'analog' } });
    expect(screen.getByText(/U1_analog/)).toBeInTheDocument();
    expect(screen.getByText(/C3_analog/)).toBeInTheDocument();
    expect(screen.queryByText(/U2_digital/)).not.toBeInTheDocument();
    expect(screen.queryByText(/R5_shorts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/X9_digital/)).not.toBeInTheDocument();
  });

  it('matches case-insensitively', () => {
    renderWithErrors();
    fireEvent.change(screen.getByPlaceholderText('Search errors...'), { target: { value: 'DIGITAL' } });
    expect(screen.getByText(/U2_digital/)).toBeInTheDocument();
    expect(screen.getByText(/X9_digital/)).toBeInTheDocument();
    expect(screen.queryByText(/U1_analog/)).not.toBeInTheDocument();
  });

  it('shows all errors when search is cleared', () => {
    renderWithErrors();
    const input = screen.getByPlaceholderText('Search errors...');
    fireEvent.change(input, { target: { value: 'analog' } });
    fireEvent.change(input, { target: { value: '' } });
    for (const name of ERROR_OPTIONS) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });
});
