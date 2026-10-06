-- Japanese currently shares canonical THIEPN Account identity and publishes a
-- privacy-minimal language dashboard, but its full learner workspace is still
-- browser-local. Keep the Account control plane truthful until a production
-- cross-device data transport is actually certified.

update public.account_apps
set description='Local-first Japanese learning with shared THIEPN Account identity and privacy-minimal language dashboard integration.',
    updated_at=now()
where slug='japanese';

update public.account_app_manifests
set manifest_version=2,
    capabilities = capabilities
      || '{"account":true,"sharedIdentity":true,"guestFirst":true,"activityTracking":true,"sync":false,"cloud_saves":false,"export_data":true,"isolatedData":true}'::jsonb,
    updated_at=now()
where app_slug='japanese';

update public.account_app_permissions
set required=false,
    mutable_by_user=false,
    active=false,
    updated_at=now()
where app_slug='japanese'
  and permission_id in ('app_data.read','app_data.write');

update public.account_app_permissions
set required=true,
    mutable_by_user=false,
    active=true,
    description='Use your canonical THIEPN Account identity to attach Japanese progress and dashboard projections to the correct account.',
    updated_at=now()
where app_slug='japanese'
  and permission_id='identity.basic';
