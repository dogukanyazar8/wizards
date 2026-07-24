[CmdletBinding()]
param(
  [ValidateSet("Install", "Uninstall")]
  [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-GitConfigRead {
  param([string[]]$Arguments)

  $output = & git @Arguments 2>$null
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    return [string]($output -join "`n").Trim()
  }
  if ($code -eq 1) {
    return $null
  }
  throw "git $($Arguments -join ' ') failed with exit code $code."
}

function Exit-Blocked {
  param([string]$Message)
  Write-Error $Message
  exit 2
}

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $root

$worktreeConfig = Invoke-GitConfigRead -Arguments @("config", "--bool", "extensions.worktreeConfig")
if ($worktreeConfig -cne "true") {
  Exit-Blocked "Git worktree-specific config is not enabled. No hook setting changed. Enable extensions.worktreeConfig with explicit repository-owner approval, then rerun."
}

$worktreePath = Invoke-GitConfigRead -Arguments @("config", "--worktree", "--get", "core.hooksPath")
$activePath = Invoke-GitConfigRead -Arguments @("config", "--get", "core.hooksPath")

if ($worktreePath -and $worktreePath -cne ".githooks") {
  Exit-Blocked "Active worktree already has core.hooksPath '$worktreePath'. No hook setting changed; keep that hook system or migrate it explicitly."
}

if ($Action -eq "Install") {
  if ($activePath -and $activePath -cne ".githooks") {
    Exit-Blocked "Effective core.hooksPath is '$activePath'. No hook setting changed; keep that hook system or migrate it explicitly."
  }
  if ($worktreePath -ceq ".githooks") {
    Write-Host "Local quality hooks are already installed for this worktree."
    exit 0
  }

  & git config --worktree core.hooksPath .githooks
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  $installedPath = Invoke-GitConfigRead -Arguments @("config", "--worktree", "--get", "core.hooksPath")
  if ($installedPath -cne ".githooks") {
    Exit-Blocked "Git did not retain the worktree-specific .githooks setting. No shared setting was used."
  }
  Write-Host "Local quality hooks installed for this worktree only."
  exit 0
}

if ($worktreePath -eq $null) {
  Write-Host "No worktree-specific .githooks setting exists; nothing changed."
  exit 0
}

& git config --worktree --unset-all core.hooksPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Host "Local quality hooks removed from this worktree only."
exit 0
