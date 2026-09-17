# Schulze customer portal — approved design

Approved in conversation on 2026-09-17.

One Vite + React + TypeScript application embedded in LearningSuite. n8n exclusively authorizes opaque bearer tokens and reads Airtable V2. No Supabase, browser Airtable access, browser integration credentials, customer selector, or edits to existing customer records.

UI: German Interessenten screen, company name, status badges, contact, website, notes, email, phone, position, source; search, filter, sorting, responsive cards, loading/empty/invalid-link/service-error states.

API: GET /customer-portal/bootstrap, Authorization: Bearer token. Response customer.name and allowlisted leads (id, name, contactName, status, website, notes, email, phone, position, source). IDs are portal-facing. Missing optional values are null. No customer query parameters accepted. No raw Airtable records.

Opaque 256-bit token, SHA-256 hash registry, one canonical client per access grant, expiry, revocation, read scope. Invalid, unknown, expired and revoked grants fail closed. Ownership candidate: Lead.Target Company → Target Companies.Client. Verify linked-table metadata and actual relationships before connecting production. Shared/ambiguous ownership must not leak data. People relationships never establish lead ownership.

Live schema inspection confirmed V2 base and Leads/People/Target Companies/Clients field names and types. Linked-table destinations, cardinality, customer-visible notes and sample data still require verification. V2-09 published version has literal appcode for AirtableembedAppLinkNachEmbedd in two nodes. Existing Welcome Form is out of scope.

Frontend keeps token in memory, strips URL query, no browser storage, no analytics. Static host serves security headers; no-referrer, no-store HTML, noindex, restrictive CSP and verified LearningSuite frame ancestors. API CORS allows portal origin. Bearer links are transferable; expiry/revocation mandatory. Proxy query/header logs must be redacted. No production origin guessed.

Tests: typecheck, token extraction and API failures, production build, responsive and iframe rendering, cross-customer ownership and ambiguous joins, build secret scan. Mock verification is not live integration verification.
