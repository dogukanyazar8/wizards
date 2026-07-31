---
type: "query"
date: "2026-07-31T03:49:29.189417+00:00"
question: "Admin yayin akisinda yeni surum olusturup yayinladim; Denetle neden tepki vermiyor ve nasil test ederim?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile/package.json", "android-apk-update-controller.ts"]
---

# Q: Admin yayin akisinda yeni surum olusturup yayinladim; Denetle neden tepki vermiyor ve nasil test ederim?

## Answer

Expanded from graph vocab: [mobile, about, update, release, artifact, version, code, android, workflow, admin, build]. The UAT APK manifest confirms 0.8.15 / 8204 exists. The next verification must build the fd58e396 UAT source into 8205, register it to the already published UAT release, then test the 8203 device path: check, available, download, Android install, relaunch.

## Outcome

- Signal: useful

## Source Nodes

- mobile/package.json
- android-apk-update-controller.ts