begin;
-- Isolate probes under transaction locks; ROLLBACK restores every live row.
select singleton from public.portal_realtime_queue for update;
update public.portal_realtime_queue set dirty_seq=0,completed_seq=0,lease_id=null,lease_seq=null,lease_expires_at=null,wake_hash=null,wake_expires_at=null where singleton;
delete from public.portal_airtable_hooks where table_id='tblH1iaekZP1YRh2m';
delete from public.portal_airtable_events where digest in (repeat('a',64),repeat('d',64));
do $$
declare v_id uuid; v_first uuid; v_run jsonb; v_secret_count integer;
begin
 select count(*) into v_secret_count from vault.secrets;
 perform public.portal_register_airtable_hook('achPORTALTEST00001','tblH1iaekZP1YRh2m','dGVzdCBrZXkgZm9yIHRyYW5zYWN0aW9uYWwgcHJvYmUgb25seQ==',now()+interval '7 days');
 if public.portal_airtable_hook_secret('achPORTALTEST00001') is null then raise exception 'vault retrieval failed'; end if;
 if not public.portal_enqueue_airtable_event('achPORTALTEST00001',repeat('a',64)) then raise exception 'enqueue failed'; end if;
 if public.portal_enqueue_airtable_event('achPORTALTEST00001',repeat('a',64)) then raise exception 'duplicate queued'; end if;
 if not public.portal_prepare_realtime_wake(repeat('b',64)) then raise exception 'wake failed'; end if;
 if (public.portal_claim_realtime(repeat('c',64),false)->>'run')::boolean then raise exception 'wrong proof accepted'; end if;
 v_run:=public.portal_claim_realtime(repeat('b',64),false);v_first:=(v_run->>'leaseId')::uuid;
 if v_first is null then raise exception 'claim failed'; end if;
 if (public.portal_claim_realtime(null,true)->>'run')::boolean then raise exception 'concurrent lease'; end if;
 perform public.portal_enqueue_airtable_event('achPORTALTEST00001',repeat('d',64));
 perform public.portal_complete_realtime(v_first);
 v_run:=public.portal_claim_realtime(null,true);v_id:=(v_run->>'leaseId')::uuid;
 if v_id is null then raise exception 'edit during sync lost'; end if;
 begin
  perform public.portal_complete_realtime(v_first);
  raise exception 'old lease accepted';
 exception when others then if sqlerrm<>'invalid_realtime_lease' then raise; end if; end;
 update public.portal_realtime_queue set lease_expires_at=now()-interval '1 second' where singleton;
 v_run:=public.portal_claim_realtime(null,true);
 if (v_run->>'leaseId')::uuid=v_id then raise exception 'expired lease reused'; end if;
 perform public.portal_complete_realtime((v_run->>'leaseId')::uuid);
 if (select completed_seq<>dirty_seq from public.portal_realtime_queue where singleton) then raise exception 'queue not drained'; end if;
 if has_function_privilege('anon','public.portal_airtable_hook_secret(text)','EXECUTE') or has_table_privilege('authenticated','public.portal_airtable_hooks','SELECT') then raise exception 'secret privilege leak'; end if;
end $$;
do $$
declare v_lease uuid;v_run jsonb;
begin
 update public.portal_realtime_health set lease_id=null,lease_expires_at=null where component='hook_maintenance';
 v_run:=public.portal_claim_hook_maintenance();v_lease:=(v_run->>'leaseId')::uuid;
 if v_lease is null then raise exception 'maintenance claim failed'; end if;
 if (public.portal_claim_hook_maintenance()->>'run')::boolean then raise exception 'overlapping maintenance'; end if;
 begin
  perform public.portal_finish_hook_maintenance(gen_random_uuid());
  raise exception 'wrong maintenance lease accepted';
 exception when others then if sqlerrm<>'invalid_maintenance_lease' then raise; end if; end;
 perform public.portal_finish_hook_maintenance(v_lease);
 v_run:=public.portal_claim_hook_maintenance();
 if not (v_run->>'run')::boolean then raise exception 'maintenance lease not released'; end if;
 update public.portal_realtime_health set lease_expires_at=now()-interval '1 second' where component='hook_maintenance';
 if not (public.portal_claim_hook_maintenance()->>'run')::boolean then raise exception 'expired maintenance lease not recovered'; end if;
 if has_function_privilege('anon','public.portal_claim_hook_maintenance()','EXECUTE') then raise exception 'maintenance privilege leak'; end if;
end $$;
rollback;
select 'portal realtime queue probes passed' result;
