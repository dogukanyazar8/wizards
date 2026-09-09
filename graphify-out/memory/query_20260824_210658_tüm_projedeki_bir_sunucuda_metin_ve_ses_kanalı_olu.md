---
type: "query"
date: "2026-08-24T21:06:58.725322+00:00"
question: "Tüm projedeki bir sunucuda metin ve ses kanalı oluştururken seçilebilecek tüm özellikleri eksiksiz bir şekilde sıralar mısın. graphify kullan."
contributor: "graphify"
outcome: "useful"
source_nodes: ["workspace-modals.tsx", "CreateChannelSchema", "channel-service.ts", "WorkspaceChannelPermissionSettings"]
---

# Q: Tüm projedeki bir sunucuda metin ve ses kanalı oluştururken seçilebilecek tüm özellikleri eksiksiz bir şekilde sıralar mısın. graphify kullan.

## Answer

Expanded from original query via graph vocab: [channel, create, creation, workspace, server, voice, text, category, permission, bitrate, topic, nsfw]. Web ve Tauri ortak form: kanal tipi giriş aksiyonuyla TEXT veya VOICE; ortak alanlar ad, konu, kategori veya kategorisiz, izin preset PUBLIC/LOCKED_VISIBLE/PRIVATE/ROLE_GATED ve ROLE_GATED için korumasız rol seçimi. TEXT gelişmiş alanı slowModeDelay: 0,5,10,15,30,60,120,300,600,900,1800,3600 saniye. VOICE alanları bitrate 32000/64000/96000/128000, userLimit 0-10, rtcRegion otomatik veya yapılandırılmış bölge, videoQualityMode AUTO/FULL. Aktif mobil form tip, ad, mevcut kategori veya yeni kategori, özel toggle ve rol seçimi gösterir; fakat isPrivate/selectedRoleIds gönderilmez, request yalnız categoryId/name/topic:null/type taşır. Mobil API sözleşmesi ileri ayarları kabul eder ama permissions alanını yasaklar. Ayrı eski MobileWorkspaceEditorSheets channel-create dalı ad/konu/tip/kategori taşır fakat workspace-browser bunu açmaz. NSFW, rateLimitPerUser, archive/autoArchive ve ayrı codec/sample-rate seçenekleri create UI/schema alanı değildir. Sonuç statik Graphify ve kaynak/test okumasıdır; runtime çalıştırılmadı.

## Outcome

- Signal: useful

## Source Nodes

- workspace-modals.tsx
- CreateChannelSchema
- channel-service.ts
- WorkspaceChannelPermissionSettings