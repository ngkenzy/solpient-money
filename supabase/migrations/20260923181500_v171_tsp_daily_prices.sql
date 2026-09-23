-- Solpient Money V1.7.1 — TSP Daily Share Price Sync
-- Official TSP daily prices remain separate from participant-entered official balances.

alter table public.tsp_fund_positions
  add column if not exists shares numeric(24,8),
  add column if not exists snapshot_share_price numeric(24,8),
  add column if not exists snapshot_price_date date;

create table if not exists public.tsp_fund_prices (
  id uuid primary key default gen_random_uuid(),
  price_date date not null,
  fund_code text not null,
  fund_name text not null,
  share_price numeric(24,8) not null
    check (share_price > 0),
  source_kind text not null default 'official_tsp_csv'
    check (source_kind in ('official_tsp_csv')),
  source_url text not null,
  fetched_at timestamptz not null default now(),
  unique (price_date, fund_code)
);

create index if not exists tsp_fund_prices_date_idx
  on public.tsp_fund_prices(price_date desc, fund_code);

alter table public.tsp_fund_prices enable row level security;

drop policy if exists "tsp_fund_prices_authenticated_read"
  on public.tsp_fund_prices;

create policy "tsp_fund_prices_authenticated_read"
on public.tsp_fund_prices for select to authenticated
using (true);

drop policy if exists "tsp_fund_prices_authenticated_write"
  on public.tsp_fund_prices;

create policy "tsp_fund_prices_authenticated_write"
on public.tsp_fund_prices for all to authenticated
using (true)
with check (true);

revoke all on public.tsp_fund_prices from anon;
grant select, insert, update, delete on public.tsp_fund_prices to authenticated;

comment on table public.tsp_fund_prices is
  'V1.7.1 cached daily official TSP share prices. Market data only; never an authoritative participant account balance.';
comment on column public.tsp_fund_positions.shares is
  'Inferred TSP shares from participant snapshot balance divided by the official share price on or before the snapshot date.';
