---
type: "query"
date: "2026-08-05T05:46:42.145718+00:00"
question: "lokal build almak istediğimde ekteki hatayı alıyorum, nedir sorun çözer misin"
contributor: "graphify"
outcome: "useful"
source_nodes: ["build-android-uat.ps1", "mobile-build-env-parity.test.ts"]
---

# Q: lokal build almak istediğimde ekteki hatayı alıyorum, nedir sorun çözer misin

## Answer

Expanded from original query via graph vocab: [android, build, powershell, robocopy, status, count, dirty, pipeline, script, tree, uat]. Root cause: build-android-uat.ps1 wrapped only the git invocation, then Where-Object unwrapped a single dirty status line to System.String; Windows PowerShell StrictMode made .Count throw PropertyNotFoundStrict. The full filtered pipeline is now inside @(...). A Windows regression test executes the real assignment and dirty-check AST with exactly one status line. Focused tests 9/9, mobile typecheck, PowerShell parse, Prettier, diff check, Graphify update, debug APK creation/install, and Metro packager-status:running were verified. Device UI was not visually tested.

## Outcome

- Signal: useful

## Source Nodes

- build-android-uat.ps1
- mobile-build-env-parity.test.ts