# Testing

## Setup

- Tests live in `src/__tests__/`
- File naming: `[Component].test.tsx` or `[module].test.ts`
- Runner: Jest + React Testing Library

```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode
npm test -- --coverage   # With coverage report
```

## Patterns

```typescript
// Unit test for utility function
describe('testUtils helpers', () => {
  it('groups records by date', () => {
    const map = groupByDate(records);
    expect(map.get('2026-03-12')).toBe(2);
  });
});

// Component render test
it('renders filter options', () => {
  render(<FilterPanel {...props} />);
  expect(screen.getByLabelText('Metric')).toBeInTheDocument();
});

// Interaction test
it('calls handler on change', () => {
  const onMetricChange = jest.fn();
  render(<FilterPanel {...props} onMetricChange={onMetricChange} />);
  fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'errors' } });
  expect(onMetricChange).toHaveBeenCalledWith('errors');
});
```

## Troubleshooting Tests

- **Tests failing to start:** run `npm install` to restore dev dependencies
- **Fetch mock errors:** ensure `global.fetch` is mocked before rendering components that call `/api/tests`
