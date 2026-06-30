param(
  [string]$SourceRoot,
  [string]$BuildRoot = "C:\Wizards",
  [string]$ApkOutputDir = "C:\Wizards\artifacts\mobile\uat",
  [string]$JavaHome = "C:\Program Files\Java\jdk-17",
  [string]$AndroidHome = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$AndroidArchitectures,
  [string]$PnpmVirtualStoreDir = "C:\p",
  [int]$WaitForDeviceSeconds = 30,
  [switch]$SkipSync,
  [switch]$SkipUninstall,
  [switch]$SkipInstall,
  [switch]$NoStartMetro,
  [switch]$CleanAndroidCaches
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PackageName = "team.whispr.mobile"
$UatUrl = "https://wizardsweb-uat.up.railway.app"

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
  param([string]$Root, [string]$VirtualStoreDir)

  $npmrcPath = Join-Path $Root ".npmrc"
  $line = "virtual-store-dir=$VirtualStoreDir"
  $content = ""

  if (Test-Path -LiteralPath $npmrcPath) {
    $content = Get-Content -Raw -LiteralPath $npmrcPath
  }

  if ($content -notmatch "(?m)^virtual-store-dir\s*=") {
    Add-Content -LiteralPath $npmrcPath -Value $line -Encoding utf8
    return
  }

  $updated = $content -replace "(?m)^virtual-store-dir\s*=.*$", $line
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

  $abi = (& adb -s $DeviceId shell getprop ro.product.cpu.abi | Select-Object -First 1).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to read Android CPU ABI for device $DeviceId."
  }

  if ($abi) {
    return $abi
  }

  $abiList = (& adb -s $DeviceId shell getprop ro.product.cpu.abilist | Select-Object -First 1).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to read Android CPU ABI list for device $DeviceId."
  }

  $firstAbi = ($abiList -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 1)
  if (-not $firstAbi) {
    throw "Device $DeviceId did not report a usable Android CPU ABI."
  }

  return $firstAbi
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

function Clear-MobileNativeDependencyBuildCaches {
  param([string]$VirtualStoreDir)

  if (-not (Test-Path -LiteralPath $VirtualStoreDir)) {
    return
  }

  $nativeDependencyBuildDirs = @(
    "expo-modules-core",
    "react-native-safe-area-context"
  )

  foreach ($packageName in $nativeDependencyBuildDirs) {
    Get-ChildItem -LiteralPath $VirtualStoreDir -Directory -Filter "$packageName*" -ErrorAction SilentlyContinue |
      ForEach-Object {
        $buildDir = Join-Path $_.FullName "node_modules\$packageName\android\build"
        Remove-DirectoryIfPresent $buildDir
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

if (-not (Test-Path -LiteralPath (Join-Path $resolvedSourceRoot "apps\mobile\app.config.ts"))) {
  throw "SourceRoot does not contain the Whispr mobile app: $resolvedSourceRoot"
}

if ($resolvedBuildRoot -match "^[A-Za-z]:\\?$") {
  throw "BuildRoot cannot be a drive root. Received: $resolvedBuildRoot"
}

$sourceEqualsBuild = $false
if (Test-Path -LiteralPath $resolvedBuildRoot) {
  $sourceEqualsBuild = ((Resolve-Path -LiteralPath $resolvedBuildRoot).Path -ieq $resolvedSourceRoot)
}

Write-Step "Whispr Mobile UAT local build"
Write-Host "Source root : $resolvedSourceRoot"
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
$apkPath = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"

Resolve-ExistingPath $mobileRoot "Mobile root" | Out-Null
Resolve-ExistingPath $androidRoot "Android root" | Out-Null
Resolve-ExistingPath $gradlew "Gradle wrapper" | Out-Null
Resolve-ExistingPath $JavaHome "JavaHome" | Out-Null
Resolve-ExistingPath $AndroidHome "AndroidHome" | Out-Null

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:WHISPR_MOBILE_ENV = "uat"
$env:EXPO_PUBLIC_WHISPR_API_URL = $UatUrl
$env:EXPO_PUBLIC_WHISPR_SOCKET_URL = $UatUrl
$env:EXPO_PUBLIC_WHISPR_WEB_URL = $UatUrl
if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "development"
}
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

Write-Step "Validating local Android toolchain"
Invoke-CommandChecked -Command "java" -Arguments @("-version") -WorkingDirectory $resolvedBuildRoot
Invoke-CommandChecked -Command "adb" -Arguments @("version") -WorkingDirectory $resolvedBuildRoot

$devices = @(Wait-ForConnectedAndroidDeviceIds -TimeoutSeconds $WaitForDeviceSeconds)
if ($devices.Count -eq 0) {
  $deviceRows = @(Get-AndroidDeviceRows)
  $details = if ($deviceRows.Count -gt 0) { $deviceRows -join "; " } else { "adb devices returned no devices." }
  throw "No ready Android device is connected. Details: $details Enable USB debugging, unlock the phone, approve the USB debugging prompt, then retry."
}

Write-Host "Connected Android device(s): $($devices -join ', ')"
$reactNativeArchitectures = Resolve-ReactNativeArchitectures -DeviceIds $devices -OverrideArchitectures $AndroidArchitectures
Write-Host "Target Android architecture(s): $reactNativeArchitectures"

Write-Step "Preparing package manager and Android SDK config"
Ensure-ProjectNpmrc -Root $resolvedBuildRoot -VirtualStoreDir $PnpmVirtualStoreDir
Ensure-AndroidLocalProperties -MobileRoot $mobileRoot -SdkRoot $AndroidHome
Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "install", "--frozen-lockfile") -WorkingDirectory $resolvedBuildRoot
Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "--filter", "@wizards/mobile", "validate:env") -WorkingDirectory $resolvedBuildRoot
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

  Clear-MobileNativeDependencyBuildCaches -VirtualStoreDir $PnpmVirtualStoreDir
}

Write-Step "Building UAT debug APK"
$gradleBuildArguments = @(
  "app:assembleDebug",
  "-x",
  "lint",
  "-x",
  "test",
  "--configure-on-demand",
  "--build-cache",
  "-PreactNativeDevServerPort=8081",
  "-PreactNativeArchitectures=$reactNativeArchitectures"
)
Invoke-GradleBuildWithRetry -GradleWrapperPath $gradlew -GradleArguments $gradleBuildArguments -WorkingDirectory $androidRoot -VirtualStoreDir $PnpmVirtualStoreDir

Resolve-ExistingPath $apkPath "Generated APK" | Out-Null
New-Item -ItemType Directory -Force -Path $ApkOutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$version = (Get-Content -Raw -LiteralPath (Join-Path $mobileRoot "package.json") | ConvertFrom-Json).version
$archiveApkPath = Join-Path $ApkOutputDir "Whispr-Mobile-UAT-$version-$timestamp-debug.apk"
$latestApkPath = Join-Path $ApkOutputDir "Whispr-Mobile-UAT-debug-latest.apk"
Copy-Item -LiteralPath $apkPath -Destination $archiveApkPath -Force
Copy-Item -LiteralPath $apkPath -Destination $latestApkPath -Force

Write-Host "APK archived: $archiveApkPath" -ForegroundColor Green
Write-Host "APK latest  : $latestApkPath" -ForegroundColor Green

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
  Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "exec", "expo", "start", "--dev-client") -WorkingDirectory $mobileRoot
}
