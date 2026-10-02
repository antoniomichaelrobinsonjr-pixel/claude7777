create table if not exists projects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "own projects" on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
