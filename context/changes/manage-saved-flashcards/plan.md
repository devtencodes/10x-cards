# Manage Saved Flashcards Implementation Plan

## Overview

Implement S-03: let a signed-in user view (already shipped by S-02), edit, and delete their saved flashcards from `/flashcards`. Editing a card's content resets its review schedule to "new" (FR-008); deleting requires a confirmation step (FR-009).

## Current State Analysis

- `src/pages/flashcards.astro` (from S-02) is a pure Astro SSR page: it SSR-fetches `id, front, created_at` and renders a plain `<ul>` — no React island, no client-side interactivity, no `back` field fetched.
- `flashcards`/`review_schedules` tables and their RLS policies exist (F-01, archived). `flashcards` has an `after insert` trigger (`create_review_schedule_for_flashcard`) that auto-creates the matching `review_schedules` row, but there is **no `after update` trigger** — nothing today reacts to a flashcard's content changing.
- `review_schedules` columns: `state` (`'new' | 'learning' | 'review'`, default `'new'`), `due_at` (default `now()`), `interval_days` (default `0`), `last_reviewed_at` (nullable). "Reset to new" means re-applying exactly these defaults.
- `flashcards.front`/`back` are CHECK-constrained to 1–2000 characters (`char_length(...) between 1 and 2000`) — the same bounds `save.ts` already validates against.
- No API route exists yet for mutating an individual flashcard. The two existing routes (`generate.ts`, `save.ts`) both self-check `context.locals.user` at the top of the handler rather than relying on `PROTECTED_ROUTES`, and both obtain the request-scoped client via `createClient(context.request.headers, context.cookies)`.
- No dialog/modal primitive exists in the codebase — only `@radix-ui/react-slot` (used by the `Button` component's `asChild`). `CandidateCard.tsx` (S-02) already proved two relevant interaction patterns: always-editable textareas, and an Accept/Reject/Undo toggle.
- `review_schedules.flashcard_id` has `on delete cascade`, so deleting a `flashcards` row automatically removes its schedule row — no extra cleanup code needed.

## Desired End State

On `/flashcards`, each saved card shows Edit and Delete controls alongside its existing front-text/date display. Clicking Edit turns that card's front/back into editable textareas in place; saving updates the card without a full page reload, and — only if the content actually changed — resets its review schedule to `new`. Clicking Delete turns into an inline "Confirm delete? Yes/No"; confirming removes the card from the list (and its schedule row, via cascade) without a full page reload, showing the existing empty-state message if it was the last card. Only one card can be in edit or delete-confirm mode at a time. A failed edit or delete shows an inline error next to that card's controls, leaving the rest of the list untouched.

**Verification**: `npx astro check && npm run build && npm run lint` all pass; a full manual walkthrough (edit a card's content and confirm the save + review-schedule reset, edit a card with unchanged content and confirm the schedule is untouched, delete a card down to the empty state) succeeds; unauthenticated/cross-user access to the new API routes is rejected; `npx supabase db reset` applies the new migration cleanly.

### Key Discoveries:

- `review_schedules` has no `after update` trigger today (only `after insert`) — FR-008's reset behavior needs new DB logic, not something that already fires.
- Supabase JS's `.update(...)/.delete(...)` chained with `.select()` returns the affected rows; under RLS, a non-owned or nonexistent target silently returns an **empty array**, not an error — that's how 404 must be detected, since a bare `error` check would miss it.
- No dialog/modal primitive exists in this codebase — inline edit-in-place and an inline confirm-toggle reuse patterns already proven in `CandidateCard.tsx` (S-02) instead of adding a new dependency.
- `flashcards.astro` needs to fetch `back` (not just `front`) up front, since editing reveals it — the target scale (`target_scale.users: small`, `data_volume: small`) makes one eager SSR fetch simpler and cheaper than a lazy per-edit round trip.

## What We're NOT Doing

- Manual flashcard creation (PRD non-goal, deferred to v1.1).
- Search/filter on the flashcard list (PRD non-goal, deferred to v1.1).
- Bulk edit or bulk delete of multiple cards at once — FR-008/FR-009 describe single-card operations only.
- A dedicated "view full card" / expanded read-only display — the collapsed view stays front+date as S-02 built it; `back` is only shown when a card is being edited.
- Undo after a confirmed delete — FR-009 requires a confirmation step *before* deletion, not a recovery path *after* it; once confirmed, deletion is final.
- Any change to the study/spaced-repetition session UI (S-04's job) — this plan only triggers the schedule's reset-to-new side effect; it never reads or displays `due_at`, `state`, etc.
- A modal/dialog component or new UI dependency — inline patterns were chosen specifically to avoid this (see Critical Implementation Details).

## Implementation Approach

Two phases, backend-before-frontend, matching S-02's precedent: (1) the DB trigger and the two mutation API routes, curl-testable in isolation; (2) the UI, converting the existing SSR-only list into a React island wired to Phase 1's routes. This lets Phase 1 be verified against the real Supabase schema before any UI code depends on its contract.

## Critical Implementation Details

**RLS-aware 404 semantics**: Supabase's `.update(...)`/`.delete(...)` combined with `.select()` returns the affected rows as an array. Under RLS, a request targeting a flashcard that doesn't exist *or* isn't owned by the caller silently returns an **empty array with no error** — both routes must treat a zero-length result as `404`, not assume success just because `error` is falsy. This also means a non-owner gets the same `404` as a nonexistent id, which is the correct behavior (no existence leak), not an oversight.

**Trigger fires only on real content change**: the new `after update` trigger's `WHEN (new.front IS DISTINCT FROM old.front OR new.back IS DISTINCT FROM old.back)` clause means an edit submitted with unchanged content is a normal, successful `UPDATE` that simply doesn't reset the schedule — the no-op-edit edge case is enforced by the database, not by application-level diffing before the call.

**Empty-state lives in the React island, not the Astro frontmatter**: deleting the last remaining card must transition to the empty-state message without a full page reload, so `flashcards.astro` always renders `<FlashcardList client:load cards={cards} />` (even when `cards` is empty) and the empty-state branch is decided inside the React component based on its own live state — not by an `.astro` conditional that only sees the page's initial SSR snapshot.

**Single active row**: edit/delete-confirm mode is state lifted to `FlashcardList` (`activeId`, `activeMode`) rather than owned independently by each `FlashcardListItem` — this is what enforces "only one card in edit or delete-confirm mode at a time," avoiding the multi-row-editing clutter risk of fully independent per-row state.

## Phase 1: Review-schedule reset trigger + edit/delete API routes

### Overview

Add the DB-level consequence of editing a flashcard's content, and the two JSON endpoints the UI (Phase 2) will call — both testable directly via `curl` and `psql`/Studio against a running local Supabase instance, with no UI dependency.

### Changes Required:

#### 1. Review-schedule reset migration

**File**: `supabase/migrations/<timestamp>_manage_saved_flashcards.sql` (new — create via `supabase migration new manage_saved_flashcards`, then edit)

**Intent**: Give `flashcards` an `after update` counterpart to F-01's existing `after insert` trigger, so editing a card's content always resets its review schedule to "new" — atomically, and without every future write path having to remember a second update.

**Contract**: A new function (SECURITY INVOKER, `set search_path = ''`, matching `create_review_schedule_for_flashcard`'s style) that sets `review_schedules.state = 'new'`, `due_at = now()`, `interval_days = 0`, `last_reviewed_at = null` for the row matching `flashcard_id = new.id`. A new trigger `after update on public.flashcards for each row when (new.front is distinct from old.front or new.back is distinct from old.back) execute function <the new function>`. The `WHEN` clause is what makes the reset conditional on actual content change (see Critical Implementation Details) — do not replicate that check inside the function body as well.

#### 2. Rollback script

**File**: `supabase/rollbacks/<timestamp>_manage_saved_flashcards_down.sql` (new, same timestamp as the migration; plain SQL, NOT under `supabase/migrations/`)

**Intent**: Give this migration a tested revert path, per this project's established convention (F-01 shipped one for the same reason).

**Contract**: `drop trigger if exists <trigger name> on public.flashcards;` then `drop function if exists <function name>();` — reverse-dependency order, mirroring F-01's rollback script structure.

#### 3. Edit/delete API route

**File**: `src/pages/api/flashcards/[id].ts` (new)

**Intent**: The JSON endpoints the flashcard list UI (Phase 2) calls to edit or delete one card.

**Contract**: Exports `PATCH` and `DELETE` handlers (Astro's dynamic-route convention, `context.params.id`). Both return `401 { error: "Unauthorized" }` if `context.locals.user` is absent, and both obtain the request-scoped client via `createClient(context.request.headers, context.cookies)` (same call as `save.ts`).

`PATCH`: reads `{ front: string; back: string }` from the JSON body; returns `400 { error: <message> }` if either field is missing or its length is outside 1–2000 characters (matching the DB's own CHECK constraints, same bounds `save.ts` validates). Runs `supabase.from("flashcards").update({ front, back }).eq("id", id).select("front, back, updated_at")`. If the returned rows array is empty, returns `404 { error: "Flashcard not found" }` (covers both "doesn't exist" and "not owned by this user" — see Critical Implementation Details). On a DB-level error, returns a generic `500 { error: "Update failed. Please try again." }`. On success, returns `200` with the persisted `{ front, back, updated_at }`.

`DELETE`: runs `supabase.from("flashcards").delete().eq("id", id).select("id")`. Empty result array → `404 { error: "Flashcard not found" }`. DB error → generic `500 { error: "Delete failed. Please try again." }`. Success → `200 { deleted: true }`. No explicit cleanup of the matching `review_schedules` row is needed — the FK's `on delete cascade` handles it.

### Success Criteria:

#### Automated Verification:

- Migration file exists: `ls supabase/migrations/*manage_saved_flashcards.sql`
- Local reset applies cleanly: `npx supabase db reset`
- Rollback script exists: `test -s supabase/rollbacks/*manage_saved_flashcards_down.sql`
- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a valid session and an owned flashcard, `curl -X PATCH` with new well-formed `front`/`back` returns `200` with the persisted values, and the matching `review_schedules` row (checked via Studio/psql) shows `state = 'new'`, `due_at` reset to ~now, `interval_days = 0`, `last_reviewed_at = null`.
- First manually advance a card's schedule in Studio (e.g. `state = 'review'`, `interval_days = 10`), then PATCH that same card with **identical** `front`/`back` — the schedule row is left untouched (still `review`/`10`), confirming the no-op-edit case does not reset it.
- PATCH with `front`/`back` empty or over 2000 characters returns `400` and does not touch the row.
- PATCH without a session returns `401`; PATCH on another user's flashcard id returns `404`.
- With a valid session and an owned flashcard, `curl -X DELETE` returns `200`, the `flashcards` row is gone, and its `review_schedules` row is gone too (cascade, checked via Studio/psql).
- DELETE without a session returns `401`; DELETE on a nonexistent or another user's flashcard id returns `404`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Flashcard list UI — inline edit and delete

### Overview

Convert `/flashcards`'s SSR-only list into a React island with inline edit-in-place and an inline delete-confirm toggle, wired to Phase 1's routes.

### Changes Required:

#### 1. Page shell

**File**: `src/pages/flashcards.astro`

**Intent**: Fetch the extra field the UI now needs, and hand control of both the list and the empty state to the new React island (see Critical Implementation Details — the empty state must react to client-side deletes, not just the page's initial SSR snapshot).

**Contract**: Extend the select to `"id, front, back, created_at"`. Replace the existing `{cards.length === 0 ? ... : <ul>...</ul>}` block with a single `<FlashcardList client:load cards={cards} />` — the empty-state branch moves into the component.

#### 2. Flashcard list component

**File**: `src/components/flashcards/FlashcardList.tsx` (new)

**Intent**: Owns the live list state, the single-active-row rule, and the fetch calls to Phase 1's API.

**Contract**: Props: `cards: { id: string; front: string; back: string; created_at: string }[]`. Local state: a mutable copy of `cards`; `activeId: string | null`; `activeMode: "edit" | "delete-confirm" | null`; a per-id error map; a per-id pending flag. Renders the existing empty-state message (unchanged copy/link from the current `.astro` file) when the local list is empty, else maps each card to `<FlashcardListItem>` passing its data, whether it's the active row (and in which mode), its pending/error state, and callbacks: `onEdit(id)` (sets `activeId`/`activeMode`, clearing any other active row), `onCancelEdit()`, `onSaveEdit(id, front, back)` (PATCH; on success, splices the returned `{front, back}` into local state and clears active mode; on failure, sets that id's error), `onDeleteClick(id)` (sets `activeMode: "delete-confirm"` for that id), `onCancelDelete()`, `onConfirmDelete(id)` (DELETE; on success, removes the card from local state and clears active mode; on failure, sets that id's error).

#### 3. Flashcard list item

**File**: `src/components/flashcards/FlashcardListItem.tsx` (new)

**Intent**: One card's three visual modes — view, edit, delete-confirm — and its inline error display.

**Contract**: Props: the card's `id`/`front`/`back`/`created_at`, `mode: "view" | "edit" | "delete-confirm"`, `isPending: boolean`, `error?: string`, and the callbacks listed above. `id` is required so the component can pass itself back into each callback (`onSaveEdit(id, ...)`, `onConfirmDelete(id)`, etc.). View mode: truncated `front` + formatted date (reusing the existing truncate/date-format logic from the current `.astro` file) plus Edit and Delete icon buttons. Edit mode: two textareas prefilled with the card's current `front`/`back`, Save and Cancel buttons (Save disabled while `isPending`, showing a spinner). Delete-confirm mode: the Delete button is replaced by an inline "Confirm delete? Yes/No" pair (Yes disabled while `isPending`, showing a spinner). Any mode: render `error` inline near that card's controls when present.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Each saved card on `/flashcards` shows Edit and Delete controls.
- Clicking Edit reveals editable front/back textareas prefilled with the card's current content; clicking Edit on a different card closes the first (only one card active at a time).
- Editing content and clicking Save updates the card in place — no full page reload — and the change is reflected immediately.
- Editing with content left unchanged and clicking Save still succeeds with no visible error (schedule untouched per Phase 1's manual check).
- Clicking Delete turns into an inline "Confirm delete? Yes/No"; clicking No reverts to the normal Delete button with nothing changed.
- Clicking Yes removes the card from the list immediately (no full page reload); deleting the last remaining card shows the existing empty-state message in its place.
- Triggering a save or delete failure (e.g. temporarily point the fetch at a bad path, or stop the dev server mid-request) shows an inline error next to that card's controls only, leaving the rest of the list interactive.
- Visiting `/flashcards` while signed out still redirects to `/auth/signin` (pre-existing middleware behavior — confirm the refactor didn't disturb it).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None — no automated test framework is introduced in this plan (matches current project maturity; see S-02's precedent).

### Integration Tests:

- None automated. Phase 1's manual `curl`/Studio checks and Phase 2's full-browser walkthrough are the closest equivalent, following the same pattern S-02 and F-01 used.

### Manual Testing Steps:

1. Run the new migration locally (`npx supabase db reset`) and confirm the trigger fires correctly per Phase 1's manual criteria.
2. Full happy path: sign in → `/flashcards` → edit a card, confirm it updates and its schedule resets → edit a different card with unchanged content, confirm its schedule is untouched → delete a card, confirm it disappears → delete down to zero cards, confirm the empty state appears.
3. Verify the single-active-row rule, the inline error path for a forced failure, and the unauthenticated/cross-user rejections on both new API routes (see each phase's manual criteria).
4. Run `npx astro check && npm run build && npm run lint` to confirm everything compiles and lints cleanly.

## Performance Considerations

Edit/delete are plain single-row operations against an already-indexed table (`flashcards(user_id)`) — comfortably within the NFR's "non-AI actions respond within ~1 second." No new performance-sensitive paths are introduced.

## Migration Notes

One new migration adds a trigger + function; no existing data is affected (no application code has ever updated a `flashcards` row's `front`/`back` before this plan). Applying it to the live Supabase project remains the established manual, out-of-band step (`supabase link` then `supabase db push`, per F-01's precedent) — CI does not run migrations.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03: manage-saved-flashcards)
- PRD: `context/foundation/prd.md` (FR-007, FR-008, FR-009)
- Schema this plan extends: `context/archive/2026-09-07-flashcard-data-foundation/plan.md` (F-01, archived)
- Prior UI/API patterns: `src/components/flashcards/CandidateCard.tsx`, `src/pages/api/flashcards/save.ts` (S-02, archived)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Review-schedule reset trigger + edit/delete API routes

#### Automated

- [x] 1.1 Migration file exists: `ls supabase/migrations/*manage_saved_flashcards.sql` — 8603301
- [x] 1.2 Local reset applies cleanly: `npx supabase db reset` — 8603301
- [x] 1.3 Rollback script exists: `test -s supabase/rollbacks/*manage_saved_flashcards_down.sql` — 8603301
- [x] 1.4 Type checking passes: `npx astro check` — 8603301
- [x] 1.5 Build passes: `npm run build` — 8603301
- [x] 1.6 Linting passes: `npm run lint` — 8603301

#### Manual

- [x] 1.7 Valid PATCH with well-formed content returns 200 and resets the review schedule to new — 8603301
- [x] 1.8 PATCH with unchanged content leaves an already-advanced schedule untouched — 8603301
- [x] 1.9 PATCH with out-of-range content returns 400 and touches nothing — 8603301
- [x] 1.10 Unauthenticated PATCH returns 401; PATCH on another user's card returns 404 — 8603301
- [x] 1.11 Valid DELETE returns 200 and removes both the flashcard and its review schedule (cascade) — 8603301
- [x] 1.12 Unauthenticated DELETE returns 401; DELETE on a nonexistent/other-user card returns 404 — 8603301

### Phase 2: Flashcard list UI — inline edit and delete

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — c5c5293
- [x] 2.2 Build passes: `npm run build` — c5c5293
- [x] 2.3 Linting passes: `npm run lint` — c5c5293

#### Manual

- [x] 2.4 Edit/Delete controls appear on every card — c5c5293
- [x] 2.5 Edit reveals prefilled editable fields; only one card is active at a time — c5c5293
- [x] 2.6 Saving an edit updates the card in place without a full reload — c5c5293
- [x] 2.7 Saving an edit with unchanged content succeeds with no visible error — c5c5293
- [x] 2.8 Delete confirm toggle (Yes/No) works; No reverts with no changes — c5c5293
- [x] 2.9 Confirmed delete removes the card without a full reload; last-card delete shows the empty state — c5c5293
- [x] 2.10 A forced save/delete failure shows an inline error scoped to that card only — c5c5293
- [x] 2.11 Signed-out visit to `/flashcards` still redirects to `/auth/signin` — c5c5293
