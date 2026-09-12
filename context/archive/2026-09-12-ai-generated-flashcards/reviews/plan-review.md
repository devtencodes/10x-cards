<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI-Generated Flashcards Implementation Plan

- **Plan**: context/changes/ai-generated-flashcards/plan.md
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: REVISE (pre-triage) → all findings fixed in plan
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 paths ✓ (astro.config.mjs, .env.example, src/lib/config-status.ts, src/middleware.ts, src/lib/supabase.ts, src/pages/api/auth/signup.ts, src/components/auth/SignUpForm.tsx, src/pages/dashboard.astro, supabase/migrations/…flashcard_data_foundation.sql). Symbols: PROTECTED_ROUTES ✓, configStatuses/SUPABASE_URL,SUPABASE_KEY ✓, envField schema (default+secret+optional all valid per astro's zod schema) ✓, flashcards.source CHECK('ai_generated','ai_edited') ✓, review_schedules auto-insert trigger ✓, OPENROUTER_MODEL default confirmed live on OpenRouter's /api/v1/models as of 2026-09-12 ✓. brief↔plan ✓.

## Findings

### F1 — Structured-output request can hard-fail the entire generation feature

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1, Item #4 (`src/lib/openrouter.ts`) + Critical Implementation Details
- **Detail**: OpenRouter's own structured-outputs docs state an unsupported `response_format` makes the whole request fail with an error — not silent degradation. The plan framed `json_schema` as pure best-effort; if a future free-model swap doesn't support it, every generation call would fail with the generic 502, invisibly, with no automated check catching it.
- **Fix A ⭐ Recommended**: Drop `response_format: json_schema` entirely; rely on prompt instructions + the already-planned defensive parser alone.
  - Strength: Removes the one dependency that can hard-fail the whole request; the defensive parser already has to handle non-conformant output regardless.
  - Tradeoff: Slightly lower JSON-conformance rate in the common case.
  - Confidence: HIGH — grounded directly in OpenRouter's documented behavior.
  - Blind spot: Actual JSON-conformance rate from nemotron-3.5-lightning without the schema hint is unmeasured.
- **Fix B**: Keep `json_schema`, catch the "unsupported" error, retry once without it.
  - Strength: Keeps conformance benefit on models that support it.
  - Tradeoff: Doubles latency on unsupported models; more code to verify.
  - Confidence: MEDIUM — exact error shape/status for reliable detection is unverified.
- **Decision**: FIXED (via Fix A) — plan.md Phase 1 Item #4 contract and Critical Implementation Details section updated to drop `response_format` and rely on prompt + defensive parsing.

### F2 — Save/list contracts assume a `supabase` client without saying how to get one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Item #1 (`save.ts`) and Phase 4, Item #1 (`flashcards.astro`)
- **Detail**: Both contracts referenced `supabase.from(...)` as if a client were already in scope. `context.locals` only ever carries `user`; every existing route independently calls `createClient(context.request.headers, context.cookies)`. Phase 4 is a new context (no existing `.astro` page queries data today) with no null-client fallback specified.
- **Fix**: Add the client-setup call to both contracts, plus a null-client fallback (existing config-status banner) for the list page.
- **Decision**: FIXED — both contracts in plan.md updated with the explicit `createClient(...)` call and, for Phase 4, a null-client fallback to the config-status banner.

### F3 — Wrong path for a style-precedent reference

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, Item #1 (`generate.astro`) Overview
- **Detail**: Referenced `signup.astro` as a style precedent; the actual file is `src/pages/auth/signup.astro`.
- **Fix**: Update the reference to `src/pages/auth/signup.astro`.
- **Decision**: FIXED — reference corrected in plan.md.
