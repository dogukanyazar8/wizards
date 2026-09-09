# 00 — Ortak bağlam (Bildirimler + Ayarlar pencereleri)

**Bu dosya uygulanmaz, okunur.** Her şerit işe başlamadan önce buradaki gerçekleri, kararları ve
tuzakları bilir. Şeritler arası her çelişki burada çözülür.

Kaynak paket: `design_handoff/ayarlar-paketi/`
Otorite sırası: `referans/Ayarlar-referans.dc.html` inline `style` + veri dizileri **>**
`referans/Ayarlar-referans.html` **>** `SPEC-AYARLAR.md` **>** `PROMPT.md`.
Token/tipografi ve ölçekleme: `SPEC-ANA-SAYFA.md` §1 ve §8.
Plan: `docs/prompts/whispr-ayarlar/PLAN.md`. Dal: `uat`.

---

## 1. Kapsam sınırı

Uygulanacak dört yüzey:

| Yüzey                       | Ölçü             | Tetikleyici                         |
| --------------------------- | ---------------- | ----------------------------------- |
| Bildirimler paneli          | 400 px popover   | Başlıktaki zil                      |
| Bildirim ayarları penceresi | 560 px modal     | Panelin başlığındaki dişli          |
| Kullanıcı barı menüsü       | 308 px popover   | Kullanıcı barındaki 3. ikon (dişli) |
| Ana Ayarlar penceresi       | 1180 × 800 modal | Menü › Ayarlar                      |

Dokunulmayacak: sol sunucu rayı (74 px), gezinme paneli (228 px), kullanıcı çubuğunun kendisi
(avatar · durum satırı · mikrofon · kulaklık ikonları), ana içerik alanı.

**Bu görevin kabuğa değdiği tek nokta kullanıcı barındaki dişlidir.** Diğer iki tetikleyici zaten
bağlı (§2.1). Diff bunun dışında kabuğa dokunuyorsa şerit hatalıdır.

İçerik hacmi (referans `SET` ağacından **sayıldı**, tahmin değil):
**6 bölüm · 27 alt sekme · 58 grup · 170 satır · 13 kontrol tipi · 20 özel blok · 3 riskli blok.**

| Bölüm        | Sekme | Grup | Satır | Özel blok |
| ------------ | ----- | ---- | ----- | --------- |
| Hesabım      | 6     | 15   | 35    | 5         |
| Ses ve Video | 3     | 7    | 26    | 2         |
| Görünüm      | 5     | 10   | 29    | 4         |
| Bildirimler  | 7     | 14   | 50    | 2         |
| Masaüstü     | 5     | 8    | 24    | 4         |
| Hakkında     | 1     | 4    | 6     | 4         |

Gelişmiş bildirim ayarları **ayrı pencere değildir** — Bildirimler bölümünün 7 sekmesinde yaşar.

---

## 2. Doğrulanmış gerçekler (kodda okundu, tahmin değil)

### 2.1 Kabuk ve tetikleyiciler

- `components/screens/app-screen-top-bar.tsx:101` → `useCommandPalette()`; arama alanı **zaten
  düğme** ve komut paletini açıyor. `:150` `data-testid="home-command-search"`. **Dokunulmaz.**
- Aynı dosya `NotificationBell` çiziyor; `components/shared/notification-bell.tsx:82`
  `badgeVariant?: "count" | "dot"` **zaten var** ve üst çubuk `dot` kullanıyor. Buton **kalır**,
  yalnız popover gövdesi değişir.
- `components/shell/channel-sidebar.tsx:351` `UserProfileFooter`; durum
  `activeUserPopup: "quick" | "status" | null`. `quick` popover'ı (`data-testid="user-quick-menu"`,
  `:650`–`:845`) `UserBarMenu` ile **değişir**. Avatar, durum satırı, mikrofon ve kulaklık
  butonları (`:471`–`:648`) **aynen kalır**.
- `components/shell/app-nav-panel.tsx:474` `UserProfileFooter`'ı `onOpenAppearanceSettings={onOpenSettings}`
  ile çağırıyor; `onOpenSettings` `wizards-shell.tsx:1430` `openSettings`'e bağlı.
- `components/shell/wizards-shell.tsx:1817` `<InAppSettingsOverlay open onClose>` sarmalayıcısı
  korunur; içine `SettingsWindow` girer.
- `components/settings/in-app-settings-overlay.tsx` — bugün `max-w-[1460px]`,
  `h-[min(96dvh,940px)]`, `lg:grid-cols-[292px_...]`. Yeniden yazılır.

### 2.2 Ölçü, tema, ölçek

- `lib/home/metrics.ts` → `pxToRem`, `pxToEm(px, basePx)`, `hairline(px)` **mevcut**.
  `lib/messages/metrics.ts`, `lib/mentions/metrics.ts`, `lib/events/metrics.ts` bu deseni izliyor.
  `lib/settings/metrics.ts` de aynı dili konuşur: **renk taşımaz**, yalnız ölçü / yarıçap /
  boşluk / ağırlık / satır yüksekliği / süre.
- Ölçek motoru hazır: `lib/home/scale.ts` (`selectUiScale`, 4 adım: 16 / 18 / 24 / 32 px),
  `hooks/use-ui-scale.ts` (`useUiScale` — tek çağrı noktası `AuthenticatedAppProviders`),
  `hooks/use-ui-scale-step.ts` (`useUiScaleStep` — ekranlar bunu **okur**, adım **yazmaz**).
- Yoğunluk deseni: `lib/home/density.ts` → `selectHomeDensity(scale)`.
- Tema `<html>` üzerindeki `theme-*` sınıflarıyla gelir (`ThemeProvider`).
  `lib/appearance.ts` **27** tema kaydı taşır: `theme-light`, `theme-ash`, `theme-dark`,
  `theme-onyx` (4 basit) + 23 adlandırılmış.
- Tipografi token'ları `--font-display` (Outfit) / `--font-sans` (Figtree).
- **`--info` token'ı ZATEN VAR** — `app/globals.css:37` `--info: 199 89% 48%`, yanında
  `--info-foreground`, `--info-soft`, `--info-readable`. Tasarımdaki `hsl(199 89% 48%)`
  **birebir** bu token. PROMPT §1'in istisnası karşılanmış; yeni token üretilmez.
- Kırılımlar: `lib/responsive.ts` → `mobileMax: 767`, `tablet: 768`, `desktop: 1024`,
  `commandCenter: 960`, `supportPanel: 1280`, `commandCenterWide: 1360`.

### 2.3 Veri — bugün var olan

- `UserSettings` (40 kolon): `theme`, `locale`, `messageDisplayCompact`, `developerMode`,
  `showCurrentGame`, `inlineAttachmentMedia`, `inlineEmbedMedia`, `renderEmbeds`,
  `renderReactions`, `messageFont`, `messageBody*`, `animateEmoji`, `animateStickers`,
  `enableTTS`, `defaultNotifications`, `explicitContentFilter`, `friendRequestPolicy`,
  `dmPolicy`, `allowGroupInvites`, `showReadReceipts`, `profileVisibility`,
  `presenceVisibility`, `timeZone`, `dateFormat`, `timeFormat`, `interfaceDensity`,
  `friendsSort`, `serverRailWidth`, `channelSidebarWidth`, `notificationLimit`,
  `notificationAutoClose`.
- `UserNotificationSettings` (**12 kolon**): `desktopNotifications` (ölmekte olan),
  `mobileNotifications`, `emailNotifications`, `notificationSound`, `notificationSoundFile`,
  `suppressEveryoneMentions` (**ters mantık**), `suppressRoleMentions` (**ters mantık**),
  `mutedUntil`, `mentionSelf`, `mentionThreadReplies`, `desktopMentionMode`,
  `quietHoursEnabled` / `quietHoursFrom` / `quietHoursTo` / `quietHoursTimeZone`,
  `eventNotifications`.
- `User`: `phoneNumber`, `phoneVerified`, `twoFactorEnabled`, `twoFactorSecretCiphertext`,
  `bio`, `pronouns`, `customStatus`, `customStatusEmoji`, `customStatusExpiresAt`,
  `statusExpiresAt`, `statusRestoreTo`, `statusFocusMinutes`, `bannerUrl`, `bannerOffsetX/Y`,
  `preferredReleaseChannel`, `sessionsRevokedAfter`.
- `Notification { id, userId, campaignId?, dedupeKey?, type, title, body, imageUrl?, read,
readAt?, actionUrl?, metadata?, createdAt }`; `NotificationType = MENTION | FRIEND_REQUEST |
FRIEND_ACCEPTED | DM | SERVER_INVITE | SYSTEM | MODERATION | FEEDBACK | BADGE`.
  İndeksler: `[userId, read]`, `[userId, createdAt]`, `[userId, read, createdAt]`.
- `Session { id, userId, token, refreshToken, ipAddress?, userAgent?, deviceType, expiresAt,
createdAt }` + `AuthSession` + `AppSession`.
- `UserChannelSettings { muted, mutedUntil, messageNotifications, mobilePush }`
  `@@unique([userId, channelId])`.
- `UserServerSettings { starred, muted, mutedUntil, messageNotifications, mobilePush,
suppressEveryone, suppressRoles }` `@@unique([userId, serverId])`.
- `DMParticipant { muted, notifyLevel }` — yorum: `notifyLevel` otorite, `muted` aynası.
- `TwoFactorRecoveryCode`, `AccountReauthChallenge`, `EmailVerificationToken` mevcut.
- **`SecurityEvent` tablosu YOK.**

### 2.4 Mevcut API ve servisler

| Uç / dosya                                                                                                                                            | Durum                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `GET/PATCH /api/v1/users/me/settings` (`route-logic.ts`, `PatchSettingsSchema` 20 alan)                                                               | Genişler                                              |
| `GET /api/v1/users/me/settings/bootstrap`                                                                                                             | Genişler                                              |
| `GET /api/v1/notifications` (`?limit`)                                                                                                                | `?tab` + `?cursor` alacak                             |
| `POST /api/v1/notifications/[id]/read`                                                                                                                | **Çevirme** kipi öğrenecek                            |
| `POST /api/v1/notifications/read-all` · `DELETE /clear` · `GET /unread-count`                                                                         | Kalır / genişler                                      |
| `GET/PATCH /api/v1/notifications/mention-settings`                                                                                                    | Kalır; `notification-prefs` ile **aynı satırı** yazar |
| `GET/DELETE /api/v1/users/me/sessions` + `revoke-others`                                                                                              | Hazır, yeniden kullanılır                             |
| `POST /api/v1/users/me/data-export` · `deletion` · `GET /badges` · `presence`                                                                         | Hazır                                                 |
| `lib/notifications/service.ts` — `listNotifications`, `getUnreadCount`, `markRead`, `markAllRead`, `clearNotifications`, `serializeNotificationToDTO` | Genişler                                              |
| `lib/notifications/quiet-hours.ts` — `isWithinQuietHours`, `resolveQuietHoursTimeZone`, `DEFAULT_QUIET_HOURS_TIME_ZONE`                               | Hazır                                                 |
| `lib/notifications/desktop-mention-policy.ts`                                                                                                         | Genişler (yeni düzey/kanal kararları)                 |
| `lib/notifications/mention-settings-service.ts`                                                                                                       | **Ters mantığı burada çözülür**, dışarı sızmaz        |
| `lib/workspace/message-notification-service.ts:126` `isWithinQuietHours` kapısı                                                                       | Yeni tercihlerin **tek** uygulama noktası             |
| `lib/mobile/push-notifications.ts` + `push-sender.ts`                                                                                                 | `deliveryPush` kapısını öğrenecek                     |
| `lib/auth/two-factor.ts` + `lib/account/actions.ts` (`startTwoFactorSetupAction`, `confirmTwoFactorSetupAction`, `disableTwoFactorAction`)            | Hazır, satır içi blok çağırır                         |
| `api/v1/mobile/account/password/route-logic.ts`                                                                                                       | Ortak servise çıkarılıp web ucu açılacak              |
| `lib/home/route-runner.ts` (`runHomeRoute`, `readSearchParams`, `optionalParam`)                                                                      | Yeni uçların deseni                                   |
| `lib/desktop/` — `controls`, `updater`, `start`, `privacy`, `voice-mini`, `game-overlay-state`, `game-overlay-process`, `performance`, `runtime`      | Hazır                                                 |
| Tauri `src-tauri/src/lib.rs` — `tauri_plugin_global_shortcut` + **3** ses eylemi                                                                      | 5'e genişler                                          |

### 2.5 Mevcut bileşenler

`components/ui/`: `avatar`, `badge`, `context-menu`, `input`, `modal`, `segmented-control`,
`skeleton`, `textarea`, `toast`, `toggle-switch`
(`ToggleSwitchProps { checked, label, onChange, disabled?, labelledById?, describedById?, testId? }`).

`components/settings/`: `account-badges-card`, `active-sessions-card`, `account-data-controls`,
`profile-avatar-field`, `settings-voice-provider-boundary` — **korunur, özel blok olarak sarılır**.
`settings-panel.tsx` ve `settings-sidebar.tsx` — **silinir** (K1).

`components/theme/theme-picker.tsx` — 4 + 23 tema; özel blok içine girer.
`components/desktop/desktop-diagnostics-panel.tsx` — Tanılama bloğu.
`components/voice/audio-device-select.tsx` (`AudioDeviceSelect`) — kullanıcı barı menüsü kullanır.

Referans desen dosyaları (**okunur, kopyalanmaz**):
`components/mentions/mentions-page.tsx` (URL durum sahibi),
`lib/mentions/parity.test.ts` (parity kapısı deseni),
`lib/events/metrics.ts` (sözlük + `SPEC_DEVIATIONS` deseni),
`lib/events/routes.ts` (URL ayrıştırıcı).

---

## 3. Alınmış kararlar (bağlayıcı — tartışılmaz, uygulanır)

| #       | Karar                                                                                                                                                                                                                                               | Gerekçe                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **K1**  | **Tam yeniden yazım.** `SettingsWindow` + satır motoru sıfırdan; `settings-panel.tsx` (2956 satır) ve `settings-sidebar.tsx` (691 satır) **silinir**. Çalışan parçalar özel blok olarak taşınır.                                                    | 6 × 27 IA'yı eski `section`/`panel` modeline sığdırmak sürekli sürtünme demekti.      |
| **K2**  | URL **yol segmenti**: `/settings/[section]/[tab]`. Uygulama içinden → intercepting modal; doğrudan URL → aynı pencere tam ekran. Eski `?section=&panel=` **301** ile yönlenir.                                                                      | Paylaşılabilirlik + geri tuşu (PROMPT §9), tek pencere bileşeni iki bağlamda.         |
| **K3**  | Bildirim tercihleri **tipli kolon** (JSON değil).                                                                                                                                                                                                   | "Push açık olan kullanıcılar" filtresi SQL'de kalır; JSON kolonu bunu tarama yapardı. |
| **K4**  | İstisnalar için **yeni tablo yok**; liste `UserServerSettings` + `UserChannelSettings` + `DMParticipant` birleşimi, yazma kendi kaynağına.                                                                                                          | Üçünde de `muted` + `mutedUntil` + seviye var; dördüncü kaynak = kaçınılmaz ayrışma.  |
| **K5**  | `SecurityEvent` **uçtan uca**. Bağlı hesaplar (GitHub·Spotify·Steam·Xbox) ve telefon doğrulama satırları çizilir ama `disabled` + `TODO(api):`.                                                                                                     | 4 OAuth kimlik bilgisi ve SMS sözleşmesi dışarıdan gelir.                             |
| **K6**  | 23 temanın **kimliği ve rengi aynen kalır**; yalnız görünen ad tasarımın listesinden atanır. Koyu/Açık etiketi gerçek temadan okunur.                                                                                                               | Hiçbir kullanıcının teması değişmez. Sayım 14/9 çıkar → sapma #1.                     |
| **K7**  | Masaüstü kısayolları **5 eyleme** genişler; Rust kayıt hatası **çakışma** olarak raporlanır; tuş yakalamalı yeniden atama çalışır; atamalar sunucuda.                                                                                               | Tasarımdaki `⌥H` çakışması ancak gerçek kayıt denemesiyle doğrulanabilir.             |
| **K8**  | Rahatsız Etmeyin = **presence DND + süre**. Anahtar `status = DND`; süre çipi `statusExpiresAt` + `statusRestoreTo` kurar; süre bitince eski duruma döner.                                                                                          | Tek durum kaynağı; kullanıcı barındaki nokta ve menü otomatik hizalı.                 |
| **K9**  | "Boşta sayılma süresi" menüden çıkar, **Gizlilik › Görünürlük** grubuna satır olur.                                                                                                                                                                 | Menü tasarımdaki 5 satıra uyar, mevcut tercih ölmez → sapma #2.                       |
| **K10** | Panel altındaki `Tüm bildirimleri gör` → **`/mentions`**. `/inbox` ve `InboxScreen` silinir. **Karşılığı:** panelin `Sistem` sekmesi **kendi içinde sonsuz kaydırma** taşır.                                                                        | Aksi hâlde sistem ve etkinlik bildirimleri 6 kayıttan sonra erişilemez olurdu.        |
| **K11** | Başlıktaki **Web / Masaüstü segmenti üründe yok**; `Masaüstü` bölümü yalnız Tauri'de listede.                                                                                                                                                       | Referanstaki segment inceleme aracı; çalışma zamanı zaten bilinir → sapma #3.         |
| **K12** | Mobil sözleşmesi korunur; yeni alanlar **opsiyonel**, eski alanlar türetilmiş değer olarak yazılmaya devam eder. Gönderim yolu yeni tercihlere **bugün** uyar.                                                                                      | Eski mobil sürüm kırılmaz; "mobil push kapalı" gerçekten susturur.                    |
| **K13** | `VoicePreferencesPanel` / `CameraPreferencesPanel` / `ScreenSharePreferencesPanel` **silinir**; mantık hook'lara çıkar, sunum satır motoruyla yeniden çizilir. Yalnız **mikrofon seviye ölçeri** ve **kamera önizleme çerçevesi** `cst` blok kalır. | Tek kontrol ekseni kuralı (PROMPT §3) üç sekmede de tutar.                            |

---

## 4. Kayda geçen sapmalar (`SPEC_DEVIATIONS`)

`lib/settings/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisi bu dokuz kaydı **gerekçesiyle** taşır.

1. **Tema sayımı.** SPEC §5.3 "13 Koyu + 10 Açık"; kodda 14 koyu + 9 açık. Etiket koddan okunur (K6).
2. **Boşta sayılma süresi satırı.** Tasarımda yok; Gizlilik › Görünürlük'e eklenir (K9).
3. **Web / Masaüstü segmenti.** Tasarımda var, üründe çizilmez (K11).
4. **`Hareketi azalt` / `Text-to-speech` iki yerde.** Referans `v7`/`x1` ve `v8`/`x5` için **ayrı**
   anahtar tutuyor; aynı adlı iki kontrolün bağımsız durumu PROMPT §8 ile çelişir →
   **tek anahtar**, iki sekmede de aynı değer.
5. **Profil kirli bayrağı.** Referans `k.charAt(0) === 'p'` sezgisiyle işaretliyor; bu kural Ses
   işleme satırlarını (`p1…p9`) da profil sayıyor → kirli alan listesi **açıkça** sayılır:
   `pn`, `pu`, `pz`, `pbio`, `pp`, `ps`, `pe`, `px`.
6. **Bildirim düzeyi iki farklı etiketle.** 560 px pencere `Tümü / Yalnızca önemli / Kapalı`,
   Ayarlar › Genel `Tüm bildirimler / Yalnız DM ve bahsetmeler / Kapalı`. Metinler **birebir
   korunur**, ikisi de **aynı** `level` anahtarını yazar.
7. **`SET_HITS` ölü hedef içeriyor** (`'notif', 'ozet'` — böyle bir sekme yok). Arama indeksi
   statik dizi değil, içerik ağacından **üretilir**.
8. **Başlıksız grup.** Profil hero grubu ve Hakkında'nın ilk grubu etiketsiz; grup kabı başlıksız
   da render edilebilmeli.
9. **`ne1` yanlış grupta.** `Yeni istisnalar için geçici sessize alma` bir istisna değil,
   varsayılan → kendi grubuna alınır; **metin değişmez**.

---

## 5. Tuzaklar

1. **Prisma migration yolu:** `packages/db/prisma/rebaseline-migrations` okunur
   (`prisma/migrations` **değil**). Yanlış klasöre yazılan migration hiç koşmaz.
2. **Ters mantıklı iki kolon.** `suppressEveryoneMentions` ve `suppressRoleMentions` anahtarın
   **tersi**dir. Ters çevirme yalnız `mention-settings-service.ts` içinde yapılır; yeni alanlar
   ters mantığı **sürdürmez**.
3. **Aynı satır iki uçtan yazılıyor.** `notification-prefs` ve `mention-settings` **aynı**
   `UserNotificationSettings` satırını yazar. İkisi de aynı servis üzerinden geçmezse son yazan
   kazanır ve bahsetme ayarları sessizce sıfırlanır.
4. **Paylaşılan anahtarlar tek durumdur.** `nd2` (Sistem bildirimleri), `na5` (Sistem izni),
   `na6` (Mesaj önizlemeleri), `nq1` (Sessiz saatler), `ns1` (Bildirim sesi) **Genel** ve ayrıntı
   sekmelerinde aynı anahtardır. `np4` (Panel › Mesaj içeriğini göster) `na6`'dan **ayrıdır**.
5. **Kilitli tür istemci süsü değildir.** `typeSecurity` / `typeModeration` için kolon yoktur;
   API her zaman `true` döner ve PATCH'te gelirse **400** verir.
6. **Grup kabında `overflow:hidden` yasak.** Açılır menü kırpılır. Yalnız tam genişlikli özel
   bloklar kendi içinde kırpar. Menü yönü: düğmenin alt kenarı ile kaydırma alanının alt kenarı
   karşılaştırılır; **236 px** yer yoksa yukarı açılır.
7. **Saat dilimi tek yerde.** Sessiz saat aralığı ve bildirim gün grupları izleyicinin saat
   diliminde hesaplanır (`resolveQuietHoursTimeZone`). Sunucu UTC ISO gönderir; kova kararı ya
   istemcide ya sunucuda ama **tek yerde**. İkisi de yaparsa gece yarısına yakın bildirim iki
   gruba birden düşer.
8. **`zoom` üretimde kullanılmaz.** Referans HTML ölçeği `zoom` ile taklit eder; üretimde
   rem + kök font boyutu adımları geçerlidir (SPEC-ANA-SAYFA §8.2).
9. **Arbitrary px sınıfı yasak.** `w-[400px]`, `text-[13px]` yazılmaz; ölçü sözlüğünden
   `pxToRem(...)`. Hairline `hairline()`, ikon `pxToEm()`.
10. **Kırılım CSS'te seçilir, JavaScript'te değil.** `useSyncExternalStore` SSR anlık görüntüsü
    1280'dir; ilk boya yanlış kırılımda çıkar ve hidrasyon uyuşmazlığı doğar (`lib/home/layout.ts`).
11. **Modal örtüsü kartın kardeşidir.** Kartın içine tıklamak kapatmaz; kart `pointer-events:auto`
    taşıyan ayrı katmanda ortalanır. `Esc` **sırayla** modal → panel kapatır.
12. **Aynı anda tek panel, tek modal, tek açılır menü, tek riskli blok.** Merdiven tek yerde
    tanımlanır; çağrı yerlerinde tekrarlanmaz.
13. **`sessionsRevokedAfter` sözleşmesi.** "Diğerlerini kapat" bu alanı yazar; mevcut oturum
    kapanmamalı. Yanlış sıralama kullanıcıyı kendi hesabından atar.
14. **Kayıt göstergesi yalan söylememeli.** `Kaydediliyor → Kaydedildi` geçişi **gerçek** yanıt
    üzerine kurulur; referanstaki 850 ms sabit gecikme taklit edilmez.
15. **`InboxScreen` silinirken `/inbox` bağlantıları kalabilir.** Ş13 `grep -rn "/inbox"` ile
    ölü bağlantı taraması yapar.

---

## 6. Kalite çıtası (her şerit için)

- **Test önce.** Yeni davranışın testi önce yazılır, kırmızı görülür, sonra yeşile çevrilir.
- **Token dışı renk yok.** Bileşen dosyalarında `#`, `rgb(`, `rgba(` araması temiz olmalı; tek
  istisna tasarımda `#fff` olarak verilen ters metin (primary zemin üstündeki beyaz).
- **Sabit font adı yok.** `Outfit` / `Figtree` yalnız token tanımında geçer.
- **Ton token adıdır, renk değil.** `PERMISSION_TONE.blocked = "--danger"` yazılır,
  `"hsl(352 84% 60%)"` yazılmaz.
- **Renk tek başına anlam taşımaz.** Okunmamış bildirim durumu metinle de bildirilir; izin
  durumu noktayla **ve** pille yazılır.
- **i18n.** Her metin `settings.*` veya `notif.*` anahtarından gelir; TR karşılığı SPEC ve
  referanstaki metnin **birebir aynısı**. Yeniden yazma, kısaltma, "iyileştirme" yasak.
  Dinamik parçalar interpolasyonla.
- **Erişilebilirlik.** Pencere `role="dialog" aria-modal="true"`; açılışta ilk öğeye focus,
  kapanışta focus tetikleyiciye döner, focus tuzağı, `Esc` sırayla kapatır. Sol nav ve alt
  sekmeler `role="tablist"` + `aria-selected`, içerik `role="tabpanel"`. Anahtarlar
  `role="switch" aria-checked`; kilitli anahtar `aria-disabled` + açıklama. Açılır menü
  `aria-expanded` + `role="listbox"`/`option`, `↑/↓`, `Enter`, `Esc`, tip-ahead. Kaydırıcı
  `role="slider"` (`aria-valuemin/max/now`) + ok tuşları. Kayıt durumu `aria-live="polite"`.
  Focus stili `ring-ring` token'ından.
- **Uydurma endpoint yok.** Karşılığı olmayan alan için tipli adapter + `TODO(api):` notu.
- **Performans.** Bölümler tembel yüklenir; ağır bölümler (Rozetler, tema ızgarası, tanılama)
  ilk açılışta iskeletle gelir. Arama 250 ms debounce. Kaydırma konumu sekme ve bölüm
  değişiminde sıfırlanır.
- **Kapı komutları** (şerit sonunda, ilgili olanlar):
  ```
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test
  pnpm --filter @wizards/db db:generate
  ```
- **Rapor:** `docs/prompts/whispr-ayarlar/raporlar/<no>-rapor.md` — ne yapıldı, hangi sapma kayda
  geçti, hangi `TODO(api):` bırakıldı, kapı çıktısı.
- **Commit yok.** Kullanıcı açıkça isteyene kadar hiçbir şerit commit atmaz.
