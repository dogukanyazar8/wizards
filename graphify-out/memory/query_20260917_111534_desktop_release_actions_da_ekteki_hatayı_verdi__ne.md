---
type: "query"
date: "2026-09-17T11:15:34.419569+00:00"
question: "Desktop release actions'da ekteki hatayı verdi, nedendir, nasıl çözebiliriz, sorun nedir"
contributor: "graphify"
outcome: "useful"
source_nodes: ["run-tauri.test.mjs", "main.json", "run-tauri.mjs", "get_desktop_go_live_candidate", "list_desktop_running_applications"]
---

# Q: Desktop release actions'da ekteki hatayı verdi, nedendir, nasıl çözebiliriz, sorun nedir

## Answer

Expanded via graph vocab: desktop, tauri, permission, permissions, capability, generated, running, applications, candidate, release. Root cause: ef2ba1ca added allow-get-desktop-go-live-candidate and allow-list-desktop-running-applications to checked-in main capability and registered/used the commands, but omitted both from run-tauri.mjs appCommandPermissions used by generated production config. Contract test correctly fails closed. Add both permissions to appCommandPermissions, rerun focused desktop test, then rerun release. Build and publish jobs were skipped.

## Outcome

- Signal: useful

## Source Nodes

- run-tauri.test.mjs
- main.json
- run-tauri.mjs
- get_desktop_go_live_candidate
- list_desktop_running_applications