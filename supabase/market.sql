-- Daily market data: one row per country holding its quarterly price-index series, refreshed by /api/cron/market.
-- Run after schema.sql. Row level security is on with no policies, so only the server (service-role key) can read or
-- write these tables; people get the data through /api/market, which checks their plan.

create table if not exists market_series (
  country text primary key check (country ~ '^[A-Z]{2}$'),
  series jsonb not null,
  latest_period text,
  fetched_at timestamptz not null default now()
);

create table if not exists market_meta (
  id int primary key default 1 check (id = 1),
  fetched_at timestamptz not null,
  source text not null,
  countries int not null,
  latest_period text
);

alter table market_series enable row level security;
alter table market_meta enable row level security;
