param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [Parameter(Mandatory = $true)][string]$AdminUrl,
  [Parameter(Mandatory = $true)][string]$TenantId,
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$siteUri = [Uri]$SiteUrl
$adminUri = [Uri]$AdminUrl

if ($siteUri.Scheme -ne 'https') {
  throw 'SharePoint site URL must use HTTPS.'
}

if ($siteUri.Host -ne 'webscoutsteams.sharepoint.com') {
  throw "Refusing unexpected SharePoint host: $($siteUri.Host)"
}

if ($siteUri.AbsolutePath -notmatch '^/sites/KD[0-9]+/?$') {
  throw "Refusing unexpected SharePoint site path: $($siteUri.AbsolutePath)"
}

if ($adminUri.Scheme -ne 'https' -or $adminUri.Host -ne 'webscoutsteams-admin.sharepoint.com') {
  throw 'Unexpected SharePoint admin URL.'
}

if ($TenantId -notmatch '^[0-9a-fA-F-]{36}$') {
  throw 'Tenant ID must be a GUID.'
}

if ($ClientId -notmatch '^[0-9a-fA-F-]{36}$') {
  throw 'Client ID must be a GUID.'
}

$certificatePath = Join-Path $env:RUNNER_TEMP 'schulze-sharepoint-app.pfx'

try {
  [IO.File]::WriteAllBytes(
    $certificatePath,
    [Convert]::FromBase64String($CertificateBase64)
  )

  $securePassword = ConvertTo-SecureString $CertificatePassword -AsPlainText -Force

  Connect-PnPOnline     -Url $AdminUrl     -ClientId $ClientId     -Tenant $TenantId     -CertificatePath $certificatePath     -CertificatePassword $securePassword

  $site = Get-PnPTenantSite -Url $SiteUrl
  if (-not $site) {
    throw "SharePoint site was not found: $SiteUrl"
  }

  $before = [string]$site.SharingCapability
  Write-Host "Current sharing capability: $before"

  if ($before -ne 'ExternalUserSharingOnly') {
    Set-PnPTenantSite -Url $SiteUrl -SharingCapability ExternalUserSharingOnly

    $verified = $false
    for ($attempt = 1; $attempt -le 12; $attempt++) {
      Start-Sleep -Seconds 10
      $site = Get-PnPTenantSite -Url $SiteUrl
      $current = [string]$site.SharingCapability
      Write-Host "Verification attempt $attempt: $current"
      if ($current -eq 'ExternalUserSharingOnly') {
        $verified = $true
        break
      }
    }

    if (-not $verified) {
      throw 'SharePoint sharing change was not visible after 120 seconds.'
    }
  }

  Write-Host 'External SharePoint sharing is enabled and verified.'
}
finally {
  Disconnect-PnPOnline -ErrorAction SilentlyContinue
  if (Test-Path $certificatePath) {
    Remove-Item -Force $certificatePath
  }
}
