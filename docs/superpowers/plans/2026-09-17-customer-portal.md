# Schulze Portal Implementation Plan

> Execute inline with superpowers:executing-plans. Approved design is the authority.

**Goal:** Build one deployable customer portal and prepare isolated n8n integration with verified authorization.
**Architecture:** Static frontend calls n8n using a customer bearer token. Airtable is the canonical store. Live integration remains blocked until ownership and token registry are verified.
**Tech Stack:** Vite, React, TypeScript, Node test runner, Playwright for browser verification.
**Spec:** ../specs/2026-09-17-customer-portal-design.md

## Global constraints

No Supabase. No frontend integration secrets. No customer ID authorization. No existing customer data mutation. No emails, ClickUp, SharePoint, Welcome Form changes. No live provisioning before integration verification.

## Task 1: typed API and token boundary

Files: src/api/portal.ts, src/api/token.ts, tests/api.test.ts, package.json, tsconfig.json.
Interfaces: readToken(URL): string|null; bootstrap(base, token, signal?): Promise<BootstrapResponse>.

- [x] Add tests for duplicate/missing/malformed tokens, URL stripping, missing config, 401/429/5xx, invalid JSON/contract, abort and timeouts. Assert response/error behavior.
- [x] Run `npm test`; observe missing-feature failures.
- [x] Implement HTTPS base validation, bearer-only request, response allowlist validation, sanitized error classes, abort timeout and no credential storage.
- [x] Run `npm test` and `npm run typecheck`.

## Task 2: customer UI and deployable server

Files: src/App.tsx, src/components/Leads.tsx, src/styles.css, index.html, server.mjs, Dockerfile, .env.example, README.md.
Interfaces: App consumes BootstrapResponse. Leads consumes typed leads and owns search/filter/sort state.

- [x] Implement German accessible header, desktop table/mobile cards, toolbar, status badges and complete state handling; plain text notes, safe outbound links.
- [x] Add static production server with restrictive security headers and fail-closed frame ancestors. Avoid query/header logging. Bind PORT on 0.0.0.0.
- [x] Build and inspect desktop/mobile screenshots, verify iframe render and API failure states with intercepted synthetic responses. No demo data in production.

## Task 3: backend verification and isolation

Files: backend/README.md, tests/ownership.test.ts, backend/ownership.ts.

- [x] Verify current n8n schema/link destinations using read-only tools. Record evidence and unresolved constraints.
- [x] Write and run failing two-customer ownership tests; implement fail-closed reference boundary.
- [x] Install isolated n8n API and private token issuer; create empty hashed-grant registry; test authorization with synthetic fixtures. Payload execution logging disabled in final drafts.
- [ ] Activate after portal-origin configuration, proxy protections and real Airtable/iframe verification; wire issuer and URL into V2-09 after caller privacy settings are fixed.
- [x] Do not claim reference tests prove live workflow isolation. Keep integration explicitly unavailable when blocked.

## Task 4: review and deliver

- [x] Run `npm run typecheck`, `npm test`, `npm run build`, browser checks, and browser-bundle credential scan.
- [x] Document API, token lifecycle, mapping evidence, Railway deploy and exact remaining setup.
- [x] Commit and push feature branch, verify remote commit; report all changes and validation limits.

## Delivery evidence

- Live schema and inverse links verified; V2 Leads and Target Companies both empty. No migration or customer data writes.
- 15 unit/reference tests, 6 browser tests, and 1 production-header/cross-origin iframe test passed.
- Code review found long-name mobile overflow; regression reproduced then fixed.
- Production CSP test permits a synthetic allowed HTTPS parent and rejects an unrelated HTTPS parent, using the actual production server and build. Actual LS domain still unverified.
- Backend drafts are installed and synthetic n8n tests pass; activation and LS provisioning remain pending as documented in backend/n8n/README.md.
