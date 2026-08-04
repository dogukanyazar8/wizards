---
type: "query"
date: "2026-08-04T05:07:17.468743+00:00"
question: "APK derlerken EXPO_PUBLIC_WHISPR_BUILD_ID valid Git SHA hatası neden oluşuyor ve nasıl düzeltilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["app.config.js", "build-android-uat.ps1", "mobile-app-config-contract.test.ts"]
---

# Q: APK derlerken EXPO_PUBLIC_WHISPR_BUILD_ID valid Git SHA hatası neden oluşuyor ve nasıl düzeltilir?

## Answer

Expanded via graph vocab: build, mobile, android, expo, config, release, dirty, sha, environment, script, commit. Root cause: build-android-uat.ps1 intentionally appends -dirty to identify uncommitted APKs, while app.config.js accepted only pure 12-40 hex SHA. Fixed app.config.js to accept SHA-dirty only for UAT; production remains pure SHA. Regression tests and real release APK build passed.

## Outcome

- Signal: useful

## Source Nodes

- app.config.js
- build-android-uat.ps1
- mobile-app-config-contract.test.ts