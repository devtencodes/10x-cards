# Flashcard Data Foundation Implementation Plan

## Overview

Establish the Supabase schema that every downstream flashcard slice (S-02, S-03, S-04) writes to: a `flashcards` table and a 1:1 `review_schedules` table, both RLS-scoped so a user can only ever see or touch their own rows. This is F-01 on the roadmap — schema + RLS only, no API or UI.

## Current State Analysis

- `supabase/` contains only `config.toml` and CLI scaffolding — no `supabase/migrations/` directory exists yet, no domain tables.
- Auth is Supabase-native (`auth.users`, no custom `profiles` table). `src/middleware.ts` already calls `supabase.auth.getUser()` and populates `context.locals.user`; RLS policies key off `auth.uid()` the same way.
- `src/lib/supabase.ts` builds an untyped `createServerClient(...)` — no `Database` generic, no generated types anywhere in the repo.
- `supabase` CLI (`^2.23.4`) is already a devDependency — `supabase migration new` / `supabase db reset` / `supabase gen types typescript` are all available without adding tooling.
- CI (`.github/workflows/ci.yml`) is lint+build only; it does not apply migrations or touch a live database. Migrations are applied out-of-band (matches `context/deployment/deploy-plan.md`'s note that Cloudflare rollback does not revert Supabase schema — schema changes are already treated as a separate, manual-apply concern).

## Desired End State

A single migration file under `supabase/migrations/` creates `flashcards` and `review_schedules`, both RLS-enabled with per-user, per-operation policies. Inserting a row into `flashcards` automatically creates its matching `review_schedules` row via trigger — no application code is required to keep the two in sync. `supabase db reset` (local, Docker-backed) applies the migration cleanly from empty. `src/db/database.types.ts` is generated and `src/lib/supabase.ts`'s client is typed against it.

**Verification**: `npx supabase db reset` succeeds; a manual `insert into flashcards (...)` as one test user is invisible to a second test user under RLS; `npx astro check` and `npm run build` pass with the typed client wired in.

### Key Discoveries:

- Roadmap's own F-01 outcome text says "flashcards **and** review-schedule **tables**" (plural) — two related tables, not one merged table with embedded schedule columns.
- `src/pages/api/auth/signup.ts` confirms accounts are created purely via `supabase.auth.signUp` — no app-level user row to backfill or migrate.

## What We're NOT Doing

- No flashcard/generation/study API routes or UI (S-02/S-03/S-04's job).
- No admin tooling, seed data, or abstractions beyond what S-02 needs to start querying.
- No custom spaced-repetition algorithm logic — `review_schedules` only carries the minimal state a scheduling approach will read/write; S-04 picks and wires the algorithm.
- No account-deletion feature (out of scope for v1) — only the FK cascade behavior that would apply *if* a user row is ever deleted.
- No CI migration step — applying this migration to the live Supabase project stays a manual, out-of-band step per current deploy conventions.

## Implementation Approach

One Supabase migration, split into two phases so no commit ever leaves a table created without its RLS policies active in the same file: Phase 1 creates `flashcards` with its policies, Phase 2 creates `review_schedules` (plus the cross-table trigger that depends on `flashcards` already existing) with its policies. Phase 3 generates and wires in TypeScript types. All SQL lives in one migration file created once at the start of Phase 1 and extended through Phase 2 — Supabase migrations are commit-per-file-content, not append-only, so both phases edit the same file.

## Critical Implementation Details

**RLS + trigger interaction**: the `review_schedules` auto-create trigger (fires `AFTER INSERT` on `flashcards`) must NOT use `SECURITY DEFINER`. Leave it `SECURITY INVOKER` (the default) so the trigger's `INSERT INTO review_schedules` runs as the same `authenticated` role that performed the original `flashcards` insert. Because the trigger sets `review_schedules.user_id := NEW.user_id` (the same user who just satisfied the `flashcards` INSERT policy), the `review_schedules` INSERT policy's `WITH CHECK (auth.uid() = user_id)` is satisfied naturally — no privilege escalation needed. Using `SECURITY DEFINER` here would be a live foot-gun: it would make the trigger bypass RLS entirely, silently defeating the per-user isolation this migration exists to enforce.

**`review_schedules` INSERT policy is intentionally ownership-blind**: `review_schedules_insert_own`'s `WITH CHECK` only verifies `auth.uid() = user_id` — it does not confirm `flashcard_id` belongs to a flashcard the same user owns. This is safe only because `UNIQUE(flashcard_id)` plus the same-transaction auto-create trigger guarantee a matching row already exists by the time any other insert could target that `flashcard_id`. If a future change moves the trigger off `AFTER INSERT` (e.g. to `AFTER COMMIT`) or drops the uniqueness constraint, this policy would need an explicit ownership check (e.g. an `EXISTS` subquery against `flashcards`) added at the same time.

## Phase 1: Flashcards table

### Overview

Create the `flashcards` table with its constraints, an `updated_at` maintenance trigger, and per-operation RLS policies.

### Changes Required:

#### 1. Migration file (created)

**File**: `supabase/migrations/<timestamp>_flashcard_data_foundation.sql` (create via `supabase migration new flashcard_data_foundation`, then edit)

**Intent**: Define `flashcards` as the row-per-card table: owning user, front/back text, and a provenance marker so S-02/S-03 can record whether a card is as-generated or user-edited without a later migration.

**Contract**:
- Table `public.flashcards`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `front text not null check (char_length(front) between 1 and 2000)`, `back text not null check (char_length(back) between 1 and 2000)`, `source text not null default 'ai_generated' check (source in ('ai_generated', 'ai_edited'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Index: `create index on public.flashcards (user_id);` — every downstream query filters by owner.
- A reusable `set_updated_at()` trigger function (`language plpgsql`, sets `NEW.updated_at = now()`, returns `NEW`) — a `BEFORE UPDATE` trigger on `flashcards` calls it. This same function is reused by `review_schedules` in Phase 2; define it once here.
- `alter table public.flashcards enable row level security;`
- Four policies, each `for <select|insert|update|delete> ... using (auth.uid() = user_id)` (INSERT uses `with check` instead of `using`; UPDATE uses both):
  - `flashcards_select_own`, `flashcards_insert_own`, `flashcards_update_own`, `flashcards_delete_own`.

### Success Criteria:

#### Automated Verification:

- Migration file exists: `ls supabase/migrations/*flashcard_data_foundation.sql`
- Local reset applies cleanly: `npx supabase db reset`
- `flashcards` has RLS enabled with 4 policies: query `select count(*) from pg_policies where tablename = 'flashcards';` returns `4` via `npx supabase db execute` (or the local `psql` connection string printed by `supabase status`)

#### Manual Verification:

- Insert a `flashcards` row as test user A (via `psql` or SQL editor with `set local role authenticated; set local request.jwt.claims...` simulating A's `auth.uid()`), then confirm a query as test user B returns zero rows for that card.
- Confirm inserting a `flashcards` row with `front`/`back` longer than 2000 chars is rejected by the CHECK constraint.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Review-schedules table

### Overview

Create `review_schedules` (1:1 with `flashcards`), the trigger that auto-creates a schedule row whenever a flashcard is inserted, and its own RLS policies.

### Changes Required:

#### 1. Migration file (extended)

**File**: `supabase/migrations/<timestamp>_flashcard_data_foundation.sql` (same file as Phase 1 — append)

**Intent**: Give every flashcard exactly one review-schedule row, created automatically so S-02's save flow never has to remember a second insert. State starts minimal (`due_at`, `interval_days`, `last_reviewed_at`, `state`) — S-04 refines behavior against these columns when it picks a scheduling approach; this migration only needs to supply columns any binary-rating spaced-repetition scheme can read and write.

**Contract**:
- Table `public.review_schedules`: `id uuid primary key default gen_random_uuid()`, `flashcard_id uuid not null unique references public.flashcards(id) on delete cascade`, `user_id uuid not null references auth.users(id) on delete cascade` (denormalized from the owning flashcard — keeps RLS policies a direct `auth.uid() = user_id` check with no join), `state text not null default 'new' check (state in ('new', 'learning', 'review'))`, `due_at timestamptz not null default now()` (new cards are immediately due), `interval_days integer not null default 0`, `last_reviewed_at timestamptz`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Index: `create index on public.review_schedules (user_id, due_at);` — supports S-04's "cards due" query directly.
- `BEFORE UPDATE` trigger reusing Phase 1's `set_updated_at()`.
- A trigger function `create_review_schedule_for_flashcard()` (`SECURITY INVOKER`, the default — see Critical Implementation Details) that inserts one `review_schedules` row with `flashcard_id := NEW.id, user_id := NEW.user_id` and default state; an `AFTER INSERT` trigger on `flashcards` calls it.
- `alter table public.review_schedules enable row level security;`
- Four per-operation policies mirroring Phase 1's shape: `review_schedules_select_own`, `_insert_own`, `_update_own`, `_delete_own`, each on `auth.uid() = user_id`.

#### 2. Rollback script (created)

**File**: `supabase/rollbacks/<timestamp>_flashcard_data_foundation_down.sql` (plain SQL file, NOT under `supabase/migrations/` — the CLI applies every file in that directory in sequence, so an unapplied "down" migration can't safely live there alongside applied ones)

**Intent**: Give this migration a tested revert path, per `context/foundation/infrastructure.md`'s risk register ("snapshot the schema (or write a paired down-migration) before deploying schema changes"). Since no application code writes to these tables yet, this is a pure teardown script — safe and cheap to write now, expensive to improvise under incident pressure later.

**Contract**: In reverse-dependency order: drop the `AFTER INSERT` trigger on `flashcards` and its function, drop both tables' `BEFORE UPDATE` triggers, drop all 8 RLS policies, `drop table review_schedules;`, `drop table flashcards;`, then `drop function set_updated_at();`. To actually roll back a pushed migration: apply this script directly against the target database (`psql "$DATABASE_URL" -f supabase/rollbacks/<timestamp>_flashcard_data_foundation_down.sql`), then remove the corresponding row from `supabase_migrations.schema_migrations` so a later `supabase db push` doesn't skip re-applying the up-migration if it's ever reintroduced.

### Success Criteria:

#### Automated Verification:

- Local reset still applies cleanly with both tables: `npx supabase db reset`
- `review_schedules` has RLS enabled with 4 policies (same `pg_policies` check as Phase 1, table name `review_schedules`)
- `flashcard_id` uniqueness enforced: a second `psql` insert with a duplicate `flashcard_id` fails
- Rollback script exists: `test -s supabase/rollbacks/*flashcard_data_foundation_down.sql`

#### Manual Verification:

- Insert a `flashcards` row as test user A and confirm a matching `review_schedules` row appears automatically (same `user_id`, `state = 'new'`, `due_at` ≈ now) without any explicit insert into `review_schedules`.
- Confirm test user B still cannot see A's `review_schedules` row.
- Confirm deleting the `flashcards` row cascades and removes the `review_schedules` row.
- Confirm the rollback script applies cleanly against a fresh `supabase db reset` and leaves neither table nor policy behind.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: TypeScript types

### Overview

Generate typed database access so S-02 starts with a typed Supabase client instead of pausing to do this first.

### Changes Required:

#### 1. Generated types

**File**: `src/db/database.types.ts` (new)

**Intent**: Machine-generated `Database` type covering `flashcards` and `review_schedules`, produced from the local schema so it reflects exactly what Phases 1–2 committed.

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts` (requires `supabase start` running locally against the migrated schema). Not hand-edited.

#### 2. Supabase client typing

**File**: `src/lib/supabase.ts`

**Intent**: Type the server client against the generated schema so callers get compile-time column/table checking.

**Contract**: Import `Database` from `@/db/database.types`; change `createServerClient(...)` to `createServerClient<Database>(...)`. No behavioral change to cookie handling.

#### 3. ESLint ignore for generated types

**File**: `eslint.config.js`

**Intent**: Exclude the generated types file from linting. `strictTypeChecked`/`stylisticTypeChecked` (already applied repo-wide) commonly flag Supabase's generated `type Database = {...}` shape (e.g. `consistent-type-definitions` preferring `interface`), and the file is regenerated wholesale on every schema change — never hand-edited — so there's no way to satisfy a lint rule on it without the fix being wiped by the next regeneration.

**Contract**: Add `"src/db/database.types.ts"` to the `includeIgnoreFile(gitignorePath)` call's ignores array (or an equivalent top-level `{ ignores: [...] }` entry) in the `tseslint.config(...)` export, so the file is excluded from all rule sets, not just relaxed under one.

#### 4. Wire type-checking into CI

**File**: `.github/workflows/ci.yml`

**Intent**: `astro sync` (already in CI) only regenerates `.astro/types.d.ts`; `astro build` transpiles via esbuild without type-checking. Without a dedicated step, the typed Supabase client this phase introduces has no standing CI enforcement — a later PR could silently break `database.types.ts` consistency with nothing catching it.

**Contract**: Add an `npx astro check` step to the `ci` job, after `npx astro sync` and before (or alongside) `npm run lint` / `npm run build`.

### Success Criteria:

#### Automated Verification:

- Types file exists and is non-empty: `test -s src/db/database.types.ts`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Lint passes with the generated file excluded: `npm run lint`
- CI runs the type-check step: `grep -n "astro check" .github/workflows/ci.yml`

#### Manual Verification:

- Open `src/lib/supabase.ts` in an editor and confirm the generated `Database` type surfaces `flashcards`/`review_schedules` autocomplete on a test `.from(...)` call.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None required — this change has no application code to unit test (schema + generated types only).

### Integration Tests:

- The manual RLS cross-user checks in Phase 1/2 (two simulated `auth.uid()` sessions) are the closest thing to an integration test available without API routes yet; no automated integration suite exists in the repo to extend.

### Manual Testing Steps:

1. `supabase start` (local stack), `npx supabase db reset` to apply the migration from empty.
2. Using the SQL editor or `psql` against the local instance, simulate two different `auth.uid()` values and confirm cross-user row invisibility on both tables.
3. Confirm the auto-create trigger fires on a plain `flashcards` insert with no explicit `review_schedules` insert.
4. Run `npx astro check && npm run build && npm run lint` to confirm the typed client compiles cleanly.

## Performance Considerations

`review_schedules (user_id, due_at)` is indexed to keep S-04's "cards due for this user" query an index range scan rather than a sequential scan — the only query shape this foundation needs to anticipate ahead of time.

## Migration Notes

This is a net-new migration (no existing data to migrate). Applying it to the live Supabase project is a manual, out-of-band step (per current deploy conventions — CI does not run migrations); do this by running `supabase link` then `supabase db push` against the linked project once this plan's phases are implemented and reviewed.

### Rollback Strategy

Per `context/foundation/infrastructure.md`'s risk register, a Supabase schema deploy is treated as non-trivially-reversible unless paired with a snapshot or a down-migration. Phase 2 produces `supabase/rollbacks/<timestamp>_flashcard_data_foundation_down.sql` — a plain DROP script (not an auto-applied migration file) that removes both tables, their triggers, and all 8 RLS policies. If this migration needs reverting after a live `supabase db push`, run that script directly against the target database, then delete its row from `supabase_migrations.schema_migrations` so the CLI doesn't skip re-applying the up-migration later. This only covers rollback while the tables are still empty (true until S-02 starts writing rows) — reverting after real user data exists is a future problem, not this plan's.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01: Flashcard data foundation)
- PRD: `context/foundation/prd.md` (FR-006, NFR "Source text and generated flashcards are never exposed to any user other than their owner", Access Control)
- Auth pattern to match: `src/middleware.ts`, `src/pages/api/auth/signup.ts`
- Deploy/rollback caveat re: schema changes: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Flashcards table

#### Automated

- [x] 1.1 Migration file exists: `ls supabase/migrations/*flashcard_data_foundation.sql` — 9f183f4
- [x] 1.2 Local reset applies cleanly: `npx supabase db reset` — 9f183f4
- [x] 1.3 `flashcards` has RLS enabled with 4 policies — 9f183f4

#### Manual

- [x] 1.4 Cross-user row invisibility confirmed for `flashcards` — 9f183f4
- [x] 1.5 Front/back length CHECK constraint rejects oversized input — 9f183f4

### Phase 2: Review-schedules table

#### Automated

- [x] 2.1 Local reset still applies cleanly with both tables: `npx supabase db reset` — 9ceb37b
- [x] 2.2 `review_schedules` has RLS enabled with 4 policies — 9ceb37b
- [x] 2.3 `flashcard_id` uniqueness enforced — 9ceb37b
- [x] 2.4 Rollback script exists — 9ceb37b

#### Manual

- [x] 2.5 Auto-create trigger produces a matching `review_schedules` row on flashcard insert — 9ceb37b
- [x] 2.6 Cross-user row invisibility confirmed for `review_schedules` — 9ceb37b
- [x] 2.7 Cascade delete removes `review_schedules` row when its `flashcards` row is deleted — 9ceb37b
- [x] 2.8 Rollback script applies cleanly and removes both tables/policies — 9ceb37b

### Phase 3: TypeScript types

#### Automated

- [x] 3.1 Types file exists and is non-empty: `test -s src/db/database.types.ts`
- [x] 3.2 Type check passes: `npx astro check`
- [x] 3.3 Build passes: `npm run build`
- [x] 3.4 Lint passes with the generated file excluded: `npm run lint`
- [x] 3.5 CI runs the type-check step

#### Manual

- [x] 3.6 Typed `Database` generic surfaces table/column autocomplete in `src/lib/supabase.ts`
