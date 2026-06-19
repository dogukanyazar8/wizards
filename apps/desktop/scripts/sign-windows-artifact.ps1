param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ArtifactPath)) {
  throw "Desktop artifact was not found: $ArtifactPath"
}

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PFX_BASE64)) {
  throw "WINDOWS_CERTIFICATE_PFX_BASE64 is required to sign Windows desktop artifacts."
}

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PASSWORD)) {
  throw "WINDOWS_CERTIFICATE_PASSWORD is required to sign Windows desktop artifacts."
}

$certificatePath = Join-Path $env:TEMP ("whispr-codesign-{0}.pfx" -f ([guid]::NewGuid()))

try {
  [IO.File]::WriteAllBytes(
    $certificatePath,
    [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_PFX_BASE64)
  )

  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match "\\x64\\signtool.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $signtool) {
    throw "signtool.exe was not found on the Windows runner."
  }

  & $signtool.FullName sign `
    /f $certificatePath `
    /p $env:WINDOWS_CERTIFICATE_PASSWORD `
    /fd SHA256 `
    /tr http://timestamp.digicert.com `
    /td SHA256 `
    $ArtifactPath

  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed for $ArtifactPath with exit code $LASTEXITCODE."
  }
} finally {
  if (Test-Path -LiteralPath $certificatePath) {
    Remove-Item -LiteralPath $certificatePath -Force
  }
}
