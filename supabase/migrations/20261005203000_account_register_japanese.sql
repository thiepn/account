insert into public.account_apps
  (slug,name,description,path,sort_order,active,updated_at)
values
  ('japanese','Japanese','Local-first Japanese learning with optional private THIEPN Account sync.','/japanese/',80,true,now())
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  path=excluded.path,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

insert into public.account_app_manifests
  (app_slug,manifest_version,identity_scope,data_scope,export_scope,capabilities,core_app_id,updated_at)
values
  (
    'japanese',1,'shared','isolated','app-owned',
    '{"sync":true,"account":true,"guestFirst":true,"cloud_saves":true,"export_data":true,"isolatedData":true,"sharedIdentity":true,"activityTracking":true}'::jsonb,
    'japanese',
    now()
  )
on conflict (app_slug) do update set
  manifest_version=excluded.manifest_version,
  identity_scope=excluded.identity_scope,
  data_scope=excluded.data_scope,
  export_scope=excluded.export_scope,
  capabilities=excluded.capabilities,
  core_app_id=excluded.core_app_id,
  updated_at=now();

insert into public.account_app_permissions
  (app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active,updated_at)
values
  ('japanese','identity.basic','Basic account identity','Use your THIEPN Account identity to keep Japanese data attached to the correct account.',true,false,'basic',10,true,now()),
  ('japanese','app_data.read','Read Japanese cloud data','Read your private Japanese learning state when synchronizing this device.',true,false,'basic',20,true,now()),
  ('japanese','app_data.write','Update Japanese cloud data','Create and update your private Japanese learning state when synchronizing this device.',true,false,'basic',30,true,now())
on conflict (app_slug,permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();
