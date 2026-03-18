# ICT Data Viewer — Project Backlog

> Last updated: 2026-03-18
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

---

## 🐛 Bugs

---

## ✨ UI / UX Improvements


### U6 — Detail table: global filter text box
**Problem:** No free-text search across the detail table. Filters currently require clicking specific fields (post-U3) or using header controls.

**Required behavior:**
- Add a filter text input next to the detail table title
- Filters across: SN, product name, tester, fixture, operator, errors
- Results propagate to: graph, range summary, and the detail table itself

**Effort:** Medium-Large
**Dependency:** Do after U3 + U4. U6 should be an extension of the shared filter state established there — not a parallel implementation. Doing U6 standalone risks duplicate/conflicting filter logic.

---

## 🏗️ Infrastructure / Architecture


## 🚀 Features

### F1 — AI-powered chat (ict-manager / ict-admin only)

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
4. **U6** — Detail table text filter. Extends I1/U3/U4 filter state.
5. ~~**U5, U7** — Self-contained UI improvements, do in any order.~~ ✅ Done
6. **F1** — AI chat. Highest payoff, all prerequisites in place by this point.
7. **F2** — When a sample log file is available.
