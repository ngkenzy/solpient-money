-- Solpient Money V0.9.1 — Review & Reconcile
-- Human decisions override future Truth Engine runs. Confirmed account merges are
-- atomic and preserve source records for audit.

alter table public.accounts
  add column if not exists identity_review_status text not null default 'unreviewed',
  add column if not exists merged_at timestamptz;

alter table public.accounts
  drop constraint if exists accounts_identity_review_status_check;
alter table public.accounts
  add constraint accounts_identity_review_status_check
  check (identity_review_status in ('unreviewed','confirmed_duplicate','not_duplicate'));

alter table public.accounts
  drop constraint if exists accounts_data_health_status_check;
alter table public.accounts
  add constraint accounts_data_health_status_check
  check (data_health_status in ('unreviewed','healthy','stale','duplicate_candidate','needs_review','merged'));

alter table public.transactions
  add column if not exists duplicate_review_status text not null default 'unreviewed',
  add column if not exists transfer_review_status text not null default 'unreviewed';

alter table public.transactions
  drop constraint if exists transactions_duplicate_review_status_check;
alter table public.transactions
  add constraint transactions_duplicate_review_status_check
  check (duplicate_review_status in ('unreviewed','confirmed','rejected'));

alter table public.transactions
  drop constraint if exists transactions_transfer_review_status_check;
alter table public.transactions
  add constraint transactions_transfer_review_status_check
  check (transfer_review_status in ('unreviewed','confirmed','rejected'));

alter table public.holdings
  add column if not exists truth_suppressed boolean not null default false;

create index if not exists holdings_truth_suppressed_idx
  on public.holdings(household_id, truth_suppressed);

create table if not exists public.truth_merchant_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  match_merchant text not null check (char_length(match_merchant) between 1 and 240),
  normalized_merchant text,
  category text,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, match_merchant)
);

create index if not exists truth_merchant_rules_household_idx
  on public.truth_merchant_rules(household_id, priority, created_at);

alter table public.truth_merchant_rules enable row level security;

drop policy if exists "truth_merchant_rules_household_access" on public.truth_merchant_rules;
create policy "truth_merchant_rules_household_access"
on public.truth_merchant_rules for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = truth_merchant_rules.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = truth_merchant_rules.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.truth_merchant_rules from anon;
grant select, insert, update, delete on public.truth_merchant_rules to authenticated;

create table if not exists public.account_merge_audit (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  duplicate_account_id uuid not null references public.accounts(id) on delete restrict,
  canonical_account_id uuid not null references public.accounts(id) on delete restrict,
  moved_transaction_count integer not null default 0,
  reassigned_holding_count integer not null default 0,
  suppressed_holding_count integer not null default 0,
  duplicate_account_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_merge_audit_household_idx
  on public.account_merge_audit(household_id, created_at desc);

alter table public.account_merge_audit enable row level security;

drop policy if exists "account_merge_audit_household_access" on public.account_merge_audit;
create policy "account_merge_audit_household_access"
on public.account_merge_audit for select to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = account_merge_audit.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.account_merge_audit from anon;
grant select on public.account_merge_audit to authenticated;

create or replace function public.merge_truth_accounts(
  p_duplicate_account_id uuid,
  p_canonical_account_id uuid
)
returns table (
  moved_transactions integer,
  reassigned_holdings integer,
  suppressed_holdings integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_canonical_household_id uuid;
  v_duplicate_snapshot jsonb;
  v_moved_transactions integer := 0;
  v_reassigned_holdings integer := 0;
  v_suppressed_holdings integer := 0;
begin
  if p_duplicate_account_id = p_canonical_account_id then
    raise exception 'Duplicate and canonical account must be different.';
  end if;

  select a.household_id, to_jsonb(a)
    into v_household_id, v_duplicate_snapshot
  from public.accounts a
  where a.id = p_duplicate_account_id
    and a.is_active = true
  for update;

  if v_household_id is null then
    raise exception 'Duplicate account was not found or is already inactive.';
  end if;

  select a.household_id
    into v_canonical_household_id
  from public.accounts a
  where a.id = p_canonical_account_id
    and a.is_active = true
  for update;

  if v_canonical_household_id is null then
    raise exception 'Canonical account was not found or is inactive.';
  end if;

  if v_household_id <> v_canonical_household_id then
    raise exception 'Accounts belong to different households.';
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = v_household_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update public.transactions
  set account_id = p_canonical_account_id,
      updated_at = now()
  where household_id = v_household_id
    and account_id = p_duplicate_account_id;
  get diagnostics v_moved_transactions = row_count;

  update public.holdings duplicate_holding
  set truth_suppressed = true,
      updated_at = now()
  where duplicate_holding.household_id = v_household_id
    and duplicate_holding.account_id = p_duplicate_account_id
    and exists (
      select 1
      from public.holdings canonical_holding
      where canonical_holding.household_id = v_household_id
        and canonical_holding.account_id = p_canonical_account_id
        and upper(canonical_holding.ticker) = upper(duplicate_holding.ticker)
        and canonical_holding.truth_suppressed = false
    );
  get diagnostics v_suppressed_holdings = row_count;

  update public.holdings
  set account_id = p_canonical_account_id,
      updated_at = now()
  where household_id = v_household_id
    and account_id = p_duplicate_account_id
    and truth_suppressed = false;
  get diagnostics v_reassigned_holdings = row_count;

  update public.accounts
  set is_active = false,
      canonical_account_id = p_canonical_account_id,
      identity_review_status = 'confirmed_duplicate',
      data_health_status = 'merged',
      merged_at = now(),
      updated_at = now()
  where id = p_duplicate_account_id
    and household_id = v_household_id;

  update public.accounts
  set identity_review_status =
        case when identity_review_status = 'confirmed_duplicate'
          then 'unreviewed'
          else identity_review_status
        end,
      updated_at = now()
  where id = p_canonical_account_id
    and household_id = v_household_id;

  insert into public.account_merge_audit (
    household_id,
    duplicate_account_id,
    canonical_account_id,
    moved_transaction_count,
    reassigned_holding_count,
    suppressed_holding_count,
    duplicate_account_snapshot
  )
  values (
    v_household_id,
    p_duplicate_account_id,
    p_canonical_account_id,
    v_moved_transactions,
    v_reassigned_holdings,
    v_suppressed_holdings,
    coalesce(v_duplicate_snapshot, '{}'::jsonb)
  );

  return query
  select v_moved_transactions, v_reassigned_holdings, v_suppressed_holdings;
end;
$$;

revoke all on function public.merge_truth_accounts(uuid,uuid) from public, anon;
grant execute on function public.merge_truth_accounts(uuid,uuid) to authenticated;
