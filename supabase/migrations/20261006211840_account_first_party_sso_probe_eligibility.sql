create or replace function public.resolve_thiepn_first_party_sso_probe(
  p_client_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'clientId',c.oauth_client_id,
    'appSlug',c.app_slug,
    'origin',substring(c.client_uri from '^(https://[^/]+)'),
    'eligible',
      case
        when (select auth.uid()) is null then true
        when not exists (
          select 1
          from public.account_app_connections ac
          where ac.user_id=(select auth.uid())
            and ac.app_slug=c.app_slug
        ) then true
        when exists (
          select 1
          from public.account_app_connections ac
          where ac.user_id=(select auth.uid())
            and ac.app_slug=c.app_slug
            and ac.status in ('connected','limited')
        ) then true
        else false
      end
  )
  from public.account_first_party_oauth_clients c
  join public.account_apps a on a.slug=c.app_slug and a.active=true
  where c.oauth_client_id=p_client_id
    and c.active=true
    and c.automatic_identity_consent=true
    and substring(c.client_uri from '^(https://[^/]+)') is not null
  limit 1;
$function$;

revoke all on function public.resolve_thiepn_first_party_sso_probe(uuid) from public;
grant execute on function public.resolve_thiepn_first_party_sso_probe(uuid) to anon, authenticated;
