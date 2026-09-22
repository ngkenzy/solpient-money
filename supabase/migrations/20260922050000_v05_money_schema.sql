-- Solpient Money V0.5
-- Private household data model. All public-schema tables use RLS.

create extension if not exists pgcrypto;\n\ncreate schema if not exists private;\nrevoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  base_currency text not null default 'USD' check (char_length(base_currency) = 3),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  institution text not null default 'Manual',
  account_type text not null check (account_type in ('cash','investment','retirement','property','debt')),
  balance_cents bigint not null default 0,
  change_ytd_pct numeric(9,4) not null default 0,
  owner_scope text not null default 'Household' check (owner_scope in ('Household','Primary','Joint')),
  last_four text,
  apr_pct numeric(9,4),
  minimum_payment_cents bigint,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid,
  posted_at date not null,
  merchant text not null check (char_length(merchant) between 1 and 240),
  category text not null default 'Uncategorized',
  amount_cents bigint not null,
  transaction_type text not null check (transaction_type in ('income','expense','transfer')),
  note text,
  source text not null default 'manual' check (source in ('manual','demo','plaid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_household_fk
    foreign key (account_id, household_id)
    references public.accounts(id, household_id)
    on delete set null
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid,
  ticker text not null,
  name text not null,
  holding_kind text not null check (holding_kind in ('stock','etf','bond','cash')),
  shares numeric(24,8) not null default 0,
  price numeric(24,8) not null default 0,
  cost_basis_cents bigint not null default 0,
  market_value_cents bigint not null default 0,
  day_change_pct numeric(9,4) not null default 0,
  ytd_return_pct numeric(9,4) not null default 0,
  sector text not null default 'Other',
  source text not null default 'manual' check (source in ('manual','demo','plaid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_account_household_fk
    foreign key (account_id, household_id)
    references public.accounts(id, household_id)
    on delete set null,
  unique (household_id, account_id, ticker)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  current_cents bigint not null default 0 check (current_cents >= 0),
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.planning_assumptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  current_age integer not null default 45 check (current_age between 18 and 100),
  target_retirement_age integer not null default 50 check (target_retirement_age between 19 and 100),
  emergency_fund_target_months numeric(8,2) not null default 6 check (emergency_fund_target_months between 0 and 60),
  expected_annual_return_pct numeric(9,4) not null default 6,
  target_retirement_assets_cents bigint not null default 180000000 check (target_retirement_assets_cents >= 0),
  single_stock_review_pct numeric(9,4) not null default 15,
  top_three_stock_review_pct numeric(9,4) not null default 35,
  portfolio_cash_review_pct numeric(9,4) not null default 15,
  high_interest_debt_apr_pct numeric(9,4) not null default 8,
  updated_at timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  assets_cents bigint not null,
  liabilities_cents bigint not null,
  net_worth_cents bigint not null,
  source text not null default 'calculated' check (source in ('calculated','demo','manual')),
  created_at timestamptz not null default now(),
  unique (household_id, snapshot_date)
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_date date not null,
  portfolio_value_cents bigint not null,
  portfolio_return_pct numeric(9,4),
  benchmark_return_pct numeric(9,4),
  created_at timestamptz not null default now(),
  unique (household_id, snapshot_date)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_household_id uuid references public.households(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function private.add_household_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$;

revoke all on function private.add_household_owner_membership() from public, anon, authenticated;

drop trigger if exists on_household_created_add_owner on public.households;
create trigger on_household_created_add_owner
after insert on public.households
for each row execute function private.add_household_owner_membership();

create index if not exists household_members_user_id_idx on public.household_members(user_id);
create index if not exists accounts_household_id_idx on public.accounts(household_id);
create index if not exists transactions_household_posted_idx on public.transactions(household_id, posted_at desc);
create index if not exists holdings_household_id_idx on public.holdings(household_id);
create index if not exists goals_household_id_idx on public.goals(household_id);
create index if not exists net_worth_snapshots_household_date_idx on public.net_worth_snapshots(household_id, snapshot_date desc);
create index if not exists portfolio_snapshots_household_date_idx on public.portfolio_snapshots(household_id, snapshot_date desc);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.holdings enable row level security;
alter table public.goals enable row level security;
alter table public.planning_assumptions enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.user_preferences enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "households_select_member"
on public.households for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.household_members hm
    where hm.household_id = households.id
      and hm.user_id = (select auth.uid())
  )
);

create policy "households_insert_creator"
on public.households for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "households_update_creator"
on public.households for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "households_delete_creator"
on public.households for delete to authenticated
using (created_by = (select auth.uid()));

create policy "household_members_select_own"
on public.household_members for select to authenticated
using (user_id = (select auth.uid()));

create policy "accounts_household_access"
on public.accounts for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = accounts.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = accounts.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "transactions_household_access"
on public.transactions for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = transactions.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "holdings_household_access"
on public.holdings for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = holdings.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = holdings.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "goals_household_access"
on public.goals for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = goals.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = goals.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "planning_household_access"
on public.planning_assumptions for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = planning_assumptions.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = planning_assumptions.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "net_worth_snapshots_household_access"
on public.net_worth_snapshots for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = net_worth_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = net_worth_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "portfolio_snapshots_household_access"
on public.portfolio_snapshots for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = portfolio_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = portfolio_snapshots.household_id
      and hm.user_id = (select auth.uid())
  )
);

create policy "user_preferences_own"
on public.user_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    active_household_id is null
    or exists (
      select 1 from public.household_members hm
      where hm.household_id = user_preferences.active_household_id
        and hm.user_id = (select auth.uid())
    )
  )
);

revoke all on public.profiles from anon;
revoke all on public.households from anon;
revoke all on public.household_members from anon;
revoke all on public.accounts from anon;
revoke all on public.transactions from anon;
revoke all on public.holdings from anon;
revoke all on public.goals from anon;
revoke all on public.planning_assumptions from anon;
revoke all on public.net_worth_snapshots from anon;
revoke all on public.portfolio_snapshots from anon;
revoke all on public.user_preferences from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.holdings to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.planning_assumptions to authenticated;
grant select, insert, update, delete on public.net_worth_snapshots to authenticated;
grant select, insert, update, delete on public.portfolio_snapshots to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
