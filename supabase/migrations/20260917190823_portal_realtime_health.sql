create table public.portal_realtime_health (
 component text primary key check(component in ('hook_maintenance')),
 stage text not null,
 http_status integer,
 updated_at timestamptz not null default now()
);
alter table public.portal_realtime_health enable row level security;
alter table public.portal_realtime_health force row level security;
revoke all on public.portal_realtime_health from public,anon,authenticated;
grant select,insert,update on public.portal_realtime_health to service_role;
