# Manage Saved Flashcards — Plan Brief

> Full plan: `context/changes/manage-saved-flashcards/plan.md`

## What & Why

Let a signed-in user edit and delete the flashcards they've already saved (S-02 shipped view-only). Editing a card resets its review schedule to "new" (FR-008) so stale scheduling state can't survive a content change; deleting requires an inline confirmation step (FR-009) so a card isn't lost to a stray click.

## Starting Point

`/flashcards` (from S-02) is a plain Astro SSR page — it fetches `front`/`created_at` and renders a static `<ul>`, with no client-side interactivity and no `back` field loaded. The `flashcards`/`review_schedules` schema (F-01) already has an `after insert` trigger that auto-creates a schedule row, but nothing reacts to a flashcard's content changing.

## Desired End State

Every card on `/flashcards` has Edit and Delete controls. Editing turns a card's front/back into editable fields in place; saving updates it without a page reload and — only if the content actually changed — resets its review schedule. Deleting requires an inline "Confirm delete? Yes/No" step; confirming removes the card (and its schedule row, via cascade) without a reload, falling back to the existing empty state if it was the last card.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| List interactivity | React island (SSR-fetched props) | New pattern for this codebase (GenerateFlow fetches client-side with no props; this passes SSR-fetched data in) — chosen to avoid an extra client-side round trip on page load. | Plan |
| Edit UX | Inline edit-in-place | Reuses `CandidateCard`'s proven pattern; a 2-field form doesn't justify a new modal dependency. | Plan |
| Delete UX | Inline confirm toggle | Satisfies FR-009's confirmation requirement without a new dependency; mirrors `CandidateCard`'s Accept/Reject/Undo toggle. | Plan |
| Schedule-reset mechanism | New `after update` DB trigger | Atomic and un-skippable, symmetric with F-01's existing `after insert` trigger. | Plan |
| No-op edit | Reset only if content changed | An accidental re-save shouldn't wipe real study progress; enforced via the trigger's `WHEN` clause. | Plan |
| UI update timing | Pessimistic (wait for server) | Simpler state management, no rollback logic needed for a low-risk, off-critical-path slice. | Plan |
| Failure feedback | Inline error per card | Matches `CandidateCard`'s per-card feedback style; the user sees exactly which card failed. | Plan |

## Scope

**In scope:** edit a saved card's front/back (with schedule reset), delete a saved card (with confirmation), inline UI for both, two new API routes, one new DB trigger.

**Out of scope:** manual flashcard creation, search/filter, bulk edit/delete, an expanded "view full card" screen, post-delete undo, any change to the study session UI (S-04), any modal/dialog dependency.

## Architecture / Approach

`flashcards.astro` does the initial SSR fetch (now including `back`) and hands the data to a new `FlashcardList` React island, which owns list state, the single-active-row rule, and calls a new `PATCH`/`DELETE /api/flashcards/[id]` route pair. A new DB trigger (symmetric with F-01's insert trigger) resets the matching `review_schedules` row whenever `front`/`back` actually changes — enforced in SQL via a `WHEN` clause, not application code.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reset trigger + edit/delete API | DB trigger, `PATCH`/`DELETE /api/flashcards/[id]`, curl-testable | Missing the RLS-empty-array 404 case (see plan's Critical Implementation Details) |
| 2. Flashcard list UI | Inline edit + delete-confirm wired to Phase 1's routes | Empty state must live in the island, not Astro, or last-card delete won't update correctly |

**Prerequisites:** F-01 and S-02 both done (already true). **Estimated effort:** not tracked per this project's roadmap conventions — see `/10x-roadmap`'s no-estimates rule.

## Open Risks & Assumptions

- The RLS-driven 404 (empty result array, no error) is a real gotcha for whoever implements the routes — flagged explicitly in the plan so it isn't missed.
- No modal/dialog dependency was added; if a future slice needs a real overlay, that decision should be revisited then, not retrofitted from these inline patterns.

## Success Criteria (Summary)

- Editing a card updates it in place and resets its schedule only when content actually changed.
- Deleting a card requires an explicit confirm step and removes it (and its schedule) without a page reload.
- Unauthenticated or cross-user access to the new routes is rejected (401/404).
