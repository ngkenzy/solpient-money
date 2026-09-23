-- Solpient Money V1.6 — Portfolio History + Decision Journal
-- Durable daily position/Research observations and human-authored decisions.

create table if not exists public.portfolio_position_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  ticker text not null,
  name text not null,
  sector text not null default 'Other',
  shares numeric(24,8) not null default 0,
  price numeric(24,8) not null default 0,
  market_value_cents bigint not null default 0,
  cost_basis_cents bigint not null default 0,
  portfolio_weight_pct numeric(12,6) not null default 0,
  unrealized_pct numeric(12,6),
  research_covered boolean not null default false,
  research_version integer,
  research_score numeric(12,6),
  base_value numeric(24,8),
  valuation_gap_pct numeric(12,6),
  thesis_health text,
  thesis_weakened_count integer not null default 0,
  evidence_confidence numeric(12,6),
  decision_readiness numeric(12,6),
  research_age_days integer,
  review_priority integer not null default 0,
  review_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, snapshot_date, ticker)
);

create index if not exists portfolio_position_snapshots_household_date_idx
  on public.portfolio_position_snapshots(household_id, snapshot_date desc, ticker);

create index if not exists portfolio_position_snapshots_ticker_date_idx
  on public.portfolio_position_snapshots(household_id, ticker, snapshot_date desc);

create table if not exists public.investment_decisions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  decision_type text not null
    check (decision_type in ('hold','add_later','reduce_later','watch','no_action')),
  note text,
  action_item_id uuid references public.money_action_items(id) on delete set null,
  position_snapshot_id uuid references public.portfolio_position_snapshots(id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists investment_decisions_household_date_idx
  on public.investment_decisions(household_id, decided_at desc);

create index if not exists investment_decisions_ticker_date_idx
  on public.investment_decisions(household_id, ticker, decided_at desc);

alter table public.portfolio_position_snapshots enable row level security;
alter table public.investment_decisions enable row level security;

drop policy if exists "portfolio_position_snapshots_household_access"
  on public.portfolio_position_snapshots;

create policy "portfolio_position_snapshots_household_access"
on public.portfolio_position_snapshots for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = portfolio_position_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = portfolio_position_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
);

drop policy if exists "investment_decisions_household_access"
  on public.investment_decisions;

create policy "investment_decisions_household_access"
on public.investment_decisions for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = investment_decisions.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = investment_decisions.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.portfolio_position_snapshots from anon;
revoke all on public.investment_decisions from anon;

grant select, insert, update, delete on public.portfolio_position_snapshots to authenticated;
grant select, insert, update, delete on public.investment_decisions to authenticated;

comment on table public.portfolio_position_snapshots is
  'Daily deterministic V1.6 position + published Research observation. One row per household/ticker/day.';
comment on table public.investment_decisions is
  'Human-authored V1.6 investment decision journal. Decision labels document intent only and never execute a trade.';
