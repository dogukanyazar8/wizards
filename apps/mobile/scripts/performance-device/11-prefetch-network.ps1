param(
  [string]$DeviceSerial = "", [ValidateRange(1, 100)][int]$Repetitions = 30,
  [string]$DmConversationId = "a2190c2f-bc49-4cf0-862f-bbd0f8724e26",
  [string]$ServerId = "6883598c-b338-4859-bbb7-10c22ea6074e",
  [string]$ChannelId = "521474f4-111a-4654-bffb-41e41450dd29",
  [string]$OutputRoot = "", [switch]$DryRun
)
Import-Module (Join-Path $PSScriptRoot "WhisprPerformanceDevice.psm1") -Force
$arguments = @{} + $PSBoundParameters; if (-not $OutputRoot) { $arguments.Remove("OutputRoot") }
Invoke-WhisprPerformanceScenario -Scenario "prefetch-network" @arguments
