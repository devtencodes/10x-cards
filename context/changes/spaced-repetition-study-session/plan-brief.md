# Spaced Repetition Study Session — Plan Brief

> Full plan: `context/changes/spaced-repetition-study-session/plan.md`

## What & Why

Let a signed-in user study their due flashcards: start a session at `/study`, see each card's front, reveal the answer, and rate recall as "remembered" or "forgot." The rating reschedules that card's next review automatically. This is FR-010/FR-011 — the payoff step of the product's core loop (paste text → generate → save → **study**).

## Starting Point

F-01 (archived) already shipped `review_schedules` with exactly the columns a binary-rating scheduler needs (`state`, `due_at`, `interval_days`, `last_reviewed_at`) but deliberately left the algorithm unpicked — that choice was explicitly deferred to this plan. No study UI, no rating API, and no scheduling library exist yet.

## Desired End State

A user visits `/study`, works through their due cards one at a time (reveal → rate → next), sees forgotten cards come back later in the same sitting, and gets a clear "all done" message when nothing's left — whether that's because they finished the batch or nothing was due to begin with.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Scheduling algorithm | Simplified Anki-style state machine (`new`→`learning`→`review`) | Matches the schema F-01 already shipped with zero changes needed | Plan |
| Lapse handling | Full reset to `learning` on any "forgot" in `review` | Matches real Anki's default; simplest to reason about | Plan |
| Same-session retry | Forgotten cards requeue immediately (`due_at = now()`) | Reinforces the item while it's fresh, standard SRS-app behavior | Plan |
| Session size | All due cards, uncapped | Simplest correct behavior at this project's small data scale | Plan |
| Interval growth | Fixed ×2.5 multiplier on `interval_days` | Needs no new state — the column already tracks the sequence position | Plan |
| Data source | SSR-fetch in `study.astro`, no new GET API route | Matches this codebase's existing convention (no list API routes anywhere) | Plan |
| Session end | Simple "all done" message, no summary stats | FR-010 only requires an empty-state; a tally is unrequested scope | Plan |
| Resumability | Stateless — `/study` always re-fetches fresh | No PRD requirement drives persisting session state | Plan |

## Scope

**In scope:**
- `POST /api/study/[id]` rating endpoint implementing the full state-transition table
- `/study` page + `StudySession.tsx` reveal/rate/advance UI
- Client-side same-session requeue of "forgot" cards
- Empty-state at both session start (nothing due) and session end (queue drained)
- `/study` added to protected routes; dashboard nav link

**Out of scope:**
- Any third-party scheduling library (ts-fsrs, supermemo)
- Configurable scheduling parameters
- End-of-session summary stats
- Persisted/resumable session state
- Capped session size
- Any change to flashcard browse/edit/delete (S-03's territory)

## Architecture / Approach

Two phases, backend-then-frontend (matching S-02/S-03's precedent): Phase 1 builds and curl-tests the rating endpoint against the existing schema — no migration needed, since F-01 already shipped everything the algorithm reads and writes. Phase 2 builds the SSR page + React island that preloads the due batch, runs the reveal/rate loop, and manages the local queue (including forgot-card requeue) entirely client-side, calling back into Phase 1's endpoint per rating.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Rating API | `POST /api/study/[id]` implementing the 6-row state-transition table | Getting the table's edge cases (rounding, `last_reviewed_at` on lapse) right — mitigated by writing it out explicitly in the plan |
| 2. Study session UI | `/study` page + `StudySession.tsx`, full reveal/rate/advance flow | Client-side queue/requeue logic getting the "forgot reappears later, not immediately" ordering right |

**Prerequisites:** S-02 and F-01 (both done) — needs real saved cards with schedules to study.
**Estimated effort:** ~1-2 sessions across 2 phases — comparable in size to S-03, smaller than S-02.

## Open Risks & Assumptions

- Assumes single-user, low-concurrency usage — no optimistic-locking/idempotency guard against a rapid double-click double-advancing a rating. Acceptable at this project's scale; the UI disables buttons while a rating is in flight as a soft guard.
- Assumes "all done" with no stats is acceptable UX; easy to add a summary later if the user wants one.

## Success Criteria (Summary)

- A due card's front shows first; revealing shows the back; rating persists and reschedules correctly per the state table.
- A "forgot" card comes back later in the same session; a "remembered" card graduates/grows its interval correctly.
- The empty-state appears whenever there's nothing left to study, without ever requiring a full page reload.
