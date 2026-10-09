-- F8B — Stage PDF Studio as INACTIVE until a production public OAuth client exists.
-- This migration never creates OAuth clients, grants, user sessions, or secrets.
insert into public.account_apps
  (slug,name,description,path,product_url,sort_order,active,updated_at)
values
  ('pdf','PDF Studio','Private, local-first PDF editing and optional reviewed AI workflow planning.',
   '/pdf/','https://thiepn.dev/pdf/',90,false,now())
on conflict(slug) do update set
  name=excluded.name,description=excluded.description,path=excluded.path,
  product_url=excluded.product_url,active=false,updated_at=now();

insert into public.account_app_manifests
  (app_slug,manifest_version,identity_scope,data_scope,export_scope,capabilities,core_app_id,updated_at)
values
  ('pdf',1,'shared','isolated','app-owned',
   '{"account":true,"sharedIdentity":true,"guestFirst":true,"offlineFirst":true,"isolatedData":true,"cloud_saves":false,"sync":false,"export_data":false,"activityTracking":false}'::jsonb,
   null,now())
on conflict(app_slug) do update set
  manifest_version=excluded.manifest_version,identity_scope=excluded.identity_scope,
  data_scope=excluded.data_scope,export_scope=excluded.export_scope,
  capabilities=excluded.capabilities,core_app_id=excluded.core_app_id,updated_at=now();

insert into public.account_app_permissions
  (app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active,updated_at)
values
  ('pdf','identity.basic','Basic Account identity',
   'Verify your THIEPN Account session before requesting an optional PDF workflow proposal. PDF files stay local.',
   true,false,'basic',10,true,now())
on conflict(app_slug,permission_id) do update set
  name=excluded.name,description=excluded.description,
  required=excluded.required,mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,sort_order=excluded.sort_order,
  active=excluded.active,updated_at=now();
