# Airtable Omni prompt

Paste this into Omni in the Schulze V2 base:

```text
In the Schulze V2 base appAutw0Fvsuk2pfJ, create a table named exactly "Portal Access" if it does not already exist. If it exists, reuse it without deleting records or changing unrelated tables.

Use these exact fields:
- Access Name: primary field, single line text
- Email: email
- Role: single select with exactly Admin and Client
- Client: link to the existing Clients table; allow one linked client per access record
- Active: checkbox, unchecked by default
- Notes: long text

Create or update one record:
Access Name: Abed — Portal Admin
Email: abed@apex-consulting.ai
Role: Admin
Client: empty
Active: checked
Notes: Authorized Schulze Client Portal administrator.

Do not create a duplicate Abed admin record. If conflicting duplicates already exist, report them instead of deleting them.

Admin records must have Client empty. Active Client records must link to one client. Never infer an Admin role from an email domain.

Do not modify existing client contacts, leads, automations, or other production records. This table is for trusted internal staff to manage; report any editing-permission restrictions that require manual configuration.
```

# Operation

The existing five-minute sync discovers the table by its exact name. No table ID needs to be configured. It reads all entries, including unchecked ones, and replaces the private Supabase projection atomically with the client/lead snapshot. The portal uses the server-verified LearningSuite email; entries do not bypass LearningSuite login.

Before the table is ever detected, the existing Supabase `portal_admins` configuration remains effective. Once detected (even with an invalid schema), the access table is authoritative for explicit grants permanently. An empty, missing, renamed or invalid table grants no explicit access. API failures stop replacement; existing explicit access expires after 15 minutes without a successful access sync. The normal portal refresh and Supabase change signal pick up updates after sync.

An active Admin entry grants the portal's read-only view across clients. An active Client entry grants only its linked client. Multiple distinct client entries for the same email are supported. Duplicate email/role/client grants are all excluded, including active/inactive conflicts. Invalid rows grant nothing. Unchecked or deleted entries revoke their grant on the next successful sync.

Primary Contact access continues independently through the existing reciprocal Clients → People relationship. Disabling an additional access entry does not disable valid primary-contact access. To remove that person's primary-contact access, change the source primary contact relationship. Existing legacy opaque link grants are separate; this table controls LearningSuite identity access, not already-issued legacy links.

Restrict editing of this table to trusted administrators. A person allowed to add an active Admin record can grant access to every client's portal data.

`portal_access` and `portal_access_state` have forced RLS and no public/anonymous/authenticated grants. Only trusted server-side integration roles read or replace them. The legacy admin row remains for rollback but is ignored after first discovery.

To update the normalization logic, edit `backend/n8n/access.js`, run `node scripts/embed-portal-access.mjs`, and run the unit tests. The generated n8n Code nodes are tested directly as well as the pure helpers.
