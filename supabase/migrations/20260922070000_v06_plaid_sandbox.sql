-- Solpient Money V0.6 — Plaid Sandbox integration
-- Plaid access tokens are encrypted by the application before storage.
-- Only ciphertext is stored in the private schema.

create table if not exists public.plaid_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id text not null,
  institution_id text,
  institution_name text not null default 'Plaid Institution',
  environment text not null default 'sandbox' check (environment in ('sandbox')),
  connection_mode text not null check (connection_mode in ('banking','investments')),
  products text[] not null default '{}',
  status text not null default 'active' check (status in ('active','needs_update','error','disconnected')),
  transaction_cursor text,
  consent_expiration_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, item_id),
  unique (id, household_id)
);

create index if not exists plaid_connections_household_idx
  on public.plaid_connections(household_id);

alter table public.plaid_connections enable row level security;

create policy "plaid_connections_household_access"
on public.plaid_connections for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = plaid_connections.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = plaid_connections.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.plaid_connections from anon;
grant select, insert, update, delete on public.plaid_connections to authenticated;

alter table public.accounts
  add column if not exists source text not null default 'manual'
    check (source in ('manual','demo','plaid')),
  add column if not exists plaid_connection_id uuid references public.plaid_connections(id) on delete set null,
  add column if not exists plaid_account_id text,
  add column if not exists plaid_type text,
  add column if not exists plaid_subtype text,
  add column if not exists available_balance_cents bigint;

create unique index if not exists accounts_plaid_external_unique
  on public.accounts(plaid_connection_id, plaid_account_id)
  where plaid_connection_id is not null and plaid_account_id is not null;

create index if not exists accounts_plaid_connection_idx
  on public.accounts(plaid_connection_id);

alter table public.transactions
  add column if not exists plaid_connection_id uuid references public.plaid_connections(id) on delete set null,
  add column if not exists plaid_transaction_id text;

create unique index if not exists transactions_plaid_external_unique
  on public.transactions(plaid_connection_id, plaid_transaction_id)
  where plaid_connection_id is not null and plaid_transaction_id is not null;

create index if not exists transactions_plaid_connection_idx
  on public.transactions(plaid_connection_id);

alter table public.holdings
  add column if not exists plaid_connection_id uuid references public.plaid_connections(id) on delete set null,
  add column if not exists plaid_security_id text,
  add column if not exists plaid_account_id text;

create index if not exists holdings_plaid_connection_idx
  on public.holdings(plaid_connection_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.plaid_access_tokens (
  connection_id uuid primary key references public.plaid_connections(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.plaid_access_tokens from public, anon, authenticated;

create or replace function public.store_plaid_access_token(
  p_connection_id uuid,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_tag text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.plaid_connections pc
    join public.household_members hm on hm.household_id = pc.household_id
    where pc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  insert into private.plaid_access_tokens (
    connection_id, token_ciphertext, token_iv, token_tag, updated_at
  )
  values (
    p_connection_id, p_token_ciphertext, p_token_iv, p_token_tag, now()
  )
  on conflict (connection_id) do update
    set token_ciphertext = excluded.token_ciphertext,
        token_iv = excluded.token_iv,
        token_tag = excluded.token_tag,
        updated_at = now();
end;
$$;

create or replace function public.get_plaid_access_token(p_connection_id uuid)
returns table (
  token_ciphertext text,
  token_iv text,
  token_tag text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.plaid_connections pc
    join public.household_members hm on hm.household_id = pc.household_id
    where pc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select pat.token_ciphertext, pat.token_iv, pat.token_tag
  from private.plaid_access_tokens pat
  where pat.connection_id = p_connection_id;
end;
$$;

create or replace function public.delete_plaid_access_token(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.plaid_connections pc
    join public.household_members hm on hm.household_id = pc.household_id
    where pc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  delete from private.plaid_access_tokens
  where connection_id = p_connection_id;
end;
$$;

revoke all on function public.store_plaid_access_token(uuid,text,text,text) from public, anon;
revoke all on function public.get_plaid_access_token(uuid) from public, anon;
revoke all on function public.delete_plaid_access_token(uuid) from public, anon;

grant execute on function public.store_plaid_access_token(uuid,text,text,text) to authenticated;
grant execute on function public.get_plaid_access_token(uuid) to authenticated;
grant execute on function public.delete_plaid_access_token(uuid) to authenticated;
