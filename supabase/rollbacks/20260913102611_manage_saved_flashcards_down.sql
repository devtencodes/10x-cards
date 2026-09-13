-- Rollback for supabase/migrations/20260913102611_manage_saved_flashcards.sql
--
-- NOT an auto-applied migration file — the CLI applies every file under
-- supabase/migrations/ in sequence, so an unapplied "down" migration can't
-- safely live there alongside applied ones.
--
-- To roll back a pushed migration:
--   1. psql "$DATABASE_URL" -f supabase/rollbacks/20260913102611_manage_saved_flashcards_down.sql
--   2. delete from supabase_migrations.schema_migrations where version = '20260913102611';
--      (so a later `supabase db push` doesn't skip re-applying the up-migration
--      if it's ever reintroduced)
--
-- Reverse-dependency order: trigger before the function it depends on.

drop trigger if exists reset_review_schedule_after_flashcard_update on public.flashcards;
drop function if exists public.reset_review_schedule_on_flashcard_edit();
