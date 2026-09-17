# Schulze Client Portal: Supabase read model

## Runtime components

| Component | Runtime ID | Purpose |
| --- | --- | --- |
| Airtable → Supabase sync | `m2Yri8eiqX2cO6DD` | Five-minute, full, fail-closed snapshot from V2 Airtable into dedicated portal tables. |
| Bearer-authorized read API | `qpxbpg33KsqgeiP7` | Validates the existing hashed portal grant, then reads Supabase instead of Airtable. |
| Customer access issuer | `phBJ8osenbUnNCPb` | Existing client-scoped `portal:read` issuer; unchanged. |
| Restricted admin issuer | `q9UAc79st7JdGU1z` | Manual-only, fixed 24-hour `portal:admin` grant. |
| Supabase project | `zwtmlrzwqnluosrdbjfv` | Private realtime read model and Edge Functions. |

Airtable remains the source of truth. Supabase contains only the portal read model. The implementation does not write back to Airtable.

## Data flow

1. The scheduled n8n workflow reads Clients, Target Companies, Leads, and People from the canonical V2 Airtable base.
2. `normalizeSnapshot` validates record IDs, field types, size limits, reciprocal Client ↔ Target Company ownership, and Target Company ↔ Lead ownership.
3. Ambiguous or unowned targets/leads are skipped. Malformed source structures fail the run before any Supabase write.
4. n8n sends one authenticated snapshot to the private `portal-sync` Edge Function.
5. `public.portal_replace_snapshot` replaces clients and leads in one PostgreSQL transaction, including deletion propagation, and emits a `leads_changed` invalidation event.
6. The public portal still presents its 43-character bearer token to the n8n webhook. n8n resolves the stored SHA-256 grant and sends only the resolved scope and canonical client ID to the private `portal-read-model` Edge Function.
7. Customer grants can read only their client. An admin grant requires both exact scope `portal:admin` and sentinel `__portal_admin__`.
8. n8n validates the complete Supabase response before returning it to the browser.

## Dedicated Supabase objects

- `public.portal_clients`
- `public.portal_leads`
- `public.portal_events`
- `public.portal_sync_secrets`
- `public.portal_replace_snapshot(jsonb, jsonb)`
- Edge Function `portal-sync`
- Edge Function `portal-read-model`

Row-level security is forced on all four tables. Client and lead rows are not directly accessible to `anon` or `authenticated`. Only the non-sensitive `portal_events` invalidation stream has a read policy. Edge Functions use the Supabase service role after checking the project-local n8n bearer against its SHA-256 hash.

## Authorization contracts

### Customer

```json
{
  "scope": "portal:read",
  "clientRecordId": "rec..."
}
```

The record ID must match Airtable's exact 17-character record ID format.

### Schulze team/admin

```json
{
  "scope": "portal:admin",
  "clientRecordId": "__portal_admin__"
}
```

The separate admin issuer has no webhook and cannot be called by another workflow. It creates an exact 24-hour grant, stores only the token digest, and returns the raw token once. Do not place admin tokens in customer Hubs. Revoke early by setting `revokedAt` in the `schulzePortalGrants` n8n Data Table.

## Source data ownership requirement

A lead is publishable only when all of these relationships agree:

```text
Client.Target Companies contains Target Company
Target Company.Client contains exactly that Client
Target Company.Leads contains Lead
Lead.Target Company contains exactly that Target Company
```

The first live snapshot found one client and three leads, but the three target companies did not have a `Client` owner. The safe read model therefore contained one client and zero leads. Fix the missing Airtable ownership links; the next scheduled snapshot will include the leads automatically.

## Files

- `backend/n8n/logic.ts`: tested authorization and snapshot-normalization functions.
- `backend/n8n/sync.sdk.js`: scheduled sync workflow source.
- `backend/n8n/read-model.sdk.js`: Supabase-backed portal webhook source.
- `backend/n8n/admin-issuer.sdk.js`: restricted admin issuer source.
- `supabase/functions/portal-sync/index.ts`: authenticated snapshot function.
- `supabase/functions/portal-read-model/index.ts`: scoped read function.
- `supabase/migrations/20260917163142_portal_atomic_snapshot_and_restricted_access.sql`: atomic replacement and access hardening migration.

No secret values or raw portal tokens belong in this repository.
