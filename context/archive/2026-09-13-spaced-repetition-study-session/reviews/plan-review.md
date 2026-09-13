<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Spaced Repetition Study Session Implementation Plan

- **Plan**: context/changes/spaced-repetition-study-session/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Grounding: 4/4 paths ✓ (`src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/api/flashcards/[id].ts`, `src/pages/flashcards.astro`), 3/3 symbols ✓ (`PROTECTED_ROUTES`, `UUID_PATTERN`, `review_schedules` Row type + `isOneToOne` FK relationship to `flashcards`), brief↔plan ✓.

Additional verification: confirmed no `/study` or `/api/study` path exists yet (no naming collision); confirmed `review_schedules` currently has **zero** application-code readers/writers (only the two SQL triggers touch it) — this plan is the first app-code consumer, so blast radius on existing code is zero; confirmed `database.types.ts` declares `review_schedules.flashcard_id → flashcards.id` as `isOneToOne: true` with a populated `Relationships` array, while `flashcards`' own `Relationships` array is empty — validating the plan's choice to query *from* `review_schedules` embedding `flashcards(...)` rather than the reverse.

## Findings

### F1 — `due_at`/`now() + N days` computation location left implicit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Rating API route, Contract (state-transition table + rounding note)
- **Detail**: The table expresses next values as `now() + 1 day` and `now() + <new interval_days> days`, and the rounding note says this "match[es] Postgres's/JavaScript's default rounding" — phrasing that reads as if the arithmetic might happen on either side. But the plan's own design (Critical Implementation Details, "no migration") deliberately keeps this a plain `SELECT` then `.update()` via the Supabase JS client — not a Postgres function/RPC. A plain `.update()` payload is JSON, not SQL, so there's no way to pass a raw `now() + interval '...'` expression through it; the implementer must compute the new `due_at` as a JS `Date` and serialize it (e.g. `new Date(Date.now() + nextIntervalDays * 86_400_000).toISOString()`) before building the update payload. The plan doesn't say this explicitly, so an implementer could reasonably wonder whether they need a Postgres function after all — re-opening a decision the plan already made.
- **Fix**: Add one sentence to the Phase 1 Contract clarifying that `due_at` is computed in the route handler as a JS `Date` (not a SQL expression) and passed as an ISO string in the `.update()` payload — consistent with the "no migration/no RPC" approach already chosen.
- **Decision**: FIXED — added a clarifying sentence to Phase 1's Contract in plan.md.
