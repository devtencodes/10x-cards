<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manage Saved Flashcards Implementation Plan

- **Plan**: context/changes/manage-saved-flashcards/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Malformed flashcard id misclassified as a 500, not a 400

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/[id].ts:21-24 (PATCH), :75-78 (DELETE)
- **Detail**: `context.params.id` is passed straight into `.eq("id", id)` with only a "does it exist" check, never a format check. A non-UUID `id` (e.g. `/api/flashcards/not-a-uuid`) makes Postgres throw a cast error inside the `.update()`/`.delete()` call, which both handlers catch under the generic DB-error branch — logging it via `console.error` as if it were a server-side failure and returning `500 { error: "Update/Delete failed. Please try again." }` instead of a clean `400` for what is actually malformed client input.
- **Fix**: Add a UUID-format check for `id` right next to the existing "Flashcard id is required" check in both `PATCH` and `DELETE`, returning `400 { error: "Invalid flashcard id" }` on a bad format before the Supabase call.
  - Strength: Matches the existing validation style in the same file (`isValidField`'s length/type checks precede the DB call); keeps genuine DB errors (which should stay 500 + logged) distinct from malformed client input (which shouldn't be logged as a server failure).
  - Tradeoff: A few extra lines duplicated across both handlers (consistent with how `MIN_FIELD_LENGTH`/`isValidField` are already duplicated rather than shared in this file).
  - Confidence: HIGH — confirmed by reading the file; the id flows unchecked into both `.eq("id", id)` calls.
  - Blind spot: Low real-world exposure — the UI never constructs a malformed id (it always passes a real card's `id`), so this only matters against direct/adversarial API calls, not the actual `/flashcards` UI flow.
- **Decision**: FIXED — added `UUID_PATTERN` check in both `PATCH` and `DELETE`, returning `400 { error: "Invalid flashcard id" }` before the Supabase call.

## Notes (non-blocking, no action needed)

- Both review sub-agents independently confirmed: RLS is relied on correctly in both routes (no service-role bypass, no manual `user_id` filtering needed), the new SQL trigger's security posture (`SECURITY INVOKER`, pinned `search_path = ''`) correctly mirrors the existing `create_review_schedule_for_flashcard` function, and the `WHEN` clause alone (not the function body) gates the reset — exactly per plan.
- Minor benign deviations noted but not raised as findings (all functionally equivalent or strictly additive, matching established repo conventions): `FlashcardList.tsx` tracks a single `pendingId` rather than a literal per-id pending map (harmless — only one row can ever be active); `[id].ts` carries the same defensive 503/missing-id/JSON-parse guards already used in `save.ts`; `FlashcardListItem`'s Cancel button is also disabled while pending (safety net, not in the plan's literal wording); `.gitignore` gained a `.local/` entry in the Phase 1 commit for a documented dev-only session-cookie helper.
