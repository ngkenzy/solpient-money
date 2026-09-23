-- Solpient Money V1.7.5 — Atomic TSP Snapshot Revision RPC
-- New migration: never edit the already-applied snapshot-revision migration.

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
as $$
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
$$;

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
