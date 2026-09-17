-- Run with service-role database tooling. Every test mutation rolls back.
begin;
set local lock_timeout='5s';
do $$
declare result jsonb; stamp timestamptz:=clock_timestamp(); failed boolean; before_state jsonb;
begin
 -- Pre-discovery fallback remains intact.
 delete from public.portal_access_state;
 if public.portal_read_for_identity('abed@apex-consulting.ai')->>'mode' is distinct from 'admin' then raise exception 'legacy fallback failed'; end if;
 result:=public.portal_replace_snapshot_with_access(
 '[{"airtableClientId":"recAAAAAAAAAAAAAA","clientName":"Access probe A","primaryContactEmail":"owner@portal-probe.invalid"},{"airtableClientId":"recBBBBBBBBBBBBBB","clientName":"Access probe B"}]',
 '[]',
 '[{"airtableAccessId":"recCCCCCCCCCCCCCC","email":"admin@portal-probe.invalid","role":"Admin","clientId":null,"active":true},{"airtableAccessId":"recDDDDDDDDDDDDDD","email":"extra@portal-probe.invalid","role":"Client","clientId":"recBBBBBBBBBBBBBB","active":true}]',
 'ready','tblAAAAAAAAAAAAAA',stamp);
 if result->>'access' is distinct from '2' then raise exception 'projection count failed'; end if;
 if public.portal_read_for_identity('admin@portal-probe.invalid')->>'mode' is distinct from 'admin' then raise exception 'admin failed'; end if;
 if jsonb_array_length(public.portal_read_for_identity('admin@portal-probe.invalid')->'clients')<>2 then raise exception 'admin scope failed'; end if;
 if public.portal_read_for_identity('owner@portal-probe.invalid')->'clients'->0->>'id' is distinct from 'recAAAAAAAAAAAAAA' then raise exception 'primary scope failed'; end if;
 if public.portal_read_for_identity('extra@portal-probe.invalid')->'clients'->0->>'id' is distinct from 'recBBBBBBBBBBBBBB' then raise exception 'explicit scope failed'; end if;
 if public.portal_read_for_identity('abed@apex-consulting.ai') is not null then raise exception 'legacy fallback after cutover'; end if;
 if public.portal_read_for_identity('unknown@portal-probe.invalid') is not null then raise exception 'unknown authorized'; end if;
 select to_jsonb(s) into before_state from public.portal_access_state s;
 foreach stamp in array array[stamp,stamp-interval '1 second'] loop
  failed:=false;
  begin
   perform public.portal_replace_snapshot_with_access('[]','[]','[]','missing',null,stamp);
  exception when others then
   if sqlerrm<>'portal_snapshot_out_of_order' then raise; end if;
   failed:=true;
  end;
  if not failed then raise exception 'out-of-order accepted'; end if;
  if (select to_jsonb(s) from public.portal_access_state s) is distinct from before_state or (select count(*) from public.portal_access)<>2 then raise exception 'rejection changed state'; end if;
 end loop;
 update public.portal_access set active=false where role='Admin';
 if public.portal_read_for_identity('admin@portal-probe.invalid') is not null then raise exception 'inactive admin authorized'; end if;
 delete from public.portal_access where role='Client';
 if public.portal_read_for_identity('extra@portal-probe.invalid') is not null then raise exception 'deleted grant authorized'; end if;
 update public.portal_access set active=true;
 update public.portal_access_state set observed_at=now()-interval '16 minutes';
 if public.portal_read_for_identity('admin@portal-probe.invalid') is not null then raise exception 'stale grant authorized'; end if;
 if public.portal_read_for_identity('owner@portal-probe.invalid') is null then raise exception 'primary access lost'; end if;
 update public.portal_access_state set status='missing',observed_at=now();
 if public.portal_read_for_identity('admin@portal-probe.invalid') is not null or public.portal_read_for_identity('abed@apex-consulting.ai') is not null then raise exception 'missing table authorized'; end if;
 update public.portal_access_state set status='invalid';
 if public.portal_read_for_identity('admin@portal-probe.invalid') is not null then raise exception 'invalid schema authorized'; end if;
 if has_table_privilege('anon','public.portal_access','SELECT') or has_table_privilege('authenticated','public.portal_access_state','SELECT')
 or has_function_privilege('authenticated','public.portal_read_for_identity(text)','EXECUTE') then raise exception 'public privilege leak'; end if;
end;
$$;
rollback;
select 'portal access rollback probes passed' as result;
