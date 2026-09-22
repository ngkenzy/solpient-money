-- Solpient Connect V1.1 — cover new account foreign keys

create index if not exists file_import_batches_target_account_idx
  on public.file_import_batches(target_account_id);

create index if not exists file_import_profiles_preferred_account_idx
  on public.file_import_profiles(preferred_account_id);
