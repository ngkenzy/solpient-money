-- Solpient Money V3.1 — Dividend + value snapshot caches
-- Read-only market intelligence: declared dividend history per holding and
-- value-proxy snapshots (52-week range, analyst target). Refreshed on demand
-- from free quote feeds; pages render from these caches so loads stay fast.

create table if not exists public.dividend_cache (
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  dividend_events jsonb not null default '[]'::jsonb,
  frequency text not null default 'unknown',
  last_amount numeric,
  annualized_amount numeric,
  next_ex_date date,
  next_pay_date date,
  fetched_at timestamptz not null default now(),
  primary key (household_id, ticker)
);

create index if not exists dividend_cache_household_idx
  on public.dividend_cache (household_id);

create table if not exists public.value_snapshot_cache (
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  fifty_two_week_high numeric,
  fifty_two_week_low numeric,
  analyst_target numeric,
  sector text,
  industry text,
  fetched_at timestamptz not null default now(),
  primary key (household_id, ticker)
);

create index if not exists value_snapshot_cache_household_idx
  on public.value_snapshot_cache (household_id);
