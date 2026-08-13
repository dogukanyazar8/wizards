---
type: "query"
date: "2026-08-13T13:29:32.465935+00:00"
question: "Tüm yaptığımız değişikliklerden sonra web uygulamasındaki bir sunucu içerisinde kategori ve kanal oluşturma ekranlarını yeniden tasarlayacağım. Bu menülerde hangi içeriklerin seçeneklerin olması gerekiyor özetle sıralar mısın?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["category-service.ts", "channel-service.ts", "CreateCategorySchema", "CreateChannelSchema"]
---

# Q: Tüm yaptığımız değişikliklerden sonra web uygulamasındaki bir sunucu içerisinde kategori ve kanal oluşturma ekranlarını yeniden tasarlayacağım. Bu menülerde hangi içeriklerin seçeneklerin olması gerekiyor özetle sıralar mısın?

## Answer

Graf sözlüğü genişletmesi: category, channel, server, create, text, voice, topic, private, permission, role, position, slow. Kategori oluşturma: kategori adı ve iptal/oluştur; mevcut sözleşmede kategori izni veya açıklaması yok. Kanal oluşturma: TEXT/VOICE türü, ad, konu, kategori veya kategorisiz, PUBLIC/LOCKED_VISIBLE/PRIVATE/ROLE_GATED erişim seçimi, ROLE_GATED için roller, iptal/oluştur. NSFW, slow mode, bitrate ve user limit DB alanları olsa da create API sözleşmesinde yok; çalışır seçenek gibi sunulmamalı.

## Outcome

- Signal: useful

## Source Nodes

- category-service.ts
- channel-service.ts
- CreateCategorySchema
- CreateChannelSchema