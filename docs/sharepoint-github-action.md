# SharePoint external sharing — GitHub Action setup

The repository contains `.github/workflows/enable-sharepoint-sharing.yml`. n8n dispatches it only after the client SharePoint site exists. The action enables authenticated external sharing for the exact client site and then calls the V2-04 callback webhook.

## 1. Create the app certificate on Windows

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-sharepoint-certificate.ps1
```

This uses Windows' built-in certificate cmdlets and does **not** require `PnP.PowerShell` on the local PC.

It creates:
- `.cer` — public certificate, safe to upload to the Entra app registration.
- `.pfx` — private key, keep secret.
- `.pfx.b64` — base64 form used by GitHub Actions, keep secret.

Do not commit the PFX, its password, or the base64 PFX.

## 2. Entra app registration

Use a dedicated app registration for the SharePoint automation.

Configure certificate-based application authentication and upload the generated public `.cer` file.

The app must have the SharePoint application permission required for tenant-site administration, with administrator consent. Keep this app dedicated to the site-sharing automation.

Record:
- Tenant ID or tenant domain
- Application / Client ID

## 3. GitHub environment

Create the protected GitHub environment:

`sharepoint-production`

Add these environment secrets:

- `SHAREPOINT_TENANT`
- `SHAREPOINT_CLIENT_ID`
- `SHAREPOINT_CERTIFICATE_BASE64`
- `SHAREPOINT_CERTIFICATE_PASSWORD`
- `N8N_SHAREPOINT_CALLBACK_TOKEN`

Use a random callback token of at least 32 characters.

## 4. n8n callback secret

The n8n host must expose:

`N8N_SHAREPOINT_CALLBACK_TOKEN`

with exactly the same value as the GitHub environment secret.

V2-04 rejects callbacks when this value is missing or does not match.

## 5. n8n workflow

Workflow:

`FUL-V2-04 · Welcome Form & Resource Setup · Event + Reconciliation`

The GitHub repository-dispatch credential is already bound to the dispatch node. Publish the latest V2-04 draft only after the protected environment and callback secret are configured.

## 6. Runtime sequence

```text
V2-04 creates/resolves client SharePoint site
→ persist request correlation
→ release Welcome processing lease
→ GitHub repository_dispatch
→ PowerShell enables ExternalUserSharingOnly
→ action verifies the site setting
→ signed callback to n8n
→ V2-04 reclaims the lease
→ Welcome setup resumes
→ Austausch folder invite continues
```

The action is intentionally idempotent: applying `ExternalUserSharingOnly` again to a site already in that state is harmless, while n8n keeps a request correlation ID so unrelated callbacks cannot resume another onboarding.
