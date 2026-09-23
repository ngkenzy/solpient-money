-- Solpient Money V1.2
-- Monthly financial-plan baselines for continuous plan monitoring.

create table if not exists public.financial_plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_month date not null,
  plan_version text not null default '1.1',
  planned_income_cents bigint not null default 0,
  planned_spending_cents bigint not null default 0,
  planned_surplus_cents bigint not null default 0,
  reserve_allocation_cents bigint not null default 0,
  debt_allocation_cents bigint not null default 0,
  goal_allocation_cents bigint not null default 0,
  retirement_allocation_cents bigint not null default 0,
  flexible_allocation_cents bigint not null default 0,
  debt_payoff_months integer,
  retirement_required_monthly_cents bigint not null default 0,
  baseline_plan jsonb not null default '{}'::jsonb,
  reset_count integer not null default 0,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plan_month = date_trunc('month', plan_month)::date),
  unique (household_id, plan_month)
);

create index if not exists financial_plan_snapshots_household_month_idx
  on public.financial_plan_snapshots(household_id, plan_month desc);

alter table public.financial_plan_snapshots enable row level security;

drop policy if exists "financial_plan_snapshots_household_access"
on public.financial_plan_snapshots;

create policy "financial_plan_snapshots_household_access"
on public.financial_plan_snapshots for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = financial_plan_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = financial_plan_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.financial_plan_snapshots from anon;
grant select, insert, update, delete
on public.financial_plan_snapshots to authenticated;
