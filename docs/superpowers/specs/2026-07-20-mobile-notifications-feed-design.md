# Mobil 1d "Bildirimler" ekranı — içerik tamamlama

Tarih: 2026-07-20 · Dal: `uat`

## Amaç

1d Bildirimler ekranının görsel dili korunuyor (kullanıcı onaylı). Yapılan iş: içeriği web
bildirim merkezi + Discord/Slack/Teams davranışlarıyla doldurmak, kalan hardcoded metinleri
tasarım sisteminin i18n kuralına çekmek.

## Tespit edilen boşluklar

- Ekranda hardcoded Türkçe metinler: "Tümünü okundu say", "Anlık bildirimleri aç", "İzin ver",
  "Katıl", ses-odası erişilebilirlik etiketi.
- `groupMobileNotificationsByDay` "BUGÜN"/"DÜN" ve `tr-TR` biçimlendirmesini koda gömmüş.
- Web'de olup mobilde olmayanlar: hepsini sil, arkadaşlık isteği satırında Kabul/Reddet
  (`meta.friendRequestId`), okunmamış özet cümlesi.
- Discord/Slack/Teams standardı: Tümü / Okunmamış / Bahsetmeler filtresi, ayarlar kısayolu.

## Değişiklikler

### Ekran

- Header: başlık + açıklama, sağda "Tümünü okundu say" + **ayarlar ikon butonu** →
  `SettingsDetail { section: "notifications" }` (5h).
- Başlık altında **okunmamış özeti** (web `notifications.bell.unreadSummary` karşılığı; 0 iken
  "Her şey okundu").
- **Segment kontrolü** (6a/dm-inbox deseni: `surface.rail` track, beyaz aktif kart): Tümü /
  Okunmamış / Bahsetmeler; Okunmamış sekmesinde gerçek toplam rozet.
- Satırlarda `friendRequestId` varsa **Kabul et / Reddet** aksiyonları
  (`useMobileSocialMutations.acceptRequest/rejectRequest`); basınca satır da okundu işaretlenir.
- Liste sonunda **Tümünü temizle** (danger pill) → `DestructiveConfirmationSheet` (snapPoint 260).
- Filtreye göre boş durum metni.

### Veri sözleşmesi (`packages/types`)

- `MOBILE_NOTIFICATION_FILTERS` + `MobileNotificationFilterSchema` (`all` / `unread` / `mentions`).
- `MobileNotificationsQuerySchema.filter` (default `all`).
- `MobileNotificationItemSchema.friendRequestId` — `.nullable().default(null)` (UAT forward-compat).
- `MobileNotificationsResponseSchema.unreadCount` — `.default(0)` (aynı sebep).

### Web

- `listMobileNotifications`: `filter` → `read:false` / `type:"MENTION"`; gerçek `unreadCount`
  (`prisma.notification.count`, görünür tipler + okunmamış); `friendRequestId` yalnızca
  `FRIEND_REQUEST` satırlarında metadata'dan taşınır.
- Yeni `clearNotifications(userId)` servisi + `DELETE /api/v1/mobile/notifications/clear`
  (`mobileNotificationsClearRoute`), rate-limit `mobile:notifications:clear` 20/60sn.
- Route-contract bodyless listesine `DELETE mobile/notifications/clear` eklendi.

### Mobil veri katmanı

- Sorgu anahtarı filtre başına: `mobileQueryKeys.notifications(filter)`; kök için
  `notificationsRoot()`. Realtime bridge `exact: true` invalidasyon yaptığı için üç filtre
  anahtarını **açıkça** listeler.
- `fetchMobileNotifications` `filter` parametresi; `clearMobileNotifications`; `clearAll` mutation.

## Doğrulama

types/web/mobile typecheck EXIT 0 · types 56 · mobile 581 node + 422 jest (61 suite) · web mobil
rota + rate-limit + route-contract 180 · `lint:hooks` temiz.
