---
type: "query"
date: "2026-07-31T05:07:43.772463+00:00"
question: "Mobil APK güncelleme sayfasında indirme, doğrulama ve kurulum durumları nasıl modelleniyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["android-apk-update-controller.ts", "mobile-update-controller.ts", "about-update-sheet.tsx"]
---

# Q: Mobil APK güncelleme sayfasında indirme, doğrulama ve kurulum durumları nasıl modelleniyor?

## Answer

Android APK denetleyicisi doğrulama bittiğinde ilerlemeyi temizliyor; tamamlanan adımları snapshot içinde saklamak başlık ve tiklerin gerçek durumu göstermesini sağlar. 192 KiB JS/base64 hash döngüsü yerine Expo ön-derlemesine eklenen Kotlin MessageDigest modülü dosyayı yerelde akış halinde hashler.

## Outcome

- Signal: useful

## Source Nodes

- android-apk-update-controller.ts
- mobile-update-controller.ts
- about-update-sheet.tsx