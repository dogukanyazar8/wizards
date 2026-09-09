# Dalga 1 · Ş1 — Bildirim tercihleri API + gönderim yolunun tercihlere uyması

**Ön koşul:** Ş0 kapısı yeşil. **Paralel:** Ş2, Ş3, Ş4.

Bildirimler bölümünün 7 sekmesini ve 560 px pencereyi besleyen tek tercih ucu. **Saklanıp
uygulanmayan tercih yasaktır** — bu şerit hem yazma yüzeyini hem gönderim kapısını kurar.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/notifications/prefs-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/notifications/prefs-policy.ts` (yeni — düzey ↔ tür ↔ kanal kararı) + `.test.ts`
- `apps/web/src/app/api/v1/users/me/notification-prefs/route.ts` + `route-logic.ts` + `route-logic.test.ts` (yeni)
- `apps/web/src/lib/settings/notification-prefs-client.ts` (yeni — fetch + query key)
- `apps/web/src/lib/notifications/mention-settings-service.ts` (**düzenlenir** — tek servis kuralı)
- `apps/web/src/lib/notifications/desktop-mention-policy.ts` (**düzenlenir**)
- `apps/web/src/lib/workspace/message-notification-service.ts` (**düzenlenir** — kapı)
- `apps/web/src/lib/mobile/push-notifications.ts` (**düzenlenir** — `deliveryPush` kapısı)
- `apps/web/src/app/api/v1/mobile/account/settings/route-logic.ts` (**düzenlenir** — K12 köprüsü)
- `apps/web/src/lib/socket/events.ts` (`settings.updated` olayı eklenir)

**Okunur, yazılmaz:** `lib/notifications/quiet-hours.ts`, `packages/types/src/settings.ts`,
`lib/settings/tree.ts`.

---

## İş

### 1. Tek servis kuralı (tuzak #3)

`notification-prefs` ve `mention-settings` **aynı** `UserNotificationSettings` satırını yazıyor.
İki ayrı yazma yolu = son yazan kazanır ve bahsetme ayarları sessizce sıfırlanır.

`prefs-service.ts` tek otorite olur:

```ts
export async function readNotificationPrefs(userId: string): Promise<NotificationPrefs>;
export async function patchNotificationPrefs(
  userId: string,
  patch: NotificationPrefsPatch,
): Promise<NotificationPrefs>;
```

`mention-settings-service.ts` **kendi Prisma çağrısını bırakır** ve bu servisi çağırır;
ters mantıklı iki kolonun (`suppressEveryoneMentions`, `suppressRoleMentions`) çevirisi hâlâ
orada yapılır ve dışarı sızmaz (tuzak #2). Mention ucu davranışını **hiç değiştirmez** —
mevcut `mention-settings` testleri dokunulmadan yeşil kalmalı.

### 2. Kilitli türler sunucu sözleşmesidir (tuzak #5)

- Okuma: `types.security` ve `types.moderation` **her zaman `true`** döner (kolon yok, sabit).
- Yazma: `NotificationPrefsPatchSchema` bu anahtarları tanımıyor; gövdede gelirse `400` +
  `{ code: "LOCKED_NOTIFICATION_TYPE" }`.
- Test: PATCH `{ types: { security: false } }` → 400; okuma hâlâ `true`.

### 3. Düzey ↔ ayrıntı ilişkisi (`prefs-policy.ts`)

Tasarım iki yüzeyde aynı veriyi gösteriyor; ilişki **tek yerde** tanımlanır.

| Düzey       | Anlamı                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| `ALL`       | Bütün türler açık kabul edilir (kullanıcı tek tek kapatmadıysa)                         |
| `IMPORTANT` | Yalnız `mentionSelf`, `messageReplies`, `incomingCall`, `security`, `moderation`        |
| `OFF`       | Hiçbir isteğe bağlı bildirim gönderilmez; **bildirim merkezi kayıt tutmaya devam eder** |

```ts
export function isNotificationAllowed(
  prefs: NotificationPrefs,
  kind: NotificationTypeKey,
  at: Date,
): {
  allowed: boolean;
  reason?: "level" | "type" | "quietHours" | "channel";
};
export function isCustomLevel(prefs: NotificationPrefs): boolean; // "Özel" pili
```

**`OFF` merkezi susturmaz.** `Notification` satırı yine yazılır; susan yalnız push / sistem
bildirimi / ses / açılır kart. 560 px penceredeki metin bunu **açıkça** söylüyor.

`isCustomLevel` → düzeyin ima ettiği tür kümesi ile gerçek tür kümesi farklıysa `true`;
560 px penceredeki `Özel` pili bunu okur.

### 4. Sessiz saatler

`isWithinQuietHours` (mevcut) yeniden kullanılır. Eklenen tek kural: `quietHoursAllowCalls`
açıksa `incomingCall` sessiz saatte de geçer. Güvenlik ve moderasyon **her koşulda** geçer.

Saat dilimi `resolveQuietHoursTimeZone` ile çözülür (tuzak #7) — istemci ikinci kez hesaplamaz.

### 5. Gönderim kapısı

Tek uygulama noktası: `lib/workspace/message-notification-service.ts:126` civarındaki
`isWithinQuietHours` kapısı `isNotificationAllowed` ile **değiştirilir**.

| Kanal                                  | Kapı                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| Uygulama içi açılır kart               | `prefs.surfaces.inAppToast` + `isNotificationAllowed`            |
| Sistem bildirimi (uygulama açıkken)    | `prefs.surfaces.systemWhileOpen`                                 |
| Sistem bildirimi (uygulama kapalıyken) | `prefs.delivery.system` (`ALL` / `MENTIONS` / `OFF`)             |
| Rozet / sekme sayacı                   | `prefs.surfaces.appBadge`                                        |
| Mobil push                             | `prefs.delivery.push` — `lib/mobile/push-notifications.ts`       |
| E-posta                                | `prefs.delivery.email`                                           |
| Sistem bildirimi içeriği               | `prefs.systemPreview` — kapalıysa başlık ve gövde **maskelenir** |

`desktop-mention-policy.ts` yeni düzey/kanal kararlarını `prefs-policy.ts`'ten okur; kendi
kopyasını tutmaz.

### 6. Uç

| Uç                                          | Girdi                          | Çıktı               |
| ------------------------------------------- | ------------------------------ | ------------------- |
| `GET /api/v1/users/me/notification-prefs`   | —                              | `NotificationPrefs` |
| `PATCH /api/v1/users/me/notification-prefs` | kısmi `NotificationPrefsPatch` | `NotificationPrefs` |

`route-logic.ts` bağımlılık enjeksiyonlu (`runHomeRoute` deseni), `route.ts` yalnız varsayılanları
geçirir. Rate limit anahtarı `settings:notification-prefs`.

PATCH yanıtı **tam** nesne döner — istemcinin kısmi yamayla birleştirme yapmasına gerek kalmaz
ve paylaşılan anahtarlar (tuzak #4) iki sekmede de anında hizalanır.

### 7. Socket — `settings.updated`

```ts
type SettingsUpdatedPayload = {
  scope: "notification-prefs" | "user-settings" | "profile";
  userId: string;
  patch: Record<string, unknown>;
};
```

`user:{userId}` odasına yayılır. Aynı hesabın ikinci sekmesi ve masaüstü istemcisi anında
hizalanır. Yayın **PATCH başarılı olduktan sonra**, veritabanı işleminin dışında.

### 8. Mobil köprüsü (K12)

`api/v1/mobile/account/settings` yanıtı:

- Yeni alanları **opsiyonel** ekler (`level`, `types`, `delivery`, `panel`, `sounds`).
- Eski alanları (`mobileNotifications`, `emailNotifications`, `notificationSound`,
  `notificationSoundFile`, `desktopMentionMode`) **türetilmiş değer** olarak yazmaya devam eder.
- Mobil PATCH eski alanı yazarsa yeni kolonu da yazar (tek yönlü değil, **iki yönlü** eşleme).

`mobile-account-preferences-client.test.ts` ve mevcut mobil sözleşme testleri **dokunulmadan**
yeşil kalmalı.

---

## Kabul

- [ ] `GET` yanıtı SPEC §7 `NotificationPrefs` şeklini birebir karşılıyor.
- [ ] `PATCH { types: { security: false } }` → `400 LOCKED_NOTIFICATION_TYPE`; okuma hâlâ `true`.
- [ ] `PATCH` sonrası `mention-settings` `GET`'i **değişmemiş** bahsetme ayarlarını döndürüyor
      (tuzak #3 regresyon testi).
- [ ] `mention-settings` `PATCH`'i sonrası `notification-prefs` `GET`'i tutarlı
      (ters mantıklı iki kolon doğru çevriliyor).
- [ ] `level = OFF` iken `Notification` satırı **yazılıyor**, push / sistem / ses **susuyor**.
- [ ] `level = IMPORTANT` iken `typeBadges` açık olsa bile rozet bildirimi push'a düşmüyor.
- [ ] `quietHoursAllowCalls = true` iken sessiz saatte çağrı geçiyor; diğerleri geçmiyor;
      güvenlik her koşulda geçiyor.
- [ ] `systemPreview = false` iken sistem bildirimi gövdesi maskeleniyor
      (uygulama içi kart **etkilenmiyor** — `panelShowContent` ayrı).
- [ ] `delivery.push = false` iken `push-notifications.ts` hiç token okumuyor.
- [ ] `isCustomLevel` düzeyin ima ettiği kümeden sapmada `true`.
- [ ] `settings.updated` olayı yalnız sahibinin odasına gidiyor; yükü kısmi yama taşıyor.
- [ ] Mobil sözleşme testleri değişmeden yeşil; yeni alanlar opsiyonel.
- [ ] Saat dilimi kararı yalnız sunucuda; istemciye `tz` bilgi olarak gidiyor.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/02-s1-rapor.md`
