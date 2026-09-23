# SharePoint external-sharing automation

This GitHub Action is the production-side helper for Schulze onboarding SharePoint sites.

## What it does

It accepts a single customer site URL such as:

`https://tenant.sharepoint.com/sites/KDXXX`

The PowerShell script refuses any other tenant host or any path that is not `/sites/KD<number>`. It connects to the SharePoint admin tenant using an Entra application certificate, sets the site to `ExternalUserSharingOnly`, then polls until the change is visible.

The action does **not** invite the customer. n8n remains responsible for the folder-level `/invite` call after this action reports success.

## Required GitHub environment and secrets

Create a protected GitHub environment named `sharepoint-production`. Store these values only as encrypted environment/repository secrets:

- `SHAREPOINT_ADMIN_URL` — expected `https://webscoutsteams-admin.sharepoint.com`
- `SHAREPOINT_TENANT_ID` — Microsoft Entra tenant GUID
- `SHAREPOINT_CLIENT_ID` — app registration GUID
- `SHAREPOINT_CERTIFICATE_BASE64` — base64-encoded PFX
- `SHAREPOINT_CERTIFICATE_PASSWORD` — PFX password
- `N8N_SHAREPOINT_CALLBACK_URL` — fixed n8n production callback webhook
- `N8N_SHAREPOINT_CALLBACK_TOKEN` — random shared callback bearer

Never store the certificate, password, callback bearer, tenant admin credential, or a raw access token in this repository.

## Entra / SharePoint permissions

The app registration used by PnP.PowerShell must be intentionally approved for the minimum tenant-admin permission required to change site sharing. Keep this app dedicated to this action and rotate its certificate on a schedule.

## n8n integration contract

n8n dispatches the GitHub event:

```json
{
  "event_type": "enable-sharepoint-sharing",
  "client_payload": {
    "site_url": "https://tenant.sharepoint.com/sites/KDXXX",
    "request_id": "sp-KDXXX-<unique>"
  }
}
```

After the job finishes, the action POSTs to the fixed callback URL:

```json
{
  "requestId": "sp-KDXXX-<unique>",
  "siteUrl": "https://tenant.sharepoint.com/sites/KDXXX",
  "status": "success",
  "runUrl": "https://github.com/.../actions/runs/..."
}
```

n8n must authenticate the callback bearer, match the request ID and site URL to the expected onboarding, and only then continue to the Graph folder invitation.

The callback must be idempotent. A duplicate success callback must not create a second invitation or a second customer resource.
