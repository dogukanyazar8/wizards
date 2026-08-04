Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:WhisprPackage = "team.whispr.mobile"

<#
  What each scenario has to have measured before its report counts.

  The old gate read the report's total `samples` line, which counts every sample
  of every kind: a run that produced 151 samples and only 28 chat opens passed as
  a complete 30-repetition run, and the SQLCipher scenario passed three times in a
  row while reporting `sqlcipher n=0` and `network n=30` — it never measured the
  thing it exists to measure. These are the cohort rows the panel prints, and a
  scenario fails when its own cohort is short.
#>
$script:ScenarioCohorts = @{
  "cold-start"       = @("startup")
  "warm-resume"      = @("resume")
  "cached-dm"        = @("DirectMessage-cached")
  "cached-channel"   = @("ChannelChat-cached")
  "sqlcipher"        = @("sqlcipher")
  "prefetch-network" = @("prefetch", "network")
  "send"             = @("send-echo", "send-ack")
  "content-scroll"   = @("lag")
  "event-loop"       = @("lag", "resume")
  "tap-dm"           = @("tap", "DirectMessage-cached")
}

# Sampled on a timer rather than once per repetition, so its floor is "any".
$script:CohortFloorOne = @("lag")
$script:FlowRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\..\.maestro\performance"))
$script:DefaultOutputRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\..\artifacts\mobile\performance"))

function Invoke-WhisprExternal {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [hashtable]$Environment = @{}
  )

  $LASTEXITCODE = 0
  $previousErrorAction = $ErrorActionPreference
  $previousEnvironment = @{}
  $output = @()
  $commandExitCode = $null
  try {
    foreach ($entry in $Environment.GetEnumerator()) {
      $key = [string]$entry.Key
      $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
      [Environment]::SetEnvironmentVariable($key, [string]$entry.Value, "Process")
    }

    # ADB/monkey writes ordinary diagnostics to stderr even on exit 0. Under
    # Windows PowerShell + Stop that becomes NativeCommandError before the real
    # exit code can be checked. Capture both streams, then trust process status.
    $ErrorActionPreference = "Continue"
    $output = @(& $FilePath @Arguments 2>&1)
    $commandExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable([string]$entry.Key, [string]$entry.Value, "Process")
    }
  }
  if ($commandExitCode -ne 0) {
    throw "$FilePath failed with exit code $commandExitCode.`n$($output -join [Environment]::NewLine)"
  }
  return $output
}

function Resolve-WhisprDeviceSerial {
  param([string]$DeviceSerial)

  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "adb was not found on PATH."
  }

  if ($DeviceSerial) {
    $state = (Invoke-WhisprExternal -FilePath "adb" -Arguments @("-s", $DeviceSerial, "get-state")) -join ""
    if ($state.Trim() -ne "device") {
      throw "ADB device '$DeviceSerial' is not authorized and online."
    }
    return $DeviceSerial
  }

  $devices = @(Invoke-WhisprExternal -FilePath "adb" -Arguments @("devices")) |
    ForEach-Object { [string]$_ } |
    Where-Object { $_ -match "^([^\s]+)\s+device$" } |
    ForEach-Object { ([regex]::Match($_, "^([^\s]+)")).Groups[1].Value }

  if ($devices.Count -ne 1) {
    throw "Exactly one authorized ADB device is required; found $($devices.Count). Pass -DeviceSerial explicitly."
  }
  return $devices[0]
}

function Invoke-WhisprAdb {
  param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  return Invoke-WhisprExternal -FilePath "adb" -Arguments (@("-s", $DeviceSerial) + $Arguments)
}

function Assert-WhisprDeviceReady {
  param([Parameter(Mandatory = $true)][string]$DeviceSerial)

  # Some Android builds return exit 1 for `pm path` when the package is absent,
  # bypassing this function's actionable preflight error. `list packages`
  # returns exit 0 for the same state and lets us report the real problem.
  $packages = @(Invoke-WhisprAdb -DeviceSerial $DeviceSerial -Arguments @("shell", "pm", "list", "packages", $script:WhisprPackage)) |
    ForEach-Object { ([string]$_).Trim() }
  if ($packages -notcontains "package:$($script:WhisprPackage)") {
    throw "Package '$($script:WhisprPackage)' is not installed on '$DeviceSerial'."
  }
  if (-not (Get-Command maestro -ErrorAction SilentlyContinue)) {
    throw "maestro was not found on PATH."
  }
}

function Get-WhisprPerfLogLines {
  param([Parameter(Mandatory = $true)][string]$DeviceSerial)
  return @(Invoke-WhisprAdb -DeviceSerial $DeviceSerial -Arguments @("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S")) |
    ForEach-Object { [string]$_ } |
    Where-Object { $_ -like "*WHISPR_PERF|*" }
}

function Wait-WhisprPerfMarker {
  param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][string]$RunId,
    [Parameter(Mandatory = $true)][ValidateSet("ACK", "END")][string]$Marker,
    [Parameter(Mandatory = $true)][string]$Command,
    [int]$TimeoutSeconds = 20
  )

  $escapedRunId = [regex]::Escape($RunId)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $lines = Get-WhisprPerfLogLines -DeviceSerial $DeviceSerial
    $errorPattern = "WHISPR_PERF\|ERROR\|$escapedRunId\|$([regex]::Escape($Command))\|([^\s|]+)"
    $errorLine = $lines | Where-Object { $_ -match $errorPattern } | Select-Object -Last 1
    if ($errorLine) {
      $match = [regex]::Match($errorLine, $errorPattern)
      throw "Performance bridge rejected '$Command': $($match.Groups[1].Value)."
    }

    $pattern = if ($Marker -eq "ACK") {
      "WHISPR_PERF\|ACK\|$escapedRunId\|$([regex]::Escape($Command))(?:\s|$)"
    } else {
      "WHISPR_PERF\|END\|$escapedRunId(?:\s|$)"
    }
    if ($lines | Where-Object { $_ -match $pattern } | Select-Object -First 1) {
      return
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Timed out waiting for performance bridge $Marker marker for '$Command'."
}

function Send-WhisprPerfCommand {
  param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][ValidateSet("reset", "purge", "prefetch", "export")][string]$Command,
    [Parameter(Mandatory = $true)][string]$RunId,
    [ValidateSet("channel", "dm")][string]$Scope,
    [string]$TargetId
  )

  $query = "runId=$([Uri]::EscapeDataString($RunId))"
  if ($Scope) {
    $query += "&scope=$Scope&targetId=$([Uri]::EscapeDataString($TargetId))"
  }
  $url = "whispr://performance/$Command`?$query"
  # `adb shell` joins its arguments into a remote shell command. Quote the URI
  # there so query separators are not interpreted as background operators.
  $shellQuotedUrl = "'$url'"
  [void](Invoke-WhisprAdb -DeviceSerial $DeviceSerial -Arguments @(
      "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", $shellQuotedUrl, "-p", $script:WhisprPackage
    ))
  # `prefetch` runs a real read through the app's own client: a 12s request
  # timeout, one retry and up to 2s of backoff is ~26s in the worst case. A 20s
  # host deadline fired first and failed runs the device was still serving —
  # eight of ten prefetch-network runs came back partial for this alone.
  $markerTimeoutSeconds = if ($Command -eq "prefetch") { 45 } else { 20 }
  Wait-WhisprPerfMarker `
    -DeviceSerial $DeviceSerial `
    -RunId $RunId `
    -Marker $(if ($Command -eq "export") { "END" } else { "ACK" }) `
    -Command $Command `
    -TimeoutSeconds $markerTimeoutSeconds
}

function ConvertFrom-WhisprPerformanceFrames {
  param(
    [Parameter(Mandatory = $true)][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$RunId
  )

  $escapedRunId = [regex]::Escape($RunId)
  $beginMatches = @($Lines | ForEach-Object {
      $match = [regex]::Match($_, "WHISPR_PERF\|BEGIN\|$escapedRunId\|(\d+)\|([a-f0-9]{64})")
      if ($match.Success) { $match }
    })
  $endCount = @($Lines | Where-Object { $_ -match "WHISPR_PERF\|END\|$escapedRunId(?:\s|$)" }).Count
  if ($beginMatches.Count -ne 1 -or $endCount -ne 1) {
    throw "Expected exactly one BEGIN and END frame for '$RunId'."
  }

  $expectedCount = [int]$beginMatches[0].Groups[1].Value
  $expectedHash = $beginMatches[0].Groups[2].Value
  $chunks = @{}
  foreach ($line in $Lines) {
    $match = [regex]::Match($line, "WHISPR_PERF\|CHUNK\|$escapedRunId\|(\d+)\|(\d+)\|(.*)$")
    if (-not $match.Success) { continue }
    $index = [int]$match.Groups[1].Value
    $declaredCount = [int]$match.Groups[2].Value
    if ($declaredCount -ne $expectedCount -or $index -lt 0 -or $index -ge $expectedCount -or $chunks.ContainsKey($index)) {
      throw "Invalid or duplicate report chunk for '$RunId'."
    }
    $chunks[$index] = $match.Groups[3].Value.TrimEnd()
  }
  if ($chunks.Count -ne $expectedCount) {
    throw "Missing report chunks for '$RunId': expected $expectedCount, received $($chunks.Count)."
  }

  $encoded = -join (0..($expectedCount - 1) | ForEach-Object { $chunks[$_] })
  $report = [Uri]::UnescapeDataString($encoded)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $actualHash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($report)) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha.Dispose()
  }
  if ($actualHash -ne $expectedHash) {
    throw "Performance report SHA-256 mismatch for '$RunId'."
  }
  return $report
}

function Invoke-WhisprMaestroFlow {
  param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][string]$FlowName,
    [hashtable]$Environment = @{},
    [switch]$DryRun
  )

  $flowPath = Join-Path $script:FlowRoot $FlowName
  $environmentArguments = @()
  $environmentText = @($Environment.GetEnumerator() | Sort-Object Name | ForEach-Object {
      $environmentArguments += @("-e", "$($_.Name)=$($_.Value)")
      "$($_.Name)=$($_.Value)"
    }) -join ";"
  if ($DryRun) {
    Write-Output "DRYRUN|MAESTRO|$FlowName|$environmentText"
    return
  }
  if (-not (Test-Path -LiteralPath $flowPath)) {
    throw "Maestro flow not found: $flowPath"
  }
  [void](Invoke-WhisprExternal -FilePath "maestro" -Arguments (@("--device", $DeviceSerial, "test") + $environmentArguments + @($flowPath)) -Environment @{ MAESTRO_EXIT_CONSOLE = "1" })
}

function Write-WhisprIterationProgress {
  param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][int]$Index,
    [Parameter(Mandatory = $true)][int]$Total
  )
  Write-Output "PERF|$Scenario|iteration=$Index/$Total"
}

function Initialize-WhisprScenarioState {
  param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][string]$DmConversationId,
    [switch]$DryRun
  )

  if ($Scenario -eq "prefetch-network") {
    # Test 10 intentionally ends on the target DM. Purging an actively observed
    # query and prefetching it immediately made test 11 depend on prior-screen
    # state. Leave the target first; the reset below removes preparation samples.
    Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment @{ PERF_DM_CONVERSATION_ID = $DmConversationId } -DryRun:$DryRun
    Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "return-to-dm-inbox.yml" -DryRun:$DryRun
    return
  }

  # Bridge commands are foreground links. Bring the signed-in shell up before
  # reset so a killed process cannot turn reset into a cold-start delivery race.
  Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "wait-for-app-shell.yml" -DryRun:$DryRun
}

function Invoke-WhisprScenarioWorkload {
  param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][int]$Repetitions,
    [Parameter(Mandatory = $true)][string]$RunId,
    [Parameter(Mandatory = $true)][string]$DmConversationId,
    [Parameter(Mandatory = $true)][string]$ServerId,
    [Parameter(Mandatory = $true)][string]$ChannelId,
    [switch]$DryRun
  )

  $dmEnvironment = @{ PERF_DM_CONVERSATION_ID = $DmConversationId }
  $channelEnvironment = @{ PERF_SERVER_ID = $ServerId; PERF_CHANNEL_ID = $ChannelId }
  $commandState = @{ Sequence = 0 }
  $adb = {
    param([string[]]$Arguments)
    if ($DryRun) { Write-Output "DRYRUN|ADB|$($Arguments -join ' ')" }
    else { [void](Invoke-WhisprAdb -DeviceSerial $DeviceSerial -Arguments $Arguments) }
  }
  $command = {
    param([string]$Name, [string]$Scope, [string]$TargetId)
    if ($DryRun) { Write-Output "DRYRUN|COMMAND|$Name|$Scope|$TargetId" }
    else {
      # Repeated commands cannot share an ACK key: an older marker would let the
      # host advance while the current command is still running.
      $commandState.Sequence = [int]$commandState.Sequence + 1
      $commandRunId = "$RunId-c$($commandState.Sequence)"
      Send-WhisprPerfCommand -DeviceSerial $DeviceSerial -Command $Name -RunId $commandRunId -Scope $Scope -TargetId $TargetId
    }
  }

  switch ($Scenario) {
    "cold-start" {
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        & $adb @("shell", "am", "force-stop", $script:WhisprPackage)
        & $adb @("shell", "monkey", "-p", $script:WhisprPackage, "-c", "android.intent.category.LAUNCHER", "1")
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      }
    }
    "warm-resume" {
      Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        & $adb @("shell", "input", "keyevent", "3")
        if (-not $DryRun) { Start-Sleep -Milliseconds 750 }
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      }
    }
    "cached-dm" {
      Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "return-to-dm-inbox.yml" -DryRun:$DryRun
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm-in-session.yml" -Environment $dmEnvironment -DryRun:$DryRun
      }
    }
    "cached-channel" {
      Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-channel.yml" -Environment $channelEnvironment -DryRun:$DryRun
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "return-from-channel.yml" -DryRun:$DryRun
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-channel-in-session.yml" -Environment $channelEnvironment -DryRun:$DryRun
      }
    }
    "tap-dm" {
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        # The flow activates the inbox before tapping. React Navigation retains
        # inactive routes in the accessibility tree, so a separate back flow can
        # match a hidden inbox while a channel is still the active screen.
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "tap-dm.yml" -DryRun:$DryRun
      }
    }
    "sqlcipher" {
      & $command "purge" "dm" $DmConversationId
      Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      # The production persistence hook writes 1,500 ms after the newest page
      # settles. Let that documented debounce finish before the first force-stop.
      if (-not $DryRun) { Start-Sleep -Milliseconds 1750 }
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        & $adb @("shell", "am", "force-stop", $script:WhisprPackage)
        & $adb @(
          "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
          "-d", "'whispr://channels/@me/$DmConversationId'", "-p", $script:WhisprPackage
        )
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "wait-for-dm.yml" -DryRun:$DryRun
      }
    }
    "prefetch-network" {
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        & $command "purge" "dm" $DmConversationId
        & $command "prefetch" "dm" $DmConversationId
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "return-to-dm-inbox.yml" -DryRun:$DryRun
        & $command "purge" "dm" $DmConversationId
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "return-to-dm-inbox.yml" -DryRun:$DryRun
      }
    }
    "send" {
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        $environment = @{
          PERF_DM_CONVERSATION_ID = $DmConversationId
          PERF_MESSAGE = "perf-auto-$RunId-$index"
        }
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "send-dm.yml" -Environment $environment -DryRun:$DryRun
      }
    }
    "content-scroll" {
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "scroll-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "scroll-channel.yml" -Environment $channelEnvironment -DryRun:$DryRun
      }
    }
    "event-loop" {
      Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      for ($index = 1; $index -le $Repetitions; $index++) {
        Write-WhisprIterationProgress -Scenario $Scenario -Index $index -Total $Repetitions
        & $adb @("shell", "input", "keyevent", "3")
        if (-not $DryRun) { Start-Sleep -Milliseconds 750 }
        Invoke-WhisprMaestroFlow -DeviceSerial $DeviceSerial -FlowName "open-dm.yml" -Environment $dmEnvironment -DryRun:$DryRun
      }
    }
  }
}

function Get-WhisprReportCohortCount {
  param(
    [Parameter(Mandatory = $true)][string]$Report,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $match = [regex]::Match($Report, "(?m)^$([regex]::Escape($Label))\s+n=(\d+)")
  # -1 means the row is absent, which is a different failure from a row that ran
  # and measured nothing: one is a report shape change, the other is a short run.
  if (-not $match.Success) { return -1 }
  return [int]$match.Groups[1].Value
}

function Test-WhisprScenarioCohorts {
  param(
    [Parameter(Mandatory = $true)][string]$Report,
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][int]$Repetitions
  )

  if (-not $script:ScenarioCohorts.ContainsKey($Scenario)) {
    return "Scenario '$Scenario' declares no cohort to validate."
  }

  foreach ($label in $script:ScenarioCohorts[$Scenario]) {
    $minimum = if ($script:CohortFloorOne -contains $label) { 1 } else { $Repetitions }
    $count = Get-WhisprReportCohortCount -Report $Report -Label $label
    if ($count -lt 0) {
      return "Report has no '$label' row; the scenario measured nothing it is for."
    }
    if ($count -lt $minimum) {
      return "Cohort '$label' reported $count samples, expected at least $minimum."
    }
  }

  return $null
}

function Export-WhisprPerformanceReport {
  param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [Parameter(Mandatory = $true)][string]$RunId,
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][int]$MinimumSamples,
    [switch]$Partial,
    [switch]$DryRun
  )

  if ($DryRun) {
    Write-Output "DRYRUN|EXPORT|$RunId|$Scenario"
    return
  }

  Send-WhisprPerfCommand -DeviceSerial $DeviceSerial -Command "export" -RunId $RunId
  $report = ConvertFrom-WhisprPerformanceFrames -Lines (Get-WhisprPerfLogLines -DeviceSerial $DeviceSerial) -RunId $RunId
  $validationError = $null
  if (-not $Partial) {
    $validationError = Test-WhisprScenarioCohorts -Report $report -Scenario $Scenario -Repetitions $MinimumSamples
    $sampleMatch = [regex]::Match($report, "(?m)^samples (\d+)\s*$")
    if (-not $validationError) {
      if (-not $sampleMatch.Success -or [int]$sampleMatch.Groups[1].Value -lt $MinimumSamples) {
        $validationError = "Report contains fewer than $MinimumSamples samples."
      } elseif ($Scenario -eq "sqlcipher" -and $report -notmatch "(?m)^cipher_version (?!-)\S+.*\| status open \|") {
        $validationError = "Report does not prove an open SQLCipher store."
      }
    }
  }

  $runDirectory = Join-Path $OutputRoot $RunId
  [void](New-Item -ItemType Directory -Force -Path $runDirectory)
  $isPartial = $Partial -or $null -ne $validationError
  $suffix = if ($isPartial) { ".partial.txt" } else { ".txt" }
  $artifactPath = Join-Path $runDirectory "$Scenario$suffix"
  [IO.File]::WriteAllText($artifactPath, $report, (New-Object Text.UTF8Encoding($false)))
  Write-Output $artifactPath
  if ($validationError) { throw $validationError }
}

function Invoke-WhisprPerformanceScenario {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("cold-start", "warm-resume", "cached-dm", "cached-channel", "sqlcipher", "prefetch-network", "send", "content-scroll", "event-loop", "tap-dm")]
    [string]$Scenario,
    [string]$DeviceSerial = "",
    [ValidateRange(1, 100)][int]$Repetitions = 30,
    [ValidatePattern("^[0-9a-fA-F-]{36}$")][string]$DmConversationId = "a2190c2f-bc49-4cf0-862f-bbd0f8724e26",
    [ValidatePattern("^[0-9a-fA-F-]{36}$")][string]$ServerId = "6883598c-b338-4859-bbb7-10c22ea6074e",
    [ValidatePattern("^[0-9a-fA-F-]{36}$")][string]$ChannelId = "521474f4-111a-4654-bffb-41e41450dd29",
    [string]$OutputRoot = $script:DefaultOutputRoot,
    [switch]$DryRun
  )

  $runId = "$Scenario-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmss'))-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
  $serial = if ($DryRun) { "DRY-RUN" } else { Resolve-WhisprDeviceSerial -DeviceSerial $DeviceSerial }
  if (-not $DryRun) { Assert-WhisprDeviceReady -DeviceSerial $serial }

  $workloadError = $null
  try {
    Initialize-WhisprScenarioState -Scenario $Scenario -DeviceSerial $serial -DmConversationId $DmConversationId -DryRun:$DryRun
    if ($DryRun) { Write-Output "DRYRUN|RESET|$runId" }
    else { Send-WhisprPerfCommand -DeviceSerial $serial -Command "reset" -RunId $runId }
    Invoke-WhisprScenarioWorkload -Scenario $Scenario -DeviceSerial $serial -Repetitions $Repetitions -RunId $runId -DmConversationId $DmConversationId -ServerId $ServerId -ChannelId $ChannelId -DryRun:$DryRun
  } catch {
    $workloadError = $_
  }

  $exportError = $null
  try {
    Export-WhisprPerformanceReport -DeviceSerial $serial -RunId $runId -Scenario $Scenario -OutputRoot $OutputRoot -MinimumSamples $Repetitions -Partial:($null -ne $workloadError) -DryRun:$DryRun
  } catch {
    $exportError = $_
  }

  if ($workloadError) {
    if ($exportError) { Write-Warning "Partial export also failed: $($exportError.Exception.Message)" }
    throw $workloadError
  }
  if ($exportError) { throw $exportError }
}

Export-ModuleMember -Function Invoke-WhisprPerformanceScenario, ConvertFrom-WhisprPerformanceFrames
