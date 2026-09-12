<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Flashcard Data Foundation Implementation Plan

- **Plan**: context/changes/flashcard-data-foundation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-07
- **Verdict**: REVISE (all findings triaged and fixed same session — plan now reflects the fixes)
- **Findings**: 2 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase blocks use checkbox syntax, not plain bullets

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, 2, 3 — all "Success Criteria" blocks
- **Detail**: Every Phase's Automated/Manual Verification list used `- [ ]` checkboxes; the plan format contract requires plain `- ` bullets inside Phase blocks — checkbox state belongs only in `## Progress`. `/10x-implement` parses Progress mechanically and could choke on the duplication.
- **Fix**: Replace every `- [ ]` under each Phase's Verification lists with plain `- ` bullets.
- **Decision**: FIXED

### F2 — No rollback / down-migration story

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Migration Notes
- **Detail**: `context/foundation/infrastructure.md`'s risk register prescribes a snapshot or paired down-migration before any Supabase schema deploy; this plan's Migration Notes named no rollback path at all.
- **Fix A ⭐ Recommended**: Add a "Rollback Strategy" subsection specifying a paired down-migration (drop triggers/policies/tables in reverse order), committed alongside the up-migration.
  - Strength: Matches the project's documented mitigation exactly; tables are empty at this point so the down-migration is just DROP statements.
  - Tradeoff: One more file/section to keep in sync if the up-migration changes during implementation.
  - Confidence: HIGH.
  - Blind spot: Doesn't cover rollback after S-02 starts writing real rows.
- **Fix B**: Document a pre-deploy pg_dump snapshot runbook step instead.
  - Strength: No SQL to maintain in-repo.
  - Tradeoff: Manual, easy to skip under pressure.
  - Confidence: MEDIUM.
- **Decision**: FIXED (Fix A) — added `supabase/rollbacks/<timestamp>_flashcard_data_foundation_down.sql` as a new Phase 2 deliverable, plus a Rollback Strategy subsection in Migration Notes.

### F3 — Generated types file likely fails the strict lint gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3
- **Detail**: `eslint.config.js` runs `strictTypeChecked`/`stylisticTypeChecked` repo-wide with no ignore for generated files; Supabase's `type Database = {...}` output commonly trips rules like `consistent-type-definitions`, and the file is never hand-edited so a lint failure has no sustainable fix.
- **Fix A ⭐ Recommended**: Exclude `src/db/database.types.ts` from ESLint entirely.
  - Strength: Standard practice for generated, never-hand-edited files.
  - Tradeoff: A corrupted generated file wouldn't be lint-caught.
  - Confidence: MEDIUM — inferred from preset behavior, not run against real output.
- **Fix B**: Run `lint:fix` / hand-add disable comments after each regeneration.
  - Strength: No config change.
  - Tradeoff: Disable comments wiped every regeneration — fragile.
  - Confidence: LOW.
- **Decision**: FIXED (Fix A) — added an ESLint ignore entry as a new Phase 3 deliverable.

### F4 — Type-check gate isn't wired into CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3
- **Detail**: `.github/workflows/ci.yml` runs `astro sync` (regenerates types only) and `astro build` (transpiles, no type-check) — never `astro check`. Phase 3's "type check passes" criterion had no standing CI enforcement.
- **Fix A ⭐ Recommended**: Add `npx astro check` as a CI step.
  - Strength: Closes the gap permanently; `astro check` already runs clean (0 errors) today.
  - Tradeoff: Widens this change's footprint into `.github/workflows/ci.yml`.
  - Confidence: HIGH.
- **Fix B**: Leave CI as-is; accept the gap for now.
  - Strength: Keeps the change strictly scoped.
  - Tradeoff: Gap persists.
  - Confidence: HIGH.
- **Decision**: FIXED (Fix A) — added an `astro check` CI step as a new Phase 3 deliverable.

### F5 — Ambiguous "or" in a Phase 1 verification bullet

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification, 3rd bullet
- **Detail**: The bullet offered two different verification commands joined by "or" instead of one deterministic check.
- **Fix**: Keep only the `pg_policies` count query; drop the `db diff --linked` alternative.
- **Decision**: FIXED — resolved as a side effect of the F1 edit.

### F6 — Undocumented reasoning behind a deliberately weak INSERT check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — review_schedules RLS policies
- **Detail**: `review_schedules_insert_own`'s `WITH CHECK` doesn't verify `flashcard_id` ownership — safe today only via `UNIQUE(flashcard_id)` + same-transaction trigger ordering, reasoning that wasn't documented.
- **Fix**: Add a sentence to Critical Implementation Details documenting this.
- **Decision**: FIXED — added to Critical Implementation Details.
