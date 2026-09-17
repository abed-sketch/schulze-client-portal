create function public.portal_retire_missing_hook(p_id text,p_table text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_secret uuid;
begin
 delete from public.portal_airtable_hooks where webhook_id=p_id and table_id=p_table returning vault_secret_id into v_secret;
 if v_secret is not null then delete from vault.secrets where id=v_secret; end if;
end; $$;
create function public.portal_realtime_catchup()
returns void language sql security definer set search_path=pg_catalog,public as $$
 update public.portal_realtime_queue set dirty_seq=dirty_seq+1 where singleton;
$$;
revoke all on function public.portal_retire_missing_hook(text,text),public.portal_realtime_catchup() from public,anon,authenticated;
grant execute on function public.portal_retire_missing_hook(text,text),public.portal_realtime_catchup() to service_role;
