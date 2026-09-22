-- Solpient Connect V1.4 — OAuth/FDX framework

create table if not exists public.oauth_fdx_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider_id text not null check (char_length(provider_id) between 1 and 80),
  institution_name text not null check (char_length(institution_name) between 1 and 160),
  security_profile text not null check (security_profile in ('oauth_pkce_sandbox','fdx_fapi')),
  status text not null default 'active' check (status in ('active','needs_update','error','disconnected')),
  granted_scopes text[] not null default '{}'::text[],
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index if not exists oauth_fdx_connections_household_idx
  on public.oauth_fdx_connections(household_id);
create index if not exists oauth_fdx_connections_provider_idx
  on public.oauth_fdx_connections(provider_id);

alter table public.oauth_fdx_connections enable row level security;

drop policy if exists "oauth_fdx_connections_household_access" on public.oauth_fdx_connections;
create policy "oauth_fdx_connections_household_access"
on public.oauth_fdx_connections for all to authenticated
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = oauth_fdx_connections.household_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = oauth_fdx_connections.household_id
      and hm.user_id = (select auth.uid())
  )
);

revoke all on public.oauth_fdx_connections from anon;
grant select, insert, update, delete on public.oauth_fdx_connections to authenticated;

create table if not exists private.oauth_fdx_tokens (
  connection_id uuid primary key references public.oauth_fdx_connections(id) on delete cascade,
  access_ciphertext text not null,
  access_iv text not null,
  access_tag text not null,
  refresh_ciphertext text,
  refresh_iv text,
  refresh_tag text,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.oauth_fdx_tokens enable row level security;
grant usage on schema private to authenticated;
grant select, insert, update, delete on private.oauth_fdx_tokens to authenticated;

drop policy if exists "oauth_fdx_tokens_household_access" on private.oauth_fdx_tokens;
create policy "oauth_fdx_tokens_household_access"
on private.oauth_fdx_tokens for all to authenticated
using (
  exists (
    select 1
    from public.oauth_fdx_connections c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = oauth_fdx_tokens.connection_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.oauth_fdx_connections c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = oauth_fdx_tokens.connection_id
      and hm.user_id = (select auth.uid())
  )
);

create or replace function public.store_oauth_fdx_tokens(
  p_connection_id uuid,
  p_access_ciphertext text,
  p_access_iv text,
  p_access_tag text,
  p_refresh_ciphertext text,
  p_refresh_iv text,
  p_refresh_tag text,
  p_token_type text,
  p_expires_at timestamptz,
  p_scope text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.oauth_fdx_connections c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  insert into private.oauth_fdx_tokens (
    connection_id,
    access_ciphertext, access_iv, access_tag,
    refresh_ciphertext, refresh_iv, refresh_tag,
    token_type, expires_at, scope, updated_at
  )
  values (
    p_connection_id,
    p_access_ciphertext, p_access_iv, p_access_tag,
    p_refresh_ciphertext, p_refresh_iv, p_refresh_tag,
    coalesce(nullif(p_token_type,''),'Bearer'),
    p_expires_at, p_scope, now()
  )
  on conflict (connection_id) do update
    set access_ciphertext = excluded.access_ciphertext,
        access_iv = excluded.access_iv,
        access_tag = excluded.access_tag,
        refresh_ciphertext = excluded.refresh_ciphertext,
        refresh_iv = excluded.refresh_iv,
        refresh_tag = excluded.refresh_tag,
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        updated_at = now();
end;
$$;

create or replace function public.get_oauth_fdx_tokens(p_connection_id uuid)
returns table (
  access_ciphertext text,
  access_iv text,
  access_tag text,
  refresh_ciphertext text,
  refresh_iv text,
  refresh_tag text,
  token_type text,
  expires_at timestamptz,
  scope text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.oauth_fdx_connections c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    t.access_ciphertext, t.access_iv, t.access_tag,
    t.refresh_ciphertext, t.refresh_iv, t.refresh_tag,
    t.token_type, t.expires_at, t.scope
  from private.oauth_fdx_tokens t
  where t.connection_id = p_connection_id;
end;
$$;

create or replace function public.delete_oauth_fdx_tokens(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.oauth_fdx_connections c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = p_connection_id
      and hm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  delete from private.oauth_fdx_tokens
  where connection_id = p_connection_id;
end;
$$;

revoke all on function public.store_oauth_fdx_tokens(uuid,text,text,text,text,text,text,text,timestamptz,text) from public, anon;
revoke all on function public.get_oauth_fdx_tokens(uuid) from public, anon;
revoke all on function public.delete_oauth_fdx_tokens(uuid) from public, anon;
grant execute on function public.store_oauth_fdx_tokens(uuid,text,text,text,text,text,text,text,timestamptz,text) to authenticated;
grant execute on function public.get_oauth_fdx_tokens(uuid) to authenticated;
grant execute on function public.delete_oauth_fdx_tokens(uuid) to authenticated;

alter table public.accounts drop constraint if exists accounts_source_check;
alter table public.accounts
  add constraint accounts_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct','fdx'));

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct','fdx'));

alter table public.holdings drop constraint if exists holdings_source_check;
alter table public.holdings
  add constraint holdings_source_check
  check (source in ('manual','demo','plaid','file','ofx_direct','fdx'));

alter table public.accounts
  add column if not exists oauth_fdx_connection_id uuid references public.oauth_fdx_connections(id) on delete set null,
  add column if not exists fdx_account_id text;
create unique index if not exists accounts_oauth_fdx_external_unique
  on public.accounts(oauth_fdx_connection_id, fdx_account_id);
create index if not exists accounts_oauth_fdx_connection_idx
  on public.accounts(oauth_fdx_connection_id);

alter table public.transactions
  add column if not exists oauth_fdx_connection_id uuid references public.oauth_fdx_connections(id) on delete set null,
  add column if not exists fdx_transaction_id text;
create unique index if not exists transactions_oauth_fdx_external_unique
  on public.transactions(oauth_fdx_connection_id, fdx_transaction_id);
create index if not exists transactions_oauth_fdx_connection_idx
  on public.transactions(oauth_fdx_connection_id);

alter table public.holdings
  add column if not exists oauth_fdx_connection_id uuid references public.oauth_fdx_connections(id) on delete set null,
  add column if not exists fdx_account_id text,
  add column if not exists fdx_security_id text;
create unique index if not exists holdings_oauth_fdx_external_unique
  on public.holdings(oauth_fdx_connection_id, fdx_account_id, ticker);
create index if not exists holdings_oauth_fdx_connection_idx
  on public.holdings(oauth_fdx_connection_id);
