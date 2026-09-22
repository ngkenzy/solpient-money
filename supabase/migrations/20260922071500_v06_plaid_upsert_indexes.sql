create unique index if not exists accounts_plaid_external_full_unique
  on public.accounts(plaid_connection_id, plaid_account_id);

create unique index if not exists transactions_plaid_external_full_unique
  on public.transactions(plaid_connection_id, plaid_transaction_id);
