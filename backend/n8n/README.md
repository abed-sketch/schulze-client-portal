# Installed n8n portal backend

Installed on 2026-09-17 in Peer’s personal project. The runtime API and private issuer are now published, and FUL-V2-09 is wired to create secure portal URLs for newly created Vertriebsportal Hubs. V2 Airtable remains the source of truth; no public/shared Airtable view is consumed.

| Component | ID | State |
| --- | --- | --- |
| Read customer leads | `qpxbpg33KsqgeiP7` | Published; active version `8152ec0c-bfa7-4860-b005-05c31586fa65` |
| Issue customer access | `phBJ8osenbUnNCPb` | Published private subworkflow; only FUL-V2-09 may call it |
| FUL-V2-09 After-Close LearningSuite Provisioning | `yhHEoqYAJGEJ1g0J` | Published with secure portal grant/Hub creation flow; active version `3e371b38-79f6-4ca0-9be3-c894e77f30ae` |
| FUL-V2-01 New Client Setup | `kQMvqn0fzlEig5tZ` | Published; child payload retention disabled |
| Initialize access registry | `QvsYjwDPQP1SmjKd` | Manual-only; executed once to create the table |
| n8n Data Table `schulzePortalGrants` | `guf9ynWoJBgyN0dF` | Hashed-token registry |

No real customer onboarding, customer email, or production token-bearing end-to-end run was executed while making the portal integration changes documented here.

## API behavior

Production endpoint:

`GET https://automation.schulzemarketing.de/webhook/customer-portal/bootstrap`

Header:

`Authorization: Bearer <43-character base64url token>`

The live webhook/CORS configuration is scoped to:

`https://schulze-client-portal-production.up.railway.app`

The request rejects query selectors and nonempty bodies. SHA-256 lookup must return exactly one unexpired, unrevoked `portal:read` grant. The canonical Airtable client record comes only from that grant. Empty ID sets use `FALSE()`, and exact-ID reads are batched in groups of at most 50.

Ownership chain: Clients.Target Companies → Target Companies.Client (exactly this client) → Target Companies.Leads → Leads.Target Company (exactly its validated parent). People are reached only via authorized leads. Missing/conflicting relationships fail closed rather than returning partial data.

Explicit bounds: 500 target companies and 10,000 leads. Response-local lead IDs are used instead of exposing Airtable record IDs. HTTP 401 covers invalid requests/grants; integrity/upstream failures return sanitized 503.

Workflow privacy settings remain:

- `saveExecutionProgress=false`
- `saveManualExecutions=false`
- `saveDataErrorExecution=none`
- `saveDataSuccessExecution=none`
- `executionTimeout=60`

## Token issuance

The issuer is a private Execute Workflow Trigger with typed inputs `clientRecordId` and `expiresAt`. It validates the canonical V2 client and limits expiry to the future within 366 days.

Native Crypto parameters are explicitly verified as:

```json
{"action":"generate","encodingType":"base64","stringLength":43,"dataPropertyName":"data"}
```

The generated value is converted to base64url. Only the SHA-256 hash, canonical client record ID, expiry, revocation timestamp and `portal:read` scope are stored. The raw token is returned once to the trusted caller.

Issuer settings:

- `callerPolicy=workflowsFromAList`
- `callerIds=yhHEoqYAJGEJ1g0J`
- payload persistence disabled

Revoke a grant by setting `revokedAt` in `schulzePortalGrants`.

## FUL-V2-09 integration

For a **new** Vertriebsportal Hub, V2-09 now performs this sequence:

1. Resolve canonical Client/Engagement/Primary Contact/Product.
2. Verify LearningSuite course/template/Hub inventory.
3. Prepare and persist a Hub/grant creation checkpoint.
4. Call the private portal issuer with the canonical `clientRecordId`.
5. Use a 365-day expiry policy.
6. Validate the returned 43-character token, `grantId`, and expiry.
7. Build `https://schulze-client-portal-production.up.railway.app/?token=<token>` in memory.
8. Inject that URL into `AirtableembedAppLinkNachEmbedd` only for the LearningSuite Hub creation request.
9. Persist the resulting Hub identity plus `portalGrantId`, expiry and portal status — never the raw token.

V2-09 and V2-01 now have successful/error/manual execution payload retention disabled so the raw token is not retained by n8n execution history. The shared onboarding error workflow remains attached and sanitizes bearer-looking strings from alert text.

The preflight/variable-resolution nodes use `PENDING_SECURE_PORTAL_GRANT` only as an internal non-secret placeholder before issuance. The actual `POST /hub` request is wired to `Prepare Tokenized Hub Creation`, which supplies the generated customer URL.

### Retry behavior

If Hub/grant creation is checkpointed as already started and no verified Hub exists, automatic re-issuance is blocked. This is intentional: a raw token cannot be reconstructed from its hash, so an uncertain partial run must be reconciled/revoked before retry instead of silently generating another customer link.

### Existing Hubs

The verified LearningSuite API documentation exposes Hub create/list/access endpoints, but no documented endpoint for changing an existing Hub’s creation variables. Therefore V2-09 does **not** invent an update call. A reused Hub is checked to see whether its existing `AirtableembedAppLinkNachEmbedd` already matches the secure portal token URL format. If not, its onboarding resource state is marked `portalSetupStatus: Needs Migration` for deliberate migration.

## Railway release checks still required

The application should have these saved Railway service variables:

```env
VITE_API_BASE_URL=https://automation.schulzemarketing.de/webhook
API_ORIGIN=https://automation.schulzemarketing.de
FRAME_ANCESTORS=https://schulze.learningsuite.io
PORT=8080
```

Changing `VITE_API_BASE_URL` requires a rebuild/redeploy because Vite embeds it at build time.

Before calling the deployment fully verified, check from a normal browser/network that:

1. `/healthz` returns 200.
2. Portal CSP has `connect-src https://automation.schulzemarketing.de`.
3. Portal CSP has the real LearningSuite ancestor(s) in `frame-ancestors`.
4. The n8n OPTIONS preflight allows GET plus `Authorization` from the exact portal origin.
5. 401/503/200 responses carry the exact `Access-Control-Allow-Origin`.
6. Proxy/CDN logs redact query strings and Authorization headers.
7. Host/proxy rate limiting is configured appropriately.
8. Duplicate Authorization headers are rejected at the relevant HTTP/proxy layer.

## Suggested release test sequence

### 1. Local frontend regression

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:production
```

These use synthetic fixtures and prove frontend behavior/security assumptions, not real Airtable integration.

### 2. Railway headers

```sh
curl -i https://schulze-client-portal-production.up.railway.app/healthz
curl -I https://schulze-client-portal-production.up.railway.app/
```

Expected: health 200; CSP contains the expected API origin and LearningSuite `frame-ancestors`.

### 3. Browser preflight

```sh
curl -i -X OPTIONS 'https://automation.schulzemarketing.de/webhook/customer-portal/bootstrap' \
  -H 'Origin: https://schulze-client-portal-production.up.railway.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
```

Expected: successful preflight; exact `Access-Control-Allow-Origin`; GET allowed; Authorization allowed.

### 4. Unauthorized API checks

No bearer token:

```sh
curl -i 'https://automation.schulzemarketing.de/webhook/customer-portal/bootstrap' \
  -H 'Origin: https://schulze-client-portal-production.up.railway.app'
```

Invalid 43-character token:

```sh
curl -i 'https://automation.schulzemarketing.de/webhook/customer-portal/bootstrap' \
  -H 'Origin: https://schulze-client-portal-production.up.railway.app' \
  -H 'Authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
```

Both should fail closed with 401 and no customer data.

### 5. Authorized end-to-end test

Use an explicitly approved test/new V2 customer path rather than creating production records just for testing. Verify:

- V2-09 returns `portalSetupStatus=Ready` for a newly created Hub.
- Saved onboarding resources contain `portalGrantId` and expiry, but no raw token.
- LearningSuite Hub `AirtableembedAppLinkNachEmbedd` contains the portal URL with a 43-character token.
- Opening the Hub loads the portal inside the iframe.
- The frontend removes `?token=` from the browser URL after startup.
- The API returns only the authorized customer name/leads.
- Reloading the cleaned standalone URL does not recreate credentials.
- Revoking that grant makes the same link return 401.

For two-customer isolation, use two already-populated authorized V2 client datasets when they exist. The prior 2026-09-17 read-only inspection found 0 Leads and 0 Target Companies, so do not claim a populated isolation test until suitable data exists.

## Historical synthetic verification evidence

These are prior synthetic tests, not new live tests:

- Local suite: 24 tests passing (including nine backend tests), TypeScript check passing.
- Bootstrap success: execution `1168171`.
- Missing token `1168177`, unknown grant `1168179`, expired `1168180`, revoked `1168181`, duplicate `1168182`, browser selector `1168185`: 401 path.
- Foreign target owner `1168188`, foreign lead target `1168187`: sanitized 503 path.
- Empty customer `1168186`: success with empty leads.
- Issuer synthetic round trip `1168190`.
- Native Crypto probe `1168197`: verified 43-character native generation/conversion/hashing with registry insert pinned.

A later manual invalid-token check was started after publishing, but manual execution persistence is intentionally disabled, so there is no retained execution payload to use as fresh evidence. Verify the public HTTPS behavior with the curl/browser checks above.

## Safe maintenance notes

- Do not recreate these workflows under new IDs when updating them.
- Do not weaken issuer caller policy.
- Do not enable payload persistence on token-bearing workflows/callers.
- After any SDK/import update, read back Crypto `stringLength: 43`; the importer previously dropped it.
- Do not use the old Airtable public interface link as a portal data source.
- Do not run customer-creating/email-sending onboarding flows merely to test this portal.
