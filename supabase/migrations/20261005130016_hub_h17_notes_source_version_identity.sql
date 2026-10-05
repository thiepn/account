begin;
-- Native row versions bind actions even when displayed timestamps collide.
create or replace function private.hub_notes_attention_items(p_uid uuid)
returns table(issue_id text,dedupe_key text,title text,generation text,attention text,updated_at timestamptz,reminder_id text)
language sql stable security definer set search_path='' as $$
  select 'reminder:'||r.entity_id||':'||r.version||':'||n.version,'reminder:'||r.entity_id,
    coalesce(nullif(left(regexp_replace(n.payload->>'title','[[:cntrl:]]',' ','g'),160),''),'Notes reminder'),
    (r.payload->>'dueAt')||':'||(r.payload->>'createdAt'),
    case when a.generation=(r.payload->>'dueAt')||':'||(r.payload->>'createdAt') then coalesce(a.attention,'unread') else 'unread' end,
    greatest(r.updated_at,n.updated_at,case when a.generation=(r.payload->>'dueAt')||':'||(r.payload->>'createdAt') then a.updated_at else null end),
    r.entity_id
  from public.notes_sync_records r
  join public.notes_sync_records n on n.user_id=r.user_id and n.entity_type='note' and n.entity_id=r.payload->>'noteId'
  left join private.account_hub_notes_attention a on a.user_id=r.user_id and a.reminder_id=r.entity_id
  where r.user_id=p_uid and r.entity_type='reminder' and r.deleted_at is null and n.deleted_at is null
    and r.entity_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and r.payload->>'id'=r.entity_id and n.payload->>'id'=n.entity_id
    and r.payload->>'status'='active' and r.payload->>'completedAt' is null and r.payload->>'dismissedAt' is null
    and n.payload->>'trashedAt' is null
    and n.payload->>'type' in ('text','checklist')
    and (case when r.payload->>'dueAt' ~ '^[0-9]{1,16}$' then (r.payload->>'dueAt')::numeric between 0 and least(8640000000000000, floor(extract(epoch from statement_timestamp())*1000)) else false end)
    and (case when r.payload->>'createdAt' ~ '^[0-9]{1,16}$' then (r.payload->>'createdAt')::numeric between 0 and 8640000000000000 else false end)
    -- Fail closed if a later owner schema adds a per-note privacy/lock marker.
    and not (n.payload ?| array['locked','isLocked','encrypted','private','isPrivate']);
$$;
commit;
