begin;
create or replace function public.authorize_thiepn_hub_notes(p_operation text, p_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_claims jsonb := auth.jwt(); v_permissions text[]; v_exp numeric;
begin
  if v_uid is null or v_claims->>'aud' is distinct from 'authenticated' or
     v_claims->>'role' is distinct from 'authenticated' or
     v_claims->>'is_anonymous'='true' or
     p_operation not in ('summary','continue','search','inbox') or p_operation is null then
    return null;
  end if;
  if not exists(select 1 from private.account_hub_clients c where c.client_id::text=v_claims->>'client_id' and c.enabled) then return null; end if;
  if not exists(select 1 from auth.users u where u.id=v_uid and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())) then return null; end if;
  -- JWT authenticity is provided by PostgREST; current state is checked here.
  if not exists(select 1 from auth.sessions s where s.user_id=v_uid and s.id::text=v_claims->>'session_id' and (s.not_after is null or s.not_after>now())) then return null; end if;
  if exists(select 1 from public.account_deletion_requests r where r.user_id=v_uid and r.status in ('pending','deleting')) then return null; end if;
  if not public.has_notes_sync_access() or not exists(select 1 from public.account_app_connections c where c.user_id=v_uid and c.app_slug='notes' and c.status='connected') or
     not exists(select 1 from public.account_app_grants g where g.user_id=v_uid and g.app_slug='notes' and g.permission_id='app_data.read' and g.status='granted') then return null; end if;
  select c.permissions into v_permissions from private.account_hub_notes_consent c where c.user_id=v_uid and c.revision=p_revision;
  if v_permissions is null or not ('notes.hub.'||p_operation||'.read'=any(v_permissions)) then return null; end if;
  if coalesce(v_claims->>'exp','') !~ '^[0-9]{1,12}$' then return null; end if;
  v_exp := (v_claims->>'exp')::numeric;
  if v_exp <= extract(epoch from now()) then return null; end if;
  if p_operation<>'inbox' then select coalesce(array_agg(p),'{}') into v_permissions from unnest(v_permissions) p where p=any(array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read']); end if;
  return jsonb_build_object('accountId',v_uid,'consumer','thiepn-hub','audience','notes-hub',
    'permissions',v_permissions,'grantRevision',p_revision,'expiresAt',v_exp*1000,
    'accountState','active','notesSyncAccess',true);
end $$;
commit;
