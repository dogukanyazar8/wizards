[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ExecutablePath,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Out,

  [ValidateRange(1, 10)]
  [int]$Iterations = 5,

  [ValidateRange(60, 600)]
  [int]$IdleSeconds = 60,

  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$memoryBudgetMb = 220
$startupBudgetMs = 2000
$overlayCpuBudgetPercent = 3
$shortcutLatencyBudgetMs = 50

function New-Metric {
  param(
    [string]$Id,
    [string]$Status,
    [object]$Value,
    [string]$Budget,
    [string]$Method,
    [string]$Limitations,
    [object]$Diagnostic = $null
  )

  $metric = [ordered]@{
    id = $Id
    status = $Status
    value = $Value
    budget = $Budget
    method = $Method
    limitations = $Limitations
  }

  if ($null -ne $Diagnostic) {
    $metric["diagnostic"] = $Diagnostic
  }

  return [pscustomobject]$metric
}

function New-Artifact {
  param(
    [int]$MeasurementIterations,
    [int]$IdleDurationSeconds,
    [double[]]$LaunchToProcessMs = @(),
    [double[]]$MemorySamplesMb = @(),
    [bool]$ProcessFamilyComplete = $false
  )

  $roundedMemorySamples = @($MemorySamplesMb | ForEach-Object { [math]::Round($_, 2) })
  $completeMemorySamples = (
    $ProcessFamilyComplete -and
    $MeasurementIterations -ge 1 -and
    $IdleDurationSeconds -ge 60 -and
    $roundedMemorySamples.Count -eq $MeasurementIterations
  )
  $memoryStatus = "ENV_BLOCKED"
  $memoryValue = $null

  if ($completeMemorySamples) {
    $memoryValue = [math]::Round(($roundedMemorySamples | Measure-Object -Maximum).Maximum, 2)
    $memoryStatus = if ($memoryValue -le $memoryBudgetMb) { "PASS" } else { "FAIL" }
  }

  return [ordered]@{
    schemaVersion = 1
    tool = "measure-windows-desktop"
    platform = "windows"
    generatedAt = [DateTime]::UtcNow.ToString("o")
    idleSeconds = $IdleDurationSeconds
    iterations = $MeasurementIterations
    metrics = @(
      (New-Metric -Id "cold-start" -Status "NOT_RUN" -Value $null -Budget "<= $startupBudgetMs`ms" -Method "No native interactive-ready acknowledgement bridge is available." -Limitations "Process creation timing cannot prove a cold interactive desktop start." -Diagnostic ([ordered]@{ launchToProcessMs = @($LaunchToProcessMs | ForEach-Object { [math]::Round($_, 2) }) }))
      (New-Metric -Id "warm-start" -Status "NOT_RUN" -Value $null -Budget "<= $startupBudgetMs`ms" -Method "No native interactive-ready acknowledgement bridge is available." -Limitations "Process creation timing cannot prove a warm interactive desktop start." -Diagnostic ([ordered]@{ launchToProcessMs = @($LaunchToProcessMs | ForEach-Object { [math]::Round($_, 2) }) }))
      (New-Metric -Id "process-family-memory" -Status $memoryStatus -Value $memoryValue -Budget "<= $memoryBudgetMb`MB" -Method "Sum working sets for the launched process and observed descendants after idle." -Limitations "Detached or OS-owned WebView processes make the process-family sample incomplete." -Diagnostic ([ordered]@{ sampleCount = $roundedMemorySamples.Count; samplesMb = @($roundedMemorySamples) }))
      (New-Metric -Id "overlay-cpu" -Status "NOT_RUN" -Value $null -Budget "<= $overlayCpuBudgetPercent% average" -Method "No overlay-visible readiness or process attribution bridge is available." -Limitations "The harness does not inject input or open a companion window.")
      (New-Metric -Id "shortcut-latency" -Status "NOT_RUN" -Value $null -Budget "<= $shortcutLatencyBudgetMs`ms p95" -Method "No trusted shortcut acknowledgement bridge is available." -Limitations "The harness does not inject global input or observe renderer acknowledgement.")
      (New-Metric -Id "updater-check-install-relaunch" -Status "NOT_RUN" -Value $null -Budget "success" -Method "Updater network, installation, and relaunch are intentionally not invoked." -Limitations "A signed artifact and controlled HTTPS feed are required for this smoke test.")
    )
  }
}

function Assert-ArtifactContract {
  param([string]$ArtifactPath)

  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand) {
    throw "Node.js is required to validate desktop measurement evidence."
  }

  $contractPath = Join-Path $PSScriptRoot "measure-windows-desktop.contract.mjs"
  & $nodeCommand.Source $contractPath $ArtifactPath
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop measurement artifact contract validation failed."
  }
}

function Write-Artifact {
  param([System.Collections.IDictionary]$Artifact)

  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  if (Test-Path -LiteralPath $outPath) {
    throw "Evidence output already exists and will not be overwritten: $outPath"
  }

  $temporaryPath = Join-Path $evidenceRoot ".measure-windows-desktop-$([guid]::NewGuid().ToString('N')).tmp"
  $serialized = $Artifact | ConvertTo-Json -Depth 8
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $stream = $null
  $writer = $null
  $published = $false

  try {
    $stream = [System.IO.File]::Open($temporaryPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $writer = New-Object System.IO.StreamWriter($stream, $encoding)
    $writer.Write($serialized)
    $writer.Flush()
    $stream.Flush($true)
    $writer.Dispose()
    $writer = $null
    $stream = $null

    Assert-ArtifactContract -ArtifactPath $temporaryPath
    [System.IO.File]::Move($temporaryPath, $outPath)
    $published = $true
  } finally {
    if ($null -ne $writer) {
      $writer.Dispose()
    } elseif ($null -ne $stream) {
      $stream.Dispose()
    }

    if (-not $published -and (Test-Path -LiteralPath $temporaryPath)) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }

  Write-Output "Wrote desktop performance evidence to $outPath"
}

function ConvertTo-ProcessIdentity {
  param([System.Diagnostics.Process]$Process)

  try {
    return [pscustomobject]@{
      ProcessId = [int]$Process.Id
      StartTimeUtc = $Process.StartTime.ToUniversalTime()
    }
  } catch {
    return $null
  }
}

function Get-NamedProcessSnapshot {
  param([string]$Name)

  $processIdentities = @()
  $complete = $true
  foreach ($process in @(Get-Process -Name $Name -ErrorAction SilentlyContinue)) {
    $identity = ConvertTo-ProcessIdentity -Process $process
    if ($null -eq $identity) {
      $complete = $false
      continue
    }

    $processIdentities += $identity
  }

  return [pscustomobject]@{
    Complete = $complete
    ProcessIdentities = @($processIdentities)
  }
}

function Test-ProcessIdentity {
  param(
    [object]$Expected,
    [object]$Actual
  )

  return (
    $null -ne $Expected -and
    $null -ne $Actual -and
    $Expected.ProcessId -eq $Actual.ProcessId -and
    $Expected.StartTimeUtc.Ticks -eq $Actual.StartTimeUtc.Ticks
  )
}

function Test-ProcessIdentityInCollection {
  param(
    [object]$Identity,
    [object[]]$Collection
  )

  foreach ($candidate in $Collection) {
    if (Test-ProcessIdentity -Expected $candidate -Actual $Identity) {
      return $true
    }
  }

  return $false
}

function ConvertTo-CimProcessStartTime {
  param([object]$CreationDate)

  if ($null -eq $CreationDate) {
    return $null
  }

  try {
    if ($CreationDate -is [datetime]) {
      return $CreationDate.ToUniversalTime()
    }

    $serializedCreationDate = [string]$CreationDate
    if ([string]::IsNullOrWhiteSpace($serializedCreationDate)) {
      return $null
    }

    return [System.Management.ManagementDateTimeConverter]::ToDateTime($serializedCreationDate).ToUniversalTime()
  } catch {
    return $null
  }
}

function Get-ProcessFamily {
  param([int]$RootProcessId)

  $processSnapshotsByProcessId = @{}
  foreach ($processInfo in Get-CimInstance Win32_Process) {
    $startTimeUtc = ConvertTo-CimProcessStartTime -CreationDate $processInfo.CreationDate

    $processSnapshotsByProcessId[[int]$processInfo.ProcessId] = [pscustomobject]@{
      ProcessId = [int]$processInfo.ProcessId
      ParentProcessId = [int]$processInfo.ParentProcessId
      StartTimeUtc = $startTimeUtc
    }
  }

  $pending = [System.Collections.Generic.Queue[int]]::new()
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $pending.Enqueue($RootProcessId)

  while ($pending.Count -gt 0) {
    $currentProcessId = $pending.Dequeue()
    if (-not $seen.Add($currentProcessId)) {
      continue
    }

    foreach ($candidateSnapshot in $processSnapshotsByProcessId.Values) {
      if ($candidateSnapshot.ParentProcessId -eq $currentProcessId) {
        $pending.Enqueue($candidateSnapshot.ProcessId)
      }
    }
  }

  $workingSetBytes = [int64]0
  $processIdentities = @()
  $complete = $true
  foreach ($processId in $seen) {
    $processSnapshot = $processSnapshotsByProcessId[$processId]
    if ($null -eq $processSnapshot -or $null -eq $processSnapshot.StartTimeUtc) {
      $complete = $false
      continue
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      $complete = $false
      continue
    }

    $identity = ConvertTo-ProcessIdentity -Process $process
    if ($null -eq $identity) {
      $complete = $false
      continue
    }

    if (-not (Test-ProcessIdentity -Expected $processSnapshot -Actual $identity)) {
      $complete = $false
      continue
    }

    $workingSetBytes += [int64]$process.WorkingSet64
    $processIdentities += $identity
  }

  return [pscustomobject]@{
    Complete = $complete
    ProcessIdentities = @($processIdentities)
    WorkingSetMb = $workingSetBytes / 1MB
  }
}

function Get-VerifiedProcess {
  param(
    [int]$ProcessId,
    [datetime]$ExpectedStartTimeUtc
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return $null
  }

  try {
    if ($process.StartTime.ToUniversalTime().Ticks -ne $ExpectedStartTimeUtc.Ticks) {
      return $null
    }
  } catch {
    return $null
  }

  return $process
}

function Stop-ProcessFamily {
  param([object[]]$ProcessIdentities)

  foreach ($identity in $ProcessIdentities | Sort-Object ProcessId -Descending) {
    $process = Get-VerifiedProcess -ProcessId $identity.ProcessId -ExpectedStartTimeUtc $identity.StartTimeUtc
    if ($null -ne $process) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$evidenceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot "artifacts\desktop-performance"))
$outPath = if ([System.IO.Path]::IsPathRooted($Out)) {
  [System.IO.Path]::GetFullPath($Out)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $Out))
}

if (-not [string]::Equals((Split-Path -Parent $outPath), $evidenceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Out must be a direct .json file under $evidenceRoot."
}

if ([System.IO.Path]::GetExtension($outPath) -ine ".json") {
  throw "Out must have a .json extension."
}

$executable = Get-Item -LiteralPath $ExecutablePath
if ($executable.PSIsContainer -or $executable.Extension -ine ".exe") {
  throw "ExecutablePath must name a Windows .exe file."
}

if ($WhatIfPreference) {
  Write-Output "WhatIf: would write desktop performance evidence to $outPath"
  exit 0
}

if ($NoLaunch) {
  Write-Artifact (New-Artifact -MeasurementIterations 0 -IdleDurationSeconds $IdleSeconds)
  exit 0
}

if (-not $PSCmdlet.ShouldProcess($executable.Name, "launch and stop only its observed process family")) {
  Write-Output "Measurement was not run because process launch was not approved."
  exit 0
}

$existingProcess = Get-Process -Name $executable.BaseName -ErrorAction SilentlyContinue
if ($null -ne $existingProcess) {
  Write-Artifact (New-Artifact -MeasurementIterations 0 -IdleDurationSeconds $IdleSeconds)
  Write-Warning "Measurement skipped because a target process is already running."
  exit 0
}

$baselineWebViewProcessSnapshot = Get-NamedProcessSnapshot -Name "msedgewebview2"
if (-not $baselineWebViewProcessSnapshot.Complete -or $baselineWebViewProcessSnapshot.ProcessIdentities.Count -gt 0) {
  Write-Artifact (New-Artifact -MeasurementIterations 0 -IdleDurationSeconds $IdleSeconds)
  Write-Warning "Measurement skipped because an existing WebView2 process cannot be attributed safely."
  exit 0
}

$launchToProcessMs = @()
$memorySamplesMb = @()
$completeSamples = $true

for ($iteration = 1; $iteration -le $Iterations; $iteration += 1) {
  $rootProcess = $null
  $rootStartTimeUtc = $null
  $rootIdentity = $null
  $processFamily = $null

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $rootProcess = Start-Process -FilePath $executable.FullName -PassThru
  $rootStartTimeUtc = $rootProcess.StartTime.ToUniversalTime()
  $rootIdentity = [pscustomobject]@{
    ProcessId = [int]$rootProcess.Id
    StartTimeUtc = $rootStartTimeUtc
  }
  $stopwatch.Stop()
  $launchToProcessMs += $stopwatch.Elapsed.TotalMilliseconds

  try {
    Start-Sleep -Seconds $IdleSeconds
    $verifiedRootProcess = Get-VerifiedProcess -ProcessId $rootIdentity.ProcessId -ExpectedStartTimeUtc $rootIdentity.StartTimeUtc
    if ($null -eq $verifiedRootProcess) {
      $completeSamples = $false
      break
    }

    $processFamily = Get-ProcessFamily -RootProcessId $rootIdentity.ProcessId
    if (
      -not $processFamily.Complete -or
      $processFamily.ProcessIdentities.Count -eq 0 -or
      -not (Test-ProcessIdentityInCollection -Identity $rootIdentity -Collection $processFamily.ProcessIdentities)
    ) {
      $completeSamples = $false
      break
    }

    $currentWebViewProcessSnapshot = Get-NamedProcessSnapshot -Name "msedgewebview2"
    if (-not $currentWebViewProcessSnapshot.Complete) {
      $completeSamples = $false
      break
    }

    $currentWebViewProcessIdentities = $currentWebViewProcessSnapshot.ProcessIdentities
    $newWebViewProcessIdentities = @(
      $currentWebViewProcessIdentities |
        Where-Object {
          -not (Test-ProcessIdentityInCollection -Identity $_ -Collection $baselineWebViewProcessSnapshot.ProcessIdentities)
        }
    )
    $unattributedWebViewProcessIdentities = @(
      $newWebViewProcessIdentities |
        Where-Object {
          -not (Test-ProcessIdentityInCollection -Identity $_ -Collection $processFamily.ProcessIdentities)
        }
    )
    if ($unattributedWebViewProcessIdentities.Count -gt 0) {
      $completeSamples = $false
      break
    }

    $memorySamplesMb += $processFamily.WorkingSetMb
  } finally {
    if ($null -ne $processFamily) {
      Stop-ProcessFamily -ProcessIdentities $processFamily.ProcessIdentities
    } elseif ($null -ne $rootIdentity) {
      $ownedRootProcess = Get-VerifiedProcess -ProcessId $rootIdentity.ProcessId -ExpectedStartTimeUtc $rootIdentity.StartTimeUtc
      if ($null -ne $ownedRootProcess) {
        Stop-Process -Id $ownedRootProcess.Id -Force -ErrorAction SilentlyContinue
      }
    }
  }

  Start-Sleep -Milliseconds 500
}

Write-Artifact (
  New-Artifact `
    -MeasurementIterations $Iterations `
    -IdleDurationSeconds $IdleSeconds `
    -LaunchToProcessMs $launchToProcessMs `
    -MemorySamplesMb $memorySamplesMb `
    -ProcessFamilyComplete ($completeSamples -and $memorySamplesMb.Count -eq $Iterations)
)
