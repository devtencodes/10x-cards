-- Rollback for supabase/migrations/20260907195424_flashcard_data_foundation.sql
--
-- NOT an auto-applied migration file — the CLI applies every file under
-- supabase/migrations/ in sequence, so an unapplied "down" migration can't
-- safely live there alongside applied ones.
--
-- To roll back a pushed migration:
--   1. psql "$DATABASE_URL" -f supabase/rollbacks/20260907195424_flashcard_data_foundation_down.sql
--   2. delete from supabase_migrations.schema_migrations where version = '20260907195424';
--      (so a later `supabase db push` doesn't skip re-applying the up-migration
--      if it's ever reintroduced)
--
-- Reverse-dependency order: trigger that depends on flashcards existing first,
-- then both tables' updated_at triggers, then all 8 RLS policies, then the
-- tables themselves, then the shared trigger function.

drop trigger if exists create_review_schedule_after_flashcard_insert on public.flashcards;
drop function if exists public.create_review_schedule_for_flashcard();

drop trigger if exists set_review_schedules_updated_at on public.review_schedules;
drop trigger if exists set_flashcards_updated_at on public.flashcards;

drop policy if exists review_schedules_select_own on public.review_schedules;
drop policy if exists review_schedules_insert_own on public.review_schedules;
drop policy if exists review_schedules_update_own on public.review_schedules;
drop policy if exists review_schedules_delete_own on public.review_schedules;

drop policy if exists flashcards_select_own on public.flashcards;
drop policy if exists flashcards_insert_own on public.flashcards;
drop policy if exists flashcards_update_own on public.flashcards;
drop policy if exists flashcards_delete_own on public.flashcards;

drop table if exists public.review_schedules;
drop table if exists public.flashcards;

drop function if exists public.set_updated_at();
