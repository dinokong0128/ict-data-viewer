# Common Development Tasks

## Adding a New Filter

1. Add state in `HomePage`: `const [newFilter, setNewFilter] = useState(...)`
2. Add prop to `FilterPanel` and update `FilterPanelProps` type
3. Add UI control in `FilterPanel`
4. Use the value in the appropriate `useMemo` computation in `HomePage`
5. Write tests

## Adding a New Chart Type

1. Update `ChartConfig` type in `HomePage`
2. Add a case in the `chartConfig` `useMemo` computation
3. Update `ChartPanel` to handle the new type
4. Add tests

## Adding a New Column Mapping

1. Add aliases to `columnAliases` in `lib/sheet.ts`
2. Reference `mapping.newColumn` in components as needed
3. Add tests for the new column detection
