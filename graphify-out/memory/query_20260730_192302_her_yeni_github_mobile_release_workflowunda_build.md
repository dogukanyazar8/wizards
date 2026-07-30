---
type: "query"
date: "2026-07-30T19:23:02.308034+00:00"
question: "Her yeni GitHub Mobile Release workflowunda build numarası otomatik artıyor mu; elle ne değiştirmeliyim?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile/eas.json", "mobile-release.yml"]
---

# Q: Her yeni GitHub Mobile Release workflowunda build numarası otomatik artıyor mu; elle ne değiştirmeliyim?

## Answer

Expanded from graph vocab: [build, version, workflow, mobile, apk, release, increment, remote, ota]. Only kind=apk runs EAS Android build. apps/mobile/eas.json uses appVersionSource remote and uat autoIncrement true, so EAS increments native versionCode. OTA and preflight runs do not. Current workflow still requires the operator to enter expected version_code and verifies APK actual_version_code equals it. Admin Release.buildNumber is separate and manual. Failed APK attempts may consume a remote number, so next code must be checked rather than assumed. Manual APK work: bump semantic version, create/publish matching UAT Release and notes, enter release_id/version/expected version_code in workflow. No app.config versionCode edit. Preferred simplification: CI reads actual built versionCode and writes artifact/admin/latest automatically, removing manual Build and version_code fields.

## Outcome

- Signal: useful

## Source Nodes

- mobile/eas.json
- mobile-release.yml