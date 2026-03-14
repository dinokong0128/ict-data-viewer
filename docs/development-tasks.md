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

## Adding a New Table Column

1. Add the field to `TestRecord` in `src/lib/testUtils.ts`
2. Update the Supabase query in `src/app/api/tests/route.ts` to select the new field
3. Update the fixture join in the same route's guest-fixture path
4. Add the column header and cell in `src/components/DetailTable.tsx`
5. Add tests
