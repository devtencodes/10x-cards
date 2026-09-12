<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI-Generated Flashcards Implementation Plan

- **Plan**: context/changes/ai-generated-flashcards/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run at review time)

- `npx astro check` — 0 errors, 0 warnings, 4 hints ✅
- `npm run build` — succeeded ✅
- `npm run lint` — 0 errors, 4 pre-existing `no-console` warnings (openrouter.ts, generate.ts, save.ts — intentional error logging at system boundaries, unchanged since Phase 1/2) ✅

## Manual verification

All 19 manual Progress items across Phases 1–4 are checked `[x]` with commit SHAs, and each was walked through interactively with the user during this session with explicit confirmation per item (not rubber-stamped) — including a real generation-failure/retry test, a real `psql`/Studio check of `source` values, and a real cross-user RLS check.

## Findings

### F1 — Unplanned back-to-dashboard links on /generate and /flashcards

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/generate.astro:9-11, src/pages/flashcards.astro:27-29
- **Detail**: Neither file's plan contract mentions a back-link. The `/generate` link was added mid-Phase-3 after an explicit AskUserQuestion exchange with the user ("Add a small back link now"). The `/flashcards` link was then added unilaterally in Phase 4 for visual consistency, without a matching explicit approval step — a minor process inconsistency in how the same scope addition was introduced across the two phases, even though the resulting code is identical in spirit and harmless.
- **Fix**: No code change needed — accept both as intentional, user-endorsed UX additions. Optionally note in the plan as an addendum for the record.
- **Decision**: ACCEPTED — user confirmed both links stay as-is, no plan edit needed.

### F2 — flashcards.astro list query has no `.limit()` or pagination

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/pages/flashcards.astro:9-12
- **Detail**: The query fetches every row for the user with no cap. Acceptable for a "minimal read-only v1 list page" per the plan — S-03 will extend this same file with edit/delete — but a heavy user (repeated 20-card generations) will eventually load an unbounded page.
- **Fix**: No action needed now; flag as a follow-up for S-03 (`.limit()` + pagination or "load more").
- **Decision**: ACCEPTED — batched with F3–F6, no action needed.

### F3 — Prefix-based route matching in middleware.ts (pre-existing pattern)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:18
- **Detail**: `pathname.startsWith(route)` means a hypothetical future route like `/flashcards-export` would inherit `/flashcards`'s auth gate — harmlessly over-protective, not an under-protection risk with the current three routes. This pattern predates this change; Phases 3–4 correctly reused it rather than inventing a new mechanism.
- **Fix**: No action needed for this change; worth a lessons-note if the route list grows and a real collision appears.
- **Decision**: ACCEPTED — batched with F3–F6, no action needed.

### F4 — char_length (Postgres) vs .length (JS) mismatch for astral-plane characters

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data safety)
- **Location**: src/pages/api/flashcards/save.ts:19
- **Detail**: For text containing rare surrogate-pair characters, JS `.length` counts 2 per character while Postgres `char_length` counts 1 — a string could pass the app's 2000-char check while still comfortably fitting the DB's own CHECK constraint (never the reverse). Not exploitable; the DB constraint is the real backstop either way.
- **Fix**: No action needed; this is an imprecision in an already-redundant validation layer.
- **Decision**: ACCEPTED — batched with F3–F6, no action needed.

### F5 — Index-as-key in GenerateFlow.tsx candidate list

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture / React correctness
- **Location**: src/components/flashcards/GenerateFlow.tsx:219
- **Detail**: `key={index}` is normally flagged as an anti-pattern, but verified safe here: candidates are only ever status-mutated in place via `.map()` across `updateCandidate`/`acceptCandidate`/`toggleReject`/`acceptAll` — never filtered, spliced, or reordered. Array length and order are stable for the component's lifetime.
- **Fix**: No action needed now; switch to a stable id if a future feature adds delete/reorder of candidates.
- **Decision**: ACCEPTED — batched with F3–F6, no action needed.

### F6 — CandidateCard allows an accepted→rejected transition not listed in the plan

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/flashcards/CandidateCard.tsx (Reject button, always rendered)
- **Detail**: The plan's explicit transition list is `pending→accepted`, `pending→rejected`, `rejected→pending`. The implementation also allows `accepted→rejected` (the Reject button stays visible/functional on an already-accepted card). This is additive and sensible — without it, a user who accepted a card and changed their mind would have no way to reject it — and doesn't violate any stated invariant.
- **Fix**: No action needed; this is a reasonable gap-fill the plan simply didn't spell out.
- **Decision**: ACCEPTED — batched with F3–F6, no action needed.
