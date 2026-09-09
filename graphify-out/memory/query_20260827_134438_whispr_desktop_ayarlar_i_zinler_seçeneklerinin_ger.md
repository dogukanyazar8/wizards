---
type: "architecture"
date: "2026-08-27T13:44:38.806729+00:00"
question: "Whispr Desktop Ayarlar İzinler seçeneklerinin gerçek kod karşılığı ve no-op kök nedenleri nedir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["desktop/permissions.ts", "desktop/permissions.test.ts", "settings/blocks/permissions-block.tsx", "settings/sections/desktop/desktop-section.tsx"]
---

# Q: Whispr Desktop Ayarlar İzinler seçeneklerinin gerçek kod karşılığı ve no-op kök nedenleri nedir?

## Answer

Current workspace audit: notification request in the remote main WebView calls Notification.requestPermission, but main.json deliberately omits notification:allow-request-permission; the exception is swallowed to unknown. The trusted Desktop Control command exists, but tauri-plugin-notification 2.3.3 desktop request_permission and permission_state both return Granted without an OS prompt. Microphone and camera use WebView navigator.mediaDevices.getUserMedia. Screen share request only rereads research_gated capability and stays unknown; real LiveKit sharing uses getDisplayMedia at share time. Global shortcut request only rereads registration status; Windows has no generic shortcut permission. openDesktopSystemSettings ignores the key and opens the generic Desktop Control permissions view. Current tests cover render/state mapping and trust boundary, not click-to-native effects. Recommended: replace generic permission model with key/platform-specific capabilities and actions; Whispr preflight UI for mic/camera followed by real WebView/OS prompt; test share action because screen consent is per capture; manage/test shortcuts; send test notification plus OS settings; keep remote WebView privilege boundary.

## Outcome

- Signal: useful

## Source Nodes

- desktop/permissions.ts
- desktop/permissions.test.ts
- settings/blocks/permissions-block.tsx
- settings/sections/desktop/desktop-section.tsx