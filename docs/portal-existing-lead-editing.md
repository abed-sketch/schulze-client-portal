# Existing lead editing — implementation contract

The requested scope is intentionally small:

- customer may update an **existing** lead,
- customer may add an interaction,
- customer may change the deal stage/status,
- customer may **not** create a new lead,
- customer may never select another customer's lead by sending a different ID.

## Frontend behavior

The React portal shows the edit action only when all of these are true:

1. it is running inside LearningSuite,
2. the verified portal mode is `customer`,
3. the lead ID returned by the scoped LearningSuite read model is an Airtable record ID.

Admin and legacy opaque-link sessions stay read-only.

On Save the frontend requests a **fresh LearningSuite access token** from the existing parent bridge and POSTs:

`POST {VITE_API_BASE_URL}/customer-portal/lead-update`

Authorization:

`Authorization: Bearer <fresh LearningSuite token>`

Body:

```json
{
  "requestId": "browser-generated-idempotency-key",
  "leadId": "rec...",
  "interactionText": "optional text",
  "dealPhase": "optional selected phase",
  "interactionDate": "2026-09-21T09:00:00.000Z"
}
```

At least one real change is required.

## Required n8n authorization

Do not use a browser-supplied client ID or email.

The live write workflow must:

1. validate method/origin/body shape,
2. forward the LearningSuite bearer to the same verified identity path used by the read portal,
3. reject Admin mode for this customer-write endpoint,
4. prove the requested `leadId` exists in that verified customer's scoped lead result,
5. discover/verify the live Airtable schema,
6. read the Lead from Airtable,
7. require exactly one Target Company,
8. read that Target Company,
9. require exactly one Client and require it to equal the verified client,
10. validate the requested single-select stage/status against Airtable's live choices,
11. create the Interaction idempotently using `requestId`,
12. patch the lead stage/status only if it changed,
13. validate Airtable receipts,
14. return only the allowlisted receipt below.

No route may create a Lead.

## Airtable field compatibility

The V2 context has historically used `Lead Status`, while the draft write workflow has expected `Deal Phase`.

The production workflow should resolve the field safely:

1. prefer an exact `Deal Phase` single-select if it exists,
2. otherwise use exact `Lead Status` if it is a single-select,
3. fail closed if neither exists or the schema is ambiguous.

The browser label can remain `Dealphase`; Airtable remains authoritative for the actual field and allowed choices.

## Success response

```json
{
  "ok": true,
  "leadId": "rec...",
  "interaction": {
    "requested": true,
    "created": true,
    "reused": false
  },
  "dealPhase": {
    "requested": "Qualified",
    "updated": true,
    "previous": "Contacted"
  }
}
```

## Security and privacy settings

Because the webhook contains a LearningSuite bearer token, the n8n workflow must use:

- `saveExecutionProgress=false`
- `saveManualExecutions=false`
- `saveDataErrorExecution=none`
- `saveDataSuccessExecution=none`
- a bounded execution timeout
- sanitized 4xx/5xx responses
- exact portal-origin CORS

Do not route the raw bearer or request body into Slack/email error alerts.

## Realtime behavior

The existing Airtable → Supabase realtime/reconciliation system remains responsible for refreshing the portal after the Airtable write. Do not build a second customer-data cache for this feature.

## Release checklist

- [ ] n8n write workflow uses LearningSuite identity, not a new browser write token.
- [ ] Airtable credential is bound to every Airtable HTTP/node operation.
- [ ] Lead ownership is rechecked from Airtable before any write.
- [ ] Stage field resolves safely between `Deal Phase` and `Lead Status`.
- [ ] Interaction replay with the same request ID does not duplicate.
- [ ] Customer A cannot update Customer B's lead.
- [ ] Admin and legacy-link portal remain read-only.
- [ ] No Lead-create API or UI exists.
- [ ] Token-bearing executions are not retained.
- [ ] Frontend unit/browser checks pass.
- [ ] Real acceptance test uses an explicitly approved test customer/lead only.
