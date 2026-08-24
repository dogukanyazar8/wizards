# Dalga 1 · Ş4 raporu — bildirim ayarları uçları

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Şerit tamamlandı. Kendi kapısı yeşil; depo genelindeki `test` kapısında **Ş2'nin kendi dosyasından**
iki kırmızı var (aşağıda).

---

## Ne landed

| Dosya                                                             | Durum                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/web/src/lib/notifications/quiet-hours.ts`                   | yeni — `isWithinQuietHours`, `parseQuietHourMinutes`, `resolveQuietHoursTimeZone` |
| `apps/web/src/lib/notifications/quiet-hours.test.ts`              | yeni — 12 test                                                                    |
| `apps/web/src/lib/notifications/mention-settings-service.ts`      | yeni — okuma/yazma eşlemesi, GET/PATCH mantığı, fan-out okuyucusu                 |
| `apps/web/src/lib/notifications/mention-settings-service.test.ts` | yeni — 26 test                                                                    |
| `apps/web/src/app/api/v1/notifications/mention-settings/route.ts` | yeni — `GET`, `PATCH`                                                             |
| `apps/web/src/lib/settings/client.ts`                             | `settingsQueryKeys.mentions` + `fetchMentionSettings` + `patchMentionSettings`    |
| `apps/web/src/components/settings/settings-panel.tsx`             | bildirim bölümüne iki anahtar + sorgu/mutation bağlantısı                         |

Yeni test sayısı: **38**.

### Alan eşlemesi (K6)

Ters mantık **tek yerde**: `mention-settings-service.ts`. `toMentionSettings` (okuma) ve
`buildMentionSettingsWriteData` (yazma) dışında `suppress…` adı geçen bir satır yok — route ve
bileşen dosyalarında `!suppress` aramasını iki test doğruluyor
(`keeps the inverse mapping out of the route`, `binds the Settings page toggles…`).

| Modal anahtarı          | Kolon                                          | Yön                               |
| ----------------------- | ---------------------------------------------- | --------------------------------- |
| `Bana özel bahsetmeler` | `mentionSelf`                                  | doğrudan                          |
| `Rol bahsetmeleri`      | `suppressRoleMentions`                         | ters                              |
| `@herkes ve @burada`    | `suppressEveryoneMentions`                     | ters                              |
| `Thread yanıtları`      | `mentionThreadReplies` (varsayılan **kapalı**) | doğrudan                          |
| `Masaüstü bildirimi`    | `desktopMentionMode` + `desktopNotifications`  | doğrudan + eski kolona çift yazım |
| Sessiz saatler          | `quietHoursEnabled/From/To/TimeZone`           | doğrudan                          |

### Uçlar

```
GET   /api/v1/notifications/mention-settings   → MentionSettings   (satır yoksa varsayılan, YAZMAZ)
PATCH /api/v1/notifications/mention-settings   → MentionSettings   (satırı upsert ile oluşturur)
```

`PATCH` gövdesi `MentionSettingsPatchSchema` (`.strict()`) ile hem route'ta hem serviste
doğrulanıyor; bilinmeyen alan 400. `PATCH` `settings:update` hız sınırına bağlı, `GET` sınırsız
(kardeş okuma uçlarıyla aynı duruş). `route-contract.test.ts` 25/25 yeşil.

### Sessiz saatler

`isWithinQuietHours(settings, at)` — Ş2 ile tek temas noktası. Aralık yarı açık: `from` içeride,
`to` ilk dışarıdaki dakika. `from > to` gece aşan aralıktır. Saat, satırdaki saat diliminin **duvar
saati** üzerinden okunur (`Intl.DateTimeFormat`, `hourCycle: h23`); UTC'de değerlendirilseydi
Istanbul'da gece üç saat kayardı.

Kabuldeki iki örnek testle sabitlendi: `23:00 – 08:00` aralığı 00:30'da `true`, 09:00'da `false`.
`from === to` uçta 400; fonksiyon tarafında da `false` (savunmanın ikinci sırası).

---

## Kararlar ve sapmalar

1. **`UserAccountPreferences` diye bir model yok.** Prompt saat dilimi zincirini
   `UserAccountPreferences.timeZone` diye tarif ediyor; şemadaki karşılığı `UserSettings.timeZone`.
   Zincir aynen kuruldu: `quietHoursTimeZone` → `UserSettings.timeZone` → `Europe/Istanbul`.
   Okuma yolu **çözülmüş** saat dilimini döndürür (asla `null`), böylece modal zinciri tekrar
   yazmak zorunda kalmaz; kolonu temizlemek için `PATCH … {"quietHours":{"timeZone":null}}` hâlâ
   çalışır.

2. **Ayarlar sayfasında bağlanacak "mevcut iki kontrol" yoktu.** `suppressRoleMentions` /
   `suppressEveryoneMentions` hiçbir web/mobil yüzeyde okunmuyordu (grep yalnız Prisma üretim
   dosyalarını buluyor). Kullanıcı kararı: iki anahtar **eklendi** —
   `settings-mention-role` ve `settings-mention-everyone`, Ş0.4'ün `mentions.settings.role.*` /
   `everyone.*` metinleriyle, yeni uç üzerinden. Sayfa ve modal aynı sorgu anahtarını
   (`settingsQueryKeys.mentions`) paylaşıyor.

3. **Masaüstü kolonu tek yönlü değil, kapılı okunuyor.** Kullanıcı kararı "servis çift yazsın,
   sayfa dursun" idi; buna ek olarak okuma tarafına eski boolean bir **kapı** olarak kondu:
   `desktopNotifications = false` ise kip `off` okunur. Sebep: Ayarlar sayfası eski uçtan hâlâ
   yalnız boolean'ı yazıyor; kapı olmasaydı oradan kapatan bir kullanıcı modalda
   `Sadece bahsetmeler` görürdü. Yazma tarafı zaten çift: `desktop` yaması iki kolonu birden
   günceller. Ayrışma bu iki kural ile kapanıyor, eski kolon düşürülmüyor.

4. **Sessiz saatleri aralıksız açmak 400.** SPEC bu durumu söylemiyor. `enabled = true` ama
   `from`/`to` boşsa istek reddediliyor; kabul edilseydi "açık" görünen ama hiçbir zaman etkisi
   olmayan bir ayar kalırdı. Doğrulama **birleştirilmiş** sonuç üzerinde yapılır: satırda aralık
   varsa `{"quietHours":{"enabled":true}}` tek alanlık yaması geçerlidir (test var).

5. **Boş yama yazmaz.** `PATCH {}` mevcut değerleri döndürür, satır oluşturmaz — yazacak bir şey
   olmadan satır açmak "bu kullanıcı hiç bir şey seçti mi" sorusunu cevapsız bırakırdı.

6. **Bozuk saklanmış aralık `null` okunur, hata fırlatmaz.** `HH:mm` olmayan bir değer (eski
   istemci, elle düzenlenmiş satır) gönderim yolunda 500'e dönüşmemeli.

7. **Planda olmayan iki ihraç eklendi:** `listMentionSettings(userIds)` ve
   `readMentionSettings(map, userId)`. Gerekçe 4. maddede.

---

## Ş2'ye devir (açık maddeler — Ş4 bu dosyalara yazmadı)

1. **`isWithinQuietHours` imzası tutmuyor.** `message-notification-service.ts:50` bugün
   `isWithinQuietHours(_userId: string): boolean` yer tutucusunu taşıyor ve `TODO(api):` notu
   bunun Ş4 gelince değişeceğini söylüyor. Sözleşme imzası
   `isWithinQuietHours(settings, at: Date)`; alıcının ayarını `listMentionSettings` +
   `readMentionSettings` ile alıp bu fonksiyona vermek gerekiyor.

2. **Ters mantık şu an iki dosyada.** Ş2 kendi `readMentionNotificationSettings` /
   `readMentionSetting` çiftini yazmış ve ham `suppress*` alanlarını taşıyor;
   `message-notification-service.ts:473` `!…suppressEveryoneMentions` okuyor. K6 "ters mantık
   yalnız servis katmanında" diyor — `listMentionSettings` tam olarak bu ihtiyacı tek sorguyla
   karşılıyor (fan-out'ta alıcı başına sorgu yok, satırı olmayan alıcı varsayılana düşüyor).
   Ş2'nin okuyucusunun yerine geçebilir; dosya Ş2'nin olduğu için dokunulmadı.

3. **Sessiz saatte sayaç yazılır, push/masaüstü bastırılır.** Kural Ş2'nin fan-out yolunda
   uygulanır; Ş4 yalnız değerlendirmeyi ve saat dilimi çözümünü sağlıyor.

## Ş8'e devir

- Modal `fetchMentionSettings` / `patchMentionSettings` + `settingsQueryKeys.mentions` kullanır;
  ikinci bir sorgu anahtarı açılırsa Ayarlar sayfasıyla ayrışır.
- `Düzenle` şeridi `quietHours.from`/`to` değerlerini `HH:mm` yazar; `from === to` ucu 400 döner,
  metin karşılığı `mentions.settings.saveError`.
- `desktop` segmenti `all` / `mentions` / `off` gönderir; `off` eski boolean'ı da kapatır.

---

## Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✖ 3874 pass · 2 fail · 1 skip (3877 test, 888 suite)
```

İki kırmızının ikisi de `src/lib/workspace/message-notification-service.test.ts` içinde
(`creates a MENTION notification…`, `skips users who muted the channel…`) — Ş2'nin şu an üzerinde
çalıştığı dosya, `MessageMention.kind = 'SELF'` yazımı eklendi ama kendi testi henüz güncellenmedi.
Ş4'ün dosyalarıyla ilgisi yok; Ş4'ün kendi iki test dosyası 38/38 yeşil ve
`src/app/api/v1/route-contract.test.ts` 25/25 yeşil.
