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

-- Phase 2: review_schedules table (1:1 with flashcards), auto-create
-- trigger, and RLS policies.

create table public.review_schedules (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null unique references public.flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'new' check (state in ('new', 'learning', 'review')),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.review_schedules (user_id, due_at);

create trigger set_review_schedules_updated_at
  before update on public.review_schedules
  for each row
  execute function public.set_updated_at();

-- SECURITY INVOKER (the default): runs as the same authenticated role
-- that performed the flashcards insert, so the review_schedules INSERT
-- policy's `auth.uid() = user_id` check is satisfied naturally. Do NOT
-- mark this SECURITY DEFINER — that would bypass RLS entirely.
create function public.create_review_schedule_for_flashcard()
returns trigger
language plpgsql
as $$
begin
  insert into public.review_schedules (flashcard_id, user_id)
  values (new.id, new.user_id);
  return new;
end;
$$;

create trigger create_review_schedule_after_flashcard_insert
  after insert on public.flashcards
  for each row
  execute function public.create_review_schedule_for_flashcard();

alter table public.review_schedules enable row level security;

create policy review_schedules_select_own
  on public.review_schedules
  for select
  using (auth.uid() = user_id);

create policy review_schedules_insert_own
  on public.review_schedules
  for insert
  with check (auth.uid() = user_id);

create policy review_schedules_update_own
  on public.review_schedules
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy review_schedules_delete_own
  on public.review_schedules
  for delete
  using (auth.uid() = user_id);
