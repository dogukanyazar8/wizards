---
type: "query"
date: "2026-08-06T04:58:54.777516+00:00"
question: "bu limiti kaldıralım, github actions yeterli olmayacak mı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["workflow", "runner", "mobile", "release"]
---

# Q: bu limiti kaldıralım, github actions yeterli olmayacak mı?

## Answer

Expanded via graph vocabulary: mobile release runner temp android build github hosted storage limit workflow. Standard GitHub-hosted Ubuntu documents 14 GB storage, so removing the 20 GiB preflight guard does not guarantee the local EAS Android build will fit. Recommended controlled trial: replace hard failure with disk telemetry, move CI and mobile-release jobs to ubuntu-24.04, update contract tests, then treat one real APK run as capacity acceptance. If it fails with ENOSPC, switch only APK build to EAS cloud; larger GitHub runners require organization Team or Enterprise.

## Outcome

- Signal: useful

## Source Nodes

- workflow
- runner
- mobile
- release