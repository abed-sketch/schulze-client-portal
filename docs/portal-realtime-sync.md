# Portal realtime sync

Deployed 2026-09-17 in the Schulze Marketing n8n project and its dedicated Supabase project.

## Runtime

| Component | ID | Function |
| --- | --- | --- |
| Realtime worker | `cSzoSJipggwtcrEf` | Claims queued signed notifications and executes the existing atomic snapshot |
| Webhook maintenance | `6n4b3cTXePK0vU2p` | Registers/renews five portal hooks every 12 hours; repairs missing/expired hooks and re-enables notifications |
| Snapshot | `m2Yri8eiqX2cO6DD` | Full snapshot, called by the worker; five-minute recovery schedule retained |
| Signed receiver | `portal-airtable-events` | Supabase Edge Function; Airtable HMAC verification and private integration routes |

Airtable Clients, Target Companies, Leads, People and Portal Access changes enqueue a durable sync immediately. The worker coalesces rapid edits, holds a three-minute lease, and acknowledges only a confirmed snapshot. Edits arriving during a run remain pending for another pass. A one-minute recovery trigger retries queued work if the immediate wake fails. The existing five-minute full snapshot recovers missed notifications.

The browser already subscribes to Supabase's non-sensitive invalidation signal and reauthorizes through its normal API. It also refreshes every 60 seconds while visible and on focus. This is near realtime, not zero-latency or a guaranteed delivery SLA. No lead data or access tokens are broadcast publicly. This sync is one-way: Airtable remains authoritative; editing a Supabase projection directly may be overwritten by the next snapshot.

## Security and deployment

- Apply the four `20260917*_portal_realtime_*` / `portal_hook_maintenance_lease` migrations in timestamp order. The registry, dedup queue, health state and lease RPCs are service-only with forced RLS.
- Deploy both files under `supabase/functions/portal-airtable-events`, with entrypoint `index.ts`. `verify_jwt=false` is intentional: `/notify` verifies the exact raw-body Airtable HMAC, base, hook ID and timestamp; private routes verify the existing n8n integration bearer against its stored SHA-256 digest.
- The Airtable native credential requires `webhook:manage`, `data.records:read`, `schema.bases:read` and Creator access to the base. Existing approved write operations use the existing write scope.
- Use the dedicated Airtable and Schulze Portal Supabase n8n credentials; never place their values in Code nodes, source files or browser configuration.
- Create the worker, bind credentials, apply `backend/n8n/realtime.settings.json`, and add its ID to the snapshot caller allowlist before publishing. Update IDs deliberately if installing into another instance.
- Create maintenance and apply its privacy settings **before the first run**: success/error retention `none`, manual retention `false`, execution progress `false`, timeout 120 seconds. MAC keys pass directly from the native Airtable HTTP response to Supabase Vault. They cannot be retrieved again from Airtable.
- Maintenance claims an exclusive five-minute database lease before reading registries. Its enforced 120-second timeout is shorter than the lease. One-item batches persist each signing key before processing another table. Do not increase this timeout beyond the lease or bypass the claim.
- The worker timeout is 170 seconds, shorter than its 180-second queue lease. The snapshot timeout is 120 seconds.
- Run maintenance once, verify five registry rows, and publish its 12-hour schedule. It renews all five hooks, re-enables delivery and queues a catch-up snapshot. Expired or disabled hooks are deleted only when their IDs and exact portal URL/table match the private registry, then replaced. Unrecognized/orphan hooks fail closed for operator review.

Official API contracts: [webhooks overview](https://airtable.com/developers/web/api/webhooks-overview), [specification](https://airtable.com/developers/web/api/model/webhooks-specification), [refresh](https://airtable.com/developers/web/api/refresh-a-webhook). Notifications contain invalidation metadata; the full snapshot rereads current source data. Payload cursor consumption is not used.

## Operator checks

These read-only SQL queries contain no signing keys or bearer tokens:

```sql
select table_id, webhook_id, expires_at, last_received_at
from public.portal_airtable_hooks;
select dirty_seq, completed_seq, lease_expires_at, last_completed_at
from public.portal_realtime_queue;
select component, stage, http_status, updated_at, lease_expires_at
from public.portal_realtime_health;
```

Normally the queue drains (`dirty_seq = completed_seq`), maintenance reports `ready`, and all five expirations are in the future. Run maintenance manually to repair failed notification delivery; run the existing snapshot manually to recover portal reads. A failed maintenance lease expires automatically. An orphan hook after an ambiguous create/Vault network failure needs operator comparison of the private registry and exact portal URL/table before deleting that one orphan; never delete unrelated hooks. The five-minute snapshot continues during this repair.

Portal Access is authoritative for explicit grants after its first successful discovery. Admin needs `Role=Admin`, checked `Active`, and no Client link. Client needs `Role=Client`, checked `Active`, and one valid Client link. Primary Contact access remains automatic. A Client row without a linked company grants nothing; no ownership is guessed. Legacy opaque bearer-link grants remain separately controlled by their n8n grant registry.

Explicit administrator access is managed in Airtable Portal Access. Personal administrator names and email addresses are intentionally not documented in this repository.

## Verification

- Five remote hooks confirmed enabled with notifications enabled; all five successfully renewed in one serialized execution (`1169982`).
- Real Airtable synthetic access row → signed notification → queued n8n snapshot → Supabase authorization tested, without manual sync.
- Inactivation: request started `19:16:08.315Z`, notification received `19:16:10.716Z`, queue completed `19:16:17.496Z`; access was denied (~9 seconds).
- Admin → Client downgrade: request started `19:18:51.339Z`, notification received `19:18:54.327Z`, queue completed `19:19:02.906Z`; scope was exactly one client and three leads (~12 seconds).
- Synthetic `portal-realtime-probe@example.com` record removed; its projection disappeared and the temporary write action was removed. No unrelated production records were modified.
- Transactional SQL probes passed for deduplication, proof rejection, concurrent/expired leases, edits during a running snapshot, stale acknowledgements and private grants. Every SQL probe rolled back.
- 44 unit tests, TypeScript check and production build passed. HMAC tampering, wrong base, stale/future notification timestamps, untrusted recovery flags, expired/missing/orphan hook plans and failed-snapshot acknowledgement are covered.
- Browser reauthorization uses the existing tested implementation. A real signed-in LearningSuite session was not available for this backend verification; confirm the open iframe refreshes in the tenant during acceptance.
