[CmdletBinding()]
param(
  [ValidateSet("Fast", "Standard", "CI", "Mobile", "MobileRelease", "Security", "E2ESmoke", "E2EApi", "E2ERealtime")]
  [string]$Profile = "Fast",
  [switch]$Plan,
  [switch]$DryRun,
  [ValidateSet("Text", "Json")]
  [string]$OutputFormat = "Text",
  [switch]$AllowMobileRelease
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-GateStepResult {
  param(
    [string]$Id,
    [ValidateSet("PASS", "FAIL", "SKIP", "BLOCKED")]
    [string]$Status,
    [string]$Command,
    [double]$DurationMs,
    [object]$ExitCode,
    [string]$NextAction
  )

  return [ordered]@{
    id = $Id
    status = $Status
    command = $Command
    durationMs = [math]::Round($DurationMs, 0)
    exitCode = $ExitCode
    nextAction = $NextAction
  }
}

function Test-IsWindowsHost {
  return [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

function Get-RequiredProperty {
  param([object]$Object, [string]$Name)

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    throw "Profile registry is missing required property '$Name'."
  }
  return $property.Value
}

function Test-ExactStringArray {
  param([object[]]$Actual, [string[]]$Expected)

  if ($Actual.Count -ne $Expected.Count) {
    return $false
  }
  for ($index = 0; $index -lt $Expected.Count; $index += 1) {
    if ([string]$Actual[$index] -cne $Expected[$index]) {
      return $false
    }
  }
  return $true
}

function Get-LocalGateRoot {
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}

function Resolve-RelativeGatePath {
  param([string]$Root, [string]$RelativePath)

  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [System.IO.Path]::IsPathRooted($RelativePath)) {
    throw "Profile registry contains an invalid relative path."
  }
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
  $normalizedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\\")
  if (-not $candidate.StartsWith("$normalizedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Profile registry path escapes the repository root."
  }
  return $candidate
}

function Resolve-LocalGateExecutable {
  param([ValidateSet("git", "node", "pnpm", "powershell")][string]$LogicalName)

  if ($LogicalName -eq "pnpm") {
    if (Test-IsWindowsHost) {
      $pnpm = @(Get-Command "pnpm.cmd" -CommandType Application -ErrorAction SilentlyContinue)[0]
      if ($null -ne $pnpm) {
        return [pscustomobject]@{ path = $pnpm.Source; prefix = @(); display = "pnpm.cmd" }
      }
      $corepack = @(Get-Command "corepack.cmd" -CommandType Application -ErrorAction SilentlyContinue)[0]
      if ($null -ne $corepack) {
        return [pscustomobject]@{ path = $corepack.Source; prefix = @("pnpm"); display = "corepack.cmd pnpm" }
      }
      throw "Neither pnpm.cmd nor corepack.cmd is available."
    }

    $pnpm = @(Get-Command "pnpm" -CommandType Application -ErrorAction SilentlyContinue)[0]
    if ($null -ne $pnpm) {
      return [pscustomobject]@{ path = $pnpm.Source; prefix = @(); display = "pnpm" }
    }
    $corepack = @(Get-Command "corepack" -CommandType Application -ErrorAction SilentlyContinue)[0]
    if ($null -ne $corepack) {
      return [pscustomobject]@{ path = $corepack.Source; prefix = @("pnpm"); display = "corepack pnpm" }
    }
    throw "Neither pnpm nor corepack is available."
  }

  if ($LogicalName -eq "powershell") {
    if (-not (Test-IsWindowsHost)) {
      throw "The canonical Android UAT script requires Windows PowerShell."
    }
    $powershellPath = Join-Path $PSHOME "powershell.exe"
    if (-not (Test-Path -LiteralPath $powershellPath)) {
      throw "powershell.exe is not available."
    }
    return [pscustomobject]@{ path = $powershellPath; prefix = @(); display = "powershell.exe" }
  }

  $command = @(Get-Command $LogicalName -CommandType Application -ErrorAction SilentlyContinue)[0]
  if ($null -eq $command) {
    throw "Required executable '$LogicalName' is not available."
  }
  return [pscustomobject]@{ path = $command.Source; prefix = @(); display = $LogicalName }
}

$stepRegistry = @{
  "fast-index-diff" = @{ executable = "git"; arguments = @("diff", "--cached", "--check") }
  "fast-toolchain" = @{ executable = "pnpm"; arguments = @("test:toolchain") }
  "fast-staged-prettier" = @{ executable = "node"; arguments = @("scripts/quality/prettier-changed.mjs", "--staged") }
  "standard-lint" = @{ executable = "pnpm"; arguments = @("lint") }
  "standard-typecheck" = @{ executable = "pnpm"; arguments = @("typecheck") }
  "standard-format" = @{ executable = "pnpm"; arguments = @("format") }
  "standard-tests" = @{ executable = "pnpm"; arguments = @("test") }
  "ci-aggregate" = @{ executable = "pnpm"; arguments = @("ci") }
  "mobile-validate-env" = @{ executable = "pnpm"; arguments = @("--filter", "@wizards/mobile", "validate:env") }
  "mobile-tests" = @{ executable = "pnpm"; arguments = @("--filter", "@wizards/mobile", "test") }
  "mobile-component-tests" = @{ executable = "pnpm"; arguments = @("--filter", "@wizards/mobile", "test:components") }
  "mobile-release-check" = @{ executable = "pnpm"; arguments = @("--filter", "@wizards/mobile", "release:check") }
  "mobile-quality-check" = @{ executable = "pnpm"; arguments = @("--filter", "@wizards/mobile", "quality:check") }
  "android-uat-release" = @{ executable = "powershell"; arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "apps/mobile/scripts/build-android-uat.ps1", "-BuildType", "release", "-SkipInstall", "-SkipUninstall", "-NoStartMetro") }
  "security-e2e-password-guard" = @{ executable = "node"; arguments = @("scripts/quality/e2e-password-guard.mjs") }
  "e2e-smoke" = @{ executable = "pnpm"; arguments = @("e2e:smoke") }
  "e2e-api" = @{ executable = "pnpm"; arguments = @("e2e:api") }
  "e2e-realtime" = @{ executable = "pnpm"; arguments = @("e2e:realtime") }
}

function Assert-ProfileDefinition {
  param([object]$ProfileDefinition)

  $allowedProfileProperties = @("description", "estimatedImpact", "preconditions", "steps")
  foreach ($property in $ProfileDefinition.PSObject.Properties) {
    if ($property.Name -notin $allowedProfileProperties) {
      throw "Profile registry contains unsupported profile property '$($property.Name)'."
    }
  }

  [void](Get-RequiredProperty $ProfileDefinition "description")
  [void](Get-RequiredProperty $ProfileDefinition "estimatedImpact")
  [void](Get-RequiredProperty $ProfileDefinition "preconditions")
  $steps = @(Get-RequiredProperty $ProfileDefinition "steps")
  if ($steps.Count -eq 0) {
    throw "Profile registry contains a profile without steps."
  }

  foreach ($step in $steps) {
    $allowedStepProperties = @("id", "executable", "arguments")
    foreach ($property in $step.PSObject.Properties) {
      if ($property.Name -notin $allowedStepProperties) {
        throw "Profile registry contains unsupported step property '$($property.Name)'."
      }
    }

    $id = [string](Get-RequiredProperty $step "id")
    $executable = [string](Get-RequiredProperty $step "executable")
    $arguments = @((Get-RequiredProperty $step "arguments") | ForEach-Object { [string]$_ })
    $registeredStep = $stepRegistry[$id]
    if ($null -eq $registeredStep -or $executable -cne $registeredStep.executable -or -not (Test-ExactStringArray $arguments $registeredStep.arguments)) {
      throw "Profile registry step '$id' is not in the approved command registry."
    }
  }
}

function Test-LoopbackTcpEnvironment {
  param([string]$Name, [string]$FallbackName)

  $value = [Environment]::GetEnvironmentVariable($Name)
  $sourceName = $Name
  if ([string]::IsNullOrWhiteSpace($value) -and -not [string]::IsNullOrWhiteSpace($FallbackName)) {
    $value = [Environment]::GetEnvironmentVariable($FallbackName)
    $sourceName = $FallbackName
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    return [pscustomobject]@{ passed = $false; detail = "Missing environment variable $Name."; nextAction = "Set $Name for the local E2E target." }
  }

  try {
    $uri = [System.Uri]$value
  } catch {
    return [pscustomobject]@{ passed = $false; detail = "Environment variable $sourceName is not a valid service URL."; nextAction = "Set $sourceName to a loopback service URL." }
  }

  $host = $uri.DnsSafeHost
  if ($host -notin @("127.0.0.1", "localhost", "::1")) {
    return [pscustomobject]@{ passed = $false; detail = "Environment variable $sourceName must target a loopback host."; nextAction = "Use a local PostgreSQL or Redis endpoint." }
  }

  $port = $uri.Port
  if ($port -le 0) {
    $port = if ($uri.Scheme -match "postgres") { 5432 } elseif ($uri.Scheme -match "redis") { 6379 } else { -1 }
  }
  if ($port -le 0) {
    return [pscustomobject]@{ passed = $false; detail = "Environment variable $sourceName has no supported service port."; nextAction = "Include an explicit local service port." }
  }

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($host, $port)
    if (-not $task.Wait(1000) -or $task.IsFaulted) {
      return [pscustomobject]@{ passed = $false; detail = "The local service required by $sourceName is not reachable."; nextAction = "Start the required local service without resetting data, then retry." }
    }
  } catch {
    return [pscustomobject]@{ passed = $false; detail = "The local service required by $sourceName is not reachable."; nextAction = "Start the required local service without resetting data, then retry." }
  } finally {
    $client.Dispose()
  }
  return [pscustomobject]@{ passed = $true; detail = "$sourceName loopback endpoint is reachable."; nextAction = "Continue." }
}

function Test-ProfilePreconditions {
  param([object[]]$Preconditions, [string]$Root)

  $results = @()
  foreach ($precondition in $Preconditions) {
    $type = [string](Get-RequiredProperty $precondition "type")
    $passed = $false
    $detail = ""
    $nextAction = ""
    switch ($type) {
      "repository" {
        $passed = Test-Path -LiteralPath (Join-Path $Root ".git")
        $detail = if ($passed) { "Repository root is available." } else { "Repository metadata is unavailable." }
        $nextAction = if ($passed) { "Continue." } else { "Run the gate from the repository checkout." }
      }
      "nodeModules" {
        $passed = Test-Path -LiteralPath (Join-Path $Root "node_modules")
        $detail = if ($passed) { "node_modules is available." } else { "node_modules is missing." }
        $nextAction = if ($passed) { "Continue." } else { "Run the documented dependency setup before this profile." }
      }
      "path" {
        $path = Resolve-RelativeGatePath $Root ([string](Get-RequiredProperty $precondition "path"))
        $passed = Test-Path -LiteralPath $path
        $detail = if ($passed) { "Required repository path is available." } else { "Required repository path is missing." }
        $nextAction = if ($passed) { "Continue." } else { "Restore the required tracked file before retrying." }
      }
      "executable" {
        $name = [string](Get-RequiredProperty $precondition "name")
        try {
          [void](Resolve-LocalGateExecutable $name)
          $passed = $true
          $detail = "Required executable $name is available."
          $nextAction = "Continue."
        } catch {
          $detail = $_.Exception.Message
          $nextAction = "Install or expose the required executable, then retry."
        }
      }
      "environment" {
        $name = [string](Get-RequiredProperty $precondition "name")
        $passed = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))
        $detail = if ($passed) { "Required environment variable $name is set." } else { "Required environment variable $name is missing." }
        $nextAction = if ($passed) { "Continue." } else { "Set $name without logging its value, then retry." }
      }
      "loopbackTcpEnvironment" {
        $fallbackProperty = $precondition.PSObject.Properties["fallbackName"]
        $probe = Test-LoopbackTcpEnvironment -Name ([string](Get-RequiredProperty $precondition "name")) -FallbackName $(if ($null -eq $fallbackProperty) { "" } else { [string]$fallbackProperty.Value })
        $passed = $probe.passed
        $detail = $probe.detail
        $nextAction = $probe.nextAction
      }
      default {
        throw "Profile registry contains unsupported precondition type '$type'."
      }
    }
    $results += [ordered]@{ type = $type; status = if ($passed) { "PASS" } else { "BLOCKED" }; detail = $detail; nextAction = $nextAction }
  }
  return $results
}

function Format-Command {
  param([string]$Display, [string[]]$Arguments)
  return (@($Display) + $Arguments) -join " "
}

function Write-GateResult {
  param([object]$Result, [int]$ExitCode, [string]$Format)

  if ($Format -eq "Json") {
    [Console]::Out.WriteLine(($Result | ConvertTo-Json -Depth 8 -Compress))
  } else {
    Write-Host "Local Quality Gate: $($Result.profile) [$($Result.status)]"
    Write-Host $Result.description
    foreach ($precondition in $Result.preconditions) {
      Write-Host "[$($precondition.status)] prerequisite: $($precondition.detail)"
    }
    foreach ($step in $Result.steps) {
      Write-Host "[$($step.status)] $($step.id) ($($step.durationMs) ms, exit $($step.exitCode)): $($step.command)"
      Write-Host "  Next: $($step.nextAction)"
    }
  }
  exit $ExitCode
}

$exitCode = 1
$result = $null
try {
  $root = Get-LocalGateRoot
  $registryPath = Join-Path $PSScriptRoot "local-gate-profiles.json"
  $registry = Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json
  if ($registry.schemaVersion -ne 1) {
    throw "Unsupported local gate profile schema version."
  }
  $profileDefinition = $registry.profiles.PSObject.Properties[$Profile].Value
  if ($null -eq $profileDefinition) {
    throw "Local gate profile '$Profile' is not defined."
  }
  Assert-ProfileDefinition $profileDefinition

  $preconditions = Test-ProfilePreconditions -Preconditions @($profileDefinition.preconditions) -Root $root
  if ($Profile -eq "MobileRelease" -and -not $AllowMobileRelease) {
    $preconditions += [ordered]@{
      type = "explicitManagedBuildApproval"
      status = "BLOCKED"
      detail = "MobileRelease can mutate the canonical managed UAT build root."
      nextAction = "Review the canonical script impact, then rerun with -AllowMobileRelease if that mutation is intended."
    }
  }
  $blocked = @($preconditions | Where-Object { $_.status -eq "BLOCKED" })
  $steps = @()
  $isPlan = $Plan -or $DryRun
  $profileSteps = @($profileDefinition.steps)
  if ($isPlan) {
    foreach ($step in $profileSteps) {
      $steps += New-GateStepResult -Id $step.id -Status $(if ($blocked.Count -eq 0) { "SKIP" } else { "BLOCKED" }) -Command (Format-Command $step.executable @($step.arguments)) -DurationMs 0 -ExitCode $null -NextAction $(if ($blocked.Count -eq 0) { "Run without -Plan to execute this step." } else { $blocked[0].nextAction })
    }
    $result = [ordered]@{ profile = $Profile; mode = "Plan"; status = if ($blocked.Count -eq 0) { "PASS" } else { "BLOCKED" }; description = $profileDefinition.description; estimatedImpact = $profileDefinition.estimatedImpact; preconditions = $preconditions; steps = $steps }
    $exitCode = if ($blocked.Count -eq 0) { 0 } else { 2 }
  } elseif ($blocked.Count -gt 0) {
    foreach ($step in $profileSteps) {
      $steps += New-GateStepResult -Id $step.id -Status "BLOCKED" -Command (Format-Command $step.executable @($step.arguments)) -DurationMs 0 -ExitCode $null -NextAction $blocked[0].nextAction
    }
    $result = [ordered]@{ profile = $Profile; mode = "Run"; status = "BLOCKED"; description = $profileDefinition.description; estimatedImpact = $profileDefinition.estimatedImpact; preconditions = $preconditions; steps = $steps }
    $exitCode = 2
  } else {
    $failed = $false
    for ($index = 0; $index -lt $profileSteps.Count; $index += 1) {
      $step = $profileSteps[$index]
      if ($failed) {
        $steps += New-GateStepResult -Id $step.id -Status "SKIP" -Command (Format-Command $step.executable @($step.arguments)) -DurationMs 0 -ExitCode $null -NextAction "Resolve the earlier failure before this step runs."
        continue
      }
      $resolved = Resolve-LocalGateExecutable $step.executable
      $arguments = @($resolved.prefix) + @($step.arguments)
      $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
      $LASTEXITCODE = 0
      $previousNativeErrorAction = $ErrorActionPreference
      try {
        $ErrorActionPreference = "Continue"
        if ($OutputFormat -eq "Json") {
          & $resolved.path @arguments 1>$null 2>$null
        } else {
          & $resolved.path @arguments
        }
        $commandExitCode = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $previousNativeErrorAction
      }
      $stopwatch.Stop()
      if ($commandExitCode -ne 0) {
        $steps += New-GateStepResult -Id $step.id -Status "FAIL" -Command (Format-Command $resolved.display $arguments) -DurationMs $stopwatch.Elapsed.TotalMilliseconds -ExitCode $commandExitCode -NextAction "Fix this command failure and rerun profile $Profile."
        $failed = $true
        $exitCode = $commandExitCode
      } else {
        $steps += New-GateStepResult -Id $step.id -Status "PASS" -Command (Format-Command $resolved.display $arguments) -DurationMs $stopwatch.Elapsed.TotalMilliseconds -ExitCode 0 -NextAction "Continue."
      }
    }
    if (-not $failed) {
      $exitCode = 0
    }
    $result = [ordered]@{ profile = $Profile; mode = "Run"; status = if ($failed) { "FAIL" } else { "PASS" }; description = $profileDefinition.description; estimatedImpact = $profileDefinition.estimatedImpact; preconditions = $preconditions; steps = $steps }
  }
} catch {
  $result = [ordered]@{ profile = $Profile; mode = if ($Plan -or $DryRun) { "Plan" } else { "Run" }; status = "BLOCKED"; description = "Local gate could not validate its safe registry."; estimatedImpact = "No external command was started."; preconditions = @(); steps = @((New-GateStepResult -Id "registry" -Status "BLOCKED" -Command "No external command" -DurationMs 0 -ExitCode $null -NextAction $_.Exception.Message)) }
  $exitCode = 2
}

Write-GateResult -Result $result -ExitCode $exitCode -Format $OutputFormat
