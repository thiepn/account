create or replace function public.ensure_thiepn_first_party_app_connection(
  p_client_id uuid,
  p_app_slug text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_created boolean := false;
  v_reconnected boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'anonymous_identity_not_supported' using errcode='42501';
  end if;
  if (((select auth.jwt())->>'client_id')) is not null then
    raise exception 'native_account_session_required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.account_first_party_oauth_clients c
    where c.oauth_client_id=p_client_id
      and c.app_slug=p_app_slug
      and c.active=true
  ) then
    raise exception 'first_party_oauth_client_unavailable' using errcode='22023';
  end if;

  select c.status into v_status
  from public.account_app_connections c
  where c.user_id=v_uid and c.app_slug=p_app_slug;

  if not found then
    perform public.connect_thiepn_app(p_app_slug);
    v_status := 'connected';
    v_created := true;
  elsif v_status in ('connected','limited') then
    update public.account_app_connections
    set last_used_at=now(),updated_at=now()
    where user_id=v_uid and app_slug=p_app_slug;
  elsif v_status='disconnected' then
    -- Official clients suppress silent authorization after a deliberate
    -- disconnect. Reaching this function again therefore represents a new
    -- explicit OAuth connection attempt from the app.
    perform public.connect_thiepn_app(p_app_slug);
    v_status := 'connected';
    v_reconnected := true;
  else
    raise exception 'first_party_app_connection_inactive' using errcode='42501';
  end if;

  return jsonb_build_object(
    'appSlug',p_app_slug,
    'status',v_status,
    'created',v_created,
    'reconnected',v_reconnected
  );
end;
$function$;

revoke all on function public.ensure_thiepn_first_party_app_connection(uuid,text) from public, anon;
grant execute on function public.ensure_thiepn_first_party_app_connection(uuid,text) to authenticated;

comment on function public.ensure_thiepn_first_party_app_connection(uuid,text) is
  'Ensures a registered first-party OAuth authorization has an active Account app connection. A previously disconnected app reconnects only after a new explicit OAuth attempt; official silent probes remain ineligible while disconnected.';
