<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap Playwright and Prove Cross-User Access Control End-to-End

- **Plan**: context/changes/testing-critical-path-access-control/plan.md
- **Scope**: Phase 1 of 4 (full plan review, all 4 phases complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `contextB` leaks on assertion failure in the isolation spec

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/cross-user-isolation.spec.ts:62-92
- **Detail**: `contextB` (user B's browser context) is only closed at line 92, reached solely on the full-success path. The `finally` block (lines 99-105) closes only `contextA`. If any of the isolation assertions (lines 68, 79, 84, 87, 90) throws — which is exactly the scenario this test exists to catch, a real regression — `contextB` is never closed. Not catastrophic (worker exit reclaims it), but it's the one failure path where clean diagnostics matter most.
- **Fix**: Move `contextB.close()` into a `finally` (nested, or added to the outer one) so it's guaranteed to run regardless of assertion outcome, matching how `contextA` is already handled.
- **Decision**: FIXED — restructured into a single try/finally; `contextB` (declared via `let` outside the try) is now closed unconditionally in `finally`. Re-verified: `npx astro check`/lint clean, full suite 12/12, isolation spec stable across 3 consecutive runs.

### F2 — Seeded flashcard can leak uncleaned if sign-in/lookup fails after creation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/cross-user-isolation.spec.ts:33-60
- **Detail**: The flashcard row is created via the real API at lines 35-38, but the `try/finally` that owns cleanup doesn't begin until line 60 — after the direct-Supabase sign-in (line 48) and `.single()` lookup (lines 50-57), both of which `throw` on error (lines 49, 57). If either throws, the seeded row is never deleted (narrow window: requires local Supabase auth/lookup to fail right after a successful save).
- **Fix**: Start the `try/finally` immediately after the `saveResponse` assertion, before the sign-in/lookup calls that can throw — or wrap that sign-in/lookup in its own `try/catch` that deletes by `front` text before rethrowing.
- **Decision**: FIXED — cleanup in `finally` now deletes by `front` text (not id) via a fresh `signInWithPassword` attempt, so it covers the row even when `flashcardId` was never captured. Re-verified: 0 leftover rows after a clean run, full suite 12/12.

### F3 — `PROTECTED_ROUTES` export mechanism differs from plan's literal Contract

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; already resolved during implementation
- **Dimension**: Plan Adherence
- **Location**: src/lib/protected-routes.ts (new), src/middleware.ts:3
- **Detail**: The plan's Contract said to export the array directly from `src/middleware.ts`. Implementation instead extracted it to a new `src/lib/protected-routes.ts`, because importing `middleware.ts` at all drags in `astro:middleware` (a virtual module Astro's bundler resolves specially), which Playwright's plain Node ESM loader can't resolve — confirmed by a real `Error: Only URLs with a scheme in: file, data, and node are supported` failure during implementation. Documented in-code and in commit `d2cec00`'s message; surfaced to the user live during implementation as a mismatch with a clear, no-tradeoff fix.
- **Fix**: No action needed — already the correct adaptation, already disclosed.
- **Decision**: ACCEPTED — necessary, technically justified, disclosed in commit `d2cec00` and surfaced live during implementation.

### F4 — Flashcard id-capture mechanism differs from plan's suggested approaches

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; already resolved during implementation
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/cross-user-isolation.spec.ts:12-58
- **Detail**: The plan suggested capturing the seeded flashcard's id "from the response (or a subsequent `/flashcards` read)." Neither worked: `save.ts`'s response carries only a count, and the rendered `/flashcards` page never puts the id in the DOM (`FlashcardListItem` keeps it in closure state only). Implementation uses a third mechanism instead — a direct, RLS-respecting `@supabase/supabase-js` client authenticated as user A via `signInWithPassword`, querying by the unique `front` text. This was explicitly presented to the user as a two-option choice via AskUserQuestion during implementation, with this approach chosen as the recommended option (no service-role key, zero production code touched).
- **Fix**: No action needed — already the user-approved adaptation.
- **Decision**: ACCEPTED — user explicitly chose this approach via AskUserQuestion during implementation.

### F5 — `CLAUDE.md` and `context/foundation/test-plan.md` bundled into Phase 2's commit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; already resolved during implementation
- **Dimension**: Scope Discipline
- **Location**: commit d2cec00
- **Detail**: Neither file is in plan.md's Changes Required for any phase. Both were bundled into commit `d2cec00` at the user's explicit request (chose "Stage all" when the phase-end ritual flagged them as unrelated dirty paths), and the commit message discloses this explicitly. `CLAUDE.md` was an unrelated external-toolkit sync; `test-plan.md` is this change's own parent rollout guide, opened earlier in the same session.
- **Fix**: No action needed — user-directed, already disclosed in the commit message.
- **Decision**: ACCEPTED — user explicitly chose "Stage all" via AskUserQuestion during the Phase 2 commit ritual.

## Sub-agent summary

**Plan Drift Detection**: All 4 phases' core contracts MATCH. Two real, well-documented deviations found (F3, F4) — both were surfaced to the user live during implementation with clear reasoning, not silent drift. "What We're NOT Doing" boundaries fully respected (verified via `git diff --name-only` across the full commit range: no `supabase/config.toml`, no CI wiring, no risks #1/#4/#5/#6/#7 coverage, no per-test account churn, no multi-browser/accessibility tooling, no AI-generation or DB-trigger code touched).

**Safety, Quality & Pattern Compliance**: 2 WARNING findings, both narrow test-hygiene gaps in `cross-user-isolation.spec.ts`'s error paths (F1, F2) — neither affects the test's actual pass/fail correctness on the happy path already verified working. Everything else confirmed clean: no service-role key usage, `src/middleware.ts`'s behavior is byte-identical pre/post refactor, all three test files use only `getByRole`/`getByLabel`/`getByText` locators (no CSS/XPath), zero `waitForTimeout` usage, `storageState`-only auth in actual specs (UI login confined to the sanctioned `global.setup.ts` exception), unique timestamp-suffixed test data, and every assertion traced back to a real code path that would genuinely fail if the corresponding risk materialized (no decorative assertions).

## Automated verification (re-confirmed at review time)

- `npx astro check` — pass (0 errors)
- `npm run build` — pass
- `npm run lint` — pass (0 errors; 8 pre-existing `no-console` warnings unrelated to this change)
- `npm run test:e2e` — pass (12/12)
