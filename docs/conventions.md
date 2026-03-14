# Code Conventions

## Naming

| Kind | Style | Example |
|------|-------|---------|
| Components | PascalCase | `HomePage`, `ChartPanel` |
| Functions/variables | camelCase | `loadData`, `buildSummary` |
| Constants | UPPER_SNAKE_CASE | `PAGE_SIZE` |
| Component prop types | PascalCase + `Props` suffix | `FilterPanelProps` |

## Import Paths

Use the `@/` alias (configured in `tsconfig.json`):

```typescript
import { ChartPanel } from '@/components/ChartPanel';
import { formatDate } from '@/lib/testUtils';
```

## TypeScript

- Always define explicit prop types for components
- Use type guards in filter operations: `.filter((r): r is TestRecord => Boolean(r))`
- Use nullish coalescing for defaults: `value ?? ''`
- Prefer `string | null` over optional properties for nullable state

## React

- Wrap expensive computations in `useMemo` with dependency arrays
- Use `useCallback` for callbacks passed to children
- Use `void` prefix for async calls in `useEffect`: `void loadData()`
- Clean up effects properly (check mounted state for async operations)

## Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript config (strict mode, ES2020 target) |
| `next.config.js` | Next.js config (React strict mode) |
| `jest.config.js` | Jest test runner config |
| `jest.setup.ts` | Test setup (extends jest-dom matchers) |
| `.eslintrc.json` | ESLint rules (next/core-web-vitals) |
