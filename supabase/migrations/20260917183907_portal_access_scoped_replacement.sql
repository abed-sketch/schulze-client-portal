-- Scope full projection replacement explicitly for the API safe-update guard.
create or replace function public.portal_replace_snapshot_with_access(p_clients jsonb,p_leads jsonb,p_access jsonb,p_access_status text,p_access_table_id text,p_snapshot_started_at timestamptz)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $$
declare v_result jsonb;
begin
 if p_access_status is null or p_access_status not in ('missing','invalid','ready')
 or jsonb_typeof(p_access) is distinct from 'array' or jsonb_array_length(p_access)>10000
 or (p_access_status<>'ready' and jsonb_array_length(p_access)<>0)
 or (p_access_status='ready' and (p_access_table_id is null or p_access_table_id !~ '^tbl[A-Za-z0-9]{14}$'))
 or (p_access_status='missing' and p_access_table_id is not null) then
  raise exception 'portal_access_snapshot_invalid';
 end if;
 -- Same lock as data replacement: permissions and data commit atomically.
 perform pg_advisory_xact_lock(hashtextextended('schulze_portal_snapshot',0));
 if p_snapshot_started_at is null or p_snapshot_started_at>clock_timestamp()+interval '1 minute'
 or p_snapshot_started_at<clock_timestamp()-interval '15 minutes' then raise exception 'portal_snapshot_timestamp_invalid'; end if;
 if exists(select 1 from public.portal_access_state where observed_at>=p_snapshot_started_at) then raise exception 'portal_snapshot_out_of_order'; end if;
 v_result:=public.portal_replace_snapshot(p_clients,p_leads);
 delete from public.portal_access where role in ('Admin','Client');
 if exists(select 1 from jsonb_array_elements(p_access) x where
   jsonb_typeof(x->'active') is distinct from 'boolean') then
   raise exception 'portal_access_active_invalid';
 end if;
 insert into public.portal_access(airtable_access_id,email,role,airtable_client_id,active)
 select x->>'airtableAccessId',x->>'email',x->>'role',nullif(x->>'clientId',''),(x->>'active')::boolean
 from jsonb_array_elements(p_access) x;
 insert into public.portal_access_state(singleton,initialized,status,airtable_table_id,synced_at,observed_at)
 values(true,p_access_status<>'missing',p_access_status,p_access_table_id,now(),p_snapshot_started_at)
 on conflict(singleton) do update set
  initialized=portal_access_state.initialized or excluded.initialized,
  status=excluded.status,airtable_table_id=excluded.airtable_table_id,synced_at=now(),observed_at=excluded.observed_at;
 return v_result || jsonb_build_object('access',jsonb_array_length(p_access),'accessStatus',p_access_status);
end;
$$;
revoke all on function public.portal_replace_snapshot_with_access(jsonb,jsonb,jsonb,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.portal_replace_snapshot_with_access(jsonb,jsonb,jsonb,text,text,timestamptz) to service_role;

