-- Solpient Connect V1.3 — Direct OFX connector

create table if not exists public.direct_ofx_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  institution_name text not null check (char_length(institution_name) between 1 and 160),
  endpoint_url text not null check (char_length(endpoint_url) between 8 and 500),
  org text,
  fid text,
  message_set text not null check (message_set in ('banking','credit_card','investment')),
  account_type text check (account_type is null or account_type in ('CHECKING','SAVINGS','MONEYMRKT','CREDITLINE','CD')),
  account_mask text,
  app_id text not null default 'SOLPIENT' check (char_length(app_id) between 1 and 32),
  app_ver text not null default '0100' check (char_length(app_ver) between 1 and 16),
  status text not null default 'active' check (status in ('active','needs_update','error','disconnected')),
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index if not exists direct_ofx_connections_household_idx
  on public.direct_ofx_connections(household_id);

alter table public.direct_ofx_connections enable row level security;

drop policy if exists "direct_ofx_connections_household_access" on public.direct_ofx_connections;
create policy "direct_ofx_connections_household_access"
on public.direct_ofx_connections for all to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = direct_ofx_connections.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = direct_ofx_connections.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.direct_ofx_connections from anon;
grant select, insert, update, delete on public.direct_ofx_connections to authenticated;

create table if not exists private.direct_ofx_secrets (
  connection_id uuid primary key references public.direct_ofx_connections(id) on delete cascade,
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.direct_ofx_secrets enable row level security;
grant usage on schema private to authenticated;
grant select, insert, update, delete on private.direct_ofx_secrets to authenticated;

drop policy if exists "direct_ofx_secrets_household_access" on private.direct_ofx_secrets;
create policy "direct_ofx_secrets_household_access"
on private.direct_ofx_secrets for all to authenticated
using (
  exists (
    select 1
    from public.direct_ofx_connections dc
    join public.household_members hm on hm.household_id = dc.household_id
    where dc.id = direct_ofx_secrets.connection_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.direct_ofx_connections dc
    join public.household_members hm on hm.household_id = dc.household_id
    where dc.id = direct_ofx_secrets.connection_id
      and hm.user_id = (select auth.uid())
  )
);

create or replace function public.store_direct_ofx_secret(
  p_connection_id uuid,
  p_secret_ciphertext text,
  p_secret_iv text,
  p_secret_tag text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.direct_ofx_connections dc
    join public.household_members hm on hm.household_id = dc.household_id
    where dc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  insert into private.direct_ofx_secrets (
    connection_id, secret_ciphertext, secret_iv, secret_tag, updated_at
  )
  values (
    p_connection_id, p_secret_ciphertext, p_secret_iv, p_secret_tag, now()
  )
  on conflict (connection_id) do update
    set secret_ciphertext = excluded.secret_ciphertext,
        secret_iv = excluded.secret_iv,
        secret_tag = excluded.secret_tag,
        updated_at = now();
end;
$$;

create or replace function public.get_direct_ofx_secret(p_connection_id uuid)
returns table (
  secret_ciphertext text,
  secret_iv text,
  secret_tag text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.direct_ofx_connections dc
    join public.household_members hm on hm.household_id = dc.household_id
    where dc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select dos.secret_ciphertext, dos.secret_iv, dos.secret_tag
  from private.direct_ofx_secrets dos
  where dos.connection_id = p_connection_id;
end;
$$;

create or replace function public.delete_direct_ofx_secret(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.direct_ofx_connections dc
    join public.household_members hm on hm.household_id = dc.household_id
    where dc.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  delete from private.direct_ofx_secrets
  where connection_id = p_connection_id;
end;
$$;

revoke all on function public.store_direct_ofx_secret(uuid,text,text,text) from public, anon;
revoke all on function public.get_direct_ofx_secret(uuid) from public, anon;
revoke all on function public.delete_direct_ofx_secret(uuid) from public, anon;

grant execute on function public.store_direct_ofx_secret(uuid,text,text,text) to authenticated;
grant execute on function public.get_direct_ofx_secret(uuid) to authenticated;
grant execute on function public.delete_direct_ofx_secret(uuid) to authenticated;

alter table public.accounts drop constraint if exists accounts_source_check;
alter table public.accounts
  add constraint accounts_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct'));

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct'));

alter table public.holdings drop constraint if exists holdings_source_check;
alter table public.holdings
  add constraint holdings_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct'));

alter table public.accounts
  add column if not exists direct_ofx_connection_id uuid references public.direct_ofx_connections(id) on delete set null;

create unique index if not exists accounts_direct_ofx_connection_unique
  on public.accounts(direct_ofx_connection_id);

alter table public.transactions
  add column if not exists direct_ofx_connection_id uuid references public.direct_ofx_connections(id) on delete set null,
  add column if not exists ofx_fitid text;

create unique index if not exists transactions_direct_ofx_external_unique
  on public.transactions(direct_ofx_connection_id, ofx_fitid);

create index if not exists transactions_direct_ofx_connection_idx
  on public.transactions(direct_ofx_connection_id);

alter table public.holdings
  add column if not exists direct_ofx_connection_id uuid references public.direct_ofx_connections(id) on delete set null,
  add column if not exists ofx_security_id text;

create unique index if not exists holdings_direct_ofx_ticker_unique
  on public.holdings(direct_ofx_connection_id, ticker);

create index if not exists holdings_direct_ofx_connection_idx
  on public.holdings(direct_ofx_connection_id);
