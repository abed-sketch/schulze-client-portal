alter table public.portal_realtime_health add column lease_id uuid, add column lease_expires_at timestamptz;
create function public.portal_claim_hook_maintenance()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid:=gen_random_uuid(); v_rows integer;
begin
 insert into public.portal_realtime_health(component,stage) values('hook_maintenance','pending') on conflict do nothing;
 update public.portal_realtime_health set lease_id=v_id,lease_expires_at=now()+interval '5 minutes',stage='starting',http_status=null,updated_at=now()
 where component='hook_maintenance' and (lease_id is null or lease_expires_at<now());
 get diagnostics v_rows=row_count;
 return case when v_rows=1 then jsonb_build_object('run',true,'leaseId',v_id) else jsonb_build_object('run',false) end;
end; $$;
create function public.portal_finish_hook_maintenance(p_lease uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows integer;
begin
 update public.portal_realtime_health set lease_id=null,lease_expires_at=null,stage='ready',http_status=200,updated_at=now()
 where component='hook_maintenance' and lease_id=p_lease and lease_expires_at>=now();
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'invalid_maintenance_lease'; end if;
 perform public.portal_realtime_catchup();
end; $$;
revoke all on function public.portal_claim_hook_maintenance(),public.portal_finish_hook_maintenance(uuid) from public,anon,authenticated;
grant execute on function public.portal_claim_hook_maintenance(),public.portal_finish_hook_maintenance(uuid) to service_role;
