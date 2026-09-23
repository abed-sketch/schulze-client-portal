# Schulze Client Portal in LearningSuite

Shared iframe URL: `https://schulze-client-portal-production.up.railway.app/`

## Install the parent bridge

For an LS HTML block that allows scripts in the immediate parent document, paste `integrations/learningsuite-client-portal.html`. It includes both the portal iframe and its matching bridge. If LS strips or isolates scripts, use the iframe in the content block and install the JavaScript in tenant Custom Code instead. Do not reuse the Welcome Form URL or its iframe attribute selector for this portal.

In Schulze LearningSuite tenant Custom Code, append the contents of `integrations/learningsuite-parent-bridge.js` inside a `<script>` element if the editor expects HTML. Keep the existing Welcome Form bridge. This portal bridge has its own cleanup handler and allows only the exact portal iframe origin, URL and window.

Embed the shared URL directly as an iframe, with no token or client/email query parameters. The immediate parent must run the bridge and expose LearningSuite's `authManager.getAccessToken()`. Reload the full LS page after installing the code. An embed wrapper or proxy domain must not be substituted without an explicit integration.

## Client and admin authorization

Every Airtable Clients record is synced automatically on change, with a five-minute recovery schedule. See [realtime sync](portal-realtime-sync.md). Access is assigned using its single **Primary Contact**, the reciprocal **People.Clients** relationship, and that person's email. The signed-in LS account must be enabled and its email verified. Normalize only case and surrounding whitespace; aliases are not guessed. A verified contact assigned to several clients receives only those clients and can filter them.

A client without a primary-contact email needs an explicit active Client grant in **Portal Access** to use LS login; admins can still see that client. Client grants must link exactly one company. No ownership is guessed.

Airtable **Portal Access** controls explicit Admin and additional Client grants. Personal administrator names and email addresses are intentionally not documented in this repository. Admins have read-only access to all portal clients/leads. To revoke an explicit grant, uncheck **Active** in Airtable. To downgrade an admin, set **Role=Client** and link the intended company. The next event-driven sync and authorized refresh apply that scope; independent Primary Contact access still applies.

## Security and operations

The public `portal-session` Edge Function accepts only GET with Authorization bearer, no query selectors. It verifies the bearer with the fixed Schulze QueryMyUser endpoint. It does not decode unverified JWTs, accept browser-supplied email, or trust LS admin roles. Only enabled users with verified email continue. Authorization relies on email ownership and the explicit client/admin assignment, not an assumed LS tenant-membership claim.

The service-only `portal_read_for_identity` RPC resolves scope and data in one stable snapshot. Portal tables are private with forced RLS, and anon/authenticated cannot execute either data RPC. A sync older than 15 minutes stops LS reads until sync recovers. The separate legacy n8n bootstrap continues to validate opaque grants and read Supabase.

Tokens stay in browser request memory. No cookies or localStorage are required, and no identity token enters Airtable, n8n execution history or URLs. Supabase function logs contain no identity/token/customer values. The parent bridge must remain limited to this trusted portal URL.

Repository tests cover mocked LS iframe behavior; they do not establish that the bridge is installed in the tenant. Final acceptance: sign in as a scoped test client, a distinct assigned client, and an authorized administrator. Reload the iframe/LS page, switch account, revoke access, and confirm no prior account's data reappears. Verify the newest sync timestamp and missing-contact exceptions before handoff.

## Deployment status (2026-09-17)

- New Supabase schema and restricted admin row applied.
- Updated n8n sync published; current Airtable contact projections confirmed.
- Edge function portal-session deployed; missing/forged bearer denied, wrong origin denied, query selectors denied, preflight succeeds.
- LS tenant bridge installation and real-account iframe acceptance require a signed-in tenant settings session; not yet verified.

Validation completed: 35 unit tests and 16 browser tests; TypeScript and production build pass. Browser tests use the actual parent bridge with a mocked identity provider, including delayed old-account token acquisition and delayed old-account API responses. Live database checks confirmed client isolation, administrator scope and denial for unknown identities. Rolled-back probes confirm multi-client scope=6 of 9 leads, admin revocation denied, and stale snapshot denied. Forced RLS and service-only RPC/table access verified.

## Airtable-managed access

The snapshot workflow discovers a `Portal Access` table automatically. See [the Omni prompt and access rules](portal-access-omni-prompt.md). Once that table is detected, it replaces the Supabase admin allowlist as the source of explicit Admin and additional Client grants. Primary Contact access remains automatic. Editing this table must be restricted to trusted internal administrators.
