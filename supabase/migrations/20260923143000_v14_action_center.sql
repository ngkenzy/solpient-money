-- Solpient Money V1.4 — Action Center + Local Scheduler
-- Persistent human-review workflow for material Autopilot findings.

create table if not exists public.money_action_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_key text not null,
  source_type text not null default 'autopilot'
    check (source_type in ('autopilot')),
  category text not null,
  severity text not null
    check (severity in ('critical','watch')),
  status text not null default 'new'
    check (status in ('new','reviewed','snoozed','resolved')),
  title text not null,
  detail text not null,
  href text not null default '/autopilot',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, source_key)
);

create index if not exists money_action_items_household_status_idx
  on public.money_action_items(household_id, status, severity, last_seen_at desc);

create index if not exists money_action_items_snoozed_idx
  on public.money_action_items(household_id, snoozed_until)
  where status = 'snoozed';

alter table public.money_action_items enable row level security;

drop policy if exists "money_action_items_household_access"
  on public.money_action_items;

create policy "money_action_items_household_access"
on public.money_action_items for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = money_action_items.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = money_action_items.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.money_action_items from anon;
grant select, insert, update, delete on public.money_action_items to authenticated;

comment on table public.money_action_items is
  'Persistent read-only decision queue created from critical/watch Money Autopilot findings. Status changes acknowledge workflow only; they never execute financial actions.';
