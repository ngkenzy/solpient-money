-- Solpient Money V1.7 — Military TSP Tracker
-- Local-first TSP tracking for Uniformed Service members. No TSP.gov credentials.

create table if not exists public.tsp_profiles (
  household_id uuid primary key references public.households(id) on delete cascade,
  linked_account_id uuid references public.accounts(id) on delete set null,
  retirement_system text not null default 'unknown'
    check (retirement_system in ('brs','legacy','unknown')),
  service_component text not null default 'active'
    check (service_component in ('active','reserve','guard','other')),
  service_entry_date date,
  age_at_year_end integer
    check (age_at_year_end is null or age_at_year_end between 18 and 80),
  annual_basic_pay_cents bigint not null default 0
    check (annual_basic_pay_cents >= 0),
  traditional_contribution_pct numeric(9,4) not null default 0
    check (traditional_contribution_pct between 0 and 100),
  roth_contribution_pct numeric(9,4) not null default 0
    check (roth_contribution_pct between 0 and 100),
  external_deferrals_ytd_cents bigint not null default 0
    check (external_deferrals_ytd_cents >= 0),
  prior_year_plan_wages_cents bigint not null default 0
    check (prior_year_plan_wages_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tsp_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  traditional_balance_cents bigint not null default 0
    check (traditional_balance_cents >= 0),
  roth_balance_cents bigint not null default 0
    check (roth_balance_cents >= 0),
  outstanding_loan_cents bigint not null default 0
    check (outstanding_loan_cents >= 0),
  employee_contrib_ytd_cents bigint not null default 0
    check (employee_contrib_ytd_cents >= 0),
  service_auto_ytd_cents bigint not null default 0
    check (service_auto_ytd_cents >= 0),
  service_match_ytd_cents bigint not null default 0
    check (service_match_ytd_cents >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, snapshot_date)
);

create table if not exists public.tsp_fund_positions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_id uuid not null references public.tsp_snapshots(id) on delete cascade,
  fund_code text not null,
  fund_name text not null,
  balance_cents bigint not null default 0
    check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  unique (snapshot_id, fund_code)
);

create index if not exists tsp_snapshots_household_date_idx
  on public.tsp_snapshots(household_id, snapshot_date desc);

create index if not exists tsp_fund_positions_snapshot_idx
  on public.tsp_fund_positions(snapshot_id, fund_code);

alter table public.tsp_profiles enable row level security;
alter table public.tsp_snapshots enable row level security;
alter table public.tsp_fund_positions enable row level security;

drop policy if exists "tsp_profiles_household_access" on public.tsp_profiles;
create policy "tsp_profiles_household_access"
on public.tsp_profiles for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_profiles.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_profiles.household_id
      and hm.user_id = (select auth.uid())
  )
);

drop policy if exists "tsp_snapshots_household_access" on public.tsp_snapshots;
create policy "tsp_snapshots_household_access"
on public.tsp_snapshots for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
);

drop policy if exists "tsp_fund_positions_household_access" on public.tsp_fund_positions;
create policy "tsp_fund_positions_household_access"
on public.tsp_fund_positions for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_fund_positions.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = tsp_fund_positions.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.tsp_profiles from anon;
revoke all on public.tsp_snapshots from anon;
revoke all on public.tsp_fund_positions from anon;

grant select, insert, update, delete on public.tsp_profiles to authenticated;
grant select, insert, update, delete on public.tsp_snapshots to authenticated;
grant select, insert, update, delete on public.tsp_fund_positions to authenticated;

comment on table public.tsp_profiles is
  'V1.7 local military TSP planning profile. Stores no TSP.gov credentials.';
comment on table public.tsp_snapshots is
  'V1.7 dated TSP balance and contribution observations.';
comment on table public.tsp_fund_positions is
  'V1.7 per-snapshot G/F/C/S/I/L or custom TSP fund balances.';
