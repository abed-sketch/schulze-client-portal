-- Portal-only projection. Airtable becomes authoritative once its access table is observed.
create table public.portal_access (
 airtable_access_id text primary key check (airtable_access_id ~ '^rec[A-Za-z0-9]{14}$'),
 email text not null check (email = lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role text not null check (role in ('Admin','Client')),
 airtable_client_id text references public.portal_clients(airtable_client_id) on delete cascade,
 active boolean not null default false,
 synced_at timestamptz not null default now(),
 check ((role='Admin' and airtable_client_id is null) or (role='Client' and airtable_client_id is not null))
);
create unique index portal_access_grant_idx on public.portal_access(email,role,coalesce(airtable_client_id,''));
create table public.portal_access_state (
 singleton boolean primary key default true check (singleton),
 initialized boolean not null default false,
 observed_at timestamptz not null,
 status text not null check (status in ('missing','invalid','ready')),
 airtable_table_id text check (airtable_table_id ~ '^tbl[A-Za-z0-9]{14}$'),
 synced_at timestamptz not null default now()
);
alter table public.portal_access enable row level security;
alter table public.portal_access force row level security;
alter table public.portal_access_state enable row level security;
alter table public.portal_access_state force row level security;
revoke all on public.portal_access,public.portal_access_state from public,anon,authenticated;
grant select,insert,update,delete on public.portal_access,public.portal_access_state to service_role;

create function public.portal_replace_snapshot_with_access(p_clients jsonb,p_leads jsonb,p_access jsonb,p_access_status text,p_access_table_id text,p_snapshot_started_at timestamptz)
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
 delete from public.portal_access;
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

create or replace function public.portal_read_for_identity(p_email text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off
as $$
declare
 v_admin boolean; v_initialized boolean; v_access_fresh boolean;
 v_ids text[]; v_clients jsonb; v_leads jsonb; v_name text; v_stale boolean;
begin
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 then return null; end if;
 select initialized,status='ready' and observed_at>=now()-interval '15 minutes'
 into v_initialized,v_access_fresh from public.portal_access_state where singleton;
 if coalesce(v_initialized,false) then
  select coalesce(v_access_fresh,false) and exists(select 1 from public.portal_access where email=p_email and active and role='Admin') into v_admin;
 else
  select exists(select 1 from public.portal_admins where email=p_email and active and scope='portal:admin') into v_admin;
 end if;
 select array_agg(c.airtable_client_id),
  jsonb_agg(jsonb_build_object('id',c.airtable_client_id,'clientId',c.client_id,'name',c.client_name) order by c.airtable_client_id),
  min(c.client_name),bool_or(c.synced_at<now()-interval '15 minutes')
 into v_ids,v_clients,v_name,v_stale
 from public.portal_clients c where v_admin or c.primary_contact_email=p_email or
 (coalesce(v_access_fresh,false) and exists(select 1 from public.portal_access a
  where a.email=p_email and a.active and a.role='Client' and a.airtable_client_id=c.airtable_client_id));
 if v_clients is null and not v_admin then return null; end if;
 if v_stale then return jsonb_build_object('error','stale_snapshot'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',l.airtable_lead_id,'name',l.lead_name,'contactName',l.contact_name,
  'status',l.status,'website',l.website,'notes',l.notes,'email',l.email,
  'phone',l.phone,'position',l.position,'source',l.source,
  'clientRecordId',c.airtable_client_id,'clientName',c.client_name
 ) order by c.airtable_client_id,l.airtable_lead_id),'[]'::jsonb)
 into v_leads from public.portal_leads l join public.portal_clients c on c.airtable_client_id=l.airtable_client_id
 where c.airtable_client_id=any(v_ids);
 if jsonb_array_length(v_leads)>(case when v_admin then 100000 else 10000 end) then raise exception 'portal_read_limit'; end if;
 return jsonb_build_object('mode',case when v_admin then 'admin' else 'customer' end,
  'customer',jsonb_build_object('name',case when v_admin then 'Schulze Marketing' when jsonb_array_length(v_clients)>1 then 'Meine Unternehmen' else v_name end),
  'clients',coalesce(v_clients,'[]'::jsonb),'leads',v_leads);
end;
$$;
revoke all on function public.portal_read_for_identity(text) from public,anon,authenticated;
grant execute on function public.portal_read_for_identity(text) to service_role;
