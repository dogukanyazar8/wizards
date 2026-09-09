# Whispr · Bildirimler + Ayarlar pencereleri — uygulama planı

> Kaynak paket: `design_handoff/ayarlar-paketi/`
> Otorite sırası: `referans/Ayarlar-referans.dc.html` inline `style` + veri dizileri **>**
> `referans/Ayarlar-referans.html` **>** `SPEC-AYARLAR.md` **>** `PROMPT.md`.
> Token/tipografi ve 2K/4K ölçek: `SPEC-ANA-SAYFA.md` §1 ve §8.
> Dal: `uat`. Hedef: web + masaüstü (Tauri aynı Next.js kabuğunu sarar, ayrı iş yok).

---

## 1. Kapsam — dört yüzey

| Yüzey                       | Ölçü             | Nereden açılır              | Bugünkü karşılığı                                     |
| --------------------------- | ---------------- | --------------------------- | ----------------------------------------------------- |
| Bildirimler paneli          | 400 px popover   | Başlıktaki zil              | `NotificationBell` popover, 304 px, sekmesiz          |
| Bildirim ayarları penceresi | 560 px modal     | Panelin dişlisi             | **yok**                                               |
| Kullanıcı barı menüsü       | 308 px popover   | Kullanıcı barındaki 3. ikon | `UserProfileFooter` "quick" popover, farklı içerik    |
| Ana Ayarlar penceresi       | 1180 × 800 modal | Menü › Ayarlar              | `InAppSettingsOverlay` + `SettingsPanel` (2956 satır) |

**Dokunulmayacak:** sunucu rayı (74 px), gezinme paneli (228 px), kullanıcı çubuğunun kendisi, ana içerik.
Kabuğa değen tek nokta kullanıcı barındaki dişli — zil ve arama alanı **zaten** bağlı (§2).

İçerik hacmi (referans `SET` ağacından sayıldı): **6 bölüm · 27 alt sekme · 58 grup · 170 satır ·
13 kontrol tipi · 20 özel blok · 3 satır içi riskli blok.**

---

## 2. Bugünkü durum — kod tabanı gerçekleri

Plan varsayım üstüne değil, taranan kod üstüne kuruldu.

| Konu               | Bugün                                                                                                              | Sonuç                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Ayarlar gövdesi    | `components/settings/settings-panel.tsx` **2956 satır / 117 KB**, `section` × `panel` modeli                       | **Silinecek** (K1). Yeni IA 6 × 27, eski model 6 × 19 "panel" ve alt sekme şeridi yok             |
| Ayarlar sol nav    | `components/settings/settings-sidebar.tsx` 691 satır, 292–308 px, 3 kırılım                                        | **Silinecek**; yeni nav 250 px sabit, 3 grup etiketi (`KULLANICI · UYGULAMA · BİLGİ`)             |
| Ayarlar kabuğu     | `in-app-settings-overlay.tsx` 154 satır, `max-w-[1460px]`, `h-[min(96dvh,940px)]`                                  | **Yeniden yazılacak**: 1180 × 800 sabit tasarım ölçüsü, rem + kök font ölçeği                     |
| Ayarlar rotası     | `app/settings/{layout,page}.tsx` + `?section=&panel=`                                                              | `/settings/[section]/[tab]` + intercepting route (K2); eski sorgu 301 ile yönlenir                |
| Rota çözücü        | `lib/settings/navigation.ts` — `SettingsPanelKey` 19 değer                                                         | Yeniden yazılacak: `SettingsSection` × `SettingsTab` (27 sekme)                                   |
| Zil                | `components/shared/notification-bell.tsx` 764 satır, 304 px popover, sekme yok, `badgeVariant="dot"` **zaten var** | Buton **kalır**, popover gövdesi `NotificationPanel` olarak yeniden yazılır                       |
| Başlıktaki arama   | `app-screen-top-bar.tsx` → `useCommandPalette()` **zaten bağlı**                                                   | Dokunulmayacak. PROMPT'un "arama alanı düğmedir" maddesi karşılanmış                              |
| Kullanıcı barı     | `channel-sidebar.tsx:351` `UserProfileFooter` + `activeUserPopup: "quick" \| "status"`                             | `quick` popover'ı `UserBarMenu` ile değişir; avatar/durum/mikrofon/kulaklık kısmı **aynen kalır** |
| Ayarlar açma       | `wizards-shell.tsx:1817` `<InAppSettingsOverlay>` + `openSettings`                                                 | Sarmalayıcı korunur, içerik `SettingsWindow` olur                                                 |
| DB · tercih        | `UserSettings` 40 kolon, `UserNotificationSettings` **12 kolon**                                                   | `UserNotificationSettings` tipli kolonlarla genişler (K3)                                         |
| DB · istisna       | `UserServerSettings` / `UserChannelSettings` / `DMParticipant` — üçünde de `muted`, `mutedUntil`, seviye           | **Yeni tablo yok** (K4); İstisnalar sekmesi bu üç kaynağın birleşimi                              |
| DB · bildirim      | `Notification` (`type` 9 değerli enum, `read`, `readAt`, `@@index([userId, read, createdAt])`)                     | Panelin 4 sekmesi bu enum'dan türetilir (§4.3)                                                    |
| API · ayarlar      | `GET/PATCH /api/v1/users/me/settings` (`PatchSettingsSchema` 20 alan), `/settings/bootstrap`                       | Genişleyecek                                                                                      |
| API · bildirim     | `/notifications` · `[id]/read` · `read-all` · `clear` · `unread-count` · `mention-settings`                        | `[id]/read` **çevirme** (toggle) kipini öğrenecek; `?tab=` sayacı eklenecek                       |
| API · güvenlik     | `users/me/sessions` (+ `revoke-others`), `data-export`, `deletion`, `badges`, `presence` **hazır**                 | Yeniden kullanılacak                                                                              |
| Server action      | `startTwoFactorSetupAction` / `confirmTwoFactorSetupAction` / `disableTwoFactorAction` **hazır**                   | Satır içi 2FA bloğu bunları çağırır                                                               |
| Parola değiştirme  | Yalnız `api/v1/mobile/account/password/route-logic.ts`                                                             | Ortak servise çıkarılıp web ucu açılacak                                                          |
| Güvenlik günlüğü   | **Tablo yok**                                                                                                      | `SecurityEvent` eklenecek, uçtan uca (K5)                                                         |
| Bağlı hesaplar     | Yalnız Google OAuth (`MOBILE_OAUTH_SUPPORTED_PROVIDERS = ["google"]`)                                              | 4 satır çizilir, `disabled` + `TODO(api):` (K5)                                                   |
| Telefon            | `User.phoneNumber` / `phoneVerified` kolonu var, SMS sağlayıcı **yok**                                             | Satır çizilir, `disabled` + `TODO(api):` (K5)                                                     |
| Temalar            | `lib/appearance.ts` — 4 basit (`theme-light/ash/dark/onyx`) + **23** tema                                          | Kimlikler korunur, Türkçe adlar eklenir (K6)                                                      |
| Sesler             | `public/sounds/` — notification, voice-join, voice-leave × (klasik + `-whispr`)                                    | 4. satır için `call.mp3` + `call-whispr.mp3` üretilecek                                           |
| Uygulama simgeleri | `public/app-icons/` **var**                                                                                        | Görünüm › Düzen'deki 7 kutu buradan beslenir                                                      |
| `--info` token     | `globals.css:37` `--info: 199 89% 48%` **zaten tanımlı** (+`-soft`, `-readable`)                                   | PROMPT §1 istisnası karşılanmış; yeni token gerekmiyor                                            |
| Ölçek motoru       | `lib/home/scale.ts` (`selectUiScale`, 4 adım) + `pxToRem`/`pxToEm`/`hairline` + `useUiScale`                       | Hazır, yalnızca tüketilecek                                                                       |
| Hazır bileşenler   | `ui/{avatar,badge,input,textarea,modal,skeleton,toggle-switch,segmented-control,context-menu,toast}`               | Hazır; satır motoru bunları sarar                                                                 |
| Masaüstü köprüsü   | `lib/desktop/` — `controls`, `updater`, `start`, `privacy`, `voice-mini`, `game-overlay-*`, `performance`          | Hazır; İzinler ve Tanılama buradan okur                                                           |
| Tauri kısayol      | `tauri_plugin_global_shortcut` + **3** ses eylemi (mute/deafen/PTT), çakışma raporu yok                            | 5 eyleme genişleyecek + çakışma (K7)                                                              |
| i18n               | `lib/locale/messages/{tr,en}.ts` 3733/3761 satır, ekran başına `*-screen-copy.test.ts` denetimi                    | ~**420** yeni anahtar; `settings.` ve `notif.` önekleri denetlenecek                              |
| Mobil              | `/api/v1/mobile/account/{settings,preferences,password,two-factor,sessions,profile}`                               | Sözleşme korunur, yeni alanlar opsiyonel (K12)                                                    |

---

## 3. Bağlayıcı kararlar (K1–K12)

Sorulup onaylandı. Şeritler bunları tartışmaz, uygular.

| #       | Karar                                                                                                                                                                                                                         | Gerekçe / sonuç                                                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **K1**  | **Tam yeniden yazım.** Yeni `SettingsWindow` + `SettingsGroup`/`SettingsRow` satır motoru sıfırdan. `settings-panel.tsx` ve `settings-sidebar.tsx` silinir.                                                                   | 6 × 27 IA'yı eski `section`/`panel` modeline sığdırmak sürekli sürtünme demekti. Çalışan parçalar (`account-badges-card`, `active-sessions-card`, `account-data-controls`, `profile-avatar-field`, `ThemePicker`, `DesktopDiagnosticsPanel`) **özel blok** olarak taşınır, silinmez. |
| **K2**  | URL **yol segmenti**: `/settings/[section]/[tab]`. Uygulama içinden açılınca kabuğun üstüne modal (intercepting route), doğrudan URL ile açılınca aynı pencere tam ekran. Eski `?section=&panel=` 301 ile yeni yola.          | Paylaşılabilirlik + geri tuşu (PROMPT §9). Tek pencere bileşeni iki bağlamda çalışır.                                                                                                                                                                                                |
| **K3**  | Bildirim tercihleri **tipli kolon** olarak `UserNotificationSettings`'e eklenir (JSON değil).                                                                                                                                 | "Push açık olan kullanıcılar" gibi filtreler bildirim gönderim yolunda SQL'de kalır; JSON kolonu bu sorguyu tarama hâline getirirdi.                                                                                                                                                 |
| **K4**  | İstisnalar için **yeni tablo yok**. Liste `UserServerSettings` + `UserChannelSettings` + `DMParticipant` birleşiminden türetilir; `Düzenle`/kaldır kendi kaynağına yazar.                                                     | Üç tabloda zaten `muted` + `mutedUntil` + seviye var. Dördüncü kaynak = kaçınılmaz ayrışma.                                                                                                                                                                                          |
| **K5**  | `SecurityEvent` tablosu + yazan servis **uçtan uca**. Bağlı hesaplar (GitHub·Spotify·Steam·Xbox) ve telefon doğrulama satırları çizilir ama `disabled` + `TODO(api):`.                                                        | 4 OAuth uygulamasının kimlik bilgisi ve SMS sağlayıcı sözleşmesi dışarıdan gelir; onlarsız "uçtan uca" iddiası yalan olurdu.                                                                                                                                                         |
| **K6**  | 23 temanın **kimliği ve rengi aynen kalır**; yalnız görünen adlar tasarımın listesinden atanır (`theme-forest-dark` → `Orman`). Koyu/Açık etiketi gerçek temadan okunur.                                                      | Hiçbir kullanıcının teması değişmez. Sayım 13/10 yerine **14/9** çıkar → `SPEC_DEVIATIONS` #1.                                                                                                                                                                                       |
| **K7**  | Masaüstü kısayolları **5 eyleme** genişler (`Overlay'i gizle`, `Moderasyon konsolu` eklenir), Rust tarafı kayıt hatasını **çakışma** olarak raporlar, UI'da tuş yakalamalı yeniden atama çalışır. Atamalar sunucuda saklanır. | Tasarımdaki `⌥H` çakışma durumu ancak gerçek kayıt denemesiyle doğrulanabilir.                                                                                                                                                                                                       |
| **K8**  | Rahatsız Etmeyin = **presence DND + süre**. Anahtar `status = DND` yazar; süre çipi `statusExpiresAt` + `statusRestoreTo` kurar (mevcut odak makinesi). Süre bitince eski duruma döner.                                       | Tek durum kaynağı. Kullanıcı barındaki nokta ve menü otomatik aynı şeyi söyler.                                                                                                                                                                                                      |
| **K9**  | "Boşta sayılma süresi" kontrolü menüden çıkar, **Ayarlar › Hesabım › Gizlilik › Görünürlük** grubuna satır olarak iner.                                                                                                       | Menü tasarımdaki 5 satıra birebir uyar, mevcut tercih ölmez → `SPEC_DEVIATIONS` #2 (tasarımda olmayan tek satır).                                                                                                                                                                    |
| **K10** | Panel altındaki `Tüm bildirimleri gör` → **`/mentions`**. `/inbox` rotası ve `InboxScreen` silinir.                                                                                                                           | Kullanıcı kararı. **Sonucu:** sistem ve etkinlik bildirimlerinin tam listesi için ayrı ekran kalmaz → panelin `Sistem` sekmesi **kendi içinde sonsuz kaydırma** ile tüm geçmişi taşır (§6.1). Aksi hâlde bu iki tür 6 kayıttan sonra erişilemez olurdu.                              |
| **K11** | Başlıktaki **Web / Masaüstü segmenti üründe yok**. `Masaüstü` bölümü yalnız Tauri çalışma zamanında listeye girer (`isDesktopRuntime()`).                                                                                     | Referanstaki segment bir inceleme aracı; gerçek uygulamada çalışma zamanı zaten bilinir → `SPEC_DEVIATIONS` #3.                                                                                                                                                                      |
| **K12** | Mobil sözleşmesi korunur: `/api/v1/mobile/...` yeni alanları **opsiyonel** döner, eski alanları türetilmiş değer olarak yazmaya devam eder. Bildirim gönderim yolu yeni tür/kanal tercihlerine **bugün** uyar.                | Eski mobil sürüm kırılmaz; "mobil push kapalı" dendiğinde telefon gerçekten susar. Mobil ayarlar ekranı ayrı pakette.                                                                                                                                                                |

### Ses ve Video kararı (K13, tur dışı ama bağlayıcı)

`VoicePreferencesPanel` / `CameraPreferencesPanel` / `ScreenSharePreferencesPanel` **silinir**;
cihaz numaralandırma, seviye ölçer, kamera önizleme ve ekran paylaşımı mantığı hook'lara çıkarılır,
sunum tamamen satır motoruyla yeniden çizilir. Yalnız iki gerçekten özel parça `cst` blok kalır:
**mikrofon seviye ölçeri** ve **kamera önizleme çerçevesi**.

---

## 4. Kayda geçen tasarım/spec sapmaları (`SPEC_DEVIATIONS`)

Her biri `lib/settings/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine gerekçesiyle yazılır.

1. **Tema sayımı.** SPEC §5.3 "13 Koyu + 10 Açık"; kodda 14 koyu + 9 açık. Kimlikler korunduğu için sayım koddan okunur (K6).
2. **Boşta sayılma süresi satırı.** Tasarımda yok; Gizlilik › Görünürlük'e eklenir (K9).
3. **Web / Masaüstü segmenti.** Tasarımda var, üründe çizilmez (K11).
4. **`Hareketi azalt` iki yerde.** Referans `v7` (Medya) ve `x1` (Erişilebilirlik) için **ayrı** anahtar tutuyor; aynı adlı iki kontrolün bağımsız durumu PROMPT §8 ile çelişir. → **Tek anahtar** (`reduceMotion`), iki sekmede de aynı değer. Aynısı `Text-to-speech` (`v8` / `x5`) için.
5. **Profil kirli bayrağı.** Referans `k.charAt(0) === 'p'` ile kirli işaretliyor; bu kural Ses işleme satırlarını (`p1…p9`) da profil alanı sayıyor. → Kirli alan listesi **açıkça** sayılır (`pn`, `pu`, `pz`, `pbio`, `pp`, `ps`, `pe`, `px`), önek sezgisi kullanılmaz.
6. **Bildirim düzeyi iki farklı etiketle.** 560 px pencerede `Tümü / Yalnızca önemli / Kapalı`, Ayarlar › Genel'de `Tüm bildirimler / Yalnız DM ve bahsetmeler / Kapalı`. Metinler **birebir korunur**, ikisi de **aynı** `level` anahtarını yazar.
7. **`SET_HITS` bir ölü hedef içeriyor.** `['Gelişmiş bildirim ayarları', 'Bildirimler › Özet', 'notif', 'ozet']` — `ozet` diye bir sekme yok. Arama indeksi statik dizi değil, `SET` ağacından **üretilir** (§7.4), böylece ölü hedef doğuramaz.
8. **`o1` grubu başlıksız.** Hakkında'nın ilk grubu ve Profil'in hero grubu etiketsiz; grup kabı başlıksız da render edilebilmeli.
9. **`ne1` yanlış grupta.** `Yeni istisnalar için geçici sessize alma` segmenti `Aktif istisnalar` grubunun içinde duruyor ama bir istisna değil, varsayılan. → Kendi grubuna (`Varsayılanlar`) alınır; metin değişmez.

---

## 5. Veri sözleşmesi

### 5.1 Prisma migration — `20260824090000_settings_notifications_screen`

> Konum: `packages/db/prisma/rebaseline-migrations/` — Prisma **bu** klasörü okur, `prisma/migrations` değil.

```prisma
enum NotificationLevelPreference { ALL  IMPORTANT  OFF }
enum SystemNotificationMode      { ALL  MENTIONS   OFF }
enum SoundProfile                { WHISPR  CLASSIC }
enum SecurityEventKind {
  LOGIN_NEW_DEVICE  PASSWORD_CHANGED  FAILED_LOGIN
  TWO_FACTOR_ENABLED  TWO_FACTOR_DISABLED
  SESSION_REVOKED  RECOVERY_CODES_REGENERATED  EMAIL_CHANGED
}

model SecurityEvent {
  id         String            @id @default(uuid())
  userId     String
  kind       SecurityEventKind
  /// Ham IP saklanmaz; `AdminAuditLog.ipHash` ile aynı tuzlu hash şeması.
  ipHash     String?           @db.VarChar(64)
  userAgent  String?
  location   String?
  metadata   Json?
  createdAt  DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

`UserNotificationSettings` eklenen kolonlar (mevcut 12 kolon **korunur**):

| Alan                                                                                              | Tip                                       | Varsayılan                             | Tasarım karşılığı                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `level`                                                                                           | `NotificationLevelPreference`             | `IMPORTANT`                            | 560 px pencere radyo kartları + Genel › `b1`                                                                      |
| `systemMode`                                                                                      | `SystemNotificationMode`                  | `MENTIONS`                             | `nd2` (iki sekmede paylaşılan)                                                                                    |
| `systemPreview`                                                                                   | `Boolean`                                 | `false`                                | `na6` — sistem bildiriminde içerik                                                                                |
| `inAppToast` · `systemWhileOpen` · `appBadge`                                                     | `Boolean`                                 | `true` / `false` / `true`              | `na1` · `na2` · `na3`                                                                                             |
| `deliveryInApp` · `deliveryPush` · `deliveryEmail`                                                | `Boolean`                                 | `true` / `true` / `false`              | `nd1` · `nd3` · `nd4` (`mobileNotifications`/`emailNotifications` bunlara **eşlenir**, çift kaynak olmaz)         |
| `typeDm` … `typeProductUpdates` (16 alan)                                                         | `Boolean`                                 | tasarım varsayılanları                 | Türler sekmesi. `typeSecurity` ve `typeModeration` **kolonu yok** — sunucu tarafında sabit `true` (kilitli satır) |
| `quietHoursAllowCalls`                                                                            | `Boolean`                                 | `true`                                 | `nq5`                                                                                                             |
| `soundNotification*` / `soundCall*` / `soundJoin*` / `soundLeave*` (`enabled`,`profile`,`volume`) | `Boolean`/`SoundProfile`/`Int`            | tasarım                                | Sesler sekmesi (`ns1`–`ns4`)                                                                                      |
| `panelCount` · `panelAutoClose` · `panelDurationSec` · `panelShowContent` · `panelShowSource`     | `Int`/`Boolean`/`Int`/`Boolean`/`Boolean` | `5` · `true` · `10` · `false` · `true` | Panel sekmesi (`np1`–`np5`)                                                                                       |
| `defaultMuteDuration`                                                                             | `String`                                  | `8h`                                   | `ne1`                                                                                                             |

`UserSettings` eklenen kolonlar: `idleTimeoutMinutes Int @default(10)` (K9),
`highContrast`, `strongFocusRings`, `uiTextScale Int @default(100)`, `screenReaderDescriptions`,
`followSystemA11y`, `appIcon String @default("whispr")`, `mainContentWidth Int @default(100)`,
`serverIconSize Int @default(44)`, `showMemberPanelByDefault Boolean @default(true)`.

`User` eklenen kolon: yok. `phoneNumber`/`phoneVerified` zaten var.

**Geri doldurma:** `notificationLimit` → `panelCount`, `notificationAutoClose` → `panelAutoClose`,
`notificationSound` → `soundNotificationEnabled`, `notificationSoundFile` → `soundNotificationProfile`,
`desktopMentionMode` → `systemMode`, `mobileNotifications` → `deliveryPush`,
`emailNotifications` → `deliveryEmail`, `defaultNotifications` (UserSettings) → `level`.
Eski kolonlar **bir sürüm daha** yazılmaya devam eder (`UserNotificationSettings.desktopNotifications`
yorumundaki kuralın aynısı); düşürme ayrı migration.

### 5.2 Paylaşılan tipler — `packages/types/src/settings.ts` (yeni)

`NotificationPrefsSchema`, `NotificationPrefsPatchSchema`, `UserSettingsSchema`,
`SecurityEventSchema`, `NotificationExceptionSchema`, `AppNotificationSchema`.
SPEC §7 tipleri **birebir** karşılanır; `NotifKind` panel sekmelerine `Notification.type`
enum'undan eşlenir (§6.1).

### 5.3 Kilitli türler

`typeSecurity` ve `typeModeration` kolonu **yoktur**. API bunları her zaman `true` döner ve
PATCH içinde gelirse `400` verir — "kilitli" iddiası istemci süsü değil, sunucu sözleşmesi olur.

---

## 6. API ve gerçek zaman

### 6.1 Bildirim merkezi

| Uç                                       | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/notifications`              | `?tab=all\|mentions\|replies\|system` + `?cursor=` + `?limit=` alır. Sekme → `Notification.type` eşlemesi: `mentions` = `MENTION`; `replies` = `MENTION` + `metadata.kind = 'thread' \| 'reply'`; `system` = `SYSTEM` + `MODERATION` + `FEEDBACK` + `BADGE` + `SERVER_INVITE`; `all` = hepsi. Yanıt `groups: [{ label: 'today'\|'yesterday'\|'older', items }]` taşır — gruplama sunucuda, saat dilimi kullanıcının. |
| `GET /api/v1/notifications/unread-count` | `{ all, mentions, replies, system }` döner (bugün tek sayı).                                                                                                                                                                                                                                                                                                                                                         |
| `POST /api/v1/notifications/[id]/read`   | `{ read: boolean }` gövdesiyle **çevirme** kipi. Tasarım satıra tıklamayı toggle olarak tanımlıyor; tek yönlü uç bunu yapamaz.                                                                                                                                                                                                                                                                                       |
| `POST /api/v1/notifications/read-all`    | Aynen kalır.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `DELETE /api/v1/notifications/clear`     | Aynen kalır (panelde girişi yok, `/mentions` kullanır).                                                                                                                                                                                                                                                                                                                                                              |

Socket: mevcut `notification.created` + **yeni** `notification.read` (`{ id, read, counts }`).
Sayaçlar tek kaynaktan gelir; zil noktası, sekme pilleri ve başlık sayacı aynı yanıtı okur.

### 6.2 Tercihler

| Uç                                                 | Not                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET/PATCH /api/v1/users/me/notification-prefs`    | Yeni. Tam `NotificationPrefs` gövdesi; PATCH kısmi. Kilitli türler `400`.                                                                              |
| `GET/PATCH /api/v1/users/me/settings`              | Genişler; `PatchSettingsSchema` yeni alanlarla büyür. Profil alanları **bu uçta değil** — `PATCH /api/v1/users/me` (mevcut).                           |
| `GET /api/v1/users/me/notification-exceptions`     | Yeni, **salt okuma**. Üç tablonun birleşimi, `scope` + `id` + `name` + `level` + `mutedUntil` döner. Yazma mevcut sunucu/kanal/DM uçlarına gider (K4). |
| `POST /api/v1/users/me/password`                   | Yeni web ucu; `mobile/account/password/route-logic.ts` ortak servise çıkarılır.                                                                        |
| `GET /api/v1/users/me/security-events`             | Yeni; son 10 kayıt.                                                                                                                                    |
| `GET/POST /api/v1/users/me/two-factor/*`           | Mevcut server action'lar korunur, satır içi blok onları çağırır.                                                                                       |
| `GET/DELETE /api/v1/users/me/connections/:service` | **`TODO(api):`** — 4 satır `disabled` (K5).                                                                                                            |

Socket: **yeni** `settings.updated` (`{ scope, patch }`) — aynı hesabın ikinci sekmesi/masaüstü
istemcisi anında hizalanır. Mevcut `session.revoked` yeniden kullanılır.

### 6.3 Masaüstü köprüsü

| Konu                           | Kaynak                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| İzinler (5 satır)              | `navigator.permissions` + Tauri `get_desktop_permission_status` (yeni komut)                                         |
| Kısayollar (5 satır + çakışma) | `configure_desktop_shortcuts` (mevcut `configure_desktop_voice_shortcuts` genişletilir), kayıt hatası = çakışma (K7) |
| Overlay                        | `lib/desktop/voice-mini.ts` + `game-overlay-state.ts` (hazır)                                                        |
| Güncelleme                     | `lib/desktop/updater.ts` (hazır)                                                                                     |
| Başlangıçta aç / tepsi         | `lib/desktop/start.ts` + `controls.ts` (hazır)                                                                       |
| Yayıncı modu                   | `lib/desktop/privacy.ts` (hazır)                                                                                     |
| Tanılama (10 satır)            | `DesktopDiagnosticsPanel` verisi + `lib/desktop/performance.ts`                                                      |

---

## 7. Bileşen ağacı

### 7.1 Satır motoru — `components/settings/rows/`

```
SettingsGroup      başlık + not + kap (radius 16, border H(border,.65), H(surface-card))
SettingsRow        sol: başlık + pil + açıklama (max 400) · sağ: kontrol yuvası (1081 px ekseni)
```

13 kontrol tipi tek dosya ailesi olur — **her ayar için elle markup yasak**:

| Tip     | Bileşen                | Notlar                                                                          |
| ------- | ---------------------- | ------------------------------------------------------------------------------- |
| `tgl`   | `SettingToggle`        | 38×22, `role="switch"`                                                          |
| `lok`   | `SettingToggle locked` | `aria-disabled` + `Kilitli` pili + açıklama                                     |
| `sel`   | `SettingSelect`        | 210 px düğme, `role="listbox"`, ↑/↓/Enter/Esc/tip-ahead, **yön mantığı** (§7.3) |
| `seg`   | `SettingSegment`       | mevcut `ui/segmented-control` sarılır                                           |
| `sld`   | `SettingSlider`        | − / ray / + / değer, `role="slider"`, ok tuşları                                |
| `inp`   | `SettingInput`         | 260 px, isteğe bağlı `@` öneki                                                  |
| `txt`   | `SettingTextarea`      | tam genişlik + `75 / 190` sayacı                                                |
| `act`   | `SettingActions`       | 1–3 düğme, ilki `primary`/`danger`                                              |
| `risky` | `SettingRiskyBlock`    | satır altında açılır blok, **aynı anda tek blok**                               |
| `snd`   | `SettingSoundRow`      | anahtar + profil + seviye + `Önizle`                                            |
| `jump`  | `SettingJump`          | başka sekmeye geçirir                                                           |
| `nav`   | `SettingNav`           | dış hedefe götürür                                                              |
| `cst`   | `SettingCustomBlock`   | 20 özel blok yuvası                                                             |

### 7.2 Özel bloklar (20)

`ProfileHeroCard` · `ConnectionsBlock` · `SecurityEventsBlock` · `ActiveSessionsBlock` ·
`BadgeGridBlock` · `MicLevelMeterBlock` · `CameraPreviewBlock` · `SimpleThemeBlock` ·
`ThemeGridBlock` · `MessagePreviewBlock` · `AppIconGridBlock` · `NotifSummaryBlock` ·
`ExceptionsBlock` · `ShortcutsBlock` · `PermissionsBlock` · `DiagnosticsBlock` ·
`AboutCardBlock` · `VersionGridBlock` · `WhatsNewBlock` · `ContributorsBlock`

Bunlardan 6'sı mevcut bileşeni sarar: `BadgeGridBlock`←`account-badges-card`,
`ActiveSessionsBlock`←`active-sessions-card`, `ProfileHeroCard`←`profile-avatar-field`,
`SimpleThemeBlock`/`ThemeGridBlock`←`ThemePicker`, `DiagnosticsBlock`←`DesktopDiagnosticsPanel`.

### 7.3 Açılır menü yön mantığı

Grup kabında `overflow:hidden` **yasak** (yalnız tam genişlikli özel bloklar kendi içinde kırpar).
Tıklama anında düğmenin alt kenarı ile kaydırma alanının alt kenarı karşılaştırılır; **236 px**
yer yoksa menü yukarı açılır. Ölçülebilir kabul: ilk ve son seçenek kaydırma alanı içinde.

### 7.4 Arama

`SET` ağacından **derleme zamanında** düz bir indeks üretilir (`settings-search-index.ts`):
her satır için `{ title, sectionKey, tabKey, groupLabel }`. 250 ms debounce, sonuç satırı
`Bölüm › Grup` yolunu yazar. Statik `SET_HITS` dizisi kullanılmaz (sapma #7).

### 7.5 Yeni dosya haritası (özet)

```
apps/web/src/
  app/settings/[section]/[tab]/page.tsx            tam ekran pencere
  app/@modal/(.)settings/[section]/[tab]/page.tsx  intercepting modal
  components/settings/
    settings-window.tsx          kabuk: nav + başlık + sekme şeridi + kayıt + kirli şerit
    settings-nav.tsx             250 px, 3 grup, alt kullanıcı kartı
    settings-search.tsx
    rows/*.tsx                   satır motoru (13 dosya)
    blocks/*.tsx                 20 özel blok
    sections/{account,av,appearance,notifications,desktop,about}/*.tsx
  components/notifications/
    notification-panel.tsx       400 px
    notification-item.tsx
    notification-prefs-dialog.tsx  560 px
  components/shell/user-bar-menu.tsx  308 px
  lib/settings/
    metrics.ts                   ölçü sözlüğü + SPEC_DEVIATIONS
    metrics.test.ts
    parity.test.ts               referans HTML ↔ sözlük
    tree.ts                      6 × 27 × 58 × 170 içerik ağacı (i18n anahtarlarıyla)
    search-index.ts
    navigation.ts                yeniden yazılır
    notification-prefs-client.ts
    security-events-client.ts
  lib/notifications/panel-*.ts
packages/types/src/settings.ts
packages/db/prisma/rebaseline-migrations/20260824090000_settings_notifications_screen/
```

**Silinecek:** `settings-panel.tsx`, `settings-sidebar.tsx`, `voice-preferences-panel`,
`camera-preferences-panel`, `screen-share-preferences-panel`, `inbox-screen.tsx`,
`app/(main)/inbox/`, `app/settings/appearance/`.

---

## 8. Ölçü sözlüğü ve parity

`lib/settings/metrics.ts` — Ana Sayfa / Mesajlar / Bahsedilmeler / Etkinlikler ile **aynı desen**:
renk taşımaz, yalnız ölçü/yarıçap/boşluk/ağırlık/süre; tüketici `pxToRem`, `pxToEm`, `hairline` kullanır.

Sözlük blokları: `panel` (400 px popover) · `prefsDialog` (560) · `userMenu` (308) ·
`window` (1180×800) · `nav` (250) · `header` · `tabs` · `body` (720 kolon) · `row` · `controls` ·
`riskyBlock` · `blocks` (20 özel blok geometrisi).

`parity.test.ts` referans `.dc.html` içinde bu değerlerin **inline `style` metnini** arar —
Bahsedilmeler ve Etkinlikler'de kurulan `assertReferenceContains` deseni.

Ölçekleme: SPEC-ANA-SAYFA §8 aynen. `min(100vw / 1360, 100dvh / 920)` ile 4 adım (16/18/24/32 px).
Arbitrary px (`w-[272px]`, `text-[13px]`) **yasak**. Hairline `max(1px, 0.0625rem)`.

Küçük ekran (SPEC §10): `<1240` kenar 16 px + `%100` · `<1024` nav 64 px ikon modu ·
`<860` nav üstte yatay şerit · `<720` tam ekran + kontroller satırın altına · panel `<520` alt sayfa.

---

## 9. i18n

~**420** yeni anahtar, iki önek: `settings.*` ve `notif.*`.
TR metinleri SPEC ve referanstaki **birebir** metindir — kısaltma, "iyileştirme", yeniden yazım yok.
EN karşılıkları aynı turda yazılır. `lib/locale/settings-screen-copy.test.ts` eklenir:
her sekme, grup, satır başlığı ve açıklaması için anahtar varlığını ve TR metnin birebirliğini denetler.

---

## 10. Dalgalar ve şeritler

Toplam **14 şerit / 5 dalga**. Dalga içi şeritler paralel çalışabilir; dalgalar sıralıdır.

### Dalga 0 — Sözleşme (1 şerit, sıralı)

**Ş0** · migration + geri doldurma · `packages/types/src/settings.ts` · `lib/settings/metrics.ts` +
`metrics.test.ts` + `parity.test.ts` · `lib/settings/tree.ts` (170 satırlık içerik ağacı, i18n
anahtarlarıyla) · i18n iskeleti (420 anahtar, TR+EN) · `SPEC_DEVIATIONS` 9 kayıt.
**Kapı:** migration yerel DB'de koşar, parity testi yeşil, tip kontrolü temiz.

### Dalga 1 — Veri katmanı (4 paralel şerit)

- **Ş1** Bildirim tercihleri: `GET/PATCH /me/notification-prefs`, servis, kilitli tür sözleşmesi, `settings.updated` socket, mobil köprü (K12), gönderim yolunun yeni tercihlere uyması.
- **Ş2** Bildirim merkezi: `?tab=` + cursor + sunucu tarafı gün gruplama, 4'lü sayaç ucu, `[id]/read` çevirme kipi, `notification.read` socket.
- **Ş3** Hesap ve güvenlik: `SecurityEvent` yazan servis (8 olay), web parola ucu, 2FA satır içi akış sözleşmesi, oturum listesi/kapatma, dışa aktarma, hesap silme.
- **Ş4** İstisnalar + arama: üç tablodan türetilen salt-okuma ucu, yazma yönlendirmesi, `search-index.ts` üretimi.

### Dalga 2 — Kabuk ve satır motoru (2 paralel şerit)

- **Ş5** `SettingsWindow` kabuğu: `/settings/[section]/[tab]` + intercepting modal, 250 px nav (3 grup + alt kullanıcı kartı), başlık, alt sekme şeridi, kayıt göstergesi (3 durum, `aria-live`), kirli şerit, arama alanı, 4 iskelet blok, `Masaüstü` bölümünün koşullu görünmesi (K11).
- **Ş6** Satır motoru: `SettingsGroup` + `SettingsRow` + 13 kontrol + açılır menü yön mantığı + tam klavye/ARIA sözleşmesi. Görsel doğrulama için tek bir örnek sekme kullanılır.

### Dalga 3 — Bölümler (4 paralel şerit)

- **Ş7** Hesabım (6 sekme · 35 satır · 5 özel blok · 3 riskli blok). Hero canlı güncelleme, profil kirli şeridi, K9 satırı.
- **Ş8** Ses ve Video (3 sekme · 26 satır) + Görünüm (5 sekme · 29 satır). K13 panel taşıması, K6 tema adları, canlı mesaj önizlemesi, 7 uygulama simgesi.
- **Ş9** Bildirimler (7 sekme · 50 satır · 2 özel blok). 5 paylaşılan anahtar, `np4` ≠ `na6` ayrımı, kilitli iki tür, sapma #4 ve #9.
- **Ş10** Masaüstü (5 sekme · 24 satır · 4 özel blok) + Hakkında (6 satır · 4 özel blok). Tauri kısayol genişletmesi (K7), izin okuma, tanılama ızgarası.

### Dalga 4 — Popover'lar (2 paralel şerit)

- **Ş11** Bildirimler paneli (400 px, 4 sekme, gün grupları, satır çevirme, `Hepsi okundu`, sonsuz kaydırma K10) + bildirim ayarları penceresi (560 px, izin şeridi, 3 radyo kartı, 3 hızlı tercih, iki atlama hedefi).
- **Ş12** Kullanıcı barı menüsü (308 px): DND kartı + süre çipleri (K8), giriş/çıkış cihaz seçimi, 14 segmentli giriş seviyesi ölçeri + `Test et`, Ayarlar (`⌘,`), Bildirim ayarları, Çıkış. `UserProfileFooter`'ın avatar/durum/mikrofon/kulaklık kısmı **değişmez**.

### Dalga 5 — Kapanış (1 şerit)

**Ş13** · a11y geçişi (focus tuzağı, `Esc` sırası, tablist/tabpanel, switch/slider/listbox) · 4 çözünürlük × 2 tema ekran görüntüsü karşılaştırması · küçük ekran kırılımları · eski dosyaların silinmesi ve ölü i18n anahtarlarının temizlenmesi · `graphify update .` · parity + kabul kriterleri denetimi.

---

## 11. Kabul kriterleri (PROMPT'tan devralınan + eklenen)

- [x] Sunucu rayı, gezinme paneli, kullanıcı çubuğu ve ana içerik **hiç değişmedi**; diff yalnız dört yüzeye ve tek tetikleyiciye (kullanıcı barı dişlisi) dokunuyor. _(Ş13 şerhi: kabuk düzeni değişmedi. Diff bunun dışında iki yerde kabuğa dokunuyor ve ikisi de K10'un sonucu — `/inbox` silinince Ana Sayfa kartının hedefi ve komut paleti güncellendi, masaüstü köprüsünün iki eski Ayarlar adresi gerçek yola çevrildi. `14-s13-rapor.md` §3.1.)_
- [x] Zil → panel, panel dişlisi → bildirim ayarları (paneli kapatarak), menü › Ayarlar → pencere.
- [x] Panelde satıra tıklamak durumu **çeviriyor**; sayaç, 4 sekme pili ve zil noktası aynı anda güncelleniyor; hepsi okunduğunda `Hepsi okundu` göstergesi geliyor ve kırmızı `0` pili **görünmüyor**.
- [x] 560 px pencere: izin şeridi (izin varsa **render edilmiyor**), `Yalnızca önemli = Önerilen`, `Tüm bildirim ayarları` → Bildirimler › Yüzeyler, `Saatleri düzenle` → Sessiz saatler.
- [x] Menü sırası: DND → cihazlar → Ayarlar → Bildirim ayarları → Çıkış. DND açıkken 4 süre çipi **tek satırda**, kart `danger` durumuna geçiyor, `status` gerçekten `DND` oluyor ve süre bitince eski duruma dönüyor.
- [x] Pencere 1180 × 800; sol nav 3 grup; `Masaüstü` yalnız Tauri'de listede.
- [x] Alt sekmeler eksiksiz: 6 / 3 / 5 / 7 / 5 / 1 (Hakkında'da şerit **render edilmiyor**).
- [x] 170 satırın tamamı çizili; kontroller **tek sağ eksende** bitiyor; hiçbir açıklama etiketle kontrol arasına sıkışmıyor.
- [x] Profil hero: 132 px banner, 80 px avatar (halka + durum noktası + kamera düğmesi), `Profilimi görüntüle` sağda; ad ve kullanıcı adı yazdıkça hero canlı güncelleniyor.
- [x] `Kırp / Yakınlaştır` düğme dizileri **yok**; uydurma "…işlemleri" satırları **yok**.
- [x] Açılır menüler hiçbir yerde kırpılmıyor; sayfa sonundakiler yukarı açılıyor (ilk ve son seçenek kaydırma alanı içinde).
- [x] Genel'deki 5 paylaşılan kontrol ayrıntı sekmeleriyle **aynı** değeri gösteriyor; Panel › `Mesaj içeriğini göster` sistem önizlemesinden **ayrı**; güvenlik ve moderasyon türleri kilitli ve **sunucu** PATCH'i reddediyor.
- [x] Riskli akışlar satır içinde açılıyor (parola · 2FA · hesap silme); aynı anda tek blok.
- [x] Kayıt göstergesi üç durumu gösteriyor (`aria-live`), profil değişikliğinde alt şerit çıkıyor, `Sıfırla` ve `Değişiklikleri kaydet` çalışıyor. _(Ş13: `Sıfırla` / `Değişiklikleri kaydet` bu şeritte bağlandı — rapor §1.2.)_
- [x] Arama sonuçları `SET` ağacından üretiliyor; ölü hedef yok; 250 ms debounce.
- [x] Tema anahtarı çalışıyor; 4 + 23 tema listeleniyor; hiçbir parça tek temaya sabitlenmiş değil.
- [x] `/settings/notifications/quiet-hours` gibi doğrudan URL çalışıyor, geri tuşu sekmeler arasında geziyor, eski `?section=&panel=` yönleniyor.
- [x] 1360×920 · 1920×1080 · 2560×1440 · 3840×2160'ta kırpma yok; SPEC §10 kırılımları uyuyor. _(Ş13: 5 çözünürlük × 2 tema hesaplanarak ölçüldü — rapor §4.3. Tarayıcı koşusu `E2E_TEST_PASSWORD` olmadığı için yapılamadı, rapor §8.)_
- [x] Tüm metinler birebir; placeholder/lorem yok. `pnpm typecheck`, lint ve testler geçiyor. _(Ş13: `typecheck` ve `lint` temiz, birim testleri yeşil; `pnpm e2e` ortam eksiğinden koşulamadı — rapor §8, §9.)_

---

## 12. Riskler

| Risk                                                   | Karşılık                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2956 satırlık panelin silinmesi kayıp özellik doğurur  | Ş0'da eski panelin **satır envanteri** çıkarılır; yeni ağaçta karşılığı olmayan her ayar ya taşınır ya gerekçesiyle sapma listesine yazılır |
| 27 sekme × 170 satır tek turda görsel doğrulanamaz     | Her bölüm şeridi kendi sekmelerinin 8 ekran görüntüsünü `screens/` ile karşılaştırır, rapor `raporlar/` altına yazılır                      |
| Migration geri doldurma canlı veriyi bozar             | Eski kolonlar bir sürüm daha yazılır; geri doldurma idempotent ve tek yönlü                                                                 |
| Tauri kısayol genişletmesi masaüstü sürümünü kırar     | Rust değişikliği kendi şeridinde, web tarafı `TODO` olmadan da derlenir; kayıt hatası çakışma olarak gösterilir, çökme değil                |
| K10 sonucu sistem bildirimlerinin tam listesi kaybolur | Panelin `Sistem` sekmesi sonsuz kaydırma taşır (§6.1)                                                                                       |
