# Frontend handover — Schulze Client Portal

This repository contains the **Leads / Vertriebsportal frontend** that is embedded in LearningSuite.

It does **not** contain the separate Welcome Form frontend. The Welcome Form must be handed over from its own repository/deployment; do not assume it is part of this codebase.

## Repository and deployment

- Repository: `abed-sketch/schulze-client-portal`
- Main frontend entry: `src/App.tsx`
- Lead table/cards and existing-lead editor: `src/components/Leads.tsx`
- Translations: `src/i18n.tsx`
- Presentation/styles: `src/styles.css`, `src/admin.css`
- Production host: `https://schulze-client-portal-production.up.railway.app/`
- LearningSuite embed/bridge: `integrations/learningsuite-client-portal.html` and `integrations/learningsuite-parent-bridge.js`

## Safe visual-editing area

Peer can safely iterate the presentation layer in:

- `src/styles.css`
- `src/admin.css`
- visible labels/copy in `src/i18n.tsx`
- presentational markup/classes inside `src/App.tsx`
- presentational markup/classes inside `src/components/Leads.tsx`

Typical safe changes:

- typography
- spacing
- colors
- backgrounds
- borders/radii
- visual hierarchy
- responsive layout
- non-functional text labels
- animations/fades that do not interfere with controls

Run the full checks before merging any styling change.

## Do not change casually

The following files are security/integration boundaries and should not be edited as part of a visual redesign:

- `src/api/*`
- `src/api/learningSuite.ts`
- `src/api/token.ts`
- `src/api/realtime.ts`
- `backend/*`
- `supabase/*`
- `integrations/learningsuite-parent-bridge.js`
- `server.mjs`
- `.env.example`
- `Dockerfile`
- `railway.json`
- the authorization, ownership and token-handling logic inside `src/App.tsx`
- the save/update contract inside `src/components/Leads.tsx`

Do not add a customer ID, email, Airtable record selector or access token to the browser URL to make UI work.

## Functional boundaries to preserve

The customer portal must continue to enforce all of these rules:

1. Airtable is the business source of truth; the portal uses the scoped read model.
2. LearningSuite identity is verified server-side.
3. Customers see only their authorized client scope.
4. Admin access remains explicit and read-only in the portal UI.
5. Customers can update existing leads only through the controlled update endpoint.
6. Customers cannot create arbitrary new leads.
7. A customer cannot choose a different client/lead by changing a query parameter.
8. No customer data, bearer tokens or credentials are stored in localStorage/sessionStorage.
9. The LearningSuite parent bridge accepts messages only from the exact trusted origin/window.
10. Existing realtime refresh/revocation behavior must continue to work.

## Development / validation

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:production
```

A UI-only change is not ready for release if any of these checks fail.

## Brand refresh

The portal was intentionally built so a future Schulze brand refresh can mostly be done in the presentation files above without rebuilding the data model, n8n workflows, Supabase security model or LearningSuite identity bridge.

## Welcome Form handover gap

Peer also requested ownership of the Welcome Form frontend. That code is not present in this repository, so final project handover still needs the actual Welcome Form repository/deployment identified and documented separately.
