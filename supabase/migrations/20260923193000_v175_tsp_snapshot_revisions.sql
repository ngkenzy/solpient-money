-- Solpient Money V1.7.5 — Immutable TSP Snapshot Revisions
-- Confirmed financial observations are append-only. Saving the same statement
-- date creates a new revision linked to the prior revision.

alter table public.tsp_snapshots
  add column if not exists revision integer,
  add column if not exists supersedes_id uuid
    references public.tsp_snapshots(id) on delete set null;

update public.tsp_snapshots
set revision = 1
where revision is null;

alter table public.tsp_snapshots
  alter column revision set default 1,
  alter column revision set not null;

alter table public.tsp_snapshots
  drop constraint if exists tsp_snapshots_revision_check;

alter table public.tsp_snapshots
  add constraint tsp_snapshots_revision_check
  check (revision >= 1);

alter table public.tsp_snapshots
  drop constraint if exists tsp_snapshots_household_id_snapshot_date_key;

create unique index if not exists tsp_snapshots_household_date_revision_uidx
  on public.tsp_snapshots(household_id, snapshot_date, revision);

create index if not exists tsp_snapshots_supersedes_idx
  on public.tsp_snapshots(supersedes_id)
  where supersedes_id is not null;

-- Hosted/Supabase least privilege: confirmed snapshot facts may be selected or
-- appended, but not rewritten or directly deleted by authenticated clients.
revoke update, delete on public.tsp_snapshots from authenticated;
grant select, insert on public.tsp_snapshots to authenticated;

-- Fund balances for a confirmed snapshot are append-only. The only mutable
-- fields are derived price anchors populated by the deterministic price sync.
revoke update, delete on public.tsp_fund_positions from authenticated;
grant select, insert on public.tsp_fund_positions to authenticated;
grant update (
  shares,
  snapshot_share_price,
  snapshot_price_date
) on public.tsp_fund_positions to authenticated;

comment on column public.tsp_snapshots.revision is
  'Append-only revision number for a household and snapshot_date. Revision 1 is the original observation.';
comment on column public.tsp_snapshots.supersedes_id is
  'Prior TSP snapshot revision replaced by this newer observation for the same snapshot_date.';

-- Atomic confirmed snapshot write. One RPC call is one database transaction.
-- The advisory transaction lock serializes revisions for a household/date.
-- A bounded unique-violation retry protects against legacy/direct writers that
-- bypass this function during a concurrent save.
create or replace function public.insert_tsp_snapshot_revision(
  p_household_id uuid,
  p_snapshot_date date,
  p_traditional_balance_cents bigint,
  p_roth_balance_cents bigint,
  p_outstanding_loan_cents bigint,
  p_employee_contrib_ytd_cents bigint,
  p_service_auto_ytd_cents bigint,
  p_service_match_ytd_cents bigint,
  p_note text,
  p_funds_json text
)
returns table(snapshot_id uuid, revision integer)
language plpgsql
security invoker
set search_path = ''
as $
declare
  v_previous_id uuid;
  v_previous_revision integer;
  v_snapshot_id uuid;
  v_revision integer;
  v_attempt integer := 0;
  v_constraint text;
  v_funds jsonb;
begin
  v_funds := coalesce(p_funds_json, '[]')::jsonb;

  if pg_catalog.jsonb_typeof(v_funds) <> 'array' then
    raise exception 'TSP fund payload must be a JSON array.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_household_id::text || ':' || p_snapshot_date::text,
      0
    )
  );

  loop
    v_attempt := v_attempt + 1;

    select ts.id, ts.revision
      into v_previous_id, v_previous_revision
    from public.tsp_snapshots ts
    where ts.household_id = p_household_id
      and ts.snapshot_date = p_snapshot_date
    order by ts.revision desc
    limit 1;

    v_revision := coalesce(v_previous_revision, 0) + 1;

    begin
      insert into public.tsp_snapshots (
        household_id,
        snapshot_date,
        revision,
        supersedes_id,
        traditional_balance_cents,
        roth_balance_cents,
        outstanding_loan_cents,
        employee_contrib_ytd_cents,
        service_auto_ytd_cents,
        service_match_ytd_cents,
        note
      )
      values (
        p_household_id,
        p_snapshot_date,
        v_revision,
        v_previous_id,
        p_traditional_balance_cents,
        p_roth_balance_cents,
        p_outstanding_loan_cents,
        p_employee_contrib_ytd_cents,
        p_service_auto_ytd_cents,
        p_service_match_ytd_cents,
        p_note
      )
      returning id into v_snapshot_id;

      insert into public.tsp_fund_positions (
        household_id,
        snapshot_id,
        fund_code,
        fund_name,
        balance_cents
      )
      select
        p_household_id,
        v_snapshot_id,
        pg_catalog.upper(pg_catalog.btrim(fund ->> 'fund_code')),
        pg_catalog.btrim(fund ->> 'fund_name'),
        (fund ->> 'balance_cents')::bigint
      from pg_catalog.jsonb_array_elements(v_funds) as fund
      where coalesce((fund ->> 'balance_cents')::bigint, 0) > 0;

      return query
      select v_snapshot_id, v_revision;
      return;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;

        if v_constraint <> 'tsp_snapshots_household_date_revision_uidx'
          or v_attempt >= 3 then
          raise;
        end if;

        v_previous_id := null;
        v_previous_revision := null;
    end;
  end loop;
end;
$;

revoke execute on function public.insert_tsp_snapshot_revision(
  uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,text,text
) from public, anon;

grant execute on function public.insert_tsp_snapshot_revision(
  uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,text,text
) to authenticated;

comment on function public.insert_tsp_snapshot_revision(
  uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,text,text
) is
  'V1.7.5 atomic append-only TSP snapshot revision insert with per-household/date advisory lock and bounded retry.';

