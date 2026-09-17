-- Atomic Airtable -> Supabase portal read-model replacement.
-- The portal tables and realtime event table were introduced by the preceding
-- create_portal_realtime_read_model and add_portal_realtime_invalidation_events
-- migrations in Supabase project zwtmlrzwqnluosrdbjfv.

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
    airtable_client_id, client_id, client_name, source_updated_at
  )
  select
    item ->> 'airtableClientId',
    nullif(item ->> 'clientId', ''),
    item ->> 'clientName',
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
    airtable_client_id, client_id, client_name, source_updated_at, synced_at
  )
  select airtable_client_id, client_id, client_name, source_updated_at, now()
  from _portal_snapshot_clients
  on conflict (airtable_client_id) do update set
    client_id = excluded.client_id,
    client_name = excluded.client_name,
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

alter table public.portal_clients enable row level security;
alter table public.portal_clients force row level security;
alter table public.portal_leads enable row level security;
alter table public.portal_leads force row level security;
alter table public.portal_sync_secrets enable row level security;
alter table public.portal_sync_secrets force row level security;
alter table public.portal_events enable row level security;
alter table public.portal_events force row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'portal_clients',
        'portal_leads',
        'portal_sync_secrets',
        'portal_events'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy portal_events_read
on public.portal_events
for select
to anon, authenticated
using (kind = 'leads_changed');

revoke all on table public.portal_clients from public, anon, authenticated;
revoke all on table public.portal_leads from public, anon, authenticated;
revoke all on table public.portal_sync_secrets from public, anon, authenticated;
revoke all on table public.portal_events from public, anon, authenticated;

grant select, insert, update, delete on table public.portal_clients to service_role;
grant select, insert, update, delete on table public.portal_leads to service_role;
grant select on table public.portal_sync_secrets to service_role;
grant select, insert, delete on table public.portal_events to service_role;
grant usage, select on sequence public.portal_events_id_seq to service_role;
grant select on table public.portal_events to anon, authenticated;
