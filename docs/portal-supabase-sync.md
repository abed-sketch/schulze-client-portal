# Schulze Client Portal: Supabase read model

See [realtime sync and operations](portal-realtime-sync.md) for the current event-driven deployment and verification. Historical delivery notes below describe earlier stages.

## Runtime components

| Component | Runtime ID | Purpose |
| --- | --- | --- |
| Airtable → Supabase sync | `m2Yri8eiqX2cO6DD` | Event-driven atomic snapshot from V2 Airtable; five-minute recovery schedule retained. |
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

Before the user-approved demo-data insertion below, the first live snapshot found one client and three leads, but the three target companies did not have a `Client` owner. The safe read model therefore contained one client and zero leads. Fix the missing Airtable ownership links; the next scheduled snapshot will include the leads automatically.

## Files

- `backend/n8n/logic.ts`: tested authorization and snapshot-normalization functions.
- `backend/n8n/sync.sdk.js`: scheduled sync workflow source.
- `backend/n8n/read-model.sdk.js`: Supabase-backed portal webhook source.
- `backend/n8n/admin-issuer.sdk.js`: restricted admin issuer source.
- `supabase/functions/portal-sync/index.ts`: authenticated snapshot function.
- `supabase/functions/portal-read-model/index.ts`: scoped read function.
- `supabase/migrations/20260917163142_portal_atomic_snapshot_and_restricted_access.sql`: atomic replacement and access hardening migration.

No secret values or raw portal tokens belong in this repository.

## Initial delivery verification — 2026-09-17

- Both production HTTP nodes are explicitly bound to n8n Bearer credential **Schulze Portal Supabase** (`MpEnClmtG7bhzNBS`). This credential contains the project-local integration secret, never a portal token or a frontend key.
- Sync active version: `781b92d0-99a1-42d4-8988-664c26627002`; bootstrap active version: `a92b5709-0097-4e8a-b1ed-7f724dcdf5ff`.
- Live sync execution `1169251` updated the Supabase snapshot. Read-only diagnostic `1169298` successfully read both the admin model and the current customer model using the actual integration credential.
- Current data: **APEX Test / KD118**, one client, zero safely owned portal leads. Airtable has three leads, each linked to a target without a Client owner. No ownership was guessed and no Airtable records were changed.
- Synthetic n8n tests passed for sync, customer read, admin read, and the manual admin issuer. The issuer test pinned all grant writes: no real admin grant was created.
- TypeScript check, production build, 32 unit tests, nine browser tests, and the production-header/iframe test passed. Browser coverage includes invalidation refresh, polling, revocation, team filtering, and responsive rendering.
- `anon` and `authenticated` cannot execute `portal_replace_snapshot`; private client/lead data stays behind the Edge Functions. Execution payload persistence is disabled on the portal workflows.

The initial manual **Schulze Portal · Verify delivery** workflow (`pq4a41K2rl91N1bF`) reads the two Edge Function models and source ownership only. It does not issue grants or write records. It targets the current test client; update that diagnostic input deliberately when testing a different existing customer.

## Operator handoff

1. In Airtable, assign each target to its correct Client and confirm the reciprocal Client.Target Companies relationship. Do not assume the test client owns the three existing leads. The next five-minute snapshot will publish eligible leads.
2. For team access, an authorized n8n operator opens **Schulze Portal · Issue admin access** (`q9UAc79st7JdGU1z`) and executes it manually. Copy the returned portal URL from the final node while that run is open; only its hash is retained. The grant expires after 24 hours. The workflow is intentionally inactive because it has only a manual trigger, no webhook and no permitted workflow callers.
3. Treat the URL as a credential. Share it only with the intended Schulze team member through the established private channel, never in a customer Hub. To revoke early, set that grant's `revokedAt` in `schulzePortalGrants` (`guf9ynWoJBgyN0dF`). Open pages reauthorize on invalidation, focus, and every 60 seconds while visible; a rejected grant clears displayed data.
4. New customer Hubs continue using the existing customer issuer/provisioning flow. Existing Hubs marked `Needs Migration` require a deliberate LearningSuite migration; this cutover does not rewrite them.
5. Confirm a populated real customer Hub renders in LearningSuite and repeat the isolation check with two owned customer datasets before claiming full customer acceptance. No real customer onboarding or LearningSuite account session was exercised during this delivery.

The frontend uses only the publishable Supabase key for the non-sensitive event stream. Realtime reconnects and re-fetches through the authorized n8n API; a 60-second fallback continues if realtime is unavailable. No lead payload travels through the public event channel.

## User-approved demo data and English UI — 2026-09-17

The subsequent user request explicitly authorized sample Airtable data for `it@schulzemarketing.de` and other clients. No People record existed for that email, so a labeled test owner and two test clients were added; the existing APEX Test client was retained.

| Client | Client record | Leads |
| --- | --- | --- |
| [PORTAL TEST 20260917] Schulze IT (primary contact: it@schulzemarketing.de) | `recDdrJYzfMSlJ74j` / KD119 | 3 |
| APEX Test | `rec7XEt3yxTr7K24r` / KD118 | 3 |
| [PORTAL TEST 20260917] Demo Client B | `recvvWMXIUB4HZwLE` / KD120 | 3 |

Created totals: two Clients, ten People (one test owner and nine synthetic lead contacts), nine Target Companies and nine Leads. All synthetic contacts use example.com addresses. The two new clients are Paused and have no engagements or onboardings. No outreach, LearningSuite provisioning, invitations, or grants were executed. A primary-contact email association is not a login grant: the portal still requires a client-scoped bearer link.

The seed completed in execution `1169376` after recovering from an expression error without duplicating the ten already-created People. The one-time helper `OIITX2zrnuqzwU13` was archived after success. Record IDs are preserved in `docs/portal-test-records-20260917.json` so any later cleanup can be limited to this exact fixture. Do not remove APEX Test or the three pre-existing unowned leads when cleaning up this fixture.

Sync execution `1169378` populated the read model. Live diagnostic `1169383` confirmed three clients, nine admin leads, exactly three leads for each scoped customer, and no foreign-client names or admin metadata in customer responses. The original three targets without owners remain untouched and excluded. The manual verification helper now checks this three-client demo dataset; its payload persistence is disabled again.

The portal now has a DE/EN switch. Language changes retain filters and the existing bearer session. UI text, errors, accessibility labels and known German status labels are translated; free-form customer data remains unchanged. TypeScript, build, all 32 unit tests and 12 browser tests pass, including translated-status search and arbitrary-status rendering safety.
