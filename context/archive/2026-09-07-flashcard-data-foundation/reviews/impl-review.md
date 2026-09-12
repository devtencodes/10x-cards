<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard Data Foundation Implementation Plan

- **Plan**: context/changes/flashcard-data-foundation/plan.md
- **Scope**: Phase 3 of 3 (full plan — all phases complete)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION at review time → **APPROVED post-triage** (both warnings fixed and re-verified below; the observation was acknowledged as intentional)
- **Findings**: 0 critical, 2 warnings, 1 observation — all triaged: F1 FIXED, F2 FIXED, F3 ACKNOWLEDGED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → PASS (post-fix) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL → PASS (post-fix) |

## Findings

### F1 — `npm run lint` currently fails on `src/lib/supabase.ts`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/supabase.ts:11, src/lib/supabase.ts:20
- **Detail**: The Phase 3 commit (db709d3) introduced two whitespace-only lines — a blank line with trailing spaces after the early-return block, and an indented blank line before `setAll`. `npx eslint src/lib/supabase.ts` reports:
  ```
  11:3  error  Delete `⏎··`     prettier/prettier
  20:1  error  Delete `······`  prettier/prettier
  ```
  `npm run lint` (the full run, same as CI's lint step) reproduces these 2 errors and exits non-zero — despite Progress row 3.4 ("Lint passes with the generated file excluded") being marked `[x]` at commit db709d3. Lint passed when checked immediately after the edit; these lines appear to have landed in the working tree before the phase-end commit was staged, without a re-check right before `git commit`. `astro check` and `tsc --noEmit` are both unaffected and still pass clean.
- **Fix**: Run `npx eslint --fix src/lib/supabase.ts` (or `npm run lint -- --fix`) to strip the stray whitespace, then re-run `npm run lint` to confirm it exits 0.
- **Decision**: FIXED — ran `npx eslint --fix src/lib/supabase.ts`; `npm run lint` re-verified clean.

### F2 — Function `search_path` not pinned on the two new trigger functions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260907195424_flashcard_data_foundation.sql (`set_updated_at()`, `create_review_schedule_for_flashcard()`)
- **Detail**: Neither function sets `SET search_path = ''` (or a fixed explicit path). Supabase's security advisor flags any function lacking this as "Function Search Path Mutable." Exploitability here is low — `set_updated_at()` references no schema objects, and `create_review_schedule_for_flashcard()`'s only object reference (`public.review_schedules`) is already schema-qualified — but it's the standard hardening pattern even for `SECURITY INVOKER` functions, and cheap to add now while the migration is still unpushed to any live project.
- **Fix**: Add `set search_path = ''` to both `create function` statements in the migration.
- **Decision**: FIXED — added `set search_path = ''` to both functions; re-verified `db reset` applies cleanly and the auto-create trigger still fires correctly.

### F3 — Redundant cascade path on `review_schedules.user_id` (informational)

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260907195424_flashcard_data_foundation.sql (`review_schedules.user_id ... on delete cascade`)
- **Detail**: `review_schedules.user_id` cascades on user deletion, but this is also reachable transitively via `flashcard_id → flashcards.id → auth.users.id`. Postgres handles the overlapping cascade paths fine (no conflict, no double-delete error) — this is intentional denormalization for RLS simplicity, exactly as the plan states ("keeps RLS policies a direct check with no join"). Not a bug — no action needed.
- **Decision**: ACKNOWLEDGED — confirmed intentional per the plan; no action needed.

## Notes

- **Plan Adherence**: Agent 1 confirmed every planned contract item across all 3 phases as MATCH, including the highest-stakes correctness requirement — `create_review_schedule_for_flashcard()` correctly omits `SECURITY DEFINER` and stays `SECURITY INVOKER`, with an in-line comment documenting why.
- **Scope Discipline**: No unplanned files or scope creep in any of the 3 feature commits (9f183f4, 9ceb37b, db709d3) — only the files the plan called for, plus the expected change-folder docs.
- **Rollback script**: DROP order verified logically sound (deliberately explicit, no reliance on `CASCADE`) and independently confirmed via a live drop-and-recreate test during implementation.
- **RLS coverage**: both tables have RLS enabled with all 4 CRUD policies correctly keyed on `auth.uid() = user_id`.
