-- Membership plans and server-side limits. Run AFTER schema.sql. Only needed when billing is switched on
-- (NEXT_PUBLIC_BILLING_ENABLED=true). Without this file the app is unlimited, exactly as before.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'plus', 'pro', 'studio')),
  interval text check (interval in ('week', 'month', 'year')),
  status text not null default 'none',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Free trials already used (one per paid plan per account). Written only by the webhook, like everything else here.
alter table profiles add column if not exists trials_used text[] not null default '{}';

alter table profiles enable row level security;

-- People can read their own plan. There are deliberately NO insert/update/delete policies: only the server
-- (the Stripe webhook, using the service-role key) can change a plan, so nobody can upgrade themselves.
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select using (user_id = auth.uid());

-- Limits per plan. A null max_analyses means unlimited. Keep these in step with src/billing/plans.ts.
create or replace function plan_limits(p text)
returns table (max_analyses int, max_comps int)
language sql immutable as $$
  select
    case p when 'starter' then 2 else null end,
    case p when 'starter' then 4 when 'plus' then 8 when 'pro' then 15 when 'studio' then 40 else 4 end
$$;

create or replace function enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan text;
  lim record;
  existing_comps int;
  new_comps int;
begin
  select coalesce((select p.plan from profiles p where p.user_id = new.user_id), 'starter') into user_plan;
  select * into lim from plan_limits(user_plan);

  -- Saving uses upsert, so an INSERT can really be an edit of a row that already exists. Look it up first.
  select jsonb_array_length(coalesce(data -> 'comps', '[]'::jsonb)) into existing_comps from projects where id = new.id;

  if existing_comps is null and lim.max_analyses is not null then
    if (select count(*) from projects where user_id = new.user_id) >= lim.max_analyses then
      raise exception 'plan_limit_analyses' using errcode = 'P0001';
    end if;
  end if;

  -- Comps: refuse to go over the limit, but never block someone from saving or trimming an analysis that is
  -- already over it (for example after a downgrade). Only growing past the limit is refused.
  new_comps := jsonb_array_length(coalesce(new.data -> 'comps', '[]'::jsonb));
  if new_comps > lim.max_comps and new_comps > coalesce(existing_comps, 0) then
    raise exception 'plan_limit_comps' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_plan_limits on projects;
create trigger projects_plan_limits
  before insert or update on projects
  for each row execute function enforce_plan_limits();
