---
project: "10xCards"
version: 1
status: draft
created: 2026-09-03
updated: 2026-09-13
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: ai-generated-study-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First AI-generated study loop** — Status: open

- **Intent:** Ship the v1 primary flow end to end — a user pastes source text, gets AI-generated flashcard candidates, reviews and saves them, manages their saved collection, and studies via spaced repetition. This is the entire scope PRD v1 describes; there is no further v1 tranche after this milestone.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.

## Vision recap

Manually authoring flashcards is the friction that keeps self-directed learners from sustaining spaced repetition — a proven learning method existing tools (Anki, SuperMemo, Quizlet) never solved because they invested in review-scheduling, not card authoring. 10xCards' bet is that LLMs are now reliable enough to extract quality question-answer pairs from a learner's own pasted text, closing that gap. v1 proves this with one flow: paste text → AI generates candidates → user reviews and saves what's worth keeping → user studies the result.

**Timeline note (recorded during roadmap framing, not yet reflected in `prd.md`):** the PRD's frontmatter states `hard_deadline: 2026-09-08`; the user corrected this during this roadmap session to **2026-09-10**. `prd.md` itself has not been updated — see `## Open Roadmap Questions`.

## North star

**S-02: User converts pasted text into AI-generated, reviewed, saved flashcards** — the PRD's own Success Criteria section names this exact flow as "the primary flow that proves v1 works," and it's what the primary success criterion (75% acceptance rate) measures. That's why it's the north star.

> "North star" here means: the smallest end-to-end slice that, if it works, proves the product's core idea — that AI can turn a learner's pasted text into flashcards worth keeping — placed as early as its Prerequisites allow, because everything else in this milestone only matters if this works.

## At a glance

| ID   | Change ID                        | Outcome (user can …)                                                              | Prerequisites          | PRD refs                          | Status   |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- | ---------------------------------- | -------- |
| F-01 | flashcard-data-foundation         | (foundation) flashcards + review-schedule tables exist in Supabase, RLS-scoped per user | —                        | FR-006, NFR (privacy), Access Control | done |
| S-01 | email-password-auth               | sign up with email + password and log in                                            | —                        | FR-001, FR-002                     | done     |
| S-02 | ai-generated-flashcards            | paste text, get AI-generated candidates, review (accept/edit/reject, bulk-accept), and save them | F-01, S-01, OpenRouter secret provisioned | US-01, FR-003, FR-004, FR-005, FR-006, FR-007 | done |
| S-03 | manage-saved-flashcards            | view, edit, and delete saved flashcards                                             | S-02, F-01               | FR-007, FR-008, FR-009             | in-progress |
| S-04 | spaced-repetition-study-session    | study due cards and rate recall, rescheduling the next review                       | S-02, F-01               | FR-010, FR-011                     | ready |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                        | Chain                       | Note                                                                 |
| ------ | ---------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| A      | Data foundation + AI core     | `F-01` → `S-02`              | The critical path — everything else depends on this landing first.   |
| B      | Flashcard lifecycle           | `S-03`                        | Joins Stream A at `S-02`; off the critical path per PRD's own scope note. |
| C      | Study loop                    | `S-04`                        | Joins Stream A at `S-02`; can run in parallel with Stream B.          |
| D      | Auth                           | `S-01`                        | Standalone; already implemented per baseline — no remaining work.    |

## Baseline

What's already in place in the codebase as of `2026-09-03` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 + React 19 + Tailwind wired; auth pages/forms exist (`src/pages/auth/*`, `src/components/auth/*`); no flashcard UI yet.
- **Backend / API:** partial — Astro API-route convention wired (`src/pages/api/*.ts`); only auth handlers exist (signin/signup/signout); no flashcard/generation/study endpoints.
- **Data:** absent — Supabase client wired (`src/lib/supabase.ts`) but no migrations, no domain schema (users/flashcards/review-schedule state), no seed data.
- **Auth:** present — Supabase Auth end-to-end: provider client, signup/signin/signout routes + forms, session middleware (`src/middleware.ts`) protecting `/dashboard`.
- **Deploy / infra:** partial — `wrangler.jsonc` + CI (lint/build only, no deploy step in-repo) + a real live deployment already executed (`https://10x-cards.devtencodes.workers.dev`) via Cloudflare Workers Builds (dashboard-side Git integration, not versioned in repo). `OPENROUTER_API_KEY` secret not yet provisioned.
- **Observability:** absent — no logging library, no error tracking; only Cloudflare's platform-level request-log toggle in `wrangler.jsonc`.

## Foundations

### F-01: Flashcard data foundation

- **Outcome:** (foundation) flashcards and review-schedule tables exist in Supabase (migration committed), scoped to the owning user via RLS policies.
- **Change ID:** flashcard-data-foundation
- **PRD refs:** FR-006, NFR ("Source text and generated flashcards are never exposed to any user other than their owner"), Access Control
- **Unlocks:** S-02 (north star), S-03, S-04
- **Prerequisites:** — (auth already present in baseline supplies the user identity RLS policies scope against)
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Exact review-schedule field shape depends on which scheduling approach `/10x-plan` picks for S-04 — Owner: team. Block: no (schema starts minimal — due date, interval, last-reviewed timestamp — and is refined at plan time).
- **Risk:** Sequenced first because every remaining slice writes to this table; delaying it delays all downstream work. Scope is deliberately capped to schema + RLS only — no admin tooling or abstractions beyond what S-02 needs to proceed.
- **Status:** done

## Slices

### S-01: User can sign up and log in

- **Outcome:** user can sign up with email + password and log in; session persists for a reasonable duration without an aggressive timeout that would log them out mid-study.
- **Change ID:** email-password-auth
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Confirmed done — user manually verified signup (user creation) and login both work end-to-end against the deployed app on 2026-09-03. Auth shipped with the starter bootstrap (`4896041 bootstrap project`); no `/10x-plan` was run, none was needed.
- **Status:** done

### S-02: User converts pasted text into AI-generated, reviewed, saved flashcards

- **Outcome:** user pastes source text (100–10,000 characters), triggers AI generation, reviews each candidate (accept, edit, or reject — plus a bulk accept-all), and accepted cards are saved and immediately visible in their flashcard list.
- **Change ID:** ai-generated-flashcards
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-006, FR-007 (minimal immediate-visibility slice; full browse/edit/delete lands in S-03)
- **Prerequisites:** F-01 (done), S-01 (done), external state: `OPENROUTER_API_KEY` secret provisioned in Cloudflare Workers (confirmed provisioned 2026-09-12 via `wrangler secret list --name 10x-cards`) — all three now clear
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — (resolved at plan time: OpenRouter raw fetch, model configurable via `OPENROUTER_MODEL` env var defaulting to a free-tier model given the account's $0.00 budget — see `context/changes/ai-generated-flashcards/plan.md`)
- **Risk:** This is the north star, placed as early as F-01/S-01 allow. It's also the largest remaining slice (LLM integration + review UI + persistence) against a 7-day, after-hours-only window — keep the implementation to the PRD's stated acceptance criteria only; no extra polish until this ships.
- **Status:** done

### S-03: User can manage saved flashcards

- **Outcome:** user can view their saved flashcards, edit a card (which resets its review schedule to "new"), and delete a card after a confirmation step.
- **Change ID:** manage-saved-flashcards
- **PRD refs:** FR-007, FR-008, FR-009
- **Prerequisites:** S-02, F-01
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Off the critical path per the PRD's own scope note ("supporting requirement, off the critical path"). Mostly CRUD against the schema F-01 already established — low risk.
- **Status:** in-progress

### S-04: User studies due flashcards via spaced repetition

- **Outcome:** user can start a study session that surfaces cards due per the review schedule (with an explanatory empty-state when none are due) and rate recall with a binary "remembered"/"forgot" rating, which reschedules the next review.
- **Change ID:** spaced-repetition-study-session
- **PRD refs:** FR-010, FR-011
- **Prerequisites:** S-02, F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Which existing scheduling approach/library to integrate is an implementation choice for `/10x-plan` (PRD Non-Goals rules out building a custom one) — Owner: team. Block: no.
- **Risk:** Ties to the secondary success criterion (7-day return). Needs real saved cards to operate on, so it's sequenced after S-02; can run in parallel with S-03 since neither depends on the other.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                        | Suggested issue title                                      | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ---------------------------------- | ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ |
| F-01       | flashcard-data-foundation         | Add flashcards + review-schedule schema with per-user RLS    | yes                    | —                                                                        |
| S-01       | email-password-auth               | Email/password sign-up and login                             | yes                    | Verified done by user 2026-09-03 — closed without `/10x-plan`.           |
| S-02       | ai-generated-flashcards            | AI-generate, review, and save flashcards from pasted text     | yes                    | F-01, S-01 done; OpenRouter secret confirmed provisioned 2026-09-12.     |
| S-03       | manage-saved-flashcards            | View, edit, and delete saved flashcards                       | yes                    | S-02, F-01 done — unblocked 2026-09-12.                                  |
| S-04       | spaced-repetition-study-session    | Study due flashcards with spaced repetition                   | yes                    | S-02, F-01 done — unblocked 2026-09-12.                                  |

## Open Roadmap Questions

1. **Should saving a flashcard check for duplicates against existing cards (e.g. near-identical front text)?** — Owner: user. Block: none (not blocking v1; revisit if duplicate cards become a real nuisance).
2. **Should the flashcard list support search/filter?** — Owner: user. Block: none (targeted for v1.1, alongside manual card creation).
3. **What replaces the "users create 75% of flashcards using AI" success criterion for v1, given manual creation is deferred to v1.1?** — Owner: user. Block: none (currently dropped for v1; becomes meaningful once v1.1 ships).
4. **`prd.md` frontmatter states `hard_deadline: 2026-09-08`; this roadmap session recorded a user correction to 2026-09-10, but the PRD file itself was not updated.** — Owner: user. Block: roadmap-wide (informational only — doesn't block any slice, but the two documents now disagree; reconcile via `/10x-prd` or a manual edit when convenient).

## Parked

- **Manual flashcard creation** — Why parked: PRD non-goal; deferred to v1.1, v1 is AI-generation only.
- **Own spaced-repetition algorithm** — Why parked: PRD non-goal; an existing scheduling approach is used instead of building custom logic.
- **Multi-format import (PDF, DOCX, etc.)** — Why parked: PRD non-goal; plain-text paste only for v1.
- **Sharing/collaborative flashcard decks between users** — Why parked: PRD non-goal; single-tenant, no cross-user sharing.
- **Integrations with other educational platforms** — Why parked: PRD non-goal; no import/export to third parties in v1.
- **Mobile apps** — Why parked: PRD non-goal; web only for now.
- **Search/filter on the flashcard list** — Why parked: PRD non-goal; deferred to v1.1, v1 ships a flat chronological list.
- **De-duplication checking on saved cards** — Why parked: PRD non-goal; deferred to v1.1.
- **App-level logging/error tracking (Sentry, structured logs)** — Why parked: baseline reports this absent, but no slice's Unlocks require it — the PRD's failure-feedback NFR is a UI-level requirement (clear message to the user), not an infra-level one. Revisit post-MVP if debugging production issues blind becomes painful.
- **Landing page + polished login/dashboard UI** — Why parked: not in v1 PRD scope; every M-1 slice deliberately deferred visual polish given the deadline pressure ("no extra polish until this ships"). Not yet a roadmap slice — it has no source-anchor (FR/US) in the current PRD to trace to. Revisit as the first candidate milestone (or slice within one) once M-1 closes: re-invoke `/10x-roadmap` with a self-description of the desired outcome (or an updated PRD) so it gets a proper decomposition instead of being invented ad hoc.

## Milestone History

(Empty — this is the first milestone.)

## Done

- **S-01: email-password-auth** — done 2026-09-03. Signup/login verified manually by the user; GitHub #2 and Linear DEV-11 closed.
- **F-01: (foundation) flashcards and review-schedule tables exist in Supabase (migration committed), scoped to the owning user via RLS policies.** — Archived 2026-09-12 → `context/archive/2026-09-07-flashcard-data-foundation/`. Lesson: —.
- **S-02: user pastes source text (100–10,000 characters), triggers AI generation, reviews each candidate (accept, edit, or reject — plus a bulk accept-all), and accepted cards are saved and immediately visible in their flashcard list.** — Archived 2026-09-12 → `context/archive/2026-09-12-ai-generated-flashcards/`. Lesson: —.
