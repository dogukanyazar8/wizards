---
type: "query"
date: "2026-08-11T14:19:16.788456+00:00"
question: "Peki artık desktop ve mobile için release'i nasıl alacağım?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["android:uat:local:apk:phone:release", "Whispr Desktop Release Guide", "Signing And Updates", "workflow"]
---

# Q: Peki artık desktop ve mobile için release'i nasıl alacağım?

## Answer

Expanded from original query via vocab: [desktop, mobile, release, android, apk, tauri, windows, workflow, dispatch, artifact, signing, uat]. CircleCI is quality-only. Mobile UAT OTA/APK publication uses the manual GitHub Mobile Release workflow on uat and requires a published release row plus the mobile-uat runner/environment secrets. A local Android release APK uses android:uat:local:apk:phone:release. Desktop remote native release workflows are disabled because no Windows/macOS runner exists; Windows can currently produce only a local NSIS installer via build:desktop, while signed updater publication requires restoring a Windows release workflow and runner.

## Outcome

- Signal: useful

## Source Nodes

- android:uat:local:apk:phone:release
- Whispr Desktop Release Guide
- Signing And Updates
- workflow