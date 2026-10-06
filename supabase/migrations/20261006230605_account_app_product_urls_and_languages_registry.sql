alter table public.account_apps
  add column if not exists product_url text;

update public.account_apps
set product_url = 'https://thiepn.dev' || path
where product_url is null;

alter table public.account_apps
  alter column product_url set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_apps'::regclass
      and conname = 'account_apps_product_url_check'
  ) then
    alter table public.account_apps
      add constraint account_apps_product_url_check
      check (
        product_url = btrim(product_url)
        and product_url ~ '^https://[^/?#]+(?:/[^?#]*)?$'
      );
  end if;
end
$$;

insert into public.account_apps
  (slug, name, description, path, product_url, sort_order, active)
values
  (
    'languages',
    'Languages',
    'Shared THIEPN language-learning home with private Account-scoped dashboard access.',
    '/languages/',
    'https://languages.thiepn.dev/',
    55,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  path = excluded.path,
  product_url = excluded.product_url,
  sort_order = excluded.sort_order,
  active = excluded.active;

insert into public.account_app_manifests
  (app_slug, core_app_id, capabilities)
values
  (
    'languages',
    'languages',
    jsonb_build_object(
      'account', true,
      'guestFirst', false,
      'sync', false,
      'cloud_saves', false,
      'export_data', false,
      'isolatedData', true,
      'sharedIdentity', true,
      'activityTracking', false,
      'languageDashboard', true
    )
  )
on conflict (app_slug) do update set
  core_app_id = excluded.core_app_id,
  capabilities = excluded.capabilities,
  updated_at = now();

insert into public.account_app_permissions
  (
    app_slug,
    permission_id,
    name,
    description,
    required,
    mutable_by_user,
    sensitivity,
    sort_order,
    active
  )
values
  (
    'languages',
    'identity.basic',
    'Basic account identity',
    'Use your canonical THIEPN Account identity to load your private Languages dashboard.',
    true,
    false,
    'basic',
    10,
    true
  )
on conflict (app_slug, permission_id) do update set
  name = excluded.name,
  description = excluded.description,
  required = excluded.required,
  mutable_by_user = excluded.mutable_by_user,
  sensitivity = excluded.sensitivity,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();
