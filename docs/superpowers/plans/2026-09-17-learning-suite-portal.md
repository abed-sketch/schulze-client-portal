# LearningSuite client portal implementation

Use the existing Schulze LearningSuite parent token bridge protocol for a shared tokenless portal URL. Verify every bearer with the fixed LearningSuite QueryMyUser endpoint; require an enabled account and verified email. Use that server-verified email as the explicit authorization matching key (do not infer membership or admin status from LS roles or JWT claims).

Sync reciprocal Clients.Primary Contact → People.Email + People.Clients into the private Supabase portal_clients projection. Missing or ambiguous primary contacts get no email access. A contact may own multiple client records, but receives only those records. Keep legacy customer grants supported. Add the requested explicit abed@apex-consulting.ai portal:admin allowlist row in a separate private table.

Read authorization and data in a single stable SQL function snapshot. Revoke public/anon/authenticated execution and grant only service_role. Deny stale client projections after 15 minutes. Admin access is read-only and revocable by portal_admins.active.

The iframe requests a fresh parent token on initial load, focus, visibility, realtime invalidation and 60-second polling; on 401, retry one fresh token. Validate exact origin, source, version and request ID. Hold tokens only in request memory. Cancel previous requests on identity invalidation and preserve filter controls only for the same verified session. Keep DE/EN UI.

Validation: identity failures, reciprocal membership, deployed SQL scope/ACL, multi-client isolation, revoked admins, forged endpoint tokens, CORS/selectors, embedded reload and account-switch races. Deploy Edge function and sync before frontend. Final live acceptance requires the portal bridge installed in LS tenant Custom Code and actual signed-in client/admin sessions.
