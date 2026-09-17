# Backend integration handoff — not deployed

## Verified facts (2026-09-17)

Live metadata was read from the Schulze x Apex V2 Airtable base through the existing n8n credential. Exact relation metadata confirms:

- `Leads.Target Company` → `Target Companies` (prefers one linked record).
- `Target Companies.Client` → `Clients` (prefers one linked record).
- `Leads.Linked Person` → `People` (prefers one linked record).
- Reciprocal `Clients.Target Companies` and `Target Companies.Leads` links exist.
- Lead statuses: `New`, `Contacted`, `Nurturing`, `Qualified`, `Won`, `Lost`.
- Sources: `LinkedIn`, `Referral`, `Website`, `Event`, `Other`, `Social Media`.
- Read-only full relation inspection returned 0 Leads and 0 Target Companies. This is an empty production data path, not evidence of successful customer isolation.

| Response      | Canonical field                                            |
| ------------- | ---------------------------------------------------------- |
| customer.name | Clients.Client Name                                        |
| name          | Leads.Lead Name                                            |
| contactName   | People.Full Name via Leads.Linked Person                   |
| status        | Leads.Lead Status                                          |
| website       | Target Companies.Website                                   |
| notes         | Leads.Notes (never People.Notes or Target Companies.Notes) |
| email         | People.Email                                               |
| phone         | People.Phone                                               |
| position      | People.Role/Title                                          |
| source        | Leads.Source                                               |

## Existing workflow changes

Created an inactive, manual-only **Schulze Portal · Read-only schema verification** workflow in Peer's personal project. Creation requested Gateways & APIs folder, but readback returned no parent folder; actual placement is the project root. Five nodes read schema and relation IDs and return only aggregate ownership counts. Two manual read-only executions verified schema and empty relation tables. No other workflow was edited. No credential values or raw execution payloads are stored in this repository.

## Remaining work before live integration

1. Establish the customer access registry storage. No registry exists in the inspected V2 schema. Proposed fields: token SHA-256 digest (unique), linked canonical Client (exactly one), expiresAt, revokedAt, scope=`portal:read`, grant ID. Store only the digest. Generate 32 random bytes server-side; never issue tokens through an unauthenticated public endpoint.
2. Build isolated n8n bootstrap API. Reject missing/duplicate/malformed bearer credentials and all customer selectors; resolve exactly one nonexpired nonrevoked grant and exactly one existing client. Ambiguous or unavailable registry returns no customer data.
3. Fetch only IDs reached from the authorized client's Target Companies and their Leads. Use exact `RECORD_ID()` selection or record gets; do not compare linked-record display names with Airtable IDs. Recheck every target's sole Client and every lead's sole Target Company. Fetch People only from these authorized leads. Empty ID sets must return an empty result, never an unfiltered query.
4. Normalize allowlisted fields; blank optional values become null. Missing/multiple linked people require an explicit reviewed rule; no arbitrary first match. `ownership.ts` demonstrates the lead boundary but does not authenticate tokens or read Airtable.
5. Complete pagination and bounded batches; no silent partial result. Retry transient upstream failures within request budget. Every failure path must respond with a sanitized 4xx/5xx.
6. Disable n8n success/error/manual execution payload persistence and progress persistence on token-bearing workflows. Do not route raw webhook inputs into shared Slack/email error workflows. Redact proxy query and Authorization logs.
7. Configure exact portal-origin CORS (GET, OPTIONS, Authorization), CSP at the host and perimeter rate limits. CORS is not authorization.
8. Verify the actual rebuilt LS template and deployed origin; replace both `appcode` assignments in V2-09 with the generated URL only after API and token issuance work. Preserve current workflow behavior otherwise. Hub reuse must reconcile existing variables; do not assume changing the template updates existing Hubs.
9. Validate n8n graph, test with synthetic two-customer fixtures and then authorized live records. Do not create real customers or migrate legacy data without a separately defined migration scope.

The original constraint prohibits modifying existing customer data. No missing lead ownership has been guessed or repaired. A real live test needs populated, correctly linked V2 records; a legacy migration is outside this implementation.
