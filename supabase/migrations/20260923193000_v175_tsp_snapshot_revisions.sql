-- Solpient Money V1.7.5 — Immutable TSP Snapshot Revisions
-- Confirmed financial observations are append-only. Saving the same statement
-- date creates a new revision linked to the prior revision.

alter table public.tsp_snapshots
  add column if not exists revision integer,
  add column if not exists supersedes_id uuid
    references public.tsp_snapshots(id) on delete restrict;

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
