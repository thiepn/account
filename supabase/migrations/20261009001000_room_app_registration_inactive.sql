-- Register Room as an INACTIVE first-party product until its public OAuth client is issued.
-- Do not issue OAuth clients from a migration or automatic CI trigger.
insert into public.account_apps (slug,name,description,path,product_url,sort_order,active,updated_at)
values ('room','Our Little Room','A private shared room for two pre-approved THIEPN Account identities.','/room/','https://room.thiepn.dev/',95,false,now())
on conflict(slug) do update set name=excluded.name,description=excluded.description,path=excluded.path,product_url=excluded.product_url,active=false,updated_at=now();

insert into public.account_app_manifests
(app_slug,manifest_version,identity_scope,data_scope,export_scope,capabilities,core_app_id,updated_at)
values('room',1,'shared','isolated','app-owned',
'{"account":true,"sharedIdentity":true,"guestFirst":false,"isolatedData":true,"cloud_saves":true,"sync":true,"export_data":true}'::jsonb,
null,now())
on conflict(app_slug) do update set
 manifest_version=excluded.manifest_version,identity_scope=excluded.identity_scope,
 data_scope=excluded.data_scope,export_scope=excluded.export_scope,
 capabilities=excluded.capabilities,core_app_id=excluded.core_app_id,updated_at=now();

insert into public.account_app_permissions
(app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active,updated_at)
values('room','identity.basic','Basic Account identity',
'Identify one of the two approved THIEPN Account members without another password, email link, or Google sign-in.',true,false,'basic',10,true,now())
on conflict(app_slug,permission_id) do update set
 name=excluded.name,description=excluded.description,required=excluded.required,
 mutable_by_user=excluded.mutable_by_user,sensitivity=excluded.sensitivity,
 sort_order=excluded.sort_order,active=excluded.active,updated_at=now();
