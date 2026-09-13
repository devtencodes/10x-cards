# Spaced Repetition Study Session Implementation Plan

## Overview

Implement S-04: let a signed-in user start a study session at `/study` that surfaces flashcards due per their review schedule, reveal each card's answer, rate their recall as "remembered" or "forgot", and have the next review rescheduled accordingly (FR-010, FR-011).

## Current State Analysis

- `review_schedules` (shipped by F-01, archived) is deliberately minimal: `state` (`'new' | 'learning' | 'review'`, default `'new'`), `due_at` (default `now()`), `interval_days` (default `0`), `last_reviewed_at` (nullable). The F-01 plan states explicitly: *"S-04 picks and wires the algorithm... this migration only needs to supply columns any binary-rating spaced-repetition scheme can read and write."* No scheduling library (e.g. `ts-fsrs`, `supermemo`) is installed, and none is needed — the schema has no `stability`/`difficulty`/`reps` columns a full FSRS/SM-2 model would require.
- No study/rating API route exists yet. The three existing flashcard routes (`generate.ts`, `save.ts`, `[id].ts`) all self-check `context.locals.user` at the top of the handler rather than relying on `PROTECTED_ROUTES`, and all obtain the request-scoped client via `createClient(context.request.headers, context.cookies)`.
- `src/pages/api/flashcards/[id].ts` validates its `:id` path param against a UUID regex before using it in a Supabase call (added during S-03's implementation review) — the pattern to reuse for the new rating route's `:id` param.
- This codebase has no dedicated "list" GET API route anywhere — `flashcards.astro` SSR-fetches the flashcard list directly in its frontmatter and passes it as a prop to a `client:load` React island. There is no `/api/flashcards` GET route. The study page follows the same convention: `study.astro` SSR-fetches the due batch directly; no `GET /api/study` route is needed.
- `src/middleware.ts` protects routes via a `PROTECTED_ROUTES` array (`/dashboard`, `/generate`, `/flashcards`) checked by path prefix — `/study` needs to join this list.
- `src/pages/dashboard.astro` has plain anchor-link navigation to `/generate` and `/flashcards` plus a sign-out form — a `/study` link needs to join it.
- `CandidateCard.tsx` and `FlashcardListItem.tsx` (S-02/S-03) establish the visual/interaction conventions this plan reuses: Tailwind glass-card styling, lucide-react icons, `isPending`-disabled buttons with an inline spinner, `void handler()`-wrapped async `onClick`s.

## Desired End State

Signed-in users can visit `/study` and see the front of one due flashcard at a time. Revealing the back shows the answer; rating "Remembered" or "Forgot" persists the outcome, reschedules that card per the state-transition table below, and advances to the next card in the session. A card rated "Forgot" reappears later in the *same* session (requeued to the end of the local queue) rather than waiting until the next day. When the queue is empty — whether because nothing was due at page load or because the session was just completed — an explanatory "all done" message is shown instead of a blank screen. Leaving and re-visiting `/study` simply re-runs the due-cards query fresh; no session state is persisted server-side.

**Verification**: `npx astro check && npm run build && npm run lint` all pass; a full manual walkthrough (study a `new` card to graduation, force a lapse from `review` back to `learning`, verify interval growth across repeated correct ratings, verify same-session requeue on "forgot", verify the empty-state at both session start and session end) succeeds; unauthenticated/cross-user access to the new API route is rejected.

### Key Discoveries:

- `review_schedules`' three-state shape (`new` → `learning` → `review`) plus a single `interval_days` integer is exactly the minimal state a simplified Anki-style scheduler needs — no schema change required for this plan.
- Because `due_at` is a precise `timestamptz` while `interval_days` is only used to *compute* the next `due_at`, an immediate same-session repeat is just `due_at = now()` — it doesn't require any special-casing outside the normal update.
- No new migration is needed. This plan is the first S-04/S-03/S-02-family change where Phase 1 is API-only.

## What We're NOT Doing

- No new DB migration — F-01's `review_schedules` schema is already sufficient.
- No third-party scheduling library (`ts-fsrs`, `supermemo`, etc.) — the simplified Anki-style state machine is implemented directly against the existing columns, matching the PRD's "default configuration, no custom tuning" scope note.
- No configurable/tunable scheduling parameters (the ×2.5 growth factor and the single learning step are fixed constants, not user-facing settings).
- No end-of-session summary statistics (e.g. "8 remembered, 2 forgot") — FR-010 only requires an empty-state message; a tally is easy to add later but not required now.
- No persisted session entity or cross-visit resumability — `/study` is stateless; each visit re-runs the due-cards query.
- No capped session size — a session includes every currently-due card, unbounded.
- No separate `StudyCard` sub-component — unlike `FlashcardList`/`FlashcardListItem`'s persistent multi-row list, only one card is ever visible at a time in a study session, so splitting display from session-state management doesn't earn its keep here; both live in `StudySession.tsx`.
- Any change to flashcard browse/edit/delete (S-03's job) — this plan only reads `flashcards.front`/`back` and reads/writes `review_schedules`.

## Implementation Approach

Two phases, backend-before-frontend, matching S-02/S-03's precedent: (1) the rating API route implementing the full state-transition table, curl-testable in isolation against a running local Supabase instance; (2) the study page and session UI, wired to Phase 1's route. Unlike S-03, Phase 1 needs no migration — the schema is already complete.

## Critical Implementation Details

**`last_reviewed_at` is set on every rating, including a lapse.** It's tempting to only stamp `last_reviewed_at` on a successful "remembered" rating, but a "forgot" rating is still a review attempt — the card was shown and the user recalled (or didn't). Set `last_reviewed_at = now()` unconditionally in the update, for every state-transition row in the table below.

**Same-session requeue is a client-side concern, not a server one.** The server's only job on a "forgot" rating is to set `due_at = now()` (and whatever state/interval the table specifies) — it has no notion of "this session's queue." The requeue-to-end-of-queue behavior is entirely local `StudySession` state: append the rated card back onto the in-memory queue array rather than removing it. If the user navigates away mid-session, that in-memory requeue is simply lost — harmless, because the card's `due_at` is already `now()` in the database, so the next fresh visit's SSR query picks it right back up at the front.

## Phase 1: Study rating API route

### Overview

Add the one new endpoint the study UI (Phase 2) calls to persist a recall rating and reschedule the card — testable directly via `curl` and `psql`/Studio against a running local Supabase instance, with no UI dependency, no new migration.

### Changes Required:

#### 1. Rating API route

**File**: `src/pages/api/study/[id].ts` (new)

**Intent**: The JSON endpoint the study session UI (Phase 2) calls to rate one card's recall and advance its review schedule.

**Contract**: Exports a `POST` handler (Astro's dynamic-route convention, `context.params.id`, `id` = flashcard id). Returns `401 { error: "Unauthorized" }` if `context.locals.user` is absent, and obtains the request-scoped client via `createClient(context.request.headers, context.cookies)` (same call as the other flashcard routes). Validates `id` against a UUID regex (same pattern as `src/pages/api/flashcards/[id].ts`) before use, returning `400 { error: "Invalid flashcard id" }` on a malformed id. Reads `{ rating: "remembered" | "forgot" }` from the JSON body; any other value or a malformed body returns `400 { error: <message> }`.

Reads the current `state, interval_days` from `review_schedules` scoped by `flashcard_id = id` (RLS scopes ownership — no explicit `user_id` filter needed, same reasoning as `[id].ts`). An empty result means the flashcard doesn't exist or isn't owned by this user — `404 { error: "Flashcard not found" }` (same RLS-empty-array 404 semantics established in S-03).

Computes the next `{ state, interval_days, due_at }` from the current `state` and the submitted `rating` per this table (all six rows are exhaustive — `state` only ever takes these three values):

| Current state | Rating | Next state | Next `interval_days` | Next `due_at` |
|---|---|---|---|---|
| `new` | `remembered` | `learning` | `1` | `now() + 1 day` |
| `new` | `forgot` | `new` | `0` | `now()` |
| `learning` | `remembered` | `review` | `1` | `now() + 1 day` |
| `learning` | `forgot` | `learning` | `0` | `now()` |
| `review` | `remembered` | `review` | `max(1, round(interval_days × 2.5))` | `now() + <new interval_days> days` |
| `review` | `forgot` | `learning` | `0` | `now()` |

`round()` rounds half away from zero (e.g. `round(2.5) = 3`), matching Postgres's/JavaScript's default rounding — this only matters at the single-digit boundary since the `max(1, …)` floor absorbs any smaller edge case. `last_reviewed_at = now()` is set unconditionally on every row (see Critical Implementation Details). All of `now()`, `+ 1 day`, and `+ <new interval_days> days` in the table above are computed in the route handler as a JS `Date` and passed as an ISO string in the `.update()` payload — not a SQL expression. A plain Supabase `.update()` call sends a JSON payload, so there's no way to pass raw SQL arithmetic through it; this is why the read-then-compute-then-write shape (rather than a Postgres function/RPC) was chosen for this phase in the first place.

Runs the update scoped by `flashcard_id = id`, `.select("state, interval_days, due_at, last_reviewed_at")`. DB error → `500 { error: "Rating failed. Please try again." }`. Success → `200` with the persisted schedule fields.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a valid session and a `new`-state owned flashcard, `curl -X POST` with `{"rating": "remembered"}` returns `200`, and the schedule (checked via Studio/psql) shows `state = 'learning'`, `interval_days = 1`, `due_at` ≈ now + 1 day, `last_reviewed_at` ≈ now.
- POSTing `{"rating": "forgot"}` against a `new`-state card leaves `state = 'new'`, `interval_days = 0`, `due_at` ≈ now, and still stamps `last_reviewed_at`.
- Manually advance a card to `state = 'learning'` in Studio, then POST `remembered` — confirms graduation to `state = 'review'`, `interval_days = 1`.
- Manually set a `review`-state card's `interval_days` to `10` in Studio, then POST `remembered` twice in a row — confirms `interval_days` grows by ×2.5 each time (`10 → 25 → 63`) and `due_at` moves out accordingly each time.
- Manually set a `review`-state card's `interval_days` to any positive value, then POST `forgot` — confirms a full lapse to `state = 'learning'`, `interval_days = 0`, `due_at` ≈ now.
- POST with a malformed `rating` value (e.g. `"maybe"`) or a malformed `id` returns `400` and touches nothing.
- POST without a session returns `401`; POST against another user's flashcard id (or a nonexistent one) returns `404`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Study session UI

### Overview

Add `/study`: an Astro page that SSR-fetches the current due batch and hands it to a React island that runs the reveal → rate → advance loop, requeuing "forgot" cards within the same session, wired to Phase 1's rating route.

### Changes Required:

#### 1. Study page

**File**: `src/pages/study.astro` (new)

**Intent**: SSR-fetch the due-cards batch (matching this codebase's established eager-SSR-fetch convention — see Current State Analysis — rather than adding a `GET` API route) and hand control of the session to the React island.

**Contract**: Queries `review_schedules` filtered to `due_at <= now()`, ordered by `due_at` ascending (oldest-overdue first), with an embedded `flashcards(id, front, back)` relation via the existing `flashcard_id` foreign key — RLS scopes this to the signed-in user automatically, same as every other query in this codebase. Renders `<StudySession client:load cards={dueCards} />` unconditionally (even when the batch is empty), following the same "empty-state lives in the island, not the frontmatter" rule S-03 established, since a *session-completed* empty state must also render without a page reload.

#### 2. Study session component

**File**: `src/components/study/StudySession.tsx` (new)

**Intent**: Owns the live session queue, the reveal/rate flow for the current card, the client-side requeue of "forgot" cards, and the calls to Phase 1's API.

**Contract**: Props: `cards: { id: string; front: string; back: string }[]`. Local state: a mutable queue initialized from `cards`; `revealed: boolean` for whether the current card's back is shown; a pending flag for the in-flight rating request; an error slot for a failed rating call. When the queue is non-empty, renders the front card (front text; back text only once `revealed`), a "Show answer" control before reveal, and "Remembered"/"Forgot" controls after reveal (each disabled with a spinner while a rating request is pending, matching `FlashcardListItem`'s established pending-button pattern). A small "`<queue length>` remaining" indicator is shown during the session. On a rating response, dequeues the current card on success (re-appending it to the end of the queue first if the rating was "forgot", per Critical Implementation Details) and resets `revealed` to `false` for the next card; on failure, shows an inline error next to the rating controls without changing the queue. When the queue is empty (either at mount or after the last card is rated), renders an "All done — nothing left to study" message with a link back to `/dashboard`.

#### 3. Protected routes

**File**: `src/middleware.ts`

**Intent**: `/study` requires a signed-in session, same as every other flashcard-related page.

**Contract**: Add `"/study"` to the `PROTECTED_ROUTES` array.

#### 4. Dashboard navigation

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way to reach the new page.

**Contract**: Add a "Study" anchor link to `/study`, styled identically to the existing "Generate flashcards"/"My flashcards" links.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- With at least one due card, `/study` shows its front and a "Show answer" control; no back text is visible before reveal.
- Revealing the answer shows the back and replaces "Show answer" with "Remembered"/"Forgot" controls.
- Rating "Remembered" advances to the next due card (or the empty state if it was the last) with no full page reload, and the underlying schedule updates per Phase 1's manual checks.
- Rating "Forgot" advances to the next due card immediately, and the forgotten card reappears again later in the *same* session before the session ends.
- Completing the session (queue reaches zero) shows the "All done" message.
- Visiting `/study` with zero cards currently due shows the same "All done" message immediately, with no reveal/rate controls ever appearing.
- The "`<queue length>` remaining" indicator decrements as cards are rated and increments back when a "forgot" card is requeued.
- Forcing a rating request to fail (e.g. temporarily block the network in DevTools) shows an inline error next to the rating controls, and the current card stays in place — no card is lost or skipped.
- The dashboard shows a working "Study" link to `/study`.
- Visiting `/study` while signed out redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None — no automated test framework is introduced in this plan (matches S-02/S-03's precedent and current project maturity).

### Integration Tests:

- None automated. Phase 1's manual `curl`/Studio checks and Phase 2's full-browser walkthrough are the closest equivalent, following the same pattern S-02/S-03 used.

### Manual Testing Steps:

1. Run through Phase 1's manual criteria against a running local Supabase instance to confirm every row of the state-transition table.
2. Full happy path: sign in → seed/advance a few cards to different states in Studio → `/study` → work through the session verifying reveal/rate/advance, the same-session "forgot" requeue, and interval growth on repeated "remembered" ratings against a `review`-state card.
3. Verify both empty-state triggers (zero due at load; queue drained during the session) and the unauthenticated/cross-user rejection on the new API route.
4. Run `npx astro check && npm run build && npm run lint` to confirm everything compiles and lints cleanly.

## Performance Considerations

Rating is a single-row read-then-update against an already-indexed table (`review_schedules(user_id, due_at)`), and the due-batch query is a single indexed range scan — comfortably within the NFR's "non-AI actions respond within ~1 second" at this project's small target scale. No new performance-sensitive paths are introduced.

## Migration Notes

No migration in this plan — F-01's `review_schedules` schema (shipped 2026-09-07) is unchanged and sufficient for the algorithm this plan implements.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-04: spaced-repetition-study-session)
- PRD: `context/foundation/prd.md` (FR-010, FR-011)
- Schema this plan reads/writes: `context/archive/2026-09-07-flashcard-data-foundation/plan.md` (F-01, archived)
- Prior UI/API patterns: `src/components/flashcards/FlashcardListItem.tsx`, `src/pages/api/flashcards/[id].ts` (S-03, archived)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Study rating API route

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 `new` + remembered → `learning`/interval 1/due ≈ now+1d, `last_reviewed_at` stamped
- [x] 1.5 `new` + forgot → stays `new`/interval 0/due ≈ now, `last_reviewed_at` stamped
- [x] 1.6 `learning` + remembered → graduates to `review`/interval 1
- [x] 1.7 `review` + remembered twice → interval grows ×2.5 each time (10→25→63)
- [x] 1.8 `review` + forgot → full lapse to `learning`/interval 0/due ≈ now
- [x] 1.9 Malformed rating or malformed id returns 400 and touches nothing
- [x] 1.10 Unauthenticated POST returns 401; POST on another user's/nonexistent card returns 404

### Phase 2: Study session UI

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Build passes: `npm run build`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Due card shows front + "Show answer"; back hidden before reveal
- [ ] 2.5 Reveal shows back + Remembered/Forgot controls
- [ ] 2.6 Remembered advances the session and updates the schedule per Phase 1
- [ ] 2.7 Forgot advances immediately and the card reappears later in the same session
- [ ] 2.8 Session completion shows the "All done" message
- [ ] 2.9 Zero cards due at load shows "All done" immediately, no reveal/rate controls
- [ ] 2.10 "Remaining" indicator decrements/increments correctly
- [ ] 2.11 A forced rating failure shows an inline error and doesn't lose/skip the card
- [ ] 2.12 Dashboard "Study" link works
- [ ] 2.13 Signed-out visit to `/study` redirects to `/auth/signin`
