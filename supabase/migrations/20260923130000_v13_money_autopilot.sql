-- Solpient Money V1.3 — Money Autopilot
-- Daily read-only intelligence ledger. Autopilot may refresh configured connectors,
-- but it never moves money, trades, pays bills, or changes household planning policy.

create table if not exists public.money_autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  run_date date not null,
  run_kind text not null default 'automatic'
    check (run_kind in ('automatic','manual')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  connector_report jsonb not null default '[]'::jsonb,
  briefing jsonb not null default '{}'::jsonb,
  critical_count integer not null default 0 check (critical_count >= 0),
  watch_count integer not null default 0 check (watch_count >= 0),
  new_transaction_count integer not null default 0 check (new_transaction_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, run_date)
);

create index if not exists money_autopilot_runs_household_date_idx
  on public.money_autopilot_runs(household_id, run_date desc);

alter table public.money_autopilot_runs enable row level security;

drop policy if exists "money_autopilot_runs_household_access"
  on public.money_autopilot_runs;

create policy "money_autopilot_runs_household_access"
on public.money_autopilot_runs for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = money_autopilot_runs.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = money_autopilot_runs.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.money_autopilot_runs from anon;
grant select, insert, update, delete on public.money_autopilot_runs to authenticated;

comment on table public.money_autopilot_runs is
  'One deterministic Money Autopilot observation per household/day. Stores only derived household metrics, connector health, and briefing signals.';
