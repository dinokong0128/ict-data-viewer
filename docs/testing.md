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

`jest.setup.ts` sets a default `SHEET_ID=test-sheet-id` for all tests.

## Patterns

```typescript
// Unit test for utility function
describe('sheet helpers', () => {
  it('normalizes and infers columns', () => {
    expect(normalize('  Sn ')).toBe('sn');
    expect(inferColumn('Tester Name')).toBe('tester');
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
- **`SHEET_ID` missing:** confirm `jest.setup.ts` is listed in `jest.config.js` `setupFilesAfterFramework`
