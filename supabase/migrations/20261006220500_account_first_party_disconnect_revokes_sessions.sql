create or replace function private.h20_native_disconnect_thiepn_app(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_changed boolean := false;
  v_revoked_sessions integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  update public.account_app_connections
  set status='disconnected',
      disconnected_at=now(),
      updated_at=now()
  where user_id=v_uid
    and app_slug=p_app_slug
    and status <> 'disconnected';

  v_changed := found;

  if v_changed then
    update public.account_app_grants
    set status='denied',
        granted_at=null,
        updated_at=now()
    where user_id=v_uid
      and app_slug=p_app_slug;
  end if;

  -- Revoke every OAuth Auth session issued specifically to this first-party
  -- app. Refresh tokens cascade from auth.sessions, while the native Account
  -- dashboard session is untouched because it has no app oauth_client_id.
  delete from auth.sessions s
  using public.account_first_party_oauth_clients c
  where s.user_id=v_uid
    and s.oauth_client_id=c.oauth_client_id
    and c.app_slug=p_app_slug;

  get diagnostics v_revoked_sessions = row_count;

  return jsonb_build_object(
    'app_slug',p_app_slug,
    'status','disconnected',
    'changed',v_changed,
    'revoked_sessions',v_revoked_sessions
  );
end;
$function$;

comment on function private.h20_native_disconnect_thiepn_app(text) is
  'Disconnects one Account app, denies its grants, and revokes only Auth sessions issued to that app''s registered first-party OAuth clients. Native Account sessions remain active.';
