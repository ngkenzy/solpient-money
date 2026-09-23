-- Solpient Money V1.8 — TSP Statement Import Workflow
-- Stores normalized parser output + review state only. Raw statement bytes/text
-- are intentionally not persisted.

create table if not exists public.tsp_statement_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  source_kind text not null
    check (source_kind in ('csv','structured_text','pdf','other')),
  source_filename text,
  source_content_sha256 text not null
    check (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  source_size_bytes bigint
    check (source_size_bytes is null or source_size_bytes >= 0),

  parser_version text not null,
  parsed_statement_date date,
  parsed_candidate jsonb not null default '{}'::jsonb,
  parser_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parser_warnings) = 'array'),
  parser_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parser_errors) = 'array'),

  review_statement_date date,
  review_traditional_balance_cents bigint
    check (review_traditional_balance_cents is null or review_traditional_balance_cents >= 0),
  review_roth_balance_cents bigint
    check (review_roth_balance_cents is null or review_roth_balance_cents >= 0),
  review_reported_total_balance_cents bigint
    check (review_reported_total_balance_cents is null or review_reported_total_balance_cents >= 0),
  review_outstanding_loan_cents bigint
    check (review_outstanding_loan_cents is null or review_outstanding_loan_cents >= 0),
  review_employee_contrib_ytd_cents bigint
    check (review_employee_contrib_ytd_cents is null or review_employee_contrib_ytd_cents >= 0),
  review_service_auto_ytd_cents bigint
    check (review_service_auto_ytd_cents is null or review_service_auto_ytd_cents >= 0),
  review_service_match_ytd_cents bigint
    check (review_service_match_ytd_cents is null or review_service_match_ytd_cents >= 0),
  review_funds jsonb not null default '[]'::jsonb
    check (jsonb_typeof(review_funds) = 'array'),

  balance_reconciliation_delta_cents bigint,
  fund_reconciliation_delta_cents bigint,
  review_note text,

  validation_state text not null default 'review_required'
    check (
      validation_state in (
        'invalid',
        'review_required',
        'ready',
        'confirmed',
        'rejected'
      )
    ),

  confirmed_snapshot_id uuid references public.tsp_snapshots(id) on delete set null,
  confirmed_snapshot_revision integer
    check (
      confirmed_snapshot_revision is null
      or confirmed_snapshot_revision >= 1
    ),
  confirmed_at timestamptz,

  imported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    household_id,
    source_content_sha256,
    parser_version
  )
);

create index if not exists tsp_statement_imports_household_state_idx
  on public.tsp_statement_imports(
    household_id,
    validation_state,
    imported_at desc
  );

create index if not exists tsp_statement_imports_snapshot_idx
  on public.tsp_statement_imports(confirmed_snapshot_id)
  where confirmed_snapshot_id is not null;

alter table public.tsp_statement_imports enable row level security;

drop policy if exists "tsp_statement_imports_select" on public.tsp_statement_imports;
create policy "tsp_statement_imports_select"
on public.tsp_statement_imports
for select to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = tsp_statement_imports.household_id
      and hm.user_id = (select auth.uid())
  )
);

drop policy if exists "tsp_statement_imports_insert" on public.tsp_statement_imports;
create policy "tsp_statement_imports_insert"
on public.tsp_statement_imports
for insert to authenticated
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = tsp_statement_imports.household_id
      and hm.user_id = (select auth.uid())
  )
);

drop policy if exists "tsp_statement_imports_update" on public.tsp_statement_imports;
create policy "tsp_statement_imports_update"
on public.tsp_statement_imports
for update to authenticated
using (
  validation_state <> 'confirmed'
  and exists (
    select 1
    from public.household_members hm
    where hm.household_id = tsp_statement_imports.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = tsp_statement_imports.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.tsp_statement_imports from anon;
grant select, insert, update on public.tsp_statement_imports to authenticated;

create or replace function public.prevent_confirmed_tsp_import_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.validation_state = 'confirmed' then
    raise exception 'Confirmed TSP statement imports are immutable.';
  end if;

  return new;
end;
$$;

drop trigger if exists tsp_statement_imports_confirmed_immutable
  on public.tsp_statement_imports;

create trigger tsp_statement_imports_confirmed_immutable
before update or delete
on public.tsp_statement_imports
for each row
execute function public.prevent_confirmed_tsp_import_mutation();

create or replace function public.confirm_tsp_statement_import(
  p_import_id uuid
)
returns table(snapshot_id uuid, revision integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.tsp_statement_imports%rowtype;
  v_snapshot_id uuid;
  v_revision integer;
begin
  select *
    into v_import
  from public.tsp_statement_imports tsi
  where tsi.id = p_import_id
  for update;

  if not found then
    raise exception 'TSP statement import not found.';
  end if;

  if v_import.validation_state = 'confirmed' then
    return query
    select
      v_import.confirmed_snapshot_id,
      v_import.confirmed_snapshot_revision;
    return;
  end if;

  if v_import.validation_state <> 'ready' then
    raise exception 'TSP statement import must be reviewed and ready before confirmation.';
  end if;

  if v_import.review_statement_date is null
    or v_import.review_traditional_balance_cents is null
    or v_import.review_roth_balance_cents is null
    or v_import.review_outstanding_loan_cents is null
    or v_import.review_employee_contrib_ytd_cents is null
    or v_import.review_service_auto_ytd_cents is null
    or v_import.review_service_match_ytd_cents is null then
    raise exception 'TSP statement review still has unresolved required fields.';
  end if;

  if pg_catalog.jsonb_array_length(v_import.review_funds) = 0 then
    raise exception 'TSP statement review must contain at least one fund balance.';
  end if;

  if coalesce(pg_catalog.abs(v_import.balance_reconciliation_delta_cents), 0) > 100 then
    raise exception 'TSP statement balance reconciliation exceeds $1.00.';
  end if;

  if coalesce(pg_catalog.abs(v_import.fund_reconciliation_delta_cents), 0) > 100 then
    raise exception 'TSP statement fund reconciliation exceeds $1.00.';
  end if;

  select saved.snapshot_id, saved.revision
    into v_snapshot_id, v_revision
  from public.insert_tsp_snapshot_revision(
    v_import.household_id,
    v_import.review_statement_date,
    v_import.review_traditional_balance_cents,
    v_import.review_roth_balance_cents,
    v_import.review_outstanding_loan_cents,
    v_import.review_employee_contrib_ytd_cents,
    v_import.review_service_auto_ytd_cents,
    v_import.review_service_match_ytd_cents,
    case
      when v_import.review_note is null or pg_catalog.btrim(v_import.review_note) = ''
        then 'Confirmed from TSP statement import ' || v_import.id::text
      else v_import.review_note
    end,
    v_import.review_funds::text
  ) saved;

  update public.tsp_statement_imports
  set validation_state = 'confirmed',
      confirmed_snapshot_id = v_snapshot_id,
      confirmed_snapshot_revision = v_revision,
      confirmed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_import.id;

  return query
  select v_snapshot_id, v_revision;
end;
$$;

revoke execute on function public.confirm_tsp_statement_import(uuid)
  from public, anon;
grant execute on function public.confirm_tsp_statement_import(uuid)
  to authenticated;

comment on table public.tsp_statement_imports is
  'V1.8 provenance + review state for deterministic TSP statement parsing. Raw statement content is not persisted.';
comment on function public.confirm_tsp_statement_import(uuid) is
  'Atomically confirms a reviewed TSP statement import by inserting a new immutable TSP snapshot revision.';
