---
type: "query"
date: "2026-07-30T18:46:34.861783+00:00"
question: "Versiyon - Kod Adı - Build nedir; mobilde yeni güncelleme yayınlama yolu nasıl olmalı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile/package.json", "mobile-release-contract.ts", "mobile-release-workflow.mjs", "mobile-about-settings-screen.tsx"]
---

# Q: Versiyon - Kod Adı - Build nedir; mobilde yeni güncelleme yayınlama yolu nasıl olmalı?

## Answer

Expanded from original query via graph vocab: [version, codename, build, release, mobile, android, apk, artifact, publish, workflow, channel, uat]. Version is user-visible SemVer/versionName. Codename is optional human label and never controls ordering. Build is Android versionCode: positive, globally monotonic, unique per signed binary. Recommended identity: 0.8.16-uat.1, Echo, build 8205. Native APK changes bump SemVer and versionCode, create/publish matching UAT Release, then dispatch Mobile Release kind=apk. JS/assets-only compatible changes keep native versionCode and publish kind=ota against same release/runtime fingerprint. Current About screen wrongly falls back to Release.buildNumber and installed version comes from web bootstrap; both should use native runtime identity before formalizing the pipeline. Workflow should verify APK versionName plus versionCode and derive/build the versionCode without guessing.

## Outcome

- Signal: useful

## Source Nodes

- mobile/package.json
- mobile-release-contract.ts
- mobile-release-workflow.mjs
- mobile-about-settings-screen.tsx