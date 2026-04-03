# DIN-5 / US-08 Gap Analysis (Character Creation in Lobby)

Date: 2026-04-03

## Scope

This analysis compares the **`develop`** branch of `dinokong0128/dnd-side` against the issue requirements for **[US-08] Build a character in the lobby (Player)** and identifies remaining work needed to satisfy acceptance criteria.

## Plan (listed before coding)

1. Inspect current repository state and verify whether US-08 target files exist.
2. Compare `dnd-side` `develop` branch with the US-08 feature branch to identify landed vs. missing work.
3. Map findings to Linear acceptance criteria and define remaining implementation tasks.
4. Produce a concrete execution checklist and PR recommendations.

## What exists on `develop`

On `develop`, the US-08 target implementation files are not present yet:

- Missing UI components:
  - `frontend/src/components/games/CharacterCreationForm.tsx`
  - `frontend/src/components/games/CharacterSummaryCard.tsx`
- Missing players API route:
  - `frontend/src/app/api/games/[gameId]/players/route.ts`
- Missing players Supabase helper module:
  - `frontend/src/lib/supabase/players.ts` (with create/get/update helpers requested by issue)

Only general game pages/routes exist in `develop` (e.g., game lobby page and base game routes), indicating US-08 is not merged there.

## What exists on `feat/us-08-character-creation`

The feature branch includes:

- Character form and summary card components.
- `POST` / `PATCH` API route at `/api/games/[gameId]/players` with Zod validation.
- Lobby page wiring via `CharacterSection`.
- Inventory assignment logic tied to class selection (US-09 overlap).

This indicates substantial implementation progress exists outside `develop`.

## Remaining tasks to complete DIN-5 (from issue requirements)

### 1) Merge and reconcile feature work into `develop`

- Bring over US-08 frontend and API files from feature branch into a clean branch based on `develop`.
- Resolve unrelated drift in that feature branch (it includes broad backend and auth/UI edits not scoped to US-08).

### 2) Align Supabase data layer with issue contract

Issue explicitly calls for `frontend/src/lib/supabase/players.ts` to expose:

- `createPlayer()`
- `getPlayer()`
- `updatePlayer()`

Current feature branch `players.ts` exposes fetch helpers but not those exact create/update API helpers, so this contract is still incomplete.

### 3) Validate client + server parity

- Keep Zod validation in form and route in sync for:
  - name required, 1–50
  - class enum restricted to approved classes
  - six ability scores integer 1–20
- Confirm per-field error mapping remains deterministic on both client and server.

### 4) Confirm persistence fields match requirement

On save/update, ensure writes to `players` include:

- `character_name`
- `character_class`
- `stats` (jsonb)
- `hp_max`

Also confirm edit flow preserves expected behavior before game start.

### 5) Host readiness indicator via Realtime (currently missing)

Acceptance criterion requires host readiness to update within 3 seconds via Supabase Realtime.

Remaining work:

- Subscribe host lobby player list/readiness state to `players` table changes.
- Reflect readiness immediately when a player creates/edits a character.
- Add fallback refresh/error behavior for dropped subscriptions.

### 6) RLS verification and policy hardening

Issue requires player-only row write/edit.

Remaining work:

- Ensure policy allows authenticated player to write/update only where `profile_id = auth.uid()`.
- Verify host and other players cannot mutate another player's row.
- Add policy migration/tests if not already present.

### 7) Testing coverage still needed

Add/finish tests for:

- Form validation edge cases (empty fields, >20, <1, non-int).
- API route validation and auth failures.
- Create → success card transition.
- Edit button pre-populates and persists updates.
- Realtime readiness update behavior on host view.

## Recommended implementation order

1. Start from fresh branch off `develop`.
2. Cherry-pick or re-implement only US-08 files (avoid unrelated feature branch changes).
3. Add/standardize `createPlayer/getPlayer/updatePlayer` in Supabase layer.
4. Wire realtime readiness in host lobby view.
5. Add RLS migration/policy tests.
6. Run frontend + API test suite.
7. Open focused PR for DIN-5.

## Notes

The local workspace repository (`/workspace/ict-data-viewer`) is not the same codebase as `dinokong0128/dnd-side`, so this commit records a concrete gap analysis and execution checklist based on direct branch inspection of the target GitHub repo.
