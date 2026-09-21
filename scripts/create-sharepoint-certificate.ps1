param(
  [string]$CommonName = "Schulze-SharePoint-GitHub",
  [string]$OutputDirectory = "."
)

$ErrorActionPreference = "Stop"

$target = Resolve-Path -Path $OutputDirectory
$cerPath = Join-Path $target "$CommonName.cer"
$pfxPath = Join-Path $target "$CommonName.pfx"
$base64Path = Join-Path $target "$CommonName.pfx.b64"

$password = Read-Host "Choose a strong PFX password" -AsSecureString
if (-not $password) {
  throw "A PFX password is required."
}

$cert = New-SelfSignedCertificate `
  -Subject "CN=$CommonName" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -KeyExportPolicy Exportable `
  -KeySpec Signature `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2)

Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password -Force | Out-Null

[Convert]::ToBase64String([IO.File]::ReadAllBytes($pfxPath)) |
  Set-Content -Path $base64Path -NoNewline -Encoding ascii

Write-Host ""
Write-Host "Created:"
Write-Host "  Public certificate: $cerPath"
Write-Host "  Private PFX:        $pfxPath"
Write-Host "  Base64 PFX:         $base64Path"
Write-Host ""
Write-Host "Next:"
Write-Host "1. Upload only the .cer file to the Entra app registration."
Write-Host "2. Put the .pfx.b64 contents in GitHub secret SHAREPOINT_CERTIFICATE_BASE64."
Write-Host "3. Put the PFX password in GitHub secret SHAREPOINT_CERTIFICATE_PASSWORD."
Write-Host "4. Never commit the PFX, password, or base64 PFX."
