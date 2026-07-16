param(
  [string]$SourceRoot,
  [string]$BuildHome = "C:\wm",
  [string]$ManagedBuildRoot = "C:\whispr_dev\whispr_uat\whispr_mobile",
  [string]$BuildRoot,
  [string]$ApkOutputDir,
  [string]$JavaHome = "C:\Program Files\Java\jdk-17",
  [string]$AndroidHome = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$AndroidArchitectures,
  [ValidateSet("debug", "release")]
  [string]$BuildType = "debug",
  [ValidateRange(32, 120)]
  [int]$PnpmVirtualStoreMaxLength = 32,
  [int]$WaitForDeviceSeconds = 90,
  [ValidateRange(1024, 65535)]
  [int]$DevServerPort = 8081,
  [switch]$SkipSync,
  [switch]$SkipUninstall,
  [switch]$SkipInstall,
  [switch]$NoStartMetro,
  [switch]$DisableGradleBuildCache,
  [switch]$CleanAndroidCaches
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PackageName = "team.whispr.mobile"
$UatUrl = "https://wizardsweb-uat.up.railway.app"
$BuildHomeMarkerFileName = ".whispr-mobile-uat-build-root.json"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-ExistingPath {
  param([string]$PathValue, [string]$Name)

  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "$Name does not exist: $PathValue"
  }

  return (Resolve-Path -LiteralPath $PathValue).Path
}

function Initialize-WhisprUatBuildHome {
  param([string]$BuildHomePath)

  if (-not [System.IO.Path]::IsPathRooted($BuildHomePath)) {
    throw "BuildHome must be an absolute path. Received: $BuildHomePath"
  }

  New-Item -ItemType Directory -Force -Path $BuildHomePath | Out-Null
  $resolvedBuildHome = Resolve-ExistingPath $BuildHomePath "BuildHome"
  $markerPath = Join-Path $resolvedBuildHome $BuildHomeMarkerFileName

  if (Test-Path -LiteralPath $markerPath) {
    try {
      $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    } catch {
      throw "BuildHome marker is invalid: $markerPath"
    }

    if ($marker.managedBy -ne "whispr-mobile-uat") {
      throw "BuildHome is not owned by the Whispr mobile UAT build script: $resolvedBuildHome"
    }
  } else {
    $existingEntries = @(
      Get-ChildItem -Force -LiteralPath $resolvedBuildHome |
        Where-Object { $_.Name -ne $BuildHomeMarkerFileName }
    )
    if ($existingEntries.Count -gt 0) {
      throw "BuildHome is not empty and has no Whispr UAT ownership marker: $resolvedBuildHome"
    }

    [pscustomobject]@{
      managedBy = "whispr-mobile-uat"
      schemaVersion = 1
    } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
  }

  return $resolvedBuildHome
}

function Ensure-WhisprUatManagedRootLink {
  param(
    [string]$ManagedBuildRootPath,
    [string]$ResolvedBuildHome
  )

  if (-not [System.IO.Path]::IsPathRooted($ManagedBuildRootPath)) {
    throw "ManagedBuildRoot must be an absolute path. Received: $ManagedBuildRootPath"
  }

  $normalizedManagedBuildRoot = [System.IO.Path]::GetFullPath($ManagedBuildRootPath).TrimEnd("\\")
  $buildHomeDrive = [System.IO.Path]::GetPathRoot($ResolvedBuildHome)
  $managedRootDrive = [System.IO.Path]::GetPathRoot($normalizedManagedBuildRoot)
  if (-not $managedRootDrive.Equals($buildHomeDrive, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ManagedBuildRoot must use the same drive as BuildHome to keep React Native codegen paths compatible. ManagedBuildRoot: $normalizedManagedBuildRoot; BuildHome: $ResolvedBuildHome"
  }

  $managedRootParent = Split-Path -Parent $normalizedManagedBuildRoot
  if (-not $managedRootParent) {
    throw "ManagedBuildRoot must not be a drive root. Received: $normalizedManagedBuildRoot"
  }

  if (-not (Test-Path -LiteralPath $managedRootParent)) {
    New-Item -ItemType Directory -Force -Path $managedRootParent | Out-Null
  }

  if (Test-Path -LiteralPath $normalizedManagedBuildRoot) {
    $existingLink = Get-Item -Force -LiteralPath $normalizedManagedBuildRoot
    if ($existingLink.LinkType -ne "Junction") {
      throw "ManagedBuildRoot already exists and is not a junction: $normalizedManagedBuildRoot"
    }

    $existingTargets = @($existingLink.Target | Where-Object { $_ })
    if ($existingTargets.Count -ne 1) {
      throw "ManagedBuildRoot must have exactly one target: $normalizedManagedBuildRoot"
    }

    $resolvedExistingTarget = Resolve-ExistingPath $existingTargets[0] "ManagedBuildRoot target"
    if (-not $resolvedExistingTarget.Equals($ResolvedBuildHome, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "ManagedBuildRoot targets $resolvedExistingTarget. It must target $ResolvedBuildHome for Whispr mobile UAT builds."
    }
  } else {
    New-Item -ItemType Junction -Path $normalizedManagedBuildRoot -Target $ResolvedBuildHome | Out-Null
  }

  if (-not (Test-Path -LiteralPath $normalizedManagedBuildRoot)) {
    throw "Whispr UAT managed-root junction is unavailable after setup: $normalizedManagedBuildRoot"
  }

  return $normalizedManagedBuildRoot
}

function Assert-WhisprUatManagedPath {
  param(
    [string]$ResolvedBuildHome,
    [string]$PathValue,
    [string]$Name
  )

  $normalizedBuildHome = [System.IO.Path]::GetFullPath($ResolvedBuildHome).TrimEnd("\\")
  $normalizedPath = [System.IO.Path]::GetFullPath($PathValue).TrimEnd("\\")
  $prefix = "$normalizedBuildHome\"

  if (-not $normalizedPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Name must remain inside the managed Whispr UAT build home. Received: $normalizedPath"
  }
}

function Use-WhisprMobileUatBuildMutex {
  $mutex = New-Object System.Threading.Mutex($false, "WhisprMobileUatBuild")
  $acquired = $false

  try {
    try {
      $acquired = $mutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
      Write-Host "Recovered an abandoned Whispr mobile UAT build lock." -ForegroundColor Yellow
    }

    if (-not $acquired) {
      throw "Another Whispr mobile UAT build is already running. Wait for it to finish before starting another build."
    }

    return $mutex
  } catch {
    $mutex.Dispose()
    throw
  }
}

function Invoke-CommandChecked {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-RobocopyChecked {
  param(
    [string]$From,
    [string]$To
  )

  $excludedDirectories = @(
    ".git",
    ".codex",
    ".turbo",
    ".next",
    ".pnpm-store",
    ".secrets",
    "node_modules",
    "artifacts",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "blob-report",
    "target",
    "apps\desktop\.tauri",
    "apps\desktop\src-tauri\target",
    "apps\mobile\android\.cxx",
    "apps\mobile\android\.gradle",
    "apps\mobile\android\build",
    "apps\mobile\android\app\build"
  )

  $excludedFiles = @(
    ".env",
    ".env.*",
    "*.log",
    "*.tsbuildinfo"
  )

  $args = @(
    $From,
    $To,
    "/MIR",
    "/FFT",
    "/XJ",
    "/R:2",
    "/W:2",
    "/MT:16",
    "/NP",
    "/XD"
  ) + $excludedDirectories + @("/XF") + $excludedFiles

  Write-Host "> robocopy $From $To ..." -ForegroundColor DarkGray
  & robocopy @args
  $code = $LASTEXITCODE

  if ($code -ge 8) {
    throw "Robocopy failed with exit code $code."
  }

  Write-Host "Robocopy completed with exit code $code." -ForegroundColor DarkGray
}

function Ensure-ProjectNpmrc {
  param(
    [string]$Root,
    [string]$StoreDir,
    [string]$VirtualStoreDir,
    [int]$VirtualStoreMaxLength
  )

  $npmrcPath = Join-Path $Root ".npmrc"
  $content = ""

  if (Test-Path -LiteralPath $npmrcPath) {
    $content = Get-Content -Raw -LiteralPath $npmrcPath
  }

  $settings = [ordered]@{
    "store-dir" = $StoreDir
    "virtual-store-dir" = $VirtualStoreDir
    "virtual-store-dir-max-length" = $VirtualStoreMaxLength
  }

  $updated = $content
  foreach ($entry in $settings.GetEnumerator()) {
    $pattern = "(?m)^$([regex]::Escape($entry.Key))\s*=.*$"
    $line = "$($entry.Key)=$($entry.Value)"
    if ($updated -match $pattern) {
      $updated = $updated -replace $pattern, $line
    } else {
      $updated = "$($updated.TrimEnd())`r`n$line`r`n"
    }
  }

  if ($updated -ne $content) {
    Set-Content -LiteralPath $npmrcPath -Value $updated -Encoding utf8
  }
}

function Ensure-AndroidLocalProperties {
  param([string]$MobileRoot, [string]$SdkRoot)

  $androidRoot = Join-Path $MobileRoot "android"
  $localPropertiesPath = Join-Path $androidRoot "local.properties"
  $escapedSdkRoot = $SdkRoot.Replace("\", "\\")
  Set-Content -LiteralPath $localPropertiesPath -Value "sdk.dir=$escapedSdkRoot" -Encoding ascii
}

function Get-ConnectedAndroidDeviceIds {
  $output = & adb devices
  if ($LASTEXITCODE -ne 0) {
    throw "adb devices failed. Check Android SDK platform-tools."
  }

  return @(
    $output |
      Select-Object -Skip 1 |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -match "\tdevice$" } |
      ForEach-Object { ($_ -split "\s+")[0] }
  )
}

function Get-AndroidDeviceRows {
  $output = & adb devices
  if ($LASTEXITCODE -ne 0) {
    throw "adb devices failed. Check Android SDK platform-tools."
  }

  return @(
    $output |
      Select-Object -Skip 1 |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ }
  )
}

function Get-AndroidDevicePrimaryAbi {
  param([string]$DeviceId)

  $abi = Get-AndroidDeviceProperty -DeviceId $DeviceId -Property "ro.product.cpu.abi"
  if ($abi) {
    return $abi
  }

  $abiList = Get-AndroidDeviceProperty -DeviceId $DeviceId -Property "ro.product.cpu.abilist"

  $firstAbi = (([string]$abiList) -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 1)
  if (-not $firstAbi) {
    throw "Device $DeviceId did not report a usable Android CPU ABI. The emulator may still be booting. Retry once it is fully on the home screen, or pass -AndroidArchitectures x86_64 for a Pixel emulator."
  }

  return $firstAbi
}

function Get-AndroidDeviceProperty {
  param(
    [string]$DeviceId,
    [string]$Property,
    [int]$Attempts = 5
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $output = @(& adb -s $DeviceId shell getprop $Property 2>$null)
    $exitCode = $LASTEXITCODE
    $value = (
      $output |
        ForEach-Object { ([string]$_).Replace("`r", "").Trim() } |
        Where-Object { $_ } |
        Select-Object -First 1
    )

    if ($exitCode -eq 0 -and $value) {
      return $value
    }

    if ($attempt -lt $Attempts) {
      Start-Sleep -Seconds 1
    }
  }

  return $null
}

function Resolve-ReactNativeArchitectures {
  param(
    [string[]]$DeviceIds,
    [string]$OverrideArchitectures
  )

  $supportedArchitectures = @("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
  $architectures = New-Object "System.Collections.Generic.List[string]"

  if ($OverrideArchitectures) {
    foreach ($architecture in ($OverrideArchitectures -split ",")) {
      $normalized = $architecture.Trim()
      if (-not $normalized) {
        continue
      }

      if ($supportedArchitectures -notcontains $normalized) {
        throw "Unsupported Android architecture '$normalized'. Supported values: $($supportedArchitectures -join ', ')."
      }

      if (-not $architectures.Contains($normalized)) {
        [void]$architectures.Add($normalized)
      }
    }
  } else {
    foreach ($deviceId in $DeviceIds) {
      $abi = Get-AndroidDevicePrimaryAbi -DeviceId $deviceId
      if ($supportedArchitectures -notcontains $abi) {
        throw "Unsupported Android device ABI '$abi' reported by $deviceId. Supported values: $($supportedArchitectures -join ', ')."
      }

      if (-not $architectures.Contains($abi)) {
        [void]$architectures.Add($abi)
      }
    }
  }

  if ($architectures.Count -eq 0) {
    throw "No Android architectures were resolved for the local UAT build."
  }

  return ($architectures -join ",")
}

function Wait-ForConnectedAndroidDeviceIds {
  param([int]$TimeoutSeconds)

  & adb start-server | Out-Host

  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $TimeoutSeconds))
  do {
    $rows = @(Get-AndroidDeviceRows)
    $devices = New-Object "System.Collections.Generic.List[string]"

    foreach ($row in $rows) {
      if ($row -match "\tdevice$") {
        [void]$devices.Add([string](($row -split "\s+")[0]))
      }
    }

    if ($devices.Count -gt 0) {
      return $devices
    }

    if ($rows.Count -gt 0) {
      Write-Host "ADB sees a device, but it is not ready yet: $($rows -join '; ')" -ForegroundColor Yellow
      Write-Host "If it says unauthorized, unlock the phone and approve the USB debugging prompt." -ForegroundColor Yellow
    } else {
      Write-Host "Waiting for Android device..." -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  return (New-Object "System.Collections.Generic.List[string]")
}

function Wait-ForAndroidDeviceBoot {
  param(
    [string]$DeviceId,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds([Math]::Max(5, $TimeoutSeconds))
  Write-Host "Waiting for Android boot readiness: $DeviceId" -ForegroundColor DarkGray
  & adb -s $DeviceId wait-for-device | Out-Null

  do {
    $bootCompleted = Get-AndroidDeviceProperty -DeviceId $DeviceId -Property "sys.boot_completed" -Attempts 1
    $abi = Get-AndroidDeviceProperty -DeviceId $DeviceId -Property "ro.product.cpu.abi" -Attempts 1
    $abiList = Get-AndroidDeviceProperty -DeviceId $DeviceId -Property "ro.product.cpu.abilist" -Attempts 1

    if ($bootCompleted -eq "1" -and ($abi -or $abiList)) {
      return
    }

    Write-Host "Device $DeviceId is connected but boot properties are not ready yet." -ForegroundColor DarkGray
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  $rows = @(Get-AndroidDeviceRows)
  $details = if ($rows.Count -gt 0) { $rows -join "; " } else { "adb devices returned no devices." }
  throw "Android device $DeviceId did not finish boot readiness within $TimeoutSeconds seconds. Details: $details"
}

function Stop-GradleDaemons {
  param([string]$GradleWrapperPath, [string]$WorkingDirectory)

  if (-not (Test-Path -LiteralPath $GradleWrapperPath)) {
    return
  }

  Push-Location $WorkingDirectory
  try {
    Write-Host "> $GradleWrapperPath --stop" -ForegroundColor DarkGray
    & $GradleWrapperPath "--stop" | Out-Host
  } finally {
    Pop-Location
  }
}

function Remove-DirectoryIfPresent {
  param([string]$PathValue)

  if (-not (Test-Path -LiteralPath $PathValue)) {
    return
  }

  Remove-Item -LiteralPath $PathValue -Recurse -Force
}

function Remove-WhisprUatManagedDirectory {
  param(
    [string]$ResolvedBuildHome,
    [string]$PathValue,
    [string]$Name
  )

  Assert-WhisprUatManagedPath -ResolvedBuildHome $ResolvedBuildHome -PathValue $PathValue -Name $Name
  Remove-DirectoryIfPresent $PathValue
}

function Clear-WhisprUatPnpmState {
  param(
    [string]$ResolvedBuildHome,
    [string]$PhysicalWorkspaceRoot,
    [string]$PhysicalStoreDir,
    [string]$PhysicalVirtualStoreDir
  )

  Write-Host "pnpm installation failed or retained a stale layout. Clearing only the managed Whispr UAT dependency state before one forced retry." -ForegroundColor Yellow

  Remove-WhisprUatManagedDirectory -ResolvedBuildHome $ResolvedBuildHome -PathValue (Join-Path $PhysicalWorkspaceRoot "node_modules") -Name "Managed workspace node_modules"
  Remove-WhisprUatManagedDirectory -ResolvedBuildHome $ResolvedBuildHome -PathValue $PhysicalVirtualStoreDir -Name "Managed pnpm virtual store"
  Remove-WhisprUatManagedDirectory -ResolvedBuildHome $ResolvedBuildHome -PathValue $PhysicalStoreDir -Name "Managed pnpm store"
}

function Resolve-AvailableMetroPort {
  param([int]$PreferredPort)

  for ($port = $PreferredPort; $port -le 65535; $port++) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

    try {
      $listener.Start()
      return $port
    } catch [System.Net.Sockets.SocketException] {
      continue
    } finally {
      $listener.Stop()
    }
  }

  throw "No free Metro port was found from $PreferredPort through 65535."
}

function Get-WhisprUatPnpmVirtualStoreDir {
  param([string]$WorkingDirectory)

  $modulesMetadataPath = Join-Path $WorkingDirectory "node_modules\.modules.yaml"
  if (-not (Test-Path -LiteralPath $modulesMetadataPath)) {
    return $null
  }

  try {
    $modulesMetadata = Get-Content -Raw -LiteralPath $modulesMetadataPath | ConvertFrom-Json
    $virtualStoreDirProperty = $modulesMetadata.PSObject.Properties["virtualStoreDir"]
    if ($null -eq $virtualStoreDirProperty -or [string]::IsNullOrWhiteSpace([string]$virtualStoreDirProperty.Value)) {
      return $null
    }

    return [System.IO.Path]::GetFullPath([string]$virtualStoreDirProperty.Value).TrimEnd("\\")
  } catch {
    return $null
  }
}

function Test-WhisprUatPnpmLayout {
  param(
    [string]$WorkingDirectory,
    [string]$ExpectedVirtualStoreDir
  )

  $normalizedExpectedVirtualStoreDir = [System.IO.Path]::GetFullPath($ExpectedVirtualStoreDir).TrimEnd("\\")
  $actualVirtualStoreDir = Get-WhisprUatPnpmVirtualStoreDir -WorkingDirectory $WorkingDirectory
  if ($null -eq $actualVirtualStoreDir -or -not $actualVirtualStoreDir.Equals($normalizedExpectedVirtualStoreDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  $tsxLinkPath = Join-Path $WorkingDirectory "apps\mobile\node_modules\tsx"
  if (-not (Test-Path -LiteralPath $tsxLinkPath)) {
    return $false
  }

  $tsxLink = Get-Item -Force -LiteralPath $tsxLinkPath
  $tsxTargets = @($tsxLink.Target | Where-Object { $_ })
  if ($tsxLink.LinkType -ne "Junction" -or $tsxTargets.Count -ne 1) {
    return $false
  }

  $tsxTarget = [System.IO.Path]::GetFullPath([string]$tsxTargets[0]).TrimEnd("\\")
  if (-not $tsxTarget.StartsWith("$normalizedExpectedVirtualStoreDir\", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  return (Test-Path -LiteralPath (Join-Path $tsxTarget "package.json"))
}

function Invoke-PnpmInstallWithRecovery {
  param(
    [string]$WorkingDirectory,
    [string]$ResolvedBuildHome,
    [string]$PhysicalWorkspaceRoot,
    [string]$PhysicalStoreDir,
    [string]$PhysicalVirtualStoreDir
  )

  $previousCi = $env:CI
  try {
    # CI mode makes the staged dependency layout deterministic and non-interactive.
    $env:CI = "true"
    $requiresForcedReinstall = $false
    try {
      Invoke-CommandChecked -Command "corepack" -Arguments @(
        "pnpm",
        "--config.store-dir=$PhysicalStoreDir",
        "--config.virtual-store-dir=$PhysicalVirtualStoreDir",
        "install",
        "--frozen-lockfile"
      ) -WorkingDirectory $WorkingDirectory
    } catch {
      $requiresForcedReinstall = $true
    }

    if (-not $requiresForcedReinstall -and -not (Test-WhisprUatPnpmLayout -WorkingDirectory $WorkingDirectory -ExpectedVirtualStoreDir $PhysicalVirtualStoreDir)) {
      Write-Host "Managed pnpm layout is stale or incomplete after installation. Rebuilding managed dependency state." -ForegroundColor Yellow
      $requiresForcedReinstall = $true
    }

    if ($requiresForcedReinstall) {
      Clear-WhisprUatPnpmState -ResolvedBuildHome $ResolvedBuildHome -PhysicalWorkspaceRoot $PhysicalWorkspaceRoot -PhysicalStoreDir $PhysicalStoreDir -PhysicalVirtualStoreDir $PhysicalVirtualStoreDir
      Invoke-CommandChecked -Command "corepack" -Arguments @(
        "pnpm",
        "--config.store-dir=$PhysicalStoreDir",
        "--config.virtual-store-dir=$PhysicalVirtualStoreDir",
        "install",
        "--force",
        "--frozen-lockfile"
      ) -WorkingDirectory $WorkingDirectory
    }

    if (-not (Test-WhisprUatPnpmLayout -WorkingDirectory $WorkingDirectory -ExpectedVirtualStoreDir $PhysicalVirtualStoreDir)) {
      $actualVirtualStoreDir = Get-WhisprUatPnpmVirtualStoreDir -WorkingDirectory $WorkingDirectory
      throw "Managed pnpm layout is stale or incomplete after forced recovery. Expected virtual store: $PhysicalVirtualStoreDir; actual virtual store: $actualVirtualStoreDir"
    }
  } finally {
    if ($null -eq $previousCi) {
      Remove-Item Env:CI -ErrorAction SilentlyContinue
    } else {
      $env:CI = $previousCi
    }
  }
}

function Assert-ExpoReleaseBundlePrerequisites {
  param(
    [string]$WorkingDirectory,
    [string]$BuildType
  )

  if ($BuildType -ne "release") {
    return
  }

  try {
    Invoke-CommandChecked -Command "node" -Arguments @("-e", "require.resolve('babel-preset-expo')") -WorkingDirectory $WorkingDirectory
  } catch {
    throw "UAT release bundling requires babel-preset-expo as a direct mobile devDependency. Run corepack pnpm install from the repository root, then retry. Details: $($_.Exception.Message)"
  }
}

function Clear-MobileNativeDependencyBuildCaches {
  param([string]$VirtualStoreDir)

  if (-not (Test-Path -LiteralPath $VirtualStoreDir)) {
    return
  }

  $nativeDependencyBuildDirs = @(
    "expo-modules-core",
    "react-native-reanimated",
    "react-native-worklets",
    "react-native-safe-area-context"
  )

  $packageDirectories = @(Get-ChildItem -LiteralPath $VirtualStoreDir -Directory -ErrorAction SilentlyContinue)
  foreach ($packageName in $nativeDependencyBuildDirs) {
    foreach ($packageDirectory in $packageDirectories) {
      # pnpm can truncate virtual-store directory names, so inspect the package contents instead of matching the folder name.
      $androidDir = Join-Path $packageDirectory.FullName "node_modules\$packageName\android"
      if (-not (Test-Path -LiteralPath $androidDir)) {
        continue
      }

      Remove-DirectoryIfPresent (Join-Path $androidDir ".cxx")
      Remove-DirectoryIfPresent (Join-Path $androidDir "build")
    }
  }
}

function Invoke-GradleBuildWithRetry {
  param(
    [string]$GradleWrapperPath,
    [string[]]$GradleArguments,
    [string]$WorkingDirectory,
    [string]$VirtualStoreDir
  )

  try {
    Invoke-CommandChecked -Command $GradleWrapperPath -Arguments $GradleArguments -WorkingDirectory $WorkingDirectory
  } catch {
    Write-Host "Gradle build failed. Stopping daemons, clearing native dependency build caches, and retrying once." -ForegroundColor Yellow
    Stop-GradleDaemons -GradleWrapperPath $GradleWrapperPath -WorkingDirectory $WorkingDirectory
    Clear-MobileNativeDependencyBuildCaches -VirtualStoreDir $VirtualStoreDir
    Invoke-CommandChecked -Command $GradleWrapperPath -Arguments $GradleArguments -WorkingDirectory $WorkingDirectory
  }
}

if (-not $SourceRoot) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $SourceRoot = Join-Path $scriptDir "..\..\.."
}

$resolvedSourceRoot = Resolve-ExistingPath $SourceRoot "SourceRoot"
$resolvedBuildHome = Initialize-WhisprUatBuildHome -BuildHomePath $BuildHome
$managedBuildRootLink = Ensure-WhisprUatManagedRootLink -ManagedBuildRootPath $ManagedBuildRoot -ResolvedBuildHome $resolvedBuildHome

$physicalWorkspaceRoot = Join-Path $resolvedBuildHome "workspace"
$physicalPnpmStoreDir = Join-Path $resolvedBuildHome "pnpm-store"
$physicalPnpmVirtualStoreDir = Join-Path $resolvedBuildHome "p"
$physicalGradleUserHome = Join-Path $resolvedBuildHome "gradle"
$physicalArtifactDir = Join-Path $resolvedBuildHome "artifacts"

foreach ($managedDirectory in @(
  $physicalWorkspaceRoot,
  $physicalPnpmStoreDir,
  $physicalPnpmVirtualStoreDir,
  $physicalGradleUserHome,
  $physicalArtifactDir
)) {
  New-Item -ItemType Directory -Force -Path $managedDirectory | Out-Null
}

if (-not $BuildRoot) {
  $BuildRoot = Join-Path $resolvedBuildHome "workspace"
}

if (-not $ApkOutputDir) {
  $ApkOutputDir = $physicalArtifactDir
}

$pnpmStoreDir = Join-Path $resolvedBuildHome "pnpm-store"
$pnpmVirtualStoreDir = Join-Path $resolvedBuildHome "p"
$gradleUserHome = Join-Path $resolvedBuildHome "gradle"

$resolvedBuildParent = Split-Path -Parent $BuildRoot
if (-not $resolvedBuildParent) {
  throw "BuildRoot must be an absolute, non-root path. Received: $BuildRoot"
}

if (-not (Test-Path -LiteralPath $resolvedBuildParent)) {
  throw "BuildRoot parent directory does not exist: $resolvedBuildParent"
}

$resolvedBuildParent = Resolve-ExistingPath $resolvedBuildParent "BuildRoot parent"
$resolvedBuildRoot = Join-Path $resolvedBuildParent (Split-Path -Leaf $BuildRoot)

if (-not (Test-Path -LiteralPath (Join-Path $resolvedSourceRoot "pnpm-workspace.yaml"))) {
  throw "SourceRoot is not the Wizards workspace root: $resolvedSourceRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $resolvedSourceRoot "apps\mobile\app.config.js"))) {
  throw "SourceRoot does not contain the Whispr mobile app: $resolvedSourceRoot"
}

if ($resolvedBuildRoot -match "^[A-Za-z]:\\?$") {
  throw "BuildRoot cannot be a drive root. Received: $resolvedBuildRoot"
}

$sourceEqualsBuild = $false
if (Test-Path -LiteralPath $resolvedBuildRoot) {
  $sourceEqualsBuild = ((Resolve-Path -LiteralPath $resolvedBuildRoot).Path -ieq $resolvedSourceRoot)
}

$buildMutex = Use-WhisprMobileUatBuildMutex
try {
Write-Step "Whispr Mobile UAT local build"
Write-Host "Source root : $resolvedSourceRoot"
Write-Host "Build home  : $resolvedBuildHome"
Write-Host "Managed root: $managedBuildRootLink"
Write-Host "Build root  : $resolvedBuildRoot"
Write-Host "APK output  : $ApkOutputDir"
Write-Host "UAT URL     : $UatUrl"

if (-not $SkipSync -and -not $sourceEqualsBuild) {
  Write-Step "Syncing workspace to short Android build path"
  New-Item -ItemType Directory -Force -Path $resolvedBuildRoot | Out-Null
  Invoke-RobocopyChecked -From $resolvedSourceRoot -To $resolvedBuildRoot
} elseif ($sourceEqualsBuild) {
  Write-Step "Source and build root are the same; skipping sync"
} else {
  Write-Step "Skipping workspace sync"
}

$mobileRoot = Join-Path $resolvedBuildRoot "apps\mobile"
$androidRoot = Join-Path $mobileRoot "android"
$gradlew = Join-Path $androidRoot "gradlew.bat"
$gradleBuildTask = if ($BuildType -eq "release") { "app:assembleRelease" } else { "app:assembleDebug" }
$apkPath = Join-Path $androidRoot "app\build\outputs\apk\$BuildType\app-$BuildType.apk"

Resolve-ExistingPath $mobileRoot "Mobile root" | Out-Null
Resolve-ExistingPath $androidRoot "Android root" | Out-Null
Resolve-ExistingPath $gradlew "Gradle wrapper" | Out-Null
Resolve-ExistingPath $JavaHome "JavaHome" | Out-Null
Resolve-ExistingPath $AndroidHome "AndroidHome" | Out-Null

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:GRADLE_USER_HOME = $gradleUserHome
$env:WHISPR_MOBILE_ENV = "uat"
$env:EXPO_PUBLIC_WHISPR_API_URL = $UatUrl
$env:EXPO_PUBLIC_WHISPR_SOCKET_URL = $UatUrl
$env:EXPO_PUBLIC_WHISPR_WEB_URL = $UatUrl
if ($BuildType -eq "release") {
  $env:NODE_ENV = "production"
} elseif (-not $env:NODE_ENV) {
  $env:NODE_ENV = "development"
}
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

Write-Step "Validating local Android toolchain"
Invoke-CommandChecked -Command "java" -Arguments @("-version") -WorkingDirectory $resolvedBuildRoot
Invoke-CommandChecked -Command "adb" -Arguments @("version") -WorkingDirectory $resolvedBuildRoot

$devices = @()
$requiresConnectedDevice = -not ($SkipInstall -and $SkipUninstall)
if ($requiresConnectedDevice) {
  $devices = @(Wait-ForConnectedAndroidDeviceIds -TimeoutSeconds $WaitForDeviceSeconds)
  if ($devices.Count -eq 0) {
    $deviceRows = @(Get-AndroidDeviceRows)
    $details = if ($deviceRows.Count -gt 0) { $deviceRows -join "; " } else { "adb devices returned no devices." }
    throw "No ready Android device is connected. Details: $details Enable USB debugging, unlock the phone, approve the USB debugging prompt, then retry."
  }

  Write-Host "Connected Android device(s): $($devices -join ', ')"
  foreach ($device in $devices) {
    Wait-ForAndroidDeviceBoot -DeviceId $device -TimeoutSeconds $WaitForDeviceSeconds
  }
} else {
  Write-Host "Build-only mode: connected Android device checks are skipped."
}

$reactNativeArchitectures = Resolve-ReactNativeArchitectures -DeviceIds $devices -OverrideArchitectures $AndroidArchitectures
$metroPort = Resolve-AvailableMetroPort -PreferredPort $DevServerPort
Write-Host "Target Android architecture(s): $reactNativeArchitectures"
Write-Host "Metro development server port: $metroPort"

Write-Step "Preparing package manager and Android SDK config"
Ensure-ProjectNpmrc -Root $resolvedBuildRoot -StoreDir $pnpmStoreDir -VirtualStoreDir $pnpmVirtualStoreDir -VirtualStoreMaxLength $PnpmVirtualStoreMaxLength
Ensure-AndroidLocalProperties -MobileRoot $mobileRoot -SdkRoot $AndroidHome
Invoke-PnpmInstallWithRecovery -WorkingDirectory $resolvedBuildRoot -ResolvedBuildHome $resolvedBuildHome -PhysicalWorkspaceRoot $physicalWorkspaceRoot -PhysicalStoreDir $physicalPnpmStoreDir -PhysicalVirtualStoreDir $physicalPnpmVirtualStoreDir
Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "--filter", "@wizards/mobile", "validate:env") -WorkingDirectory $resolvedBuildRoot
Assert-ExpoReleaseBundlePrerequisites -WorkingDirectory $mobileRoot -BuildType $BuildType
Stop-GradleDaemons -GradleWrapperPath $gradlew -WorkingDirectory $androidRoot

if ($CleanAndroidCaches) {
  Write-Step "Cleaning Android build caches"
  $pathsToClean = @(
    (Join-Path $androidRoot ".cxx"),
    (Join-Path $androidRoot "build"),
    (Join-Path $androidRoot "app\build")
  )

  foreach ($pathToClean in $pathsToClean) {
    if (Test-Path -LiteralPath $pathToClean) {
      Remove-Item -LiteralPath $pathToClean -Recurse -Force
    }
  }

  Clear-MobileNativeDependencyBuildCaches -VirtualStoreDir $pnpmVirtualStoreDir
}

Write-Step "Building UAT $BuildType APK"
$gradleBuildArguments = @(
  $gradleBuildTask,
  "-x",
  "lint",
  "-x",
  "test",
  "--configure-on-demand",
  "-PreactNativeDevServerPort=$metroPort",
  "-PreactNativeArchitectures=$reactNativeArchitectures"
)
if ($DisableGradleBuildCache) {
  # Gradle's incremental artifact splitter is not reliable for the four-ABI UAT APK.
  $gradleBuildArguments += "--no-build-cache"
} else {
  $gradleBuildArguments += "--build-cache"
}
Invoke-GradleBuildWithRetry -GradleWrapperPath $gradlew -GradleArguments $gradleBuildArguments -WorkingDirectory $androidRoot -VirtualStoreDir $pnpmVirtualStoreDir

Resolve-ExistingPath $apkPath "Generated APK" | Out-Null
New-Item -ItemType Directory -Force -Path $ApkOutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$version = (Get-Content -Raw -LiteralPath (Join-Path $mobileRoot "package.json") | ConvertFrom-Json).version
$architectureSlug = $reactNativeArchitectures.Replace(",", "-")
$archiveApkPath = Join-Path $ApkOutputDir "Whispr-Mobile-UAT-$version-$timestamp-$architectureSlug-$BuildType.apk"
$latestApkPath = Join-Path $ApkOutputDir "Whispr-Mobile-UAT-$BuildType-latest.apk"
$architectureLatestApkPath = Join-Path $ApkOutputDir "Whispr-Mobile-UAT-$architectureSlug-$BuildType-latest.apk"
Copy-Item -LiteralPath $apkPath -Destination $archiveApkPath -Force
Copy-Item -LiteralPath $apkPath -Destination $latestApkPath -Force
Copy-Item -LiteralPath $apkPath -Destination $architectureLatestApkPath -Force

Write-Host "APK archived: $archiveApkPath" -ForegroundColor Green
Write-Host "APK latest  : $latestApkPath" -ForegroundColor Green
Write-Host "APK ABI latest: $architectureLatestApkPath" -ForegroundColor Green
} finally {
  try {
    [void]$buildMutex.ReleaseMutex()
  } finally {
    $buildMutex.Dispose()
  }
}

if (-not $SkipUninstall) {
  Write-Step "Removing existing Whispr mobile package from device if present"
  & adb uninstall $PackageName | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Existing package was not installed or could not be removed; continuing." -ForegroundColor Yellow
  }
}

if (-not $SkipInstall) {
  Write-Step "Installing UAT APK on connected Android device"
  Invoke-CommandChecked -Command "adb" -Arguments @("install", "-r", "-d", "--user", "0", $apkPath) -WorkingDirectory $mobileRoot
}

Write-Step "Done"
Write-Host "Installed package: $PackageName"
Write-Host "Embedded environment: uat -> $UatUrl"

if (-not $NoStartMetro) {
  Write-Step "Starting Expo dev-client Metro server"
  Write-Host "Keep this PowerShell window open while testing. Press Ctrl+C to stop Metro." -ForegroundColor Yellow
  Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "exec", "expo", "start", "--dev-client", "--port", $metroPort) -WorkingDirectory $mobileRoot
}
