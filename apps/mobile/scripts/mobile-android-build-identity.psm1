Set-StrictMode -Version Latest

function Get-WhisprCleanGitCommit {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$SourceRoot
  )

  $commitLines = @(& git -C $SourceRoot rev-parse --verify HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or $commitLines.Count -ne 1) {
    throw "Unable to resolve source Git SHA for the UAT release build."
  }

  $commit = ([string]$commitLines[0]).Trim().ToLowerInvariant()
  if ($commit -notmatch "^[0-9a-f]{40}$") {
    throw "Source Git SHA for the UAT release build is invalid."
  }

  $statusLines = @(& git -C $SourceRoot status --porcelain=v1 --untracked-files=all 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to verify source cleanliness for the UAT release build."
  }
  if ($statusLines.Count -gt 0) {
    throw "Release UAT source must be clean before workspace sync."
  }

  return $commit
}

function Assert-WhisprGitCommitUnchanged {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$ExpectedCommit,
    [Parameter(Mandatory)]
    [string]$SourceRoot
  )

  if ($ExpectedCommit -notmatch "^[0-9a-f]{40}$") {
    throw "Expected source Git SHA for the UAT release build is invalid."
  }

  $actualCommit = Get-WhisprCleanGitCommit -SourceRoot $SourceRoot
  if (-not [string]::Equals($actualCommit, $ExpectedCommit.ToLowerInvariant(), [System.StringComparison]::Ordinal)) {
    throw "Release UAT source changed during workspace sync."
  }
}

function Assert-WhisprUatReleaseProvenance {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$ExpectedCommit,
    [Parameter(Mandatory)]
    [string]$SourceRoot
  )

  if ($ExpectedCommit -notmatch "^[0-9a-f]{40}$") {
    throw "Expected source Git SHA for the UAT release build is invalid."
  }

  $branchLines = @(& git -C $SourceRoot branch --show-current 2>$null)
  if ($LASTEXITCODE -ne 0 -or $branchLines.Count -ne 1) {
    throw "Unable to resolve source branch for the UAT release build."
  }
  if (([string]$branchLines[0]).Trim() -ne "uat") {
    throw "UAT release source must use branch uat."
  }

  $originLines = @(& git -C $SourceRoot rev-parse --verify refs/remotes/origin/uat 2>$null)
  if ($LASTEXITCODE -ne 0 -or $originLines.Count -ne 1) {
    throw "UAT release source has no origin/uat tracking ref."
  }
  $originCommit = ([string]$originLines[0]).Trim().ToLowerInvariant()
  if ($originCommit -notmatch "^[0-9a-f]{40}$") {
    throw "UAT release source has an invalid origin/uat tracking ref."
  }
  if (-not [string]::Equals($originCommit, $ExpectedCommit.ToLowerInvariant(), [System.StringComparison]::Ordinal)) {
    throw "UAT release source is not at origin/uat."
  }
}

function Assert-WhisprReleaseBuildCanSync {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [ValidateSet("debug", "release")]
    [string]$BuildType,
    [Parameter(Mandatory)]
    [bool]$SkipSync
  )

  if ($BuildType -eq "release" -and $SkipSync) {
    throw "Release UAT builds cannot use -SkipSync because source identity cannot be verified."
  }
}

function Test-WhisprShouldStartMetro {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [ValidateSet("debug", "release")]
    [string]$BuildType,
    [Parameter(Mandatory)]
    [bool]$NoStartMetro
  )

  return $BuildType -eq "debug" -and -not $NoStartMetro
}

Export-ModuleMember -Function @(
  "Assert-WhisprGitCommitUnchanged",
  "Assert-WhisprReleaseBuildCanSync",
  "Assert-WhisprUatReleaseProvenance",
  "Get-WhisprCleanGitCommit",
  "Test-WhisprShouldStartMetro"
)
