---
type: "query"
date: "2026-07-31T14:49:01.336699+00:00"
question: "06-cold-start.ps1 neden adb monkey args NativeCommandError veriyor ve export zaman aşımına uğruyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Invoke-WhisprExternal", "WhisprPerformanceDevice.psm1"]
---

# Q: 06-cold-start.ps1 neden adb monkey args NativeCommandError veriyor ve export zaman aşımına uğruyor?

## Answer

Invoke-WhisprExternal, ErrorActionPreference Stop altında adb.exe stderr çıktısını exit code 0 olsa bile terminating NativeCommandError yaptı. Native komut çalışırken tercih geçici Continue yapıldı, LASTEXITCODE ayrıca yakalandı ve yalnızca nonzero exit throw ediyor. Regresyon testi native stderr plus exit 0 davranışını doğruluyor.

## Outcome

- Signal: useful

## Source Nodes

- Invoke-WhisprExternal
- WhisprPerformanceDevice.psm1