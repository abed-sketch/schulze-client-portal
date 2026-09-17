-- Only portal-owned schema changes. Client access derives from reciprocal Airtable primary contacts.
alter table public.portal_clients add column primary_contact_email text;
create index portal_clients_primary_contact_email_idx on public.portal_clients(primary_contact_email);
create table public.portal_admins (
 email text primary key check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 scope text not null default 'portal:admin' check (scope = 'portal:admin'),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.portal_admins enable row level security;
alter table public.portal_admins force row level security;
revoke all on public.portal_admins from public, anon, authenticated;
grant select, insert, update, delete on public.portal_admins to service_role;

create or replace function public.portal_replace_snapshot(
  p_clients jsonb,
  p_leads jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_deleted_clients integer := 0;
  v_deleted_leads integer := 0;
  v_client_count integer := 0;
  v_lead_count integer := 0;
begin
  if jsonb_typeof(p_clients) is distinct from 'array'
     or jsonb_typeof(p_leads) is distinct from 'array' then
    raise exception 'portal_snapshot_invalid';
  end if;

  if jsonb_array_length(p_clients) > 10000
     or jsonb_array_length(p_leads) > 100000 then
    raise exception 'portal_snapshot_too_large';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('schulze_portal_snapshot', 0));

  create temporary table _portal_snapshot_clients (
    airtable_client_id text primary key,
    client_id text,
    client_name text not null,
    primary_contact_email text,
    source_updated_at timestamptz
  ) on commit drop;

  create temporary table _portal_snapshot_leads (
    airtable_lead_id text primary key,
    airtable_client_id text not null,
    airtable_target_company_id text,
    airtable_person_id text,
    lead_name text not null,
    contact_name text,
    status text,
    website text,
    notes text,
    email text,
    phone text,
    position text,
    source text,
    source_updated_at timestamptz
  ) on commit drop;

  insert into _portal_snapshot_clients (
    airtable_client_id, client_id, client_name, primary_contact_email, source_updated_at
  )
  select
    item ->> 'airtableClientId',
    nullif(item ->> 'clientId', ''),
    item ->> 'clientName',
    nullif(item ->> 'primaryContactEmail', ''),
    nullif(item ->> 'sourceUpdatedAt', '')::timestamptz
  from jsonb_array_elements(p_clients) as source(item);

  insert into _portal_snapshot_leads (
    airtable_lead_id,
    airtable_client_id,
    airtable_target_company_id,
    airtable_person_id,
    lead_name,
    contact_name,
    status,
    website,
    notes,
    email,
    phone,
    position,
    source,
    source_updated_at
  )
  select
    item ->> 'airtableLeadId',
    item ->> 'airtableClientId',
    nullif(item ->> 'airtableTargetCompanyId', ''),
    nullif(item ->> 'airtablePersonId', ''),
    item ->> 'leadName',
    nullif(item ->> 'contactName', ''),
    nullif(item ->> 'status', ''),
    nullif(item ->> 'website', ''),
    nullif(item ->> 'notes', ''),
    nullif(item ->> 'email', ''),
    nullif(item ->> 'phone', ''),
    nullif(item ->> 'position', ''),
    nullif(item ->> 'source', ''),
    nullif(item ->> 'sourceUpdatedAt', '')::timestamptz
  from jsonb_array_elements(p_leads) as source(item);

  if exists (
    select 1
    from _portal_snapshot_clients
    where airtable_client_id !~ '^rec[A-Za-z0-9]{14}$'
       or btrim(client_name) = ''
       or length(client_name) > 10000
       or length(coalesce(client_id, '')) > 200
       or (primary_contact_email is not null and (
         primary_contact_email <> lower(btrim(primary_contact_email))
         or length(primary_contact_email) > 254
         or primary_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       ))
  ) then
    raise exception 'portal_client_snapshot_invalid';
  end if;

  if exists (
    select 1
    from _portal_snapshot_leads
    where airtable_lead_id !~ '^rec[A-Za-z0-9]{14}$'
       or airtable_client_id !~ '^rec[A-Za-z0-9]{14}$'
       or (airtable_target_company_id is not null and airtable_target_company_id !~ '^rec[A-Za-z0-9]{14}$')
       or (airtable_person_id is not null and airtable_person_id !~ '^rec[A-Za-z0-9]{14}$')
       or btrim(lead_name) = ''
       or length(lead_name) > 10000
       or length(coalesce(contact_name, '')) > 10000
       or length(coalesce(status, '')) > 10000
       or length(coalesce(website, '')) > 10000
       or length(coalesce(notes, '')) > 100000
       or length(coalesce(email, '')) > 10000
       or length(coalesce(phone, '')) > 10000
       or length(coalesce(position, '')) > 10000
       or length(coalesce(source, '')) > 10000
  ) then
    raise exception 'portal_lead_snapshot_invalid';
  end if;

  if exists (
    select 1
    from _portal_snapshot_leads l
    left join _portal_snapshot_clients c
      on c.airtable_client_id = l.airtable_client_id
    where c.airtable_client_id is null
  ) then
    raise exception 'portal_lead_client_missing';
  end if;

  insert into public.portal_clients (
    airtable_client_id, client_id, client_name, primary_contact_email, source_updated_at, synced_at
  )
  select airtable_client_id, client_id, client_name, primary_contact_email, source_updated_at, now()
  from _portal_snapshot_clients
  on conflict (airtable_client_id) do update set
    client_id = excluded.client_id,
    client_name = excluded.client_name,
    primary_contact_email = excluded.primary_contact_email,
    source_updated_at = excluded.source_updated_at,
    synced_at = now();

  insert into public.portal_leads (
    airtable_lead_id,
    airtable_client_id,
    airtable_target_company_id,
    airtable_person_id,
    lead_name,
    contact_name,
    status,
    website,
    notes,
    email,
    phone,
    position,
    source,
    source_updated_at,
    synced_at
  )
  select
    airtable_lead_id,
    airtable_client_id,
    airtable_target_company_id,
    airtable_person_id,
    lead_name,
    contact_name,
    status,
    website,
    notes,
    email,
    phone,
    position,
    source,
    source_updated_at,
    now()
  from _portal_snapshot_leads
  on conflict (airtable_lead_id) do update set
    airtable_client_id = excluded.airtable_client_id,
    airtable_target_company_id = excluded.airtable_target_company_id,
    airtable_person_id = excluded.airtable_person_id,
    lead_name = excluded.lead_name,
    contact_name = excluded.contact_name,
    status = excluded.status,
    website = excluded.website,
    notes = excluded.notes,
    email = excluded.email,
    phone = excluded.phone,
    position = excluded.position,
    source = excluded.source,
    source_updated_at = excluded.source_updated_at,
    synced_at = now();

  delete from public.portal_leads existing
  where not exists (
    select 1
    from _portal_snapshot_leads incoming
    where incoming.airtable_lead_id = existing.airtable_lead_id
  );
  get diagnostics v_deleted_leads = row_count;

  delete from public.portal_clients existing
  where not exists (
    select 1
    from _portal_snapshot_clients incoming
    where incoming.airtable_client_id = existing.airtable_client_id
  );
  get diagnostics v_deleted_clients = row_count;

  select count(*) into v_client_count from _portal_snapshot_clients;
  select count(*) into v_lead_count from _portal_snapshot_leads;

  insert into public.portal_events (kind) values ('leads_changed');

  return jsonb_build_object(
    'clients', v_client_count,
    'leads', v_lead_count,
    'deletedClients', v_deleted_clients,
    'deletedLeads', v_deleted_leads
  );
end;
$$;

revoke all on function public.portal_replace_snapshot(jsonb, jsonb) from public;
grant execute on function public.portal_replace_snapshot(jsonb, jsonb) to service_role;


-- Only the Edge Function may pass a server-verified email to this function.
-- A single statement snapshot prevents membership/data races with sync or revocation.
create or replace function public.portal_read_for_identity(p_email text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public set row_security = off
as $$
declare
 v_admin boolean;
 v_clients jsonb;
 v_leads jsonb;
 v_name text;
 v_stale boolean;
begin
 if p_email is null or p_email <> lower(btrim(p_email)) or length(p_email) > 254 then return null; end if;
 select exists(select 1 from public.portal_admins where email=p_email and active and scope='portal:admin') into v_admin;
 select jsonb_agg(jsonb_build_object('id',airtable_client_id,'clientId',client_id,'name',client_name) order by airtable_client_id),
        min(client_name), bool_or(synced_at < now() - interval '15 minutes')
 into v_clients,v_name,v_stale
 from public.portal_clients where v_admin or primary_contact_email = p_email;
 if v_clients is null and not v_admin then return null; end if;
 if v_stale then return jsonb_build_object('error','stale_snapshot'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',l.airtable_lead_id,'name',l.lead_name,'contactName',l.contact_name,
   'status',l.status,'website',l.website,'notes',l.notes,'email',l.email,
   'phone',l.phone,'position',l.position,'source',l.source,
   'clientRecordId',c.airtable_client_id,'clientName',c.client_name
 ) order by c.airtable_client_id,l.airtable_lead_id),'[]'::jsonb)
 into v_leads
 from public.portal_leads l join public.portal_clients c on c.airtable_client_id=l.airtable_client_id
 where v_admin or c.primary_contact_email=p_email;
 if jsonb_array_length(v_leads) > (case when v_admin then 100000 else 10000 end) then
   raise exception 'portal_read_limit';
 end if;
 return jsonb_build_object(
   'mode',case when v_admin then 'admin' else 'customer' end,
   'customer',jsonb_build_object('name',case when v_admin then 'Schulze Marketing' when jsonb_array_length(v_clients)>1 then 'Meine Unternehmen' else v_name end),
   'clients',coalesce(v_clients,'[]'::jsonb),'leads',v_leads
 );
end;
$$;
revoke all on function public.portal_read_for_identity(text) from public,anon,authenticated;
grant execute on function public.portal_read_for_identity(text) to service_role;
