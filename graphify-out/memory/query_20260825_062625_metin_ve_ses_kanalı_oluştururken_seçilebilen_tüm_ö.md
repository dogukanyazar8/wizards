---
type: "query"
date: "2026-08-25T06:26:25.332906+00:00"
question: "metin ve ses kanalı oluştururken seçilebilen tüm özellikleri sade bir şekilde açıklamalarıyla listeler misin"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CreateChannelSchema", "channel-advanced-settings.tsx", "workspace-modals.tsx", "mobile-workspace-create-sheets.tsx", "CHANNEL_SLOW_MODE_DELAYS", "voice-media-policy.ts"]
---

# Q: metin ve ses kanalı oluştururken seçilebilen tüm özellikleri sade bir şekilde açıklamalarıyla listeler misin

## Answer

Expanded from original query via graph vocab: [channel, create, voice, text, category, permission, bitrate, topic, user, limit, slow, mode]. Web/Tauri ortak: TEXT/VOICE türü, zorunlu 1-48 karakter kanal adı, isteğe bağlı en fazla 120 karakter konu, kategori veya kategorisiz, admin için PUBLIC/LOCKED_VISIBLE/PRIVATE/ROLE_GATED erişim ve ROLE_GATED rol seçimi. TEXT: yavaş mod kapalı; 5/10/15/30 saniye; 1/2/5/10/15/30/60 dakika. VOICE: 32/64/96/128 kbps, kullanıcı limiti 0-10 (0 sunucu üst sınırı 10), otomatik veya sunucunun izin verdiği RTC bölgesi, AUTO veya FULL video kalitesi. Mobil aktif oluşturma formu tür, ad, mevcut/yeni kategori gönderir; özel kanal ve rol kontrolleri görünür ancak payload'a girmez; konu null gönderilir ve gelişmiş ayarlar sunulmaz.

## Outcome

- Signal: useful

## Source Nodes

- CreateChannelSchema
- channel-advanced-settings.tsx
- workspace-modals.tsx
- mobile-workspace-create-sheets.tsx
- CHANNEL_SLOW_MODE_DELAYS
- voice-media-policy.ts