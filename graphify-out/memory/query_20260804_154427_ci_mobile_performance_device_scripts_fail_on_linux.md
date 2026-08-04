---
type: "query"
date: "2026-08-04T15:44:27.726220+00:00"
question: "CI mobile performance device scripts fail on Linux runner"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile-performance-device-scripts.test.ts", "runner", "Platform"]
---

# Q: CI mobile performance device scripts fail on Linux runner

## Answer

Expanded from original query via graph vocabulary: mobile, performance, device, scripts, powershell, process, platform, linux, windows, test, runner. Live CI and Linux-container reproduction showed 18 tests spawned hardcoded powershell.exe on a runner without PowerShell. The harness now selects powershell.exe on Windows or pwsh elsewhere, probes availability once, skips only PowerShell-dependent tests with an explicit reason when absent, and keeps three portable contract tests active.

## Outcome

- Signal: useful

## Source Nodes

- mobile-performance-device-scripts.test.ts
- runner
- Platform