-- Solpient Connect V1.1 — remembered formats, reconciliation, freshness, and rollback metadata

create table if not exists public.file_import_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  format_signature text not null check (char_length(format_signature) between 16 and 128),
  file_format text not null check (file_format in ('csv','qfx','ofx')),
  record_type text not null check (record_type in ('transactions','holdings')),
  profile_name text not null default 'Remembered import',
  institution text,
  preferred_account_id uuid references public.accounts(id) on delete set null,
  account_name text,
  account_type text check (account_type is null or account_type in ('cash','investment','retirement','debt')),
  last_four text,
  column_mapping jsonb not null default '{}'::jsonb,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, format_signature)
);

create index if not exists file_import_profiles_household_idx
  on public.file_import_profiles(household_id, last_used_at desc nulls last);

alter table public.file_import_profiles enable row level security;

drop policy if exists "file_import_profiles_household_access" on public.file_import_profiles;
create policy "file_import_profiles_household_access"
on public.file_import_profiles for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = file_import_profiles.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = file_import_profiles.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.file_import_profiles from anon;
grant select, insert, update, delete on public.file_import_profiles to authenticated;

alter table public.file_import_batches
  add column if not exists profile_id uuid references public.file_import_profiles(id) on delete set null,
  add column if not exists pre_import_balance_cents bigint,
  add column if not exists statement_balance_cents bigint,
  add column if not exists post_import_balance_cents bigint,
  add column if not exists reconciliation_delta_cents bigint,
  add column if not exists anomaly_count integer not null default 0 check (anomaly_count >= 0),
  add column if not exists rollback_payload jsonb not null default '{}'::jsonb,
  add column if not exists created_account boolean not null default false,
  add column if not exists undone_at timestamptz;

alter table public.file_import_batches
  drop constraint if exists file_import_batches_status_check;

alter table public.file_import_batches
  add constraint file_import_batches_status_check
  check (status in ('imported','failed','undone'));

create index if not exists file_import_batches_profile_idx
  on public.file_import_batches(profile_id);

alter table public.accounts
  add column if not exists last_file_import_at timestamptz;
