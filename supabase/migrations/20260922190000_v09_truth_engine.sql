-- Solpient Money V0.9 — Financial Truth Engine
-- Derived identity, normalization, deduplication, transfer detection, and data-health metadata.
-- This migration is additive: raw imported financial records remain intact.

alter table public.accounts
  add column if not exists identity_key text,
  add column if not exists identity_confidence numeric(5,4),
  add column if not exists canonical_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists data_health_status text not null default 'unreviewed',
  add column if not exists truth_checked_at timestamptz;

alter table public.accounts
  drop constraint if exists accounts_data_health_status_check;

alter table public.accounts
  add constraint accounts_data_health_status_check
  check (data_health_status in ('unreviewed','healthy','stale','duplicate_candidate','needs_review'));

create index if not exists accounts_household_identity_idx
  on public.accounts(household_id, identity_key);

create index if not exists accounts_canonical_account_idx
  on public.accounts(canonical_account_id);

alter table public.transactions
  add column if not exists normalized_merchant text,
  add column if not exists truth_fingerprint text,
  add column if not exists duplicate_of_transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists detected_transfer boolean not null default false,
  add column if not exists transfer_group_id uuid,
  add column if not exists truth_confidence numeric(5,4),
  add column if not exists truth_checked_at timestamptz;

create index if not exists transactions_household_truth_fingerprint_idx
  on public.transactions(household_id, truth_fingerprint);

create index if not exists transactions_duplicate_of_idx
  on public.transactions(duplicate_of_transaction_id);

create index if not exists transactions_transfer_group_idx
  on public.transactions(transfer_group_id);

comment on column public.accounts.identity_key is
  'Derived stable identity hint from institution, account type, and masked account identifier/name.';

comment on column public.accounts.canonical_account_id is
  'Reviewable duplicate-account candidate link. Truth Engine never deletes or merges the source row automatically.';

comment on column public.transactions.truth_fingerprint is
  'Derived semantic fingerprint used to identify likely cross-source duplicate transactions.';

comment on column public.transactions.duplicate_of_transaction_id is
  'Reviewable duplicate link. The raw transaction remains stored and auditable.';

comment on column public.transactions.detected_transfer is
  'Derived flag for likely internal household transfers; raw transaction_type is preserved.';
