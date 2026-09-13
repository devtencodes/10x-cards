<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Manage Saved Flashcards Implementation Plan

- **Plan**: context/changes/manage-saved-flashcards/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE (both findings fixed during triage — see Decisions below; verdict after fixes: SOUND)
- **Findings**: 0 critical, 2 warnings, 0 observations (both FIXED)

## Verdicts

| Dimension | Verdict (at review) | Verdict (after fixes) |
|-----------|----------------------|------------------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING | PASS |
| Blind Spots | PASS | PASS |
| Plan Completeness | WARNING | PASS |

## Grounding

Grounding: 6/6 paths ✓, 5/5 symbols ✓, brief↔plan ✓

Deep-mode sub-agent verification: the plan's core claim that `.update()/.delete()` chained with `.select()` returns an empty array (not an error) when RLS filters out the target row is consistent with `@supabase/postgrest-js`'s documented behavior (installed `@supabase/supabase-js@2.105.3`). No existing in-repo `.update()`/`.delete()` call precedes this plan, so nothing to cross-reference directly, but no contradicting evidence found either. Blast-radius sweep: nothing else in the codebase depends on `flashcards.astro`'s internals (only route-name references in `middleware.ts`, `dashboard.astro`, `GenerateFlow.tsx`'s redirect); no existing code calls `.update()` on `flashcards` today, so the new `after update` trigger only fires from this plan's own PATCH route; `src/pages/api/flashcards/[id].ts` doesn't collide with anything and is the first dynamic API route in this codebase.

## Findings

### F1 — FlashcardListItem's prop contract omits `id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Changes Required #3 (FlashcardListItem)
- **Detail**: Phase 2 #2 (FlashcardList) specifies callback signatures the child must invoke — `onEdit(id)`, `onSaveEdit(id, front, back)`, `onDeleteClick(id)`, `onConfirmDelete(id)`. But Phase 2 #3's prop list for `FlashcardListItem` is explicitly "the card's front/back/created_at, mode, isPending, error, and the callbacks" — `id` is never listed as a prop. As written, the child has no way to know its own id to pass back into those callbacks. This would surface immediately as a TypeScript error during implementation (not a silent runtime bug), but the contract as documented is incomplete.
- **Fix**: Add `id: string` to `FlashcardListItem`'s prop list in Phase 2 #3.
- **Decision**: FIXED — added `id` to the prop list with a one-line note on why it's required.

### F2 — "Matches GenerateFlow's pattern" claim doesn't hold up

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Current State Analysis / plan-brief.md's "List interactivity" decision
- **Detail**: The plan brief justifies the React-island approach as matching "S-02's GenerateFlow pattern." Verified against the actual code: `generate.astro` renders `<GenerateFlow client:load />` with zero props — `GenerateFlow` fetches everything client-side after mount. The plan's actual proposal for `flashcards.astro` (SSR-fetch `cards`, pass as a prop into a `client:load` island) is a different, genuinely new pattern for this codebase — the closest existing precedent (`signin.astro`/`signup.astro` passing `serverError` as a prop) only passes a scalar string, not a fetched dataset. The approach itself is sound — a standard Astro pattern, arguably better here than GenerateFlow's all-client-fetch approach since it avoids an extra round trip — but the plan's own rationale misstates precedent, which could mislead whoever implements it into looking for a GenerateFlow-shaped island that doesn't exist.
- **Fix**: Correct the rationale in Current State Analysis / plan-brief.md to say this is a new pattern for the codebase (SSR-fetched array → `client:load` prop), not a reuse of GenerateFlow's approach. No code/design change needed — GenerateFlow just isn't the right precedent to cite.
- **Decision**: FIXED — corrected plan-brief.md's Key Decisions row to describe this as a new pattern chosen to avoid an extra client-side round trip, rather than a GenerateFlow reuse.
