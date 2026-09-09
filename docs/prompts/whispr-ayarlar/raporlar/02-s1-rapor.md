# 02 — Dalga 1 / Ş1 raporu · Bildirim tercihleri API + gönderim kapısı

**Dal:** `uat` · **Commit atılmadı.**
**Paralel şeritler:** Ş2, Ş3, Ş4 — dosyalarına dokunulmadı.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                                                     | İş                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/notifications/prefs-service.ts`                                                         | `UserNotificationSettings` satırının **tek kapısı**: okuma, yazma, sütun sözlüğü, K12 köprüsü       |
| `apps/web/src/lib/notifications/prefs-service.test.ts`                                                    | 31 test — eşleme, kilit, tuzak #3 regresyonu, K12                                                   |
| `apps/web/src/lib/notifications/prefs-policy.ts`                                                          | Düzey ↔ tür ↔ kanal kararı; `isNotificationAllowed`, `isCustomLevel`, `resolveNotificationDelivery` |
| `apps/web/src/lib/notifications/prefs-policy.test.ts`                                                     | 25 test                                                                                             |
| `apps/web/src/app/api/v1/users/me/notification-prefs/route.ts` + `route-logic.ts` + `route-logic.test.ts` | Uç + 9 test                                                                                         |
| `apps/web/src/lib/settings/notification-prefs-client.ts`                                                  | `fetch` + query key + `LOCKED_NOTIFICATION_TYPE` kodunu ekrana taşıyan hata sınıfı                  |

### Düzenlenen dosyalar

| Dosya                                           | Değişiklik                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/notifications/mention-settings-service.ts` | Kendi Prisma çağrılarını bıraktı; okuma/yazma `prefs-service` kapısından. Ters mantık çevirisi **davranış olarak** yerinde, tanımı tek yere (`toMentionSwitch` / `toSuppressColumn`) taşındı. Uç davranışı ve yükü **değişmedi** |
| `lib/notifications/desktop-mention-policy.ts`   | "Hangi tür bahsetme sayılır" kendi kopyası silindi, `prefs-policy`'den okuyor; `…FromPrefs` ikizi eklendi                                                                                                                        |
| `lib/workspace/message-notification-service.ts` | Gönderim kapısı: `collectQuietUserIds` → `collectNotificationDelivery`; toast / rozet / push ayrı ayrı kapılandı; `systemPreview` maskesi                                                                                        |
| `lib/workspace/role-mention-service.ts`         | Aynı kapıya taşındı + `systemPreview` maskesi (derleme zorunluluğu; hiçbir şeridin sahipliğinde değil — üç bahsetme dalından ikisi maskelenip biri maskelenmeseydi tercih yalan olurdu)                                          |
| `lib/mobile/push-notifications.ts`              | `filterPushEligibleUserIds` — `deliveryPush` kapısı, token okumasının **önünde**                                                                                                                                                 |
| `lib/socket/events.ts`                          | `settings:updated` olayı                                                                                                                                                                                                         |
| `lib/api-rate-limit.ts`                         | `settings:notification-prefs` anahtarı (120/dk)                                                                                                                                                                                  |
| `app/api/v1/users/me/settings/route.ts`         | K12'nin ters yönü: eski kolon yazıldığında yeni kolon da yazılıyor                                                                                                                                                               |
| `lib/locale/messages/tr.ts` · `en.ts`           | `notif.masked.title` / `notif.masked.body` (maskelenmiş sistem bildirimi)                                                                                                                                                        |
| `lib/locale/settings-screen-copy.test.ts`       | Ş0'ın "tüketicisini bekleyen anahtar" sayacı — tüketicisi olan iki anahtar listeden çıkarıldı, sayı 68'de kaldı                                                                                                                  |

---

## 2. Bağlayıcı kararlar (bu şeritte alındı)

### K-Ş1.1 — Çakışan beş tercihte **eski kolon otoritedir**

`notification-prefs` ile `mention-settings` beş tercihi paylaşıyor. Bahsetme ucunun yükü
donmuş durumda (`mention-settings-service.test.ts` `update` nesnesini alan alan `deepEqual`
ile doğruluyor ve o test dokunulmadan yeşil kalmak zorunda), yani bahsetme yazımına ayna
kolon **eklenemez**. O yüzden okuma eski kolondan yapılır, `notification-prefs` her yazımda
ikisini birden yazar:

| `NotificationPrefs`     | otorite                                     | ayna                  |
| ----------------------- | ------------------------------------------- | --------------------- |
| `types.mentionSelf`     | `mentionSelf`                               | `typeMentionSelf`     |
| `types.mentionRole`     | `!suppressRoleMentions`                     | `typeMentionRole`     |
| `types.mentionEveryone` | `!suppressEveryoneMentions`                 | `typeMentionEveryone` |
| `types.threadReplies`   | `mentionThreadReplies`                      | `typeThreadReplies`   |
| `delivery.system`       | `desktopNotifications ? desktopMentionMode` | `systemMode`          |

Aynadan okunsaydı, bahsetme modalinin yazdığı kolon ile tercih ucunun okuduğu kolon farklı
olurdu — tuzak #3'ün ta kendisi, yalnız işareti ters. Aynalar yine de yazılır: K3 "push'u açık
olanlar" sorusunun SQL'de cevaplanmasını istiyor ve kimsenin güncellemediği bir ayna bunu
cevaplayamaz.

Kalan dört eski kolonun (`mobileNotifications`, `emailNotifications`, `notificationSound`,
`notificationSoundFile`) ikinci yazarı yok; orada **yeni kolon otorite**, eski kolon ayna.

### K-Ş1.2 — Ters mantığın tanımı `prefs-service`'e taşındı, çevirisi `mention-settings`'te kaldı

Tuzak #2 "ters çevirme tek yerde yapılır" diyor. İki servis de aynı satırı okuduğu için iki
kopya kaçınılmazdı; `toMentionSwitch` / `toSuppressColumn` tek serviste tanımlandı,
`mention-settings-service` onları içe aktarıyor. `buildMentionSettingsWriteData`'nın çıktısı
bit bit aynı — mevcut testi bunu doğruluyor. Rota ve bileşenler hâlâ `suppress*` adını
görmüyor.

### K-Ş1.3 — `Sadece bahsetmeler` DM'i kapsamaz

`MENTION_FAMILY = { mentionSelf, mentionRole, mentionEveryone }`. İlk yazımda `dm` de
listedeydi ve `desktop-mention-policy.test.ts` bunu **kırdı**: bahsetme modalindeki
`Sadece bahsetmeler` bugüne kadar "yalnız `MENTION`" demek. Genişletmek, o seçeneği seçmiş
herkese DM için masaüstü bildirimi göndermeye başlamak olurdu.

### K-Ş1.4 — Thread yanıtı fan-out'u **iki** tür anahtarı taşır

Üst mesajın yazarına giden bildirim `messageReplies` (tasarımın `Yalnızca önemli` listesinde
**var**), diğer takipçilere giden `threadReplies` (listede **yok**). Tek anahtara indirgemek ya
varsayılan düzeyde üst mesaj yazarını susturur ya da takip edilen her thread'i "önemli"
sayardı.

### K-Ş1.5 — Socket yükü Ş0'ın şemasını kullanır, promptunkini değil

Prompt §7 `{ scope: "notification-prefs" | "user-settings" | "profile", userId, patch }`
istiyordu. Ş0 aynı olayı `packages/types/src/settings.ts` içinde `SettingsUpdatedEventSchema`
olarak **zaten tanımlamış**: `{ scope, patch }`, `scope` enum'unda `"notifications"` var.
İkinci bir şekil üretmek yerine yerleşik olan kullanıldı. Olay adı da kod tabanının
sözleşmesine uyuyor: `settings:updated` (iki nokta), `notification:new` / `mention:new` gibi.
`userId` yükte yok çünkü olay yalnız `user:{userId}` odasına gidiyor.

---

## 3. Kayda geçen sapmalar

### S1.1 — Türler sekmesinin iki varsayılanı gerçekte tersine dönük

Ş0 migration'ı `typeMentionEveryone` için `DEFAULT false`, `typeThreadReplies` için
`DEFAULT true` koydu; ama aynı satırdaki otoriteler (`suppressEveryoneMentions DEFAULT false`
= anahtar **açık**, `mentionThreadReplies DEFAULT false` = anahtar **kapalı**) tam tersini
söylüyor. K-Ş1.1 gereği otorite kazanır:

- `@herkes ve @burada` yeni hesapta **açık** (referans `SET` kapalı diyordu),
- `Thread yanıtları` yeni hesapta **kapalı** (kolon varsayılanı açık diyordu — ama K6 zaten
  kapalı olmasını istiyordu).

İkisini de değiştirmek bahsetme ucunun davranışını değiştirmek demekti; bu şerit bunu yapamaz.
Ş0'ın kolon varsayılanlarının otoriteyle hizalanması Dalga 5'e (Ş13) not edildi.

### S1.2 — `mobile/account/settings` uçtaki K12 köprüsü **yapılmadı**, gerekçesiyle

Prompt §8 bu ucun yanıtına `level` / `types` / `delivery` / `panel` / `sounds` alanlarının
opsiyonel eklenmesini istiyor. Kodda üç gerçek buna izin vermiyor:

1. **Uç bugün hiç bildirim alanı taşımıyor.** `MobileAccountSettingsResponseSchema`
   (`packages/types/src/mobile-social.ts:424`) yalnız `appearance` / `account` / `privacy`
   taşıyor. §8'in "eski alanları yazmaya devam eder" dediği beş alan bu uçta değil,
   `PATCH /api/v1/users/me/settings` içinde.
2. **Şema `.strict()`.** Yanıta yeni bir üst düzey alan eklemek, eski şemayla ayrıştıran
   yayınlanmış mobil sürümde ayrıştırmayı **düşürür** — yani tam olarak K12'nin yasakladığı
   şey ("mobil sözleşmesi kırılmaz").
3. **Mobilin bildirim tercihleri sunucuya hiç gitmiyor.** `mobile-notification-preferences.ts`
   tercihleri SecureStore'da tutuyor (`whispr.mobile.notification-preferences`); köprülenecek
   bir sunucu alanı yok.

K12 bunun yerine gerçekten var olan yerde kuruldu — eski kolonlar **iki yönde** de yazılıyor:
`notification-prefs` yazınca eski kolon (ayna), `PATCH /users/me/settings` yazınca yeni kolon
(`deriveModernNotificationColumns`). Mobil sözleşme testleri dokunulmadan yeşil.

### S1.3 — Ş0 backfill'i `notificationSoundFile`'ı yanlış eşliyor

Migration `notificationSoundFile LIKE '%whispr%'` ile `WHISPR` seçiyor. Kolon **dosya yolu
değil** `SoundProfileKey` taşıyor (`store/sound-store.ts:10`): `default`, `soft`, `pulse`,
`legacyNotification`. Hiçbiri `whispr` içermiyor, dolayısıyla backfill herkesi `CLASSIC`
yapmış — oysa `default` **Whispr paketidir** (`/sounds/notification-whispr.mp3`).

Ş1 doğru eşlemeyi kullanıyor (`default ↔ WHISPR`, geri kalan ↔ `CLASSIC`) ve
`deriveModernNotificationColumns` eski uçtan gelen her yazımda kolonu düzeltiyor. Yerel DB'de
migration koştuysa `soundNotificationProfile` bir kereye mahsus düzeltilmeli — düzeltme SQL'i
Ş13 temizlik listesine yazıldı.

### S1.4 — `level` ↔ `UserSettings.defaultNotifications` tek yönlü

Migration `level`'ı `defaultNotifications`'tan doldurdu ama iki alan farklı tablolarda ve
`defaultNotifications` bir **sunucu varsayılanı** kavramı. Ters eşleme kurulmadı;
`PatchSettingsSchema` zaten bu alanı yazmıyor. Aynı gerekçeyle `panel.count` /
`panel.autoClose` ↔ `UserSettings.notificationLimit` / `notificationAutoClose` de tek yönlü
kaldı — o ikisini eski uç hâlâ yazıyor, `TODO(api):` notu `prefs-service` içinde.

---

## 4. Uygulanan davranış değişiklikleri (ürün etkisi)

**Bu şerit "saklanıp uygulanmayan tercih yasak" kuralını gerçekten uyguluyor, yani gönderim
davranışı bugün değişiyor.** Kayda geçirilmesi gerekenler:

1. **`level` artık gönderimi kapılıyor.** Varsayılan `IMPORTANT` (migration'ın
   `defaultNotifications`'tan türettiği değer). `IMPORTANT` = `mentionSelf`, `messageReplies`,
   `incomingCall` + kilitli ikisi. Bunun **doğrudan sonucu**: `@herkes`, rol bahsetmesi ve
   thread yanıtı bildirimleri varsayılan düzeyde **push'a düşmüyor**.
   `Notification` satırı, sayaç ve zil rozeti yerinde kalıyor.
2. **`level = OFF` merkezi susturmuyor.** Satır yazılmaya devam ediyor; susan yalnız push,
   sistem bildirimi, ses ve uygulama içi kart. Test: `prefs-policy.test.ts` →
   "keeps the badge alive for a refused notification".
3. **`surfaces.inAppToast = false` artık socket olayını da durduruyor.** Olayı gönderip
   istemcide atmak, atılan bir uyandırma demekti.
4. **`systemPreview = false` push başlığını ve gövdesini maskeliyor** (`notif.masked.*`).
   Uygulama içi kart etkilenmiyor — `panel.showContent` ayrı tercih (tuzak #4).
5. **Sessiz saat artık `quietHoursAllowCalls`'ı okuyor**; güvenlik ve moderasyon her koşulda
   geçiyor.

---

## 5. Açık borç

| #   | Madde                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Kime          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| B1  | `sendMobilePushForNotifications`'ın **diğer yedi çağıranı** (`lib/dm/notification-service.ts`, `lib/friends/service.ts`, `lib/events/notifications.ts`, `lib/badges/badge-service.ts`, `lib/feedback/feedback-service.ts`, `lib/moderation/case-alert-service.ts`, `lib/workspace/invite-service.ts`, `lib/workspace/member-service.ts`) hâlâ kapısız. `filterPushEligibleUserIds` tek satırda takılacak şekilde hazır; o dosyalar bu şeridin sahiplenilen listesinde değil | Dalga 5 / Ş13 |
| B2  | `prefs.exceptions` bugün `[]`. `readNotificationPrefs` `options.exceptions` ile besleniyor; K4 birleşimini Ş4 bağlayacak                                                                                                                                                                                                                                                                                                                                                    | Ş4            |
| B3  | Ş0 kolon varsayılanları ile otorite kolonlarının hizalanması (sapma S1.1)                                                                                                                                                                                                                                                                                                                                                                                                   | Ş13           |
| B4  | `soundNotificationProfile` düzeltme SQL'i (sapma S1.3)                                                                                                                                                                                                                                                                                                                                                                                                                      | Ş13           |
| B5  | Masaüstü istemcisi hâlâ `MentionSettings` okuyor; `shouldDeliverDesktopNotificationFromPrefs` hazır ama `desktop-experience.tsx` (Ş10/Ş11 bölgesi) bağlamadı                                                                                                                                                                                                                                                                                                                | Ş10           |

`TODO(api):` bırakılan yer: `prefs-service.ts` içinde `NotificationPrefsReadOptions.exceptions`
(K4 birleşimi Ş4'te) ve panel sayacı ↔ `UserSettings` ters eşlemesi.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

| Adım        | Sonuç                                           |
| ----------- | ----------------------------------------------- |
| `typecheck` | **temiz — 0 hata**                              |
| `lint`      | **temiz — 0 hata**, 10/10 config testi geçti    |
| `test`      | **5473 test · 5472 geçti · 0 kaldı** (`EXIT=0`) |

Ş1'in kendi testleri: `prefs-service.test.ts` 31, `prefs-policy.test.ts` 25,
`notification-prefs/route-logic.test.ts` 9 — **hepsi yeşil**. Dokunulan mevcut testler
(`mention-settings-service.test.ts` 25, `desktop-mention-policy.test.ts` 4,
`message-notification-service.test.ts` 18, `role-mention-service.test.ts`,
`api/v1/route-contract.test.ts`) **dosyaları değiştirilmeden** yeşil.

Koşu sırasında geçici olarak Ş3'ün dosyalarından (`lib/security/security-event-service.ts`,
`lib/account/password-service.test.ts`) hata görüldü; şerit ilerledikçe kendiliğinden kapandı.
Ş1'in hiçbir dosyası bu hataların kaynağı değildi.

### Satır sonu notu

Ara koşularda birkaç dosyanın satır sonu CRLF/LF arasında kaydı (Windows'ta yapılan toplu
düzenleme). Depo **dosya başına karışık**: `lib/locale/messages/*.ts` ve `lib/api-rate-limit.ts`
CRLF, geri kalan her şey LF. Hepsi HEAD'deki biçimine geri döndürüldü; `git diff --numstat`
yalnız gerçek satırları gösteriyor (ör. `socket/events.ts` 38/0, `role-mention-service.ts` 9/6).

---

## 7. Kabul listesi

| Kabul                                                                                      | Durum                                                                                               |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET` yanıtı SPEC §7 `NotificationPrefs` şeklini karşılıyor                                | ✅ `NotificationPrefsSchema.parse` ile doğrulanıyor                                                 |
| `PATCH { types: { security: false } }` → `400 LOCKED_NOTIFICATION_TYPE`; okuma hâlâ `true` | ✅ `prefs-service.test.ts`, `route-logic.test.ts`                                                   |
| `PATCH` sonrası `mention-settings` `GET`'i değişmemiş                                      | ✅ "leaves the mention settings untouched after a notification-prefs write"                         |
| `mention-settings` `PATCH`'i sonrası `notification-prefs` `GET`'i tutarlı                  | ✅ "shows a mention-modal write in the notification-prefs read"                                     |
| `level = OFF` iken satır yazılıyor, push/sistem/ses susuyor                                | ✅ satır yazımı kapının önünde; `resolveNotificationDelivery` testi                                 |
| `level = IMPORTANT` iken `typeBadges` açıkken bile rozet push'a düşmüyor                   | ✅ "holds a badge notification out of push at level=important"                                      |
| `quietHoursAllowCalls` · güvenlik her koşulda                                              | ✅ `prefs-policy.test.ts`                                                                           |
| `systemPreview = false` sistem bildirimini maskeliyor, uygulama içi kart etkilenmiyor      | ✅ `maskPushText` yalnız push metnine dokunuyor                                                     |
| `delivery.push = false` iken token okunmuyor                                               | ✅ süzgeç `sendMobilePushForNotifications`'tan **önce**; `filterPushEligibleUserIds` de aynı sırada |
| `isCustomLevel` sapmada `true`                                                             | ✅                                                                                                  |
| `settings:updated` yalnız sahibinin odasına, yükü kısmi yama                               | ✅ `route-logic.test.ts`                                                                            |
| Mobil sözleşme testleri değişmeden yeşil                                                   | ✅ (yeni alan **eklenmedi** — sapma S1.2)                                                           |
| Saat dilimi kararı yalnız sunucuda                                                         | ✅ `resolveQuietHoursTimeZone` tek çağrı noktası, istemciye `tz` bilgi olarak gidiyor               |
