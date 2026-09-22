-- Solpient Connect V1 — file import provenance and deduplication

create table if not exists public.file_import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target_account_id uuid references public.accounts(id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 240),
  file_format text not null check (file_format in ('csv','qfx','ofx')),
  record_type text not null check (record_type in ('transactions','holdings')),
  file_digest text not null check (char_length(file_digest) between 16 and 128),
  total_records integer not null default 0 check (total_records >= 0),
  imported_records integer not null default 0 check (imported_records >= 0),
  duplicate_records integer not null default 0 check (duplicate_records >= 0),
  status text not null default 'imported' check (status in ('imported','failed')),
  created_at timestamptz not null default now()
);

create index if not exists file_import_batches_household_idx
  on public.file_import_batches(household_id, created_at desc);

alter table public.file_import_batches enable row level security;

drop policy if exists "file_import_batches_household_access" on public.file_import_batches;
create policy "file_import_batches_household_access"
on public.file_import_batches for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = file_import_batches.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = file_import_batches.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.file_import_batches from anon;
grant select, insert, update, delete on public.file_import_batches to authenticated;

alter table public.accounts drop constraint if exists accounts_source_check;
alter table public.accounts
  add constraint accounts_source_check check (source in ('manual','demo','plaid','file'));

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('manual','demo','plaid','file'));

alter table public.holdings drop constraint if exists holdings_source_check;
alter table public.holdings
  add constraint holdings_source_check check (source in ('manual','demo','plaid','file'));

alter table public.transactions
  add column if not exists import_batch_id uuid references public.file_import_batches(id) on delete set null,
  add column if not exists import_fingerprint text;

create unique index if not exists transactions_file_fingerprint_unique
  on public.transactions(household_id, account_id, import_fingerprint)
  where source = 'file' and account_id is not null and import_fingerprint is not null;

create index if not exists transactions_import_batch_idx
  on public.transactions(import_batch_id);

alter table public.holdings
  add column if not exists import_batch_id uuid references public.file_import_batches(id) on delete set null,
  add column if not exists import_fingerprint text;

create index if not exists holdings_import_batch_idx
  on public.holdings(import_batch_id);
