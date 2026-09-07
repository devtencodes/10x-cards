-- Flashcard data foundation (F-01)
-- Phase 1: flashcards table, constraints, updated_at trigger, RLS policies.

-- Reusable trigger function: stamps updated_at on any row update.
-- Reused by review_schedules in Phase 2.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 2000),
  source text not null default 'ai_generated' check (source in ('ai_generated', 'ai_edited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.flashcards (user_id);

create trigger set_flashcards_updated_at
  before update on public.flashcards
  for each row
  execute function public.set_updated_at();

alter table public.flashcards enable row level security;

create policy flashcards_select_own
  on public.flashcards
  for select
  using (auth.uid() = user_id);

create policy flashcards_insert_own
  on public.flashcards
  for insert
  with check (auth.uid() = user_id);

create policy flashcards_update_own
  on public.flashcards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy flashcards_delete_own
  on public.flashcards
  for delete
  using (auth.uid() = user_id);
