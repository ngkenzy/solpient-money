-- Harden V0.6 token vault: caller privileges + RLS instead of SECURITY DEFINER.

alter table private.plaid_access_tokens enable row level security;

grant usage on schema private to authenticated;
grant select, insert, update, delete on private.plaid_access_tokens to authenticated;

create policy "plaid_tokens_household_access"
on private.plaid_access_tokens for all to authenticated
using (
  exists (
    select 1
    from public.plaid_connections pc
    join public.household_members hm on hm.household_id = pc.household_id
    where pc.id = plaid_access_tokens.connection_id
      and hm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.plaid_connections pc
    join public.household_members hm on hm.household_id = pc.household_id
    where pc.id = plaid_access_tokens.connection_id
      and hm.user_id = (select auth.uid())
  )
);

create or replace function public.store_plaid_access_token(
  p_connection_id uuid,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_tag text
)
returns void
language plpgsql
security invoker
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
security invoker
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
security invoker
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
