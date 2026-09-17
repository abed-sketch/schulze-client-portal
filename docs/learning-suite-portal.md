# Schulze Client Portal in LearningSuite

Shared iframe URL: `https://schulze-client-portal-production.up.railway.app/`

## Install the parent bridge

In Schulze LearningSuite tenant Custom Code, append the contents of `integrations/learningsuite-parent-bridge.js` inside a `<script>` element if the editor expects HTML. Keep the existing Welcome Form bridge. This portal bridge has its own cleanup handler and allows only the exact portal iframe origin, URL and window.

Embed the shared URL directly as an iframe, with no token or client/email query parameters. The immediate parent must run the bridge and expose LearningSuite's `authManager.getAccessToken()`. Reload the full LS page after installing the code. An embed wrapper or proxy domain must not be substituted without an explicit integration.

## Client and admin authorization

Every Airtable Clients record is synced automatically every five minutes. Access is assigned using its single **Primary Contact**, the reciprocal **People.Clients** relationship, and that person's email. The signed-in LS account must be enabled and its email verified. Normalize only case and surrounding whitespace; aliases are not guessed. A verified contact assigned to several clients receives only those clients and can filter them.

A client without a primary-contact email has no LS login access; it is still visible to admins. This intentionally includes the synthetic Demo Client B record until a real authorized contact is assigned. No unrelated Airtable contacts are modified to make a login work.

`public.portal_admins` contains the explicit `portal:admin` allowlist. `abed@apex-consulting.ai` was added as requested. This does not create or invite a LearningSuite/Supabase Auth user. Abed must sign in to LS with this verified email. Admins have read-only access to all portal clients/leads. To revoke, set `active=false` in this private table; the next authorized refresh denies admin scope (or falls back to that user's own client scope if explicitly assigned).

## Security and operations

The public `portal-session` Edge Function accepts only GET with Authorization bearer, no query selectors. It verifies the bearer with the fixed Schulze QueryMyUser endpoint. It does not decode unverified JWTs, accept browser-supplied email, or trust LS admin roles. Only enabled users with verified email continue. Authorization relies on email ownership and the explicit client/admin assignment, not an assumed LS tenant-membership claim.

The service-only `portal_read_for_identity` RPC resolves scope and data in one stable snapshot. Portal tables are private with forced RLS, and anon/authenticated cannot execute either data RPC. A sync older than 15 minutes stops LS reads until sync recovers. The separate legacy n8n bootstrap continues to validate opaque grants and read Supabase.

Tokens stay in browser request memory. No cookies or localStorage are required, and no identity token enters Airtable, n8n execution history or URLs. Supabase function logs contain no identity/token/customer values. The parent bridge must remain limited to this trusted portal URL.

Repository tests cover mocked LS iframe behavior; they do not establish that the bridge is installed in the tenant. Final acceptance: sign in as IT (three IT test leads), a distinct assigned client (only its leads), and Abed (all clients). Reload the iframe/LS page, switch account, revoke access, and confirm no prior account's data reappears. Verify the newest sync timestamp and missing-contact exceptions before handoff.

## Deployment status (2026-09-17)

- New Supabase schema and restricted admin row applied.
- Updated n8n sync published; current Airtable contact projections confirmed.
- Edge function portal-session deployed; missing/forged bearer denied, wrong origin denied, query selectors denied, preflight succeeds.
- LS tenant bridge installation and real-account iframe acceptance require a signed-in tenant settings session; not yet verified.

Validation completed: 35 unit tests and 16 browser tests; TypeScript and production build pass. Browser tests use the actual parent bridge with a mocked identity provider, including delayed old-account token acquisition and delayed old-account API responses. Live database checks confirm IT=3 leads, second assigned client=3, Abed=9 across 3 clients, unknown email denied. Rolled-back probes confirm multi-client scope=6 of 9 leads, admin revocation denied, and stale snapshot denied. Forced RLS and service-only RPC/table access verified.
