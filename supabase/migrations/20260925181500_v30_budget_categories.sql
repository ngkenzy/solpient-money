-- Solpient Money V3.0 — Monthly Budget Categories
-- Classic category budgets with optional month-to-month rollover of unspent
-- amounts. Actuals are derived from truth-engine categorized transactions;
-- this table stores only the household's budget policy (never raw money movement).

create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  monthly_amount_cents bigint not null check (monthly_amount_cents >= 0),
  rollover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category)
);

create index if not exists budget_categories_household_idx
  on public.budget_categories (household_id);
