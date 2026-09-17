-- Portal-owned webhook registry, encrypted signing keys and durable coalescing queue.
create table public.portal_airtable_hooks (
 webhook_id text primary key check(webhook_id ~ '^ach[A-Za-z0-9]+$'),
 table_id text not null unique check(table_id ~ '^tbl[A-Za-z0-9]{14}$'),
 vault_secret_id uuid not null,
 expires_at timestamptz,
 active boolean not null default true,
 last_received_at timestamptz
);
create table public.portal_realtime_queue (
 singleton boolean primary key default true check(singleton),
 dirty_seq bigint not null default 0,
 completed_seq bigint not null default 0,
 lease_id uuid,
 lease_seq bigint,
 lease_expires_at timestamptz,
 wake_hash text,
 wake_expires_at timestamptz,
 last_completed_at timestamptz
);
insert into public.portal_realtime_queue(singleton) values(true);
create table public.portal_airtable_events (
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.portal_airtable_hooks enable row level security;
alter table public.portal_airtable_hooks force row level security;
alter table public.portal_realtime_queue enable row level security;
alter table public.portal_realtime_queue force row level security;
alter table public.portal_airtable_events enable row level security;
alter table public.portal_airtable_events force row level security;
revoke all on public.portal_airtable_hooks,public.portal_realtime_queue,public.portal_airtable_events from public,anon,authenticated;
grant select,insert,update,delete on public.portal_airtable_hooks,public.portal_realtime_queue,public.portal_airtable_events to service_role;

create function public.portal_register_airtable_hook(p_id text,p_table text,p_secret text,p_expires timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_secret uuid;
begin
 if p_table not in ('tblfPwZLXgjYuFMsc','tbln087XtgwIP7HPG','tblYeDa6ZbNL5YGTb','tblf2AsiyZTb306JQ','tblH1iaekZP1YRh2m')
 or p_secret is null or length(p_secret)<32 or length(p_secret)>256 then raise exception 'invalid_portal_hook'; end if;
 -- Registration is insert-only: a retry cannot replace an existing signing secret.
 if exists(select 1 from public.portal_airtable_hooks where webhook_id=p_id and table_id=p_table) then return; end if;
 select vault.create_secret(p_secret,'schulze_portal_airtable_'||p_id) into v_secret;
 insert into public.portal_airtable_hooks(webhook_id,table_id,vault_secret_id,expires_at) values(p_id,p_table,v_secret,p_expires);
end; $$;
create function public.portal_airtable_hook_secret(p_id text)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select s.decrypted_secret from public.portal_airtable_hooks h join vault.decrypted_secrets s on s.id=h.vault_secret_id where h.webhook_id=p_id and h.active;
$$;
create function public.portal_enqueue_airtable_event(p_id text,p_digest text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows integer;
begin
 if not exists(select 1 from public.portal_airtable_hooks where webhook_id=p_id and active) then return false; end if;
 insert into public.portal_airtable_events(digest) values(p_digest) on conflict do nothing;
 get diagnostics v_rows=row_count;
 if v_rows=0 then return false; end if;
 update public.portal_realtime_queue set dirty_seq=dirty_seq+1 where singleton;
 update public.portal_airtable_hooks set last_received_at=now() where webhook_id=p_id;
 delete from public.portal_airtable_events where created_at<now()-interval '2 days';
 return true;
end; $$;
create function public.portal_prepare_realtime_wake(p_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows integer;
begin
 if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_wake'; end if;
 update public.portal_realtime_queue set wake_hash=p_hash,wake_expires_at=now()+interval '2 minutes'
 where singleton and dirty_seq>completed_seq and (lease_id is null or lease_expires_at<now());
 get diagnostics v_rows=row_count; return v_rows=1;
end; $$;
create function public.portal_claim_realtime(p_hash text,p_recovery boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.portal_realtime_queue; v_id uuid;
begin
 select * into q from public.portal_realtime_queue where singleton for update;
 if q.dirty_seq<=q.completed_seq or (q.lease_id is not null and q.lease_expires_at>=now()) then return jsonb_build_object('run',false); end if;
 if p_recovery is not true and (p_hash is null or q.wake_hash is distinct from p_hash or q.wake_expires_at<now()) then return jsonb_build_object('run',false); end if;
 v_id:=gen_random_uuid();
 update public.portal_realtime_queue set lease_id=v_id,lease_seq=dirty_seq,lease_expires_at=now()+interval '3 minutes',wake_hash=null,wake_expires_at=null where singleton;
 return jsonb_build_object('run',true,'leaseId',v_id);
end; $$;
create function public.portal_complete_realtime(p_lease uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows integer;
begin
 update public.portal_realtime_queue set completed_seq=lease_seq,lease_id=null,lease_expires_at=null,last_completed_at=now()
 where singleton and lease_id=p_lease and lease_expires_at>=now();
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'invalid_realtime_lease'; end if;
 return true;
end; $$;
revoke all on function public.portal_register_airtable_hook(text,text,text,timestamptz),public.portal_airtable_hook_secret(text),public.portal_enqueue_airtable_event(text,text),public.portal_prepare_realtime_wake(text),public.portal_claim_realtime(text,boolean),public.portal_complete_realtime(uuid) from public,anon,authenticated;
grant execute on function public.portal_register_airtable_hook(text,text,text,timestamptz),public.portal_airtable_hook_secret(text),public.portal_enqueue_airtable_event(text,text),public.portal_prepare_realtime_wake(text),public.portal_claim_realtime(text,boolean),public.portal_complete_realtime(uuid) to service_role;
