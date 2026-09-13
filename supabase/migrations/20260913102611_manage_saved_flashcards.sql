-- Manage saved flashcards (S-03)
-- Reset a flashcard's review schedule to "new" whenever its content is edited.

-- SECURITY INVOKER (the default), matching create_review_schedule_for_flashcard's
-- style: runs as the same authenticated role that performed the flashcards
-- UPDATE, so the review_schedules UPDATE policy's `auth.uid() = user_id` check
-- is satisfied naturally. Do NOT mark this SECURITY DEFINER.
create function public.reset_review_schedule_on_flashcard_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.review_schedules
  set state = 'new',
      due_at = now(),
      interval_days = 0,
      last_reviewed_at = null
  where flashcard_id = new.id;
  return new;
end;
$$;

-- The WHEN clause (not a check inside the function body) is what makes the
-- reset conditional on the content actually changing — a re-save with
-- identical front/back is a normal UPDATE that simply doesn't fire this.
create trigger reset_review_schedule_after_flashcard_update
  after update on public.flashcards
  for each row
  when (new.front is distinct from old.front or new.back is distinct from old.back)
  execute function public.reset_review_schedule_on_flashcard_edit();
