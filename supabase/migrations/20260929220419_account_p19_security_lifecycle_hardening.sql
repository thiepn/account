create or replace function private.account_require_recent_session(
  p_max_age interval default interval '10 minutes'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session_id uuid;
  v_created_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  begin
    v_session_id := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  if v_session_id is null then
    raise exception 'reauthentication_required' using errcode='42501';
  end if;

  select s.created_at into v_created_at
  from auth.sessions s
  where s.id=v_session_id
    and s.user_id=v_uid;

  if v_created_at is null or v_created_at < now()-p_max_age then
    raise exception 'reauthentication_required' using errcode='42501';
  end if;
end;
$$;

create or replace function private.account_assert_not_deletion_pending()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  if exists (
    select 1
    from public.account_deletion_requests r
    where r.user_id=v_uid
      and r.status in ('pending','deleting')
  ) then
    raise exception 'account_deletion_pending' using errcode='55000';
  end if;
end;
$$;

revoke all on function private.account_require_recent_session(interval) from public,anon,authenticated;
revoke all on function private.account_assert_not_deletion_pending() from public,anon,authenticated;

create or replace function public.get_thiepn_account_auth_assurance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session_id uuid;
  v_created_at timestamptz;
  v_recent boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  begin
    v_session_id := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  if v_session_id is not null then
    select s.created_at into v_created_at
    from auth.sessions s
    where s.id=v_session_id
      and s.user_id=v_uid;

    v_recent := v_created_at is not null
      and v_created_at >= now()-interval '10 minutes';
  end if;

  return jsonb_build_object(
    'recent',v_recent,
    'sessionCreatedAt',v_created_at,
    'maxAgeSeconds',600
  );
end;
$$;

revoke all on function public.get_thiepn_account_auth_assurance() from public,anon;
grant execute on function public.get_thiepn_account_auth_assurance() to authenticated;

create or replace function private.account_sensitive_grant_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sensitive boolean := false;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  perform private.account_assert_not_deletion_pending();

  select p.sensitivity='sensitive'
  into v_sensitive
  from public.account_app_permissions p
  where p.app_slug=new.app_slug
    and p.permission_id=new.permission_id;

  if coalesce(v_sensitive,false)
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
     ) then
    perform private.account_require_recent_session(interval '10 minutes');
  end if;

  return new;
end;
$$;

revoke all on function private.account_sensitive_grant_guard() from public,anon,authenticated;

drop trigger if exists account_sensitive_grant_guard on public.account_app_grants;
create trigger account_sensitive_grant_guard
before insert or update of status on public.account_app_grants
for each row
execute function private.account_sensitive_grant_guard();

create or replace function private.account_connection_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    perform private.account_assert_not_deletion_pending();
  end if;
  return new;
end;
$$;

revoke all on function private.account_connection_lifecycle_guard() from public,anon,authenticated;

drop trigger if exists account_connection_lifecycle_guard on public.account_app_connections;
create trigger account_connection_lifecycle_guard
before insert or update on public.account_app_connections
for each row
execute function private.account_connection_lifecycle_guard();

create or replace function private.account_restore_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    perform private.account_assert_not_deletion_pending();
    perform private.account_require_recent_session(interval '10 minutes');
  end if;
  return new;
end;
$$;

revoke all on function private.account_restore_guard() from public,anon,authenticated;

drop trigger if exists account_restore_guard on public.account_restore_operations;
create trigger account_restore_guard
before insert on public.account_restore_operations
for each row
execute function private.account_restore_guard();

create or replace function private.account_wttn_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.deleted=true
     and (tg_op='INSERT' or old.deleted is distinct from true) then
    perform private.account_assert_not_deletion_pending();
    perform private.account_require_recent_session(interval '10 minutes');
  end if;
  return new;
end;
$$;

revoke all on function private.account_wttn_delete_guard() from public,anon,authenticated;

drop trigger if exists account_wttn_delete_guard on wttn_private.saves;
create trigger account_wttn_delete_guard
before insert or update of deleted on wttn_private.saves
for each row
execute function private.account_wttn_delete_guard();

create or replace function private.account_deletion_request_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.status='pending' then
    perform private.account_require_recent_session(interval '10 minutes');
  end if;
  return new;
end;
$$;

revoke all on function private.account_deletion_request_guard() from public,anon,authenticated;

drop trigger if exists account_deletion_request_guard on public.account_deletion_requests;
create trigger account_deletion_request_guard
before insert on public.account_deletion_requests
for each row
execute function private.account_deletion_request_guard();

drop policy if exists account_profiles_active_lifecycle_update on public.account_profiles;
create policy account_profiles_active_lifecycle_update
  on public.account_profiles
  as restrictive
  for update
  to authenticated
  using (
    not exists (
      select 1
      from public.account_deletion_requests r
      where r.user_id=(select auth.uid())
        and r.status in ('pending','deleting')
    )
  )
  with check (
    not exists (
      select 1
      from public.account_deletion_requests r
      where r.user_id=(select auth.uid())
        and r.status in ('pending','deleting')
    )
  );

create index if not exists account_app_connections_app_slug_idx
  on public.account_app_connections(app_slug);

create index if not exists account_app_deletion_operations_user_id_idx
  on public.account_app_deletion_operations(user_id);

create index if not exists account_app_deletion_plans_user_id_idx
  on public.account_app_deletion_plans(user_id);

create index if not exists account_app_grants_permission_fk_idx
  on public.account_app_grants(app_slug,permission_id);

create index if not exists account_deletion_plans_user_id_idx
  on public.account_deletion_plans(user_id);

create index if not exists account_restore_operations_app_slug_idx
  on public.account_restore_operations(app_slug);

create index if not exists account_user_apps_app_slug_idx
  on public.account_user_apps(app_slug);

comment on function private.account_require_recent_session(interval) is
  'P19 recent-auth guard: requires the JWT session_id to belong to auth.uid() and the session to have been created within the supplied window.';
comment on function public.get_thiepn_account_auth_assurance() is
  'Returns whether the current THIEPN Account session was established within the ten-minute sensitive-action window.';
