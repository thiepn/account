drop policy if exists account_app_connections_select_own on public.account_app_connections;
create policy account_app_connections_select_own
on public.account_app_connections
for select
to authenticated
using (
  (select auth.uid())=user_id
  and (
    ((select auth.jwt())->>'client_id') is null
    or public.is_thiepn_first_party_oauth_client_for_app(app_slug)
  )
);

drop policy if exists account_app_grants_select_own on public.account_app_grants;
create policy account_app_grants_select_own
on public.account_app_grants
for select
to authenticated
using (
  (select auth.uid())=user_id
  and (
    ((select auth.jwt())->>'client_id') is null
    or public.is_thiepn_first_party_oauth_client_for_app(app_slug)
  )
);

drop policy if exists account_app_permissions_select_authenticated on public.account_app_permissions;
create policy account_app_permissions_select_authenticated
on public.account_app_permissions
for select
to authenticated
using (
  active=true
  and (
    ((select auth.jwt())->>'client_id') is null
    or public.is_thiepn_first_party_oauth_client_for_app(app_slug)
  )
);
