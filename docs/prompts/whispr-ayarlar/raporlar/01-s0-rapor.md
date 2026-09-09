# Ş0 — Sözleşme katmanı · rapor

**Tarih:** 2026-08-24 · **Dal:** `uat` · **Commit:** yok (kullanıcı istemedi)
**Şerit:** Dalga 0 / Ş0 — migration, paylaşılan tipler, ölçü sözlüğü, içerik ağacı, rota çözücü,
i18n iskeleti, parity kapısı.

Bu şerit **hiç ekran çizmedi.** Aşağıdaki on üç dosya sonraki on üç şeridin okuyacağı sözleşmedir.

---

## 1. Ne yapıldı

### 1.1 Migration — `20260824090000_settings_notifications_screen`

`packages/db/prisma/rebaseline-migrations/` altında (Prisma **bu** klasörü okur, tuzak #1).
Beş eklemeli adım, hiçbir düşürme ya da yeniden adlandırma yok:

1. **Dört enum:** `NotificationLevelPreference` · `SystemNotificationMode` · `SoundProfile` ·
   `SecurityEventKind` (8 üye).
2. **`SecurityEvent`** tablosu + `@@index([userId, createdAt])` + `ON DELETE CASCADE` FK.
   `ipHash VARCHAR(64)`, ham IP **yok** (`AdminAuditLog.ipHash` ile aynı şema).
3. **`UserNotificationSettings` +42 kolon** — Bildirimler bölümünün yedi sekmesi (K3, tipli
   kolon). `typeSecurity` / `typeModeration` **eklenmedi**.
4. **`UserSettings` +13 kolon** — K9 (`idleTimeoutMinutes`) + Görünüm'ün Düzen / Erişilebilirlik /
   Medya satırları. `reduceMotion` **tek** kolon (sapma #4).
5. **Geri doldurma** — 13 alan; ters mantıklı iki kolon `NOT` ile **bir kez** çevriliyor.

Migration yerel DB'de **koştu** (`prisma migrate deploy`, 11 satır). İdempotenlik ölçüldü:
geri doldurma bloğu iki kez koşturuldu, tablo md5'i aynı kaldı.

| Denetim                                             | Sonuç                          |
| --------------------------------------------------- | ------------------------------ |
| `UserNotificationSettings` kolon sayısı             | 18 → **60**                    |
| `typeSecurity` / `typeModeration`                   | **yok**                        |
| `suppressEveryoneMentions` / `suppressRoleMentions` | **duruyor**                    |
| `SecurityEvent` indeksleri                          | `pkey`, `userId_createdAt_idx` |
| Geri doldurma iki koşumda aynı sonuç                | evet                           |

`packages/db/prisma/schema-settings-screen.test.mjs` (25 iddia) `packages/db/package.json`
`test` script'ine eklendi.

### 1.2 Paylaşılan tipler — `packages/types/src/settings.ts`

SPEC §7'nin tamamı + PLAN §5.4. `packages/types/src/index.ts` üzerinden ihraç edildi;
`settings.test.ts` 11 iddia.

Sunucu **metin göndermez, enum ve sayı gönderir** kuralı beş yerde uygulandı ve dosya başında
tabloyla kayda geçti (`types: Record<string, boolean>` → 16 adlı anahtar; exception `level`,
`expiresIn`, `privacy` ve `updates.lastCheck` enum/ISO'ya çevrildi).

Kilitli tür sözleşmesi:

- `NotificationTypesSchema` **16** anahtar okur; `security` / `moderation` `z.literal(true)`.
- `NotificationPrefsPatchSchema` `z.strictObject` üstüne kurulu, **14** anahtar yazar.
  `{ types: { security: false } }` ayrıştırma hatası verir → uç 400 döner.
- `permission` ve `exceptions` da patch'te **yok**: biri çalışma zamanından gelir, diğeri üç
  tablonun birleşimidir (K4).

### 1.3 Ölçü sözlüğü — `apps/web/src/lib/settings/metrics.ts`

`lib/events/metrics.ts` deseni. On üç blok: `panel` · `prefsDialog` · `userMenu` · `window` ·
`nav` · `header` · `tabs` · `body` · `row` · `controls` (13 kontrol tipi) · `riskyBlock` ·
`saveBar` · `blocks` (20 özel blok) · `motion`.

- Renk **yok**: `hsl(`, `rgb(`, `#`, `var(--` araması temiz (`metrics.test.ts` doğruluyor).
- Font ailesi adı **yok**.
- `pxToRem` / `pxToEm` / `hairline` `lib/home/metrics.ts`'ten yeniden ihraç edildi.
- Negatif sayılar allow-list ile sınırlı (9 kayıt: gölge yayılmaları, `avatarRowMarginTop`,
  kaydırıcı topuz ofsetleri).
- `SPEC_DEVIATIONS` **dokuz** kayıt; `SETTINGS_DIRTY_PROFILE_KEYS` sekiz anahtar (sapma #5).

### 1.4 Parity kapısı — `apps/web/src/lib/settings/parity.test.ts`

`lib/mentions/parity.test.ts` deseni; referans `.dc.html` içindeki inline `style` metni aranıyor.
**Altı** iddia grubu, 19 test, ~60 ayrı parça:

1. Dört yüzeyin genişliği + yarıçapı + konumu + gölgesi
2. Sol nav (genişlik, üst boşluk, arama, satır, alt kart) ve başlık
3. Alt sekme şeridi + içerik kolonu (720) + iskelet yükseklikleri
4. Satır dolgusu, açıklama genişliği ve on üç kontrolün geometrisi
5. Hero (banner 132 · avatar 80 · halka 5 · `-42` · durum noktası 17 · kamera düğmesi 28),
   QR 104, kamera önizleme 220/16:9, tema kartı 62, swatch 18, istisna satırı
6. 400 / 560 / 308 px yüzeylerin iç geometrisi + kayıt şeridi + sapmaların HTML'deki karşılığı

### 1.5 İçerik ağacı — `apps/web/src/lib/settings/tree.ts`

Referanstaki `SET` dizisinden **birebir** çıkarıldı (elle değil, ayrıştırıcıyla; sonuç dosyaya
yazıldı ve gözden geçirildi). `tree.test.ts` 28 test:

```
6 bölüm · 27 sekme (6/3/5/7/5/1) · 58 grup · 170 satır · 13 kontrol tipi · 20 blok · 3 riskli
```

Bölüm başına: `account 6/15/35` · `av 3/7/26` · `appearance 5/10/29` · `notifications 7/14/50` ·
`desktop 5/8/24` · `about 1/4/6`.

Ayrıca kilitlenenler:

- `sharedTabs` **yalnız** `nd2`, `na5`, `na6`, `nq1`, `ns1` üzerinde; her biri iki sekmede,
  ikisinde de aynı `type` + `defaultValue`.
- `np4` `sharedTabs` **taşımıyor** (tuzak #4).
- `locked` yalnız `nt13` / `nt14`.
- `stateKey` yalnız `v7`/`x1` (`reduceMotion`) ve `v8`/`x5` (`enableTTS`) — sapma #4.
- Hiçbir `jump.target` var olmayan sekmeye gitmiyor (sapma #7'nin kökü).
- `SETTINGS_TREE` sekme sırası `SETTINGS_TABS_BY_SECTION` ile birebir.

### 1.6 Rota çözücü — `apps/web/src/lib/settings/navigation.ts`

Yeniden yazıldı. Yeni yüzey: `SettingsSection` (6) · `SettingsTab` (**27 ayrı değer**) ·
`buildSettingsHref` · `resolveSettingsRoute` · `migrateLegacySettingsQuery` ·
`SETTINGS_TABS_BY_SECTION` · `DEFAULT_SETTINGS_ROUTE`.

`navigation.test.ts` (12 test) 19 eski `SettingsPanelKey` değerinin **hepsini** eşliyor, eski özel
dalı (`?section=about&panel=desktop` → `/settings/desktop/updates`) koruyor ve tanımadığı değere
`null` dönüyor.

### 1.7 i18n iskeleti

`tr.ts` / `en.ts` içine **551** yeni anahtar:

| Öbek                                                                                        | Adet |
| ------------------------------------------------------------------------------------------- | ---- |
| Ağaçtan üretilen (`settings.section                                                         | tab  | group | row | option | action.*`) | 467 |
| Pencere kabuğu + üç popover + üç blok düğmesi (`settings.*`, `settings.block.*`, `notif.*`) | 84   |

Mevcut 392 `settings.*` anahtarının **hiçbiri silinmedi** — eski panel hâlâ ayakta (Ş13).
Yeni anahtarlarla eski anahtarlar arasında çakışma **yok** (ölçüldü).

`settings-screen-copy.test.ts` (11 test) **spot kontrol değil, tam tarama**: referans HTML'in
içindeki `SET` dizisini kendi ayrıştırıcısıyla okuyup (`eval` yok) `SETTINGS_TREE` ile yan yana
geziyor ve 170 satırın başlık / açıklama / pil / seçenek / düğme / önek metinlerinin tamamını
karşılaştırıyor. Ayrıca ağaç öneklerinde ölü anahtar olmadığını ve iki dilin anahtar kümesinin
aynı olduğunu doğruluyor.

---

## 2. Kayda geçen sapmalar (`SPEC_DEVIATIONS`, dokuz kayıt)

| #   | `field`                          | HTML               | SPEC            |
| --- | -------------------------------- | ------------------ | --------------- |
| 1   | `themeGrid.darkLightSplit`       | `14/9`             | `13/10`         |
| 2   | `privacy.visibility.rowCount`    | 3                  | 4               |
| 3   | `header.runtimeSegmentRendered`  | `true`             | `false`         |
| 4   | `sharedStateRowPairs.stateCount` | 2                  | 1               |
| 5   | `profileDirtyKeys.count`         | `prefix:p`         | 8               |
| 6   | `level.labelSets`                | 2                  | 1               |
| 7   | `searchIndex.source`             | `SET_HITS`         | `SETTINGS_TREE` |
| 8   | `group.titleOptional`            | `true`             | `false`         |
| 9   | `exceptions.ne1Group`            | `Aktif istisnalar` | `Varsayılanlar` |

Sapma #1 ve #4 ikişer maddeyi tek kayıtta topluyor (tema koyu/açık sayımı; `reduceMotion` +
`enableTTS`) — liste dokuz kayıtta tutulsun diye.

**Sapma #9'un çözümü:** ağaç `SET` ile birebir kaldı (58 grup), `ne1` satırı
`ownGroupTitleKey: "settings.group.notifications.exceptions.defaults.title"` taşıyor.
Ş9 satırı kendi `Varsayılanlar` başlığı altında çizer; grup sayımı bozulmaz, satır metni
değişmez.

---

## 3. Kararlardan sapılan tek nokta

**"Hiçbir ekran dosyası değişmedi" maddesi tam tutmadı.** `navigation.ts` yeniden yazılınca eski
`SettingsSection` birleşimi (`voice` üyesiyle) yeni birleşimle (`av`) çakıştı. Üç ölmekte olan
dosyada **altı satır** değişti — hepsi import adı ya da fonksiyon adı, hiçbiri mantık:

- `components/settings/settings-panel.tsx` — `buildSettingsHref` → `buildLegacySettingsHref` (2)
- `components/settings/settings-sidebar.tsx` — aynı + `SettingsSection` → `LegacySettingsSection` (3)
- `components/shared/user-profile-popover.tsx` — `buildSettingsHref` → `buildLegacySettingsHref` (2)

Alternatif, tip kontrolünü kırmızı bırakmaktı. Eski API `navigation.ts` içinde `Legacy` önekiyle
tam olarak korundu; üretilen adresler **birebir aynı** kaldı (`/settings?section=…&panel=…`), yani
çalışma zamanı davranışı değişmedi. Ş13 eski paneli silerken dosyanın alt yarısı da gider.

---

## 4. Prompt ile kod arasındaki farklar (uygulayan şeritler için)

1. **`UserNotificationSettings` 12 değil 18 kolondu.** Prompt'un "12 kolon" sayımı tercih
   kolonlarını sayıyor; `id`, `userId`, üç `quietHours*` ve `eventNotifications` dahil gerçek
   sayı 18'di. Migration sonrası **60**.
2. **zod 4'te `deepPartial()` yok.** `NotificationPrefsPatchSchema` elle yazıldı — zaten
   gerekiyordu: türetilmiş bir deep partial `permission`, `exceptions` ve kilitli iki türü de
   kabul ederdi.
3. **Prompt'un geri doldurma SQL'i olduğu gibi koşmuyordu.**
   `CASE (SELECT s."defaultNotifications" …) WHEN 'NOTHING'` — `NotificationLevel` enum'unda
   `NOTHING` diye bir üye yok; Postgres literal'i enum'a zorlayıp
   `invalid input value for enum` ile migration'ı iptal ederdi. `::text` ile karşılaştırılıyor,
   dal gerekçesiyle yorumda duruyor.
4. **`00-ortak-baglam.md` §1 tablosunda Masaüstü'nün özel blok sayısı 4 yazıyor; gerçek 3**
   (`shortcuts`, `perms`, `diag`). Toplam 20 doğru: `5 + 2 + 4 + 2 + 3 + 4`.
5. **Satır anahtarları küresel olarak tekil değil.** `o1` ve `o2` hem Hesabım › Güvenlik'te hem
   Hakkında'da geçiyor. İkisi de durum tutmayan satırlar (`custom` / `action`); `tree.test.ts`
   bunu bir kural olarak sabitledi — bir gün biri `toggle` olursa test kırılır.
6. **Paylaşılan anahtarların açıklaması her yerde aynı değil.** `nq1` Genel'de
   `Her gün 23:00 – 08:00 · güvenlik bildirimleri hariç`, Sessiz saatler'de
   `Her gün 23:00 – 08:00`. `nd2`'nin Genel'de açıklaması var, Yüzeyler'de yok. Anahtar şeması
   buna göre `settings.row.nq1.descriptionShort` ile genişletildi; `type` ve `defaultValue`
   ikisinde de aynı.
7. **On iki satırın alt metni kopya değil, veri.** `ae` (`dogukan@whispr.app`), `s2`
   (`10 kod · 8 tanesi kullanılmadı`), `h1` (`2.4.1 · build 4812 …`) gibi. Bunlar sözlüğe
   **yazılmadı**; satır `descriptionData: "<alan>"` taşıyor. Aynısı üç grup başlığı için
   (`badgeProgress`, `sessionCount`, `appVersion`) ve `q3`'ün pili için (`shortcutConflicts`).
   Sözlüğe yazılsalardı demo veri ürüne sızardı.
8. **Sekme anahtarları İngilizce.** Referansta `notif/genel` ile `about/genel` aynı harfleri
   taşıyor; İngilizce dilimlerle 27 sekme 27 **ayrı** değer oldu ve
   `/settings/notifications/quiet-hours` gibi adresler paylaşılabilir hâle geldi.
9. **`prisma format` çalıştırılmadı.** Depodaki `schema.prisma` prettier-temiz değil; format
   komutu 349 ilgisiz satırı yeniden hizalıyordu. Şema elle hizalandı, `prisma validate` temiz.
10. **i18n hacmi ~420 değil 551.** Fark, ağaçtan üretilen seçenek ve düğme anahtarlarından
    geliyor (467 ağaç + 84 kabuk/popover).

---

## 5. Bırakılan `TODO(api):`

**Bu şeritte kod içinde `TODO(api):` işareti yazılmadı.** K5'in karşılığı olmayan iki yüzeyi tip
seviyesinde işaretlendi ve işaretler Ş3/Ş7'de kod yorumuna dönüşecek:

- `AccountConnectionSchema.available: boolean` — dört OAuth sağlayıcısının kimlik bilgisi yok;
  satır çizilir, `disabled`.
- `SettingsAccountSchema.phone` maskeli geliyor, `phoneVerified` var ama SMS sağlayıcı yok.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/db db:generate      ✔ Generated Prisma Client (7.9.1)
pnpm --filter @wizards/db test             ℹ pass 134  ℹ fail 0
pnpm --filter @wizards/types test          ℹ pass 519  ℹ fail 0
pnpm --filter @wizards/web typecheck       ✔ (çıktı yok)
pnpm --filter @wizards/web lint            ℹ pass 10   ℹ fail 0  + eslint temiz
pnpm --filter @wizards/web test            ℹ pass 5217 ℹ fail 0  ℹ skipped 1
```

Yeni test dosyalarının kendi sayıları: `metrics.test.ts` 12 · `parity.test.ts` 19 ·
`tree.test.ts` 28 · `navigation.test.ts` 12 · `settings-screen-copy.test.ts` 11 ·
`packages/types/src/settings.test.ts` 11 · `schema-settings-screen.test.mjs` 25 = **118**.

Migration yerel DB'de koştu; `prisma migrate status` temiz.

---

## 7. Kabul listesi

- [x] Migration `rebaseline-migrations/` altında ve yerel DB'de koştu
- [x] `db:generate` temiz; `schema-settings-screen.test.mjs` yeşil
- [x] `typeSecurity` / `typeModeration` kolonu yok
- [x] Geri doldurma idempotent (iki koşumda aynı md5)
- [x] Ters mantıklı iki kolon duruyor ve `NOT` ile doğru çevriliyor
- [x] `packages/types/src/settings.ts` SPEC §7'yi karşılıyor; patch şeması kilitli türleri reddediyor
- [x] `metrics.ts` renk taşımıyor; `SPEC_DEVIATIONS` dokuz kayıt
- [x] `parity.test.ts` yeşil; altı iddia grubu (beş isteniyordu)
- [x] `tree.test.ts` `6 / 6-3-5-7-5-1 / 58 / 170 / 20 / 3 / 5` sayımlarını kilitliyor
- [x] `navigation.test.ts` 19 eski panel değerinin hepsini eşliyor
- [x] `settings-screen-copy.test.ts` tam tarama yapıyor ve yeşil
- [~] Ekran dosyaları: üç dosyada altı satırlık import/ad değişikliği (§3)
- [x] Commit atılmadı

---

## 8. Dalga 1 için notlar

- **Ş1** `NotificationPrefsSchema` ↔ 42 kolon eşlemesini yazarken `mobileNotifications` /
  `emailNotifications` ile `deliveryPush` / `deliveryEmail` **ikisi birden** yazılmaya devam
  etmeli (bir sürüm daha). `mention-settings` ve `notification-prefs` uçlarının aynı satırı
  yazdığı unutulmamalı (tuzak #3).
- **Ş2** `NotifDayBucketSchema` üç kova taşıyor (`today` / `yesterday` / `older`); referans
  yalnız ikisini çiziyor ama K10 `Sistem` sekmesine sonsuz kaydırma verdiği için üçüncü kova
  gerçekten dolar.
- **Ş3** `SecurityEventKind`'in sekiz üyesi kapalı bir liste: karşılığı olan bir yazıcı olmadan
  üye eklenmez.
- **Ş4** Arama indeksi `walkSettingsRows()` üzerinden üretilir; `collectSettingsCopyKeys()`
  hazır.
- **Ş5/Ş6** `SETTINGS_METRICS.controls.select.openDownThreshold` = 236, `menuMaxHeight` = 222.
  Grup kabında `overflow:hidden` yasak.
- **Ş9** `ne1`'in `ownGroupTitleKey` alanı sapma #9'un taşıyıcısı; grup sayısı 58'de kalmalı.
