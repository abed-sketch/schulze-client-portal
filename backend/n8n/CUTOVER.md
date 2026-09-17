# Supabase portal cutover — 2026-09-17

## Actual state

Supabase project: `zwtmlrzwqnluosrdbjfv`.

| Component | ID | State |
| --- | --- | --- |
| Airtable → Supabase snapshot | `m2Yri8eiqX2cO6DD` | Saved; inactive; four Airtable reads explicitly bound to Schulze x Apex Airtable |
| Portal bootstrap | `qpxbpg33KsqgeiP7` | Saved Supabase/admin draft; published version still reads Airtable |
| Restricted admin issuer | `q9UAc79st7JdGU1z` | Saved, manual-only, no token issued during this continuation |
| Customer issuer | `phBJ8osenbUnNCPb` | Existing published issuer, unchanged |
| Frontend | PR #2 | Existing draft with Realtime invalidation and admin UI; not merged |

The three new workflow JSON files here are snapshots of the saved n8n drafts, not claims that those drafts are published. MCP sanitizes credential references from exports. Rebind the four Airtable nodes to credential `oun3u0zdIMOShiCK` (`airtableTokenApi`) after any import. Do not replace the existing live bootstrap with an imported copy; update its existing workflow ID.

## Required credential

There is no dedicated portal/Supabase credential in the n8n credential inventory. The unrelated `Bearer Auth account` must not be reused by guesswork. The n8n credentials skill requires creating missing credentials through the UI.

Create an n8n **Bearer Auth** credential named **Schulze Portal Supabase**. Its token must match the active SHA-256 digest stored under `portal_sync_secrets.name = 'n8n_portal_sync'`. This is a dedicated shared integration secret, not a Supabase publishable key and not a customer/admin access token.

If the previous raw secret is unavailable, generate a fresh random 32-byte token locally and calculate its SHA-256 digest. Put only the raw token in n8n. Supply only the digest for updating the existing Supabase secret record. Do not paste the raw token into chat, a workflow field, or this repository.

Then bind that credential to:

1. `Replace Supabase portal snapshot` in `m2Yri8eiqX2cO6DD`.
2. `Read Supabase portal model` in `qpxbpg33KsqgeiP7`.

## Release sequence

1. Bind and verify the dedicated credential and matching active hash.
2. Validate all three workflow graphs with n8n's SDK validator, then test pinned fixtures. Local tests below are not substitutes for n8n runtime validation.
3. Run the portal sync once with real Airtable reads. Writes/deletions must be confined to dedicated Supabase portal tables. Inspect the acknowledgement and source counts, including skipped ownership records. Do not create artificial customer data in production.
4. Confirm a customer read returns only that client's leads and admin read returns correctly attributed clients/leads. Verify rejection of expired, revoked and mismatched grants. Issue test grants only through the private issuers; never place an admin link in a customer Hub.
5. Publish the five-minute sync and then the saved Supabase bootstrap version. Keep the previous bootstrap active version available for rollback.
6. Complete frontend PR #2 testing and deployment; this continuation branch builds on that draft. The admin issuer stays manual-only, with callerPolicy none and fixed 24-hour expiry.
7. Test a real authorized LearningSuite iframe and confirm updates appear after the next sync (up to five minutes), followed by Realtime invalidation. This is scheduled Airtable replication, not instant Airtable event delivery.

## Security fix applied live

The existing `SECURITY DEFINER` snapshot RPC initially granted EXECUTE to `anon` and `authenticated`. Applied migration `restrict_portal_snapshot_execution` revokes PUBLIC/anon/authenticated access and explicitly grants `service_role`. Follow-up `has_function_privilege` checks confirmed false/false/true respectively. No customer or lead rows were changed.

Private portal tables have RLS enabled and no public SELECT grants. The advisor's no-policy notices are expected for these backend-only tables. Its separate warnings for the unrelated `public.rls_auto_enable()` function were left unchanged; see [Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Verification performed

`npm test`: 31 passing local tests, including seven that exercise the exact saved workflow code with synthetic data. These cover two-client ownership, ambiguous ownership exclusion, duplicate source rejection, customer/admin grant separation, expiry/revocation, and issuer restrictions. No live workflow executions or token issuance were performed.

The Edge Function files are copies of deployed version 2, preserved for review. They were not redeployed in this continuation. Their imports currently use major-version Supabase packages; pin exact versions before future function changes. Full browser/deployment validation remains pending with credential setup.
