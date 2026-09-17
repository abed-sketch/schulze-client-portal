# Installed n8n portal backend

Installed on 2026-09-17 in Peer’s personal project. **Both runtime workflows remain inactive.** They retrieve V2 Airtable records through native Airtable nodes; no shared-view URL is consumed.

| Component | ID | State |
| --- | --- | --- |
| Read customer leads | `qpxbpg33KsqgeiP7` | Installed, tested with synthetic records, inactive |
| Issue customer access | `phBJ8osenbUnNCPb` | Installed, private subworkflow, callers disabled |
| Initialize access registry | `QvsYjwDPQP1SmjKd` | Manual-only, executed once to create the empty table |
| n8n Data Table `schulzePortalGrants` | `guf9ynWoJBgyN0dF` | Created, no grants issued |

## API behavior

After activation: `GET https://automation.schulzemarketing.de/webhook/customer-portal/bootstrap` with `Authorization: Bearer <token>`. Frontend `VITE_API_BASE_URL` becomes `https://automation.schulzemarketing.de/webhook`.

The request rejects query selectors and nonempty bodies. SHA-256 lookup must return exactly one unexpired, unrevoked `portal:read` grant. A canonical Airtable record ID is taken only from that grant. All searches use validated exact record IDs. Empty ID sets use `FALSE()`, never an unfiltered search.

Ownership chain: Clients.Target Companies → Target Companies.Client (exactly this client) → Target Companies.Leads → Leads.Target Company (exactly its validated parent). People are reached only via authorized leads. No linked person returns null contact fields; multiple linked people reject the response. Missing requested records, conflicting relationships, and malformed data fail the whole response without partial disclosure.

Native searches fetch all pages for each batch of at most 50 exact IDs. Explicit bounds: 500 target companies and 10,000 leads. The final response excludes Airtable record IDs, raw grants, credentials, and unrelated fields. Lead IDs are response-local keys, not identifiers for write operations. HTTP 401 covers invalid grants/requests; 503 covers data-integrity or upstream failures.

## Token issuance

The issuer is a private Execute Workflow Trigger, with typed inputs `clientRecordId` and `expiresAt`. It requires one input, an existing canonical client, and expiry in the future within 366 days. It generates 43 cryptographically random base64 characters and converts them to URL-safe form. SHA-256 hashes, client record IDs, expiry, revocation and scope are stored; raw tokens are returned once to the trusted caller.

Return: `{ token, expiresAt, grantId }`. A caller constructs `https://<portal-domain>/?token=<token>`. Choose the expiry explicitly in provisioning; no expiry policy has been silently applied to customers. Every issuance creates a new grant. Retries must be handled deliberately by provisioning; raw tokens cannot be recovered from stored hashes.

Revoke via the n8n Data Table by setting `revokedAt` to a timestamp. Existing grants can coexist until revoked or expired. The API rejects duplicate hashes rather than choosing the first match.

## Deployment and activation gate

1. Deploy the frontend and obtain the actual HTTPS portal origin. The API currently permits only the deliberate nonproduction sentinel `https://portal-not-configured.invalid`. Server-side requests without Origin still require valid authorization.
2. Replace the origin in the webhook `allowedOrigins`, `Validate portal request`, and the three response nodes’ `Access-Control-Allow-Origin`. Verify OPTIONS allows GET and Authorization, and check CORS on both success/error responses from the actual frontend. Do not assume n8n’s automatic preflight is sufficient without this browser test.
3. Configure host/proxy rate limits and redact URL queries and Authorization headers. Reject duplicate Authorization headers at the proxy; the workflow rejects arrays/comma-joined values but cannot reconstruct duplicates discarded by the HTTP server.
4. Set the frontend’s LearningSuite frame ancestors using the actual Hub origin. Set `API_ORIGIN=https://automation.schulzemarketing.de`.
5. Wire the issuer into V2-09 only after removing token-bearing execution payload retention from V2-09 and its callers/error handlers. V2-09 currently saves error payloads. Set issuer `callerPolicy=workflowsFromAList` with only the verified trusted provisioning workflow ID. It currently uses `none` deliberately.
6. Replace both `appcode` assignments in V2-09 (`Validate LearningSuite Preflight` and `Resolve After-Close Hub Variables`) with the provisioned portal URL. Reconcile existing Hubs separately; template edits do not guarantee existing Hub variables change.
7. Configure a sanitized workflow failure handler/monitoring path that cannot send raw tokens or customer data. No notification workflow was attached or executed here.
8. Test the actual HTTPS API, browser preflight, LearningSuite iframe, token revocation and two real authorized customer datasets. Verify native multi-batch retrieval with populated V2 records before activation. The inspected V2 Leads and Target Companies tables were empty, so this remains unverified.
9. Publish only after the configuration and live checks pass. No real customers, grants, emails, SharePoint or ClickUp resources were created by these tests.

## Sources and safe reinstallation

The `*.workflow.json` files are authoritative n8n import exports captured from the configured live drafts. They include disabled execution persistence, issuer caller policy, native token length and credential references (no secret values). Use the existing installed IDs when updating; do not create duplicate runtime endpoints.

`logic.ts` contains the tested pure authorization/normalization code. `build-workflows.mjs` generates SDK source from it. To regenerate for a domain:

```sh
PORTAL_ORIGIN=https://your-portal-domain.example node backend/n8n/build-workflows.mjs
```

**SDK creation alone is not a safe deployment.** The SDK interface does not carry workflow settings, and its importer dropped the Crypto generation length during testing. After SDK create/update, before ANY real execution:

- Set `saveDataSuccessExecution=none`, `saveDataErrorExecution=none`, `saveManualExecutions=false`, `saveExecutionProgress=false`, `executionTimeout=60`.
- Set the issuer `callerPolicy=none` until a trusted caller is explicitly wired.
- Explicitly set the generator parameters `{ action: 'generate', encodingType: 'base64', stringLength: 43, dataPropertyName: 'data' }` via `updateNodeParameters`.
- Bind every Airtable node to the verified `Schulze x Apex Airtable` credential by ID.
- Read the workflow back and verify parameters, settings and all normal/error connections. Refresh the JSON exports after changes. Validation alone did not detect the importer’s dropped length.

Registry and base/table IDs refer to this inspected Schulze instance. Recreating the registry elsewhere requires updating the references; no IDs should be invented.

## Verification evidence

- Local suite: 24 tests passing (including nine backend tests), TypeScript check passing.
- n8n synthetic bootstrap success: execution `1168171`, exact normalized customer/lead response.
- Missing token `1168177`, unknown grant `1168179`, expired `1168180`, revoked `1168181`, duplicate `1168182`, browser selector `1168185`: each reached only the 401 responder.
- Foreign target owner `1168188`, foreign lead target `1168187`: each reached only the sanitized 503 responder, never the success responder.
- Empty customer `1168186`: success with empty leads.
- Real empty-registry lookup with synthetic request `1168199`: 401; Airtable nodes were pinned and not queried.
- Issuer synthetic round trip `1168190`: 43-character token, SHA-256 match, validated returned grant metadata. Trigger, Airtable client read, generator and registry insert were pinned.
- Native generation probe `1168197`: real Crypto generated 43 characters, URL-safe conversion and hashing passed. Registry insert was pinned and the deliberately mismatched returned hash caused the final verification to fail. No grant was stored. This verified generation, not a real issuance/storage round trip.

Bootstrap synthetic tests pinned trigger, Airtable reads and registry output, so they prove runtime authorization/wiring, **not live Airtable results**. Synthetic-only execution output was temporarily retained for inspection; final privacy settings were restored and read back. No production workflow was executed or changed.
