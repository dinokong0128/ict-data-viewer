# ICT Data Viewer — Project Backlog

> Last updated: 2026-03-17
> Stack: Next.js (App Router), React, TypeScript, Supabase, Vercel
> Repo: https://github.com/dinokong0128/ict-data-viewer (branch: `develop`)

---

## ✅ Completed

| # | Item |
|---|------|
| B1 | `Threshold:` being parsed into `*_raw` fields as plain text — fixed in `ict-parser.ts` |
| U1 | "Error types" expand list opened to the right, breaking layout — fixed to expand downward |
| U2 | Range summary: changed top errors count from 5 → 3 |

---

## 🐛 Bugs

### B2 — Query timeout / data refresh UX
**Problem:** The frontend occasionally shows a query timeout error, likely correlated with large data imports running concurrently. Additionally, when a data refresh fails, the UI flushes existing data — leaving the user with an empty view instead of stale-but-usable data.

**Required behavior:**
- On refresh failure, keep the previously loaded data visible; show a non-blocking error indicator (e.g. a banner or icon) instead of clearing the view
- Audit all data-fetching hooks/functions: identify polling intervals, refetch triggers, and any `useEffect` chains that wipe state before the new fetch resolves
- Consider adding request timeout configuration and retry logic with exponential backoff
- Ensure the loading/error/success states are clearly distinct in the UI

**Effort:** Medium
**Notes:** Investigate whether Supabase query timeouts can be tuned (statement_timeout). Also check if the hourly ingest job causes DB load spikes that overlap with frontend queries.

---

## ✨ UI / UX Improvements

### U3 — Clickable fixture / SN / tester in detail table → apply as filter
**Problem:** No way to quickly filter by a specific board or fixture by clicking on it in the detail table.

**Required behavior:**
- Clicking `fixture`, `SN`, or `tester` in the detail table applies that value as a filter
- Filter updates propagate to: graph, detail table, range summary

**Effort:** Medium
**Dependency:** Resolve filter state architecture (see I1) first.

---

### U4 — Product name filter in header
**Problem:** No way to filter by product name; only one product exists currently but more are planned (see F2).

**Required behavior:**
- Add a product name filter control in the header, between the reload icon and the date range picker
- Filter propagates to: graph, detail table, range summary

**Effort:** Medium
**Dependency:** Resolve filter state architecture (see I1) first. Do alongside U3.

---

### U5 — Error name text filter in error selection lists
**Problem:** Error selection lists (in the header and in range summary) have no search/filter, making it hard to find specific errors when the list is long.

**Required behavior:**
- Add a text input to filter error names in both the header error selector and the range summary error selector
- Same pattern in both locations — build once, reuse

**Effort:** Small
**Notes:** Self-contained, no shared filter state changes needed.

---

### U6 — Detail table: global filter text box
**Problem:** No free-text search across the detail table. Filters currently require clicking specific fields (post-U3) or using header controls.

**Required behavior:**
- Add a filter text input next to the detail table title
- Filters across: SN, product name, tester, fixture, operator, errors
- Results propagate to: graph, range summary, and the detail table itself

**Effort:** Medium-Large
**Dependency:** Do after U3 + U4. U6 should be an extension of the shared filter state established there — not a parallel implementation. Doing U6 standalone risks duplicate/conflicting filter logic.

---

### U7 — Detail table "errors" column: foldable with readings
**Problem:** The errors column can be very long, making rows hard to scan. Individual error readings (measured value, limits, threshold, unit) are not visible in the table view.

**Required behavior:**
- Show first 3 errors collapsed by default
- "Show all" expands to a sub-table with all errors and their readings: `measured_value`, `high_limit`, `low_limit`, `threshold`, `unit`
- Collapse/expand is per-row

**Effort:** Medium
**Notes:** Pure UI change — all readings data is already in `test_errors`. No query changes needed.

---

## 🏗️ Infrastructure / Architecture

### I1 — Filter state: migrate from `useState` to URL query parameters
**Current state:** All filters are held in local `useState`. Not shareable, not bookmarkable, lost on refresh.

**Two approaches — pick one:**

#### Option A: URL as single source of truth
All filter state lives in the URL (`?product=X&fixture=Y&date=...`). React reads from the URL; user interactions update the URL; components derive state from URL params.

- ✅ Fully shareable and bookmarkable links
- ✅ Browser back/forward works as filter history
- ✅ One authoritative source — no sync bugs between URL and state
- ⚠️ Every filter change triggers a URL push — can feel noisy in the address bar
- ⚠️ More complex to implement: Next.js App Router requires `useSearchParams` + `useRouter`, and updates must be batched carefully to avoid excessive re-renders
- ⚠️ Sensitive filter values (e.g. serial numbers) become visible in URLs and browser history

#### Option B: URL sets initial values only (recommended for now)
On page load, read query params and use them to seed `useState`. After that, state is local. URL is not updated as the user interacts.

- ✅ Simple to implement — one-time read on mount
- ✅ Supports deep-linking and "share this view" use case if you construct the URL manually
- ✅ No re-render complexity from URL updates
- ⚠️ URL drifts from actual state after first interaction — back button does not undo filters
- ⚠️ Cannot rely on the URL to reflect current state for sharing mid-session

**Recommendation:** Start with Option B. It covers the main use case (pre-setting filters via a shared link) with much less complexity. Option A can be revisited if "shareable live filter state" becomes a real need.

**Effort:** Medium (Option B) / Large (Option A)
**Dependency:** U3, U4, U6 should all be built on top of whatever architecture is chosen here. Decide this first.

---

## 🚀 Features

### F1 — AI-powered chat (ict-manager / ict-admin only)
**Description:** Natural language interface for querying ICT data. Engineers type a question; the app generates a SQL query, runs it, and returns a grounded answer — with graph/table/range summary rendered when appropriate.

**Architecture (designed in prior session):**
- `POST /api/chat` — takes `{ question: string }`, returns `{ answer, sql, rows }`
- Pass 1: send Claude the schema + question → returns a `SELECT` SQL query
- Pass 2: run SQL on Supabase → send rows + question back to Claude → returns plain-English answer
- Read-only Postgres role for the chat route (never expose service role key)

**UI placement:**
- Chat input accessible to `ict-manager` and `ict-admin` roles only (gate via `user_roles`)
- Text answer displayed between graph and detail table
- Expandable drawer showing the AI-generated SQL

**Effort:** Large
**Dependencies:** Auth/role gating already in schema (`user_roles`). Read-only Postgres role needs to be created. `ANTHROPIC_API_KEY` needs to be added to Vercel env vars.

---

### F2 — Import additional products + extend parser
**Description:** Support log files from additional ICT products beyond the current one.

**Effort:** Unknown — depends entirely on how different the new log format is. Could be a small extension to `ict-parser.ts` or a separate parser module.

**Required before starting:** Sample log file from the new product.

---

## 📋 Recommended work order

1. **I1** — Decide and implement filter state architecture (Option B recommended). All filter-related work depends on this.
2. **U3 + U4** — Clickable filters + product filter header. Build on I1.
3. **B2** — Query timeout / data refresh UX. Independent, but affects daily usability.
4. **U6** — Detail table text filter. Extends I1/U3/U4 filter state.
5. **U5, U7** — Self-contained UI improvements, do in any order.
6. **F1** — AI chat. Highest payoff, all prerequisites in place by this point.
7. **F2** — When a sample log file is available.
