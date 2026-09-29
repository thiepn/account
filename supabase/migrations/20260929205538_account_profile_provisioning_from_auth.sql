create or replace function private.account_provision_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(
    trim(
      regexp_replace(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        ),
        '[[:cntrl:]]',
        '',
        'g'
      )
    ),
    ''
  );

  if v_display_name is not null then
    v_display_name := left(v_display_name, 80);
  end if;

  insert into public.account_profiles (user_id, display_name)
  values (new.id, v_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.account_provision_profile_from_auth_user() from public, anon, authenticated;

drop trigger if exists account_provision_profile_from_auth_user on auth.users;

create trigger account_provision_profile_from_auth_user
after insert on auth.users
for each row
execute function private.account_provision_profile_from_auth_user();

insert into public.account_profiles (user_id, display_name)
select
  u.id,
  left(
    nullif(
      trim(
        regexp_replace(
          coalesce(
            u.raw_user_meta_data ->> 'full_name',
            u.raw_user_meta_data ->> 'name',
            ''
          ),
          '[[:cntrl:]]',
          '',
          'g'
        )
      ),
      ''
    ),
    80
  )
from auth.users u
where not exists (
  select 1
  from public.account_profiles p
  where p.user_id = u.id
);
