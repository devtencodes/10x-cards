# Flashcard Data Foundation — Plan Brief

> Full plan: `context/changes/flashcard-data-foundation/plan.md`

## What & Why

Establish the Supabase schema everything downstream (S-02, S-03, S-04) writes to: a `flashcards` table and a 1:1 `review_schedules` table, RLS-scoped so a user only ever sees their own rows. This is F-01 — the roadmap's own risk note caps it to "schema + RLS only, no admin tooling or abstractions beyond what S-02 needs."

## Starting Point

No domain schema exists yet — `supabase/` has only CLI scaffolding, no `migrations/` directory. Auth is already Supabase-native (`auth.users`), so RLS policies key off `auth.uid()` the same way `src/middleware.ts` already does. No `Database` TypeScript type exists anywhere in the repo.

## Desired End State

A single migration creates both tables with RLS active from the same commit that creates each table. Saving a flashcard automatically gets it a review-schedule row via trigger — no application code has to remember a second insert. A generated `Database` type is wired into the existing Supabase client so S-02 starts with typed queries.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Schedule row creation | DB trigger, not app code | S-02's save endpoint can't forget the schedule row — it's atomic and automatic. |
| Review-progress state | Explicit `state` enum column | FR-008's "edit resets to new" becomes a single-column update instead of nulling several fields. |
| Account deletion | `ON DELETE CASCADE` | Matches the PRD's privacy guardrail — no orphaned personal data after account deletion. |
| RLS granularity | 4 policies per table (per operation) | Matches Supabase's own documented convention; each policy independently auditable. |
| Provenance tracking | `source` column added now | Avoids a second migration when v1.1 adds manual card creation. |
| Field constraints | CHECK constraints, generous bounds | Defense in depth even if S-02's app-layer validation has a bug. |
| TypeScript types | Generated now, wired into client | S-02 starts typed on day one instead of pausing to do this first. |
| Table shape | Two tables (`flashcards` + `review_schedules`), not merged | Roadmap's own F-01 outcome text already says "tables" (plural). |

## Scope

**In scope:** `flashcards` + `review_schedules` tables, constraints, indexes, auto-create trigger, RLS policies (8 total), a paired rollback script, generated TypeScript types, typed Supabase client, an ESLint ignore for the generated file, and an `astro check` CI step.

**Out of scope:** any flashcard/generation/study API or UI (S-02/S-03/S-04), admin tooling, seed data, spaced-repetition algorithm logic (S-04 picks the approach), account-deletion feature, CI migration automation (stays manual/out-of-band per current deploy conventions).

## Architecture / Approach

One migration file, built in two RLS-safe increments — `flashcards` (table + policies) first, then `review_schedules` (table + cross-table trigger + policies) so no commit ever leaves a table live without its RLS active. A third phase generates and wires in TypeScript types. `review_schedules.user_id` is denormalized from the owning flashcard so its RLS policies are a direct `auth.uid() = user_id` check with no join.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Flashcards table | Table, constraints, `updated_at` trigger, 4 RLS policies | RLS check clause typo would silently leak/hide rows — verify with two simulated users, not just "policy exists" |
| 2. Review-schedules table | Table, auto-create trigger, `updated_at` trigger, 4 RLS policies | Trigger must stay `SECURITY INVOKER` — `SECURITY DEFINER` would bypass RLS entirely |
| 3. TypeScript types | Generated `Database` type wired into `src/lib/supabase.ts` | Types can drift if schema changes after generation but before S-02 starts |

**Prerequisites:** Local Supabase stack running (`supabase start`, Docker-backed) to run `db reset` and `gen types` locally.
**Estimated effort:** ~1 session, 3 phases — this is a capped-scope foundation change, not a multi-week build.

## Open Risks & Assumptions

- Applying this migration to the live/linked Supabase project is a manual `supabase db push` step, out of band from Cloudflare's deploy — not automated in CI. If that's ever forgotten before S-02 ships, S-02 will fail against a schema-less remote database. A paired rollback script (`supabase/rollbacks/..._down.sql`, Phase 2) covers reverting it while the tables are still empty.
- The exact `review_schedules` field shape (`state`, `interval_days`, `due_at`) is deliberately minimal per the roadmap's own noted unknown — S-04 may need to add columns (e.g. an ease factor) once it picks a concrete scheduling approach. That's an anticipated future migration, not a gap in this one.

## Plan Review

Reviewed via `/10x-plan-review` on 2026-09-07 — all 6 findings triaged and fixed in-plan (Progress checkbox formatting, a paired rollback script, an ESLint ignore for the generated types file, and an `astro check` CI step). Full report: `context/changes/flashcard-data-foundation/reviews/plan-review.md`.

## Success Criteria (Summary)

- `npx supabase db reset` applies the migration cleanly from empty.
- Two simulated users can only ever see their own `flashcards`/`review_schedules` rows.
- `npx astro check && npm run build && npm run lint` all pass with the typed Supabase client wired in.
