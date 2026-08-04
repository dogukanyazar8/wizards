---
type: "query"
date: "2026-08-04T11:29:59.683094+00:00"
question: "github actionsdan mobile release build aldığımda uygulamadaki google girişi android işletim sistemi yerine tarayıcıda devam ediyor, buradaki sorun nedir, nasıl düzeltebilirim?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile-auth-context.tsx", "mobileGoogleNativeSignInClient", "mobile-google-signin-client.ts"]
---

# Q: github actionsdan mobile release build aldığımda uygulamadaki google girişi android işletim sistemi yerine tarayıcıda devam ediyor, buradaki sorun nedir, nasıl düzeltebilirim?

## Answer

Expanded from original query via vocab: [native, google, signin, fallback, developer, error, fingerprint, client, mobile]. GitHub Actions APK uses the EAS release signing certificate SHA-1 37:8E:C9:A6:59:17:09:E8:4E:C5:3B:84:D5:FC:6C:34:09:89:9B:DB, while the previously configured Android OAuth client used debug SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25. EAS uat already embeds the Web client ID and links the native module. Create another Android OAuth client for package team.whispr.mobile and the release SHA-1; keep the Web client ID unchanged. Runtime source intentionally falls back to browser on developer-error.

## Outcome

- Signal: useful

## Source Nodes

- mobile-auth-context.tsx
- mobileGoogleNativeSignInClient
- mobile-google-signin-client.ts