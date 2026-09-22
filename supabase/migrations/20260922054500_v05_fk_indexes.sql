create index if not exists households_created_by_idx
  on public.households(created_by);

create index if not exists transactions_account_household_idx
  on public.transactions(account_id, household_id);

create index if not exists holdings_account_household_idx
  on public.holdings(account_id, household_id);

create index if not exists user_preferences_active_household_idx
  on public.user_preferences(active_household_id);
