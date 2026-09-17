# Schulze Client Portal

One customer-facing React application for the LearningSuite Vertriebsportal. German lead overview, responsive table/cards, search, status filter, sorting, safe external links and explicit loading/empty/error states.

## Current delivery status

Frontend implemented; n8n bootstrap API and private token issuer are installed as inactive drafts. Backend integration is **not live**. An empty n8n hashed-token registry was created. No tokens have been issued, no customers created, and no existing provisioning workflow changed. See `backend/n8n/README.md` for installed workflow IDs, test evidence and activation steps. The application fails closed when configuration or a valid customer link is missing. It contains no production demo mode.

Live V2 metadata was verified on 2026-09-17: Leads → Target Company links to Target Companies; Target Companies → Client links to Clients; Leads → Linked Person links to People. Read-only record inspection returned **0 Leads and 0 Target Companies**. No real two-customer integration test is possible against these empty tables. See `backend/README.md` for the exact remaining integration work.

## Local development

Requires Node 22.18+ (Node 24 also supported).

```sh
npm ci
cp .env.example .env
# Set VITE_API_BASE_URL to the HTTPS n8n API base.
npm run dev
```

Open the personal `/?token=...` link. An arbitrary token is never enough: n8n must validate it. For an intentional UI preview with synthetic data, run the Playwright tests; synthetic fixtures are only in tests, never in the application bundle.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:production
```

Browser tests intercept HTTPS API calls using fabricated fixtures. They prove frontend behavior, not a working Airtable/n8n integration. An optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` environment variable supports a locally installed Chromium.

## API contract

`GET ${VITE_API_BASE_URL}/customer-portal/bootstrap`

Authorization: `Bearer <43-character base64url opaque token>` (at least 256 bits of entropy). The native issuer generates 43 cryptographically random base64 characters and converts them to URL-safe form. Token shape validation in React is only input hygiene; all authorization must run in n8n. No customer ID/query selectors are accepted by the app. `credentials: omit`, no-store, redirect refusal, 25-second timeout, cancellation and sanitized errors are implemented.

```ts
type BootstrapResponse = {
  customer: { name: string };
  leads: Array<{
    id: string; // Portal-facing, no raw Airtable ID needed
    name: string;
    contactName: string | null;
    status: string | null;
    website: string | null;
    notes: string | null;
    email: string | null;
    phone: string | null;
    position: string | null;
    source: string | null;
  }>;
};
```

Optional values must be `null`, not absent. Unknown fields are dropped, malformed/duplicate lead identifiers reject the whole response. Maximum 10,000 leads per response; the backend must reject oversized datasets or implement a reviewed paginated contract, never silently truncate.

Status codes: 401/403 invalid link; 429 rate limit; 5xx service error. No backend error detail is displayed. The API must include CORS headers on error responses too.

## Railway deployment

1. Deploy this repository/branch using the included Dockerfile; Railway configuration is in `railway.json`.
2. Set **build-time** `VITE_API_BASE_URL` to the verified HTTPS API base, including `/webhook` for a direct n8n endpoint. Do not append `/customer-portal/bootstrap`.
3. Set **runtime** `API_ORIGIN` to that API's exact origin, e.g. `https://automation.example.org` (no path).
4. Set **runtime** `FRAME_ANCESTORS` to the actual LearningSuite parent origins, comma separated, with no trailing slash. Include every ancestor if LS nests frames. Empty means embedding is denied.
5. Railway supplies `PORT`; default is 8080. Generate the public domain for that port. Healthcheck: `/healthz`.
6. Verify proxy/CDN access logs redact query strings and Authorization headers before issuing real bearer URLs. The included server logs only its startup, never requests.
7. Rebuild after changing `VITE_API_BASE_URL`; Vite embeds it at build time. This is public configuration, not a secret.

Docker build locally:

```sh
docker build --build-arg VITE_API_BASE_URL=https://automation.example.org/webhook -t schulze-portal .
docker run --rm -p 8080:8080 -e API_ORIGIN=https://automation.example.org -e FRAME_ANCESTORS=https://learning.example.org schulze-portal
```

These domains are documentation examples, not verified production domains.

Other hosts can serve `dist/`, but must configure the same HTTP headers as `server.mjs`; CSP `frame-ancestors` cannot be set through HTML meta tags. Do not add `X-Frame-Options: SAMEORIGIN` or `DENY` to a working cross-origin LS deployment.

## LearningSuite

Keep the reusable template variable:

```html
<iframe
  src="[[AirtableembedAppLinkNachEmbedd]]"
  title="Ihre Interessenten"
  width="100%"
  height="1000"
  style="border:0"
  referrerpolicy="no-referrer"
></iframe>
```

Provisioning must inject the hosted portal URL with its customer-scoped token, never a public Airtable URL. There is one application for all customers. The current V2-09 published workflow still has literal `appcode` in this variable; it was inspected but not modified.

## Security and limitations

- No Airtable PAT, n8n integration credential, Supabase, direct browser Airtable calls or customer navigation.
- Customer token is held in memory only. Query and fragment are removed on startup. Reloading the cleaned URL requires reopening the original LS link.
- The initial token-bearing URL reaches the host/proxy before JavaScript executes. Infrastructure log redaction is mandatory; frontend URL cleanup does not solve server logs.
- Bearer links can be shared. They are not LearningSuite SSO. Expiration and immediate revocation are backend requirements.
- CSP permits only configured API origin and LS ancestors. No analytics, third-party fonts, scripts or images.
- No local/session storage, cookies or service worker. No customer response cache.
- `backend/ownership.ts` is a tested server-side reference, not a deployed authorization service. It is never imported into React.

## File map

- `src/api/`: token consumption, API types, contract validation and sanitized errors.
- `src/App.tsx`: page shell and request lifecycle.
- `src/components/Leads.tsx`, `src/styles.css`: table/cards, filters and responsive styling.
- `server.mjs`, `Dockerfile`, `railway.json`, `.env.example`: deployment and headers.
- `tests/`: API, authorization reference, production security headers and browser tests.
- `backend/README.md`: verified mapping and live integration blockers.
- `docs/superpowers/`: approved design and implementation plan.

## Preview

Synthetic browser-test fixtures only:

![Desktop preview](docs/previews/desktop.png)

[Mobile preview](docs/previews/mobile.png)
