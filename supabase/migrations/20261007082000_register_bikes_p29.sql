insert into public.account_apps
  (slug,name,description,path,product_url,sort_order,active)
values
  (
    'bikes',
    'Bike Atlas',
    'Interactive bicycle learning, maintenance and build-decision workspace with optional cross-device saved-build portfolio sync.',
    '/bikes/',
    'https://thiepn.dev/bikes/',
    72,
    true
  )
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  path=excluded.path,
  product_url=excluded.product_url,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

insert into public.account_app_manifests
  (
    app_slug,
    manifest_version,
    identity_scope,
    data_scope,
    export_scope,
    core_app_id,
    capabilities
  )
values
  (
    'bikes',
    1,
    'shared',
    'isolated',
    'app-owned',
    'bikes',
    jsonb_build_object(
      'account',true,
      'guestFirst',true,
      'sharedIdentity',true,
      'sync',true,
      'cloud_saves',true,
      'offlineFirst',true,
      'export_data',true,
      'isolatedData',true,
      'activityTracking',false,
      'portfolioSync',true,
      'delete_app_data',false
    )
  )
on conflict (app_slug) do update set
  manifest_version=excluded.manifest_version,
  identity_scope=excluded.identity_scope,
  data_scope=excluded.data_scope,
  export_scope=excluded.export_scope,
  core_app_id=excluded.core_app_id,
  capabilities=excluded.capabilities,
  updated_at=now();

insert into public.account_app_permissions
  (
    app_slug,permission_id,name,description,required,mutable_by_user,
    sensitivity,sort_order,active
  )
values
  (
    'bikes',
    'identity.basic',
    'Basic account identity',
    'Use your stable THIEPN Account ID to attach Bike Atlas saved-build portfolios to the correct account.',
    true,false,'basic',10,true
  ),
  (
    'bikes',
    'app_data.read',
    'Read Bike Atlas cloud portfolio',
    'Read your own private saved-build portfolio from THIEPN Core for cross-device recovery.',
    true,false,'basic',20,true
  ),
  (
    'bikes',
    'app_data.write',
    'Update Bike Atlas cloud portfolio',
    'Create and update your own private saved-build portfolio using revision-safe cross-device sync.',
    true,false,'basic',30,true
  )
on conflict (app_slug,permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

comment on column public.account_app_manifests.core_app_id is
  'Optional link from an Account product to its THIEPN Core backend namespace. Bike Atlas P29 uses core_app_id=bikes.';
