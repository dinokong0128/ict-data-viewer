# ICT Data Viewer — Project Backlog

> Last updated: 2026-04-16
> Stack: Next.js (App Router), React, TypeScript, Supabase, Vercel
> Repo: https://github.com/dinokong0128/ict-data-viewer (branch: `develop`)

---

## ✅ Completed

| # | Item |
|---|------|
| B1 | `Threshold:` being parsed into `*_raw` fields as plain text — fixed in `ict-parser.ts` |
| U1 | "Error types" expand list opened to the right, breaking layout — fixed to expand downward |
| U2 | Range summary: changed top errors count from 5 → 3 |
| I1 | Filter state: URL query params seed initial useState values on page mount (Option B) |
| U3 | Clickable fixture / SN / tester in detail table → apply/toggle as filter |
| U4 | Product name filter dropdown in header; options fetched from Supabase / fixture |
| U5 | Error name text filter in error selection lists (header + range summary); shared `useErrorSearch` hook + `ErrorSearchInput` component |
| U7 | Detail table errors column: foldable with readings sub-table (first 3 collapsed, "Show all (N)" expands inline table with measured/limits/unit) |
| B2 | Query timeout / data refresh UX — stale data preserved on refresh failure; AbortController with 15s timeout; API batch raised 1000→5000 |
| U6 | Detail table: free-text filter box next to table title; filters SN, product, tester, fixture, operator, errors; propagates to graph and range summary (debounced 300ms); ?q= URL seeding |

---

## 🐛 Bugs

B3 — SI-suffix numeric values not parsed (paste below B2)
markdown### B3 — SI-suffix numeric values not parsed into `*_value` columns
**Problem:** The parser correctly captures raw strings like `"214.33p"`, `"1.0434M"`, `"5.0000k"` into `*_raw` columns but fails to parse them into the numeric `*_value` columns. `measured_value`, `high_limit_value`, `low_limit_value`, and `threshold_value` end up NULL for any value with an SI suffix.

**Scale:** 246,127 rows affected (35.8% of `test_errors`) — 134,714 with case-sensitive suffixes (`M`, `Meg`), 111,413 with lowercase (`p`/`n`/`u`/`m`/`k`/`g`/`f`). Every numeric comparison against limits — anomaly detection, suspect-pass classification, range summary deltas — is silently broken for these rows.

**Required behavior:**
- Parser handles all SI suffixes: `f` (1e-15), `p` (1e-12), `n` (1e-9), `u` (1e-6), `m` (1e-3), `k` (1e3), `M` / `Meg` (1e6), `g` / `G` (1e9)
- **Case-sensitive** for `m` vs `M` — critical, they differ by a factor of 1e9
- Negative values supported (`-1.0434M`, `-117.21k`)
- Graceful null return on garbage (`"0.-inf"`, `"Part# ..."`, `"Threshold: ..."`, empty strings)
- Backfill migration to populate existing NULL `*_value` rows using the same logic
- Comprehensive unit tests (TDD — tests first)

**Effort:** Small-Medium
**Approach:** Two PRs — (1) parser fix + tests, (2) backfill migration (reviewed and applied manually via Supabase MCP).
**Blocks:** Any future work that relies on numeric comparison of readings to limits — anomaly detection, false-positive classification, enhanced range summary.

B4 — Field-alignment misparse in some error blocks (paste below B3)
markdown### B4 — Field-alignment misparse: `Threshold:` text bleeding into `measured_raw`
**Problem:** In certain error block shapes, the parser's field alignment fails and non-numeric text ends up in the wrong column. Observed cases in production data:
- `"Threshold: 300.00"`, `"Threshold: 100.00"`, `"Threshold: 5.0000k"` etc. appearing in `measured_raw` (44 occurrences)
- `"Part# 7012068"`, `"Part# 7336193"` appearing in `measured_raw` (6 occurrences)
- `"Too many attempts to discharge device"` in `measured_raw` (1 occurrence)

**Scale:** ~51 rows across the DB — small, but indicates the parser is mis-reading block structure in edge cases. Note that B1 was an earlier, related fix for the `Threshold:` issue; this is a residual leak that made it through.

**Required behavior:**
- Identify which block shapes / error types trigger the misalignment (inspect `raw_block` for affected rows — see query below)
- Fix the parser's line-to-field mapping to correctly handle these shapes
- Add regression tests with the actual failing raw blocks as fixtures

**Diagnostic query:**
```sql
SELECT raw_block, measured_raw, high_limit_raw, low_limit_raw
FROM test_errors
WHERE measured_raw ~ '^(Threshold:|Part#|Too many)'
LIMIT 10;
```

**Effort:** Small (after the misaligned cases are identified)
**Notes:** Low priority at 51 rows, but worth doing after
---

## ✨ UI / UX Improvements

---

## 🏗️ Infrastructure / Architecture


## 🚀 Features

### ✅ F1 — AI-powered chat (ict-manager / ict-admin only)

**Description:** Natural-language analytics for ICT data. Engineers can ask about top errors, fail trends, fail counts by tester/fixture/product, or serial-number history. The system returns a grounded answer and, when useful, a table or chart.

**v1 scope:**
- Supported query types: `summary`, `top_n`, `trend`, `compare`, `lookup`
- `POST /api/chat` receives `{ question }`
- LLM returns structured `ChatQueryPlan` JSON
- Server validates the plan, compiles SQL, applies guardrails, runs a read-only query, then generates a grounded answer
- UI shows answer first, with expandable debug details (SQL, row count, warnings)
- Visualization hints in v1: `none`, `table`, `line`, `bar`

**Guardrails:**
- Never use `SUPABASE_SERVICE_KEY` for chat queries
- Read-only access only
- `SELECT` only, single statement only
- Allowlisted query shapes and fields only
- Enforce row limits and timeout
- If the question is ambiguous or data is insufficient, say so explicitly

**Suggested modules:**
- `src/app/api/chat/route.ts`
- `src/lib/ai/chat-plan.ts`
- `src/lib/ai/sql-compiler.ts`
- `src/lib/ai/sql-guard.ts`
- `src/lib/ai/chat-answer.ts`
- `src/lib/ai/chat-provider.ts`

**Dependencies:** `user_roles` gating, dedicated read-only DB role/path, one concrete provider implementation, provider API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)

**Detailed design:** see project [design doc / Google Doc](https://docs.google.com/document/d/1ITqxmd5sucV5LlRGBSFtkmju1gnQLLlJqCnx_28L7P8/) for semantic layer, field mapping, `ChatQueryPlan`, examples, and testing strategy.

**Implementation note:** Do not start with raw schema → arbitrary LLM SQL. First define the semantic layer and `ChatQueryPlan`, then build validation, SQL compilation, and grounded answering.

---

### F2 — Import additional products + extend parser
**Description:** Support log files from additional ICT products beyond the current one.

**Effort:** Unknown — depends entirely on how different the new log format is. Could be a small extension to `ict-parser.ts` or a separate parser module.

**Required before starting:** Sample log file from the new product.

---

## 📋 Recommended work order

1. ~~**I1** — Decide and implement filter state architecture (Option B recommended). All filter-related work depends on this.~~ ✅ Done
2. ~~**U3 + U4** — Clickable filters + product filter header. Build on I1.~~ ✅ Done
3. ~~**B2** — Query timeout / data refresh UX. Independent, but affects daily usability.~~ ✅ Done
4. ~~**U6** — Detail table text filter. Extends I1/U3/U4 filter state.~~ ✅ Done
5. ~~**U5, U7** — Self-contained UI improvements, do in any order.~~ ✅ Done
6. ~~**F1** — AI chat. Highest payoff, all prerequisites in place by this point.~~ ✅ Done
8. **B3** — SI-suffix parser fix + backfill. Unblocks any feature doing numeric comparison. Small PRs, high payoff.
9. **B4** — Field-alignment misparse cleanup. Low priority, do after B3.
10. **F2** — When a sample log file is available.

