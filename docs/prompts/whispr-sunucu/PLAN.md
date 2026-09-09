# Whispr · Sunucu ekranı, kanallar ve sunucu yönetimi — uygulama planı

> Kaynak paket: `design_handoff/design_handoff_sunucu/`
> Otorite sırası: `design/Sunucu.dc.html` inline `style` + veri dizileri **>**
> `design/Sunucu-referans.html` **>** `SPEC-SUNUCU.md` **>** `PROMPT.md`.
> Ortak kabuk, tip ölçeği ve 2K/4K ölçekleme: `design_handoff/app/SPEC-ANA-SAYFA.md` §1 ve §8.
> Mesaj satırı dili: `design_handoff/design_handoff_whispr_mesajlasma` / `mesajlar-paketi` SPEC'i.
> Dal: `uat`. Hedef: web + masaüstü (Tauri aynı Next.js kabuğunu sarar, ayrı iş yok).

---

## 1. Kapsam

Referans dosyada gezilebilen **16 ekran durumu**, **9 sunucu ayarı bölümü**, **6 pencere** ve
**1 tam sayfa oluşturma akışı** (sunucu oluştur, 940 px).

| Bölge                 | Ölçü        | Bugünkü karşılığı                                                                                                      |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sunucu rayı           | 74          | `server-rail.tsx` (474 satır) — **hazır**, yalnız `+` düğmesi sunucu oluşturma penceresine bağlanacak                  |
| Gezinme paneli        | 280 (K1)    | `app-nav-panel.tsx` (486 satır) — **hazır**, dokunulmaz                                                                |
| Kanal kenar çubuğu    | 252         | `channel-sidebar.tsx` (2039 satır) — sunucu menüsü yok, arama popover değil, daraltma kuralı yok, bağlı ses şeridi yok |
| İçerik · metin kanalı | esnek       | `chat/*` — mesaj listesi **zaten** `MESSAGES_METRICS` ile yenilenmiş; başlık/sabitlenen çubuk/bildirim çipi eksik      |
| İçerik · ses kanalı   | esnek       | `voice-channel-view.tsx` (891) + `voice/room/voice-room-primitives.tsx` (1403) — kablolama hazır, görsel dil eski      |
| Sağ panel             | 326         | `server-member-panel.tsx` (1065) — gruplama SPEC'ten farklı, ses katılımcı paneli ve davet dönüşümü yok                |
| Pencereler            | 460–940     | `workspace-modals.tsx` (1112) — kategori/kanal/davet/sunucu var; bildirim ve etkinlik penceresi **yok**                |
| Sunucu ayarları       | 1180 × %100 | `server-settings-overlay.tsx` (1517, **6 sekme**) — hedef **9 bölüm**                                                  |

İçerik hacmi (SPEC'ten sayıldı, tahmin değil):
**9 ayar bölümü · 6 pencere · 4 adımlı kanal sihirbazı · 4 yetki grubu / 18 yetki ·
5 öneri grubu / 20 keşif etiketi · 12 yavaş mod seçeneği · 10 kanal · 5 rol · 5 üye · 2 davet · 2 etkinlik.**

**Kapsam dışı:** mobil ekranlar (K10), admin paneli, Keşfet dizini (ayrı paket), DM yüzeyleri.

---

## 2. Bugünkü durum — kod tabanı gerçekleri

Plan varsayım üstüne değil, taranan kod üstüne kuruldu.

| Konu                    | Bugün                                                                                                                                                                 | Sonuç                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ölçü sözlüğü            | `lib/home/metrics.ts`, `lib/messages/metrics.ts`, `lib/{discover,events,mentions,settings}/metrics.ts`                                                                | `lib/servers/metrics.ts` **eklenecek** (SERVER_METRICS) — aynı `pxToRem`/`pxToEm`/`hairline` motoru                         |
| Ray genişliği           | `HOME_METRICS.rail.width = 74`                                                                                                                                        | SPEC ile **birebir aynı**, dokunulmaz                                                                                       |
| Panel genişliği         | `HOME_METRICS.panel.width = 280`; `NAV_PANEL_ADJUSTMENTS.width = { from: 228, to: 280 }`, Etkinlikler gün paneli bu değere bağlı, `metrics.test.ts` eşitliği zorluyor | **280 kalır** (K1). SPEC §1'in 228'i sapma olarak kaydedilir                                                                |
| Kanal kenar çubuğu      | `channel-sidebar.tsx` — dnd-kit sıralama, kategori daraltma, **inline** arama kutusu, `UserProfileFooter`                                                             | Sunucu başlığı + 5 satırlık menü + `⌘K` popover + daraltma filtresi + bağlı ses şeridi **eklenecek**; dnd ve footer korunur |
| Metin kanalı            | `chat/message-item.tsx`, `message-list.tsx`, `chat-area.tsx` **zaten** `MESSAGES_METRICS` kullanıyor; `PinnedStrip` ve `PinnedListSheet` bağlı                        | Mesaj satırı dili **hazır**. Kanal başlığı çipleri, bildirim çipi, `24 üye erişebilir` alt satırı eksik                     |
| Arama paneli            | `chat/message-search-panel.tsx` — `SearchMode = "basic" \| "advanced"` **zaten var**                                                                                  | SPEC'in alan seti (KİMDEN · KANAL · TARİH ARALIĞI · 4 içerik çipi · thread anahtarı) eklenecek                              |
| Ses yüzeyi              | LiveKit canlı; `krisp-quality.ts`, `video-quality.ts`, `screen-share.ts`, `participant-view-model.ts` hazır                                                           | **Görsel yenileme** (K5): kablolama korunur, kart/ızgara/sahne/kontrol çubuğu yeniden çizilir                               |
| Sağ panel               | Role göre gruplama (`owner/admin/role/member/offline`), `ActiveVoiceCard`, `QuickAccessCard`, `DesktopDownloadCard`                                                   | SPEC iki grup istiyor (`ÇEVRİMİÇİ` / `ÇEVRİMDIŞI`) + üye arama; ses katılımcı paneli ve `Davet et → Gönderildi` **yeni**    |
| Pencereler              | `workspace-modals.tsx`: `categoryModal`, `channelModal`, `inviteModal`, `serverModal`                                                                                 | Bildirim penceresi ve etkinlik penceresi **yeni**; kanal penceresi 4 adımlı sihirbaza dönüşür                               |
| Kanal gelişmiş ayarları | `channel-advanced-settings.tsx` (180) + `channel-form-model.ts` — bitrate/userLimit/rtcRegion/videoQuality **hazır**                                                  | Sihirbazın 4. adımına taşınır, çip dili SPEC'e göre                                                                         |
| Sunucu ayarları         | `server-settings-overlay.tsx` tek dosya, 6 sekme, `app-panel` + `rounded-[32px]` eski sınıflar                                                                        | **Silinir** (K4). `components/shell/server-settings/` altında kabuk + 9 bölüm dosyası, lazy + Skeleton                      |
| Sözleşme                | `packages/types/src/workspace.ts` (877 satır) — kanal/rol/üye/davet/etkinlik/yetki şemaları **hazır ve zengin**                                                       | Genişletilecek: `iconColor`, `slowModeDelay`, sahiplik devri, ban/timeout, hedefli davet                                    |
| Yetki anahtarları       | `WorkspacePermissionKeySchema` **25 anahtar** (`ADMINISTRATOR`…`MANAGE_EVENTS`)                                                                                       | SPEC 4 grup × 18 yetki istiyor — 18'i mevcut 25'ten seçilir, **yeni anahtar üretilmez**                                     |
| Kanal erişimi           | `WorkspaceChannelPermissionPresetSchema = PUBLIC \| LOCKED_VISIBLE \| PRIVATE \| ROLE_GATED`                                                                          | SPEC'in dört seçeneğiyle **birebir örtüşüyor**; çip renkleri success/warning/danger/primary                                 |
| Yavaş mod               | `CHANNEL_SLOW_MODE_DELAYS = [0,5,10,15,30,60,120,300,600,900,1800,3600]`                                                                                              | SPEC'in 12 seçeneğiyle **birebir aynı**                                                                                     |
| Bitrate                 | `CHANNEL_BITRATE_OPTIONS = [32_000, 64_000, 96_000, 128_000]`, `Channel.bitrate` varsayılan 64000                                                                     | **Hazır**, varsayılan SPEC ile uyumlu                                                                                       |
| Medya anahtarları       | `lib/workspace/server-features.ts` — `allowGifs`/`allowFileUploads`/`allowMemberAdds` `features[]` dizisinde yaşıyor                                                  | **Hazır**, İçerik bölümü bunları okur                                                                                       |
| Mesaj limiti            | `Server.messageCharacterLimit` (250–40000), `deletedMessageNoticeMinutes` (5–10080)                                                                                   | **Hazır**. Not: DB varsayılanı **60 dk**, SPEC varsayılanı **15 dk** → yalnız yeni sunucularda SPEC değeri (K7)             |
| Sunucu geneli yavaş mod | Kolon **yok**                                                                                                                                                         | `Server.slowModeDelay` eklenecek + mesaj gönderme servisinde "uzun olan uygulanır" (K2)                                     |
| Sunucu ikon rengi       | Kolon **yok**; ikon rengi kısa addan deterministik türetiliyor (`server-icon.tsx`)                                                                                    | `Server.iconColor` eklenecek; `null` = eski deterministik davranış (K2)                                                     |
| Sahiplik devri          | Yalnız grup DM'de (`GroupMemberRoleUpdateRequestSchema`)                                                                                                              | Sunucu için yeni uç + audit + authorization revision (K2)                                                                   |
| Ban / zaman aşımı       | `ServerBan` tablosu **var**, `ServerMember.communicationDisabledUntil` **var**, `/servers/[serverId]/bans` ucu **var**, `member-ban-service.ts` **var**               | Web'e bağlanacak (K3) — **migration gerekmez**                                                                              |
| Hedefli davet           | `ServerInvite.targetUserId` kolonu **var**                                                                                                                            | "Arkadaş seçerek davet" + "Bekleyen davetler" bu kolondan beslenir — **yeni tablo yok** (K3)                                |
| QR kod                  | `qrcode@1.5.4` + `@types/qrcode` **zaten bağımlılık**                                                                                                                 | Davet penceresinde canvas QR — yeni paket kurulmaz (K3)                                                                     |
| Etkinlikler             | `ScheduledEvent` + `ServerScheduledEventSchema` + `/servers/[serverId]/events` **hazır**                                                                              | Yalnız pencere ve bölüm çizilecek; ad 100→60, açıklama 1000→180 daraltılır (K6)                                             |
| Davet süresi/kullanımı  | `CreateInviteSchema`: `expiresInHours` 1–720, `maxUses` 1–1000, ikisi de `nullable`                                                                                   | SPEC'in 6 + 6 çipiyle **örtüşüyor** (720 sa = 30 gün, `null` = Süresiz/Sınırsız)                                            |
| Keşif etiketleri        | `ServerTagSchema` (slug, ≤24), `SERVER_TAG_LIMIT = 5`, `server-tags-editor.tsx` (115) **var**                                                                         | `DiscoveryTagPicker` bunun üstüne kurulur; **tek bileşen** hem ayarlar hem oluşturma (PROMPT §3)                            |
| Token                   | `globals.css:37` `--info: 199 89% 48%` **zaten tanımlı** (+`-foreground`, `-soft`, `-readable`)                                                                       | Yalnız `--accent-2: 291 64% 55%` eklenecek (K8)                                                                             |
| Tipografi               | `layout.tsx` — `--font-display` = Outfit, `--font-sans` = Figtree **hazır**                                                                                           | Yeni font yüklenmez                                                                                                         |
| Ölçek motoru            | `lib/home/scale.ts` (`selectUiScale`, 4 adım) + `pxToRem`/`pxToEm`/`hairline` + `useUiScale`                                                                          | Hazır, yalnızca tüketilecek                                                                                                 |
| Parity altyapısı        | `e2e/helpers/design-parity.ts`, `e2e/specs/design/{home,messages}-parity.spec.ts`, `lib/{events,mentions,settings}/parity.test.ts`, `lib/home/token-audit.ts`         | Aynı düzen: `lib/servers/parity.test.ts` + `e2e/specs/design/server-parity.spec.ts`                                         |
| Migration yolu          | Prisma **yalnız** `packages/db/prisma/rebaseline-migrations/` okur                                                                                                    | Yeni migration oraya yazılır; `prisma/schema-*.test.mjs` düzeninde `schema-server-screen.test.mjs` eklenir                  |
| i18n                    | `lib/locale/messages/{tr,en}.ts` 4258/4236 satır; `server.*` öneki **hiç kullanılmamış** (0 eşleşme), bugün `serverSettings.*` var                                    | ~**380** yeni anahtar `server.*` altında; `serverSettings.*` migrate edilir                                                 |
| Rota                    | `/channels/[serverId]/[channelId]` **var**; `/servers/[serverId]/about` ayrı                                                                                          | Rota **değişmez** (K9)                                                                                                      |

---

## 3. Bağlayıcı kararlar (K1–K12)

Sorulup onaylandı. Şeritler bunları tartışmaz, uygular.

| #       | Karar                                                                                                                                          | Gerekçe                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1**  | Gezinme paneli **280 px** kalır; SPEC §1'in 228'i uygulanmaz                                                                                   | Mesajlar paketinde bilerek genişletildi, Etkinlikler gün paneli ve `metrics.test.ts` bu değere bağlı. Ray 74 · kanal çubuğu 252 · sağ panel 326 SPEC'teki gibi                   |
| **K2**  | `Server.iconColor`, `Server.slowModeDelay` ve **sahiplik devri** uçtan uca eklenir                                                             | Üçü de tasarımda gerçek kontrol; mock ile bırakılırsa swatch/anahtar/buton yalan söyler                                                                                          |
| **K3**  | Ban · zaman aşımı · QR kod · arkadaş seçerek davet · bekleyen davetler **uçtan uca** eklenir                                                   | SPEC "sonraki faz" diyor ama tablo, kolon, servis, uç ve `qrcode` paketi **zaten var**; kesikli çip çizmek mevcut yeteneği saklamak olurdu. Kesikli "yakında" çipleri kaldırılır |
| **K4**  | `server-settings-overlay.tsx` **silinir**; `components/shell/server-settings/` altında kabuk + 9 bölüm dosyası                                 | 1517 satır tek dosyada lazy yükleme ve bölüm başına Skeleton (PROMPT §11) imkânsız                                                                                               |
| **K5**  | Ses kanalı **görsel yenileme**; LiveKit kablolaması, cihaz seçimi, ekran paylaşımı ve abonelik mantığı korunur                                 | Kayıtlı 4 sözleşme tuzağı (codec/bitrate, çerçeveleme, abonelik, SVC) yeniden doğrulanmak zorunda kalmaz                                                                         |
| **K6**  | Sözleşme SPEC'e **daraltılır**: rol adı 48→32, etkinlik adı 100→60, etkinlik açıklaması 1000→180                                               | Tek sınır iki istemcide de geçerli olur. Ş0 daraltmadan önce yerel + UAT verisinde ihlal taraması yapar                                                                          |
| **K7**  | `deletedMessageNoticeMinutes` DB varsayılanı **60** kalır; SPEC'in 15'i yalnız **yeni** sunucuya ve UI varsayılanına uygulanır                 | Mevcut sunucuların ayarını sessizce değiştirmek veri kaybıdır                                                                                                                    |
| **K8**  | Yeni token yalnız `--accent-2: 291 64% 55%` (açık + koyu). `--info` zaten var                                                                  | PROMPT §1 istisnası; başka hex/tema sınıfı üretilmez                                                                                                                             |
| **K9**  | Rota `/channels/[serverId]/[channelId]` **değişmez**; sunucu ayarları ve pencereler durum tabanlı katman                                       | Mevcut derin bağlantılar, e2e ve mobil paylaşım bağlantıları kırılmaz                                                                                                            |
| **K10** | Mobil **ekranlar** bu pakette değişmez; yeni alanlar mobil sözleşmesine **opsiyonel** eklenir                                                  | Eski mobil sürüm kırılmaz (`toMobileServerRole` bilinmeyen anahtarı düşürür)                                                                                                     |
| **K11** | Katman sırası: sunucu ayarları `z-index 70`, pencereler `z-index 80`. Aynı anda **tek** açılır/panel/pencere. `Esc` en üstteki katmanı kapatır | SPEC §10 kuralı; ayarlardan açılan pencere ayarların üstünde çizilir ve kapanınca ayarlara döner                                                                                 |
| **K12** | Kenar çubuğundaki kalabalık demo veri (24 üye) ile ayarlardaki "Mobile Test" verisi (5 üye) **tek kaynaktan** beslenir                         | PROMPT §5; iki ayrı sayaç iki ayrı gerçek üretir                                                                                                                                 |

---

## 4. Dalgalar ve şeritler

15 şerit, 7 dalga. Aynı dalganın şeritleri paralel çalışabilir; dalgalar sıralıdır.

### Dalga 0 — Sözleşme ve ölçü (1 şerit, kilit)

| Şerit  | İş                                                                                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş0** | Prisma migration (`Server.iconColor`, `Server.slowModeDelay`) · `workspace.ts` genişletme + K6 daraltması · sahiplik devri / ban / timeout / hedefli davet şemaları · `lib/servers/metrics.ts` (SERVER_METRICS) · `--accent-2` token · `schema-server-screen.test.mjs` · parity iskeleti · i18n anahtar iskeleti |

**Ş0 bitmeden hiçbir şerit başlamaz.**

### Dalga 1 — API (3 şerit, paralel)

| Şerit  | İş                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş1** | Sunucu yazma uçları: `PATCH /servers/[serverId]` (iconColor + slowModeDelay) · `POST /servers/[serverId]/transfer-ownership` · silme onayı · audit log + authorization revision |
| **Ş2** | Üye moderasyonu: ban / ban kaldırma / zaman aşımı uçlarının web sözleşmesi · üye filtreleri (7 çip) ve `N / 5 üye` sayacının sunucu tarafı · rol atama                          |
| **Ş3** | Davet: QR üretimi (istemci), hedefli davet (`targetUserId`), bekleyen davet listesi + iptali, davet oluşturma özeti                                                             |

### Dalga 2 — Kabuk (2 şerit, paralel)

| Şerit  | İş                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş4** | Kanal kenar çubuğu 252: sunucu başlığı · 5 satırlık sunucu menüsü · `⌘K` arama popover'ı · kategori/kanal listesi + daraltma filtresi · ses kanalı katılımcı satırları · bağlı ses şeridi |
| **Ş5** | Sağ panel 326: üye listesi (2 grup + arama) · ses kanalı katılımcıları (`Davet et → Gönderildi`) · arama paneli (basit/gelişmiş, 4 içerik çipi, thread anahtarı)                          |

### Dalga 3 — Kanal yüzeyleri (2 şerit, paralel)

| Şerit  | İş                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş6** | Metin kanalı: başlık çipleri · sabitlenen mesaj çubuğu · bildirim durumu çipi + zil rengi · bestekar ölçüleri                                         |
| **Ş7** | Ses kanalı görsel yenileme: katılımcı ızgarası · kamera varyantı · ekran paylaşımı sahnesi + şerit · kontrol çubuğu · başlık çipleri (Krisp, gecikme) |

### Dalga 4 — Pencereler (3 şerit, paralel)

| Şerit   | İş                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ş8**  | Paylaşılan parçalar (`ToggleRow`, `OptionChipGroup`, `DiscoveryTagPicker`, `PermissionGroupCard`) + kategori penceresi (560) + kanal penceresi (660, 4 adım) |
| **Ş9**  | Davet penceresi (480, QR dâhil) + kanal bildirimleri (460) + etkinlik oluştur (560)                                                                          |
| **Ş10** | Sunucu oluştur (940): form + canlı önizleme kolonu + katlanır Gelişmiş                                                                                       |

### Dalga 5 — Sunucu ayarları (3 şerit, paralel)

| Şerit   | İş                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------- |
| **Ş11** | Ayarlar kabuğu + sol menü (9 bölüm, sayılar) + Genel + Görünürlük ve Keşfet + İçerik ve Mesajlaşma    |
| **Ş12** | Kanallar ve Kategoriler + Roller ve Yetkiler (**satır içi** rol oluşturma dâhil)                      |
| **Ş13** | Üyeler ve Moderasyon (+ban/timeout) + Davetler (+QR/hedefli/bekleyen) + Etkinlikler + Tehlike bölgesi |

### Dalga 6 — Kapanış (1 şerit)

| Şerit   | İş                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ş14** | Ölçek adımları ve kırılımlar (§11) · a11y (§12) · i18n denetimi · token denetimi · parity matrisi · 4 çözünürlük × 2 tema karşılaştırması · ölü kod temizliği |

---

## 5. Dosya haritası

**Yeni**

```
apps/web/src/lib/servers/metrics.ts                 SERVER_METRICS ölçü sözlüğü
apps/web/src/lib/servers/parity.test.ts             SPEC ↔ sözlük denetimi
apps/web/src/lib/servers/permission-groups.ts       4 grup × 18 yetki + 3 hazır ayar
apps/web/src/lib/servers/discovery-tag-groups.ts    5 grup × 4 etiket + kod rozetleri
apps/web/src/lib/servers/channel-visibility.ts      daraltılmış kategori filtre kuralı
apps/web/src/components/shell/server-menu.tsx
apps/web/src/components/shell/channel-search-popover.tsx
apps/web/src/components/shell/connected-voice-strip.tsx
apps/web/src/components/shell/server-settings/       kabuk + 9 bölüm + ortak parçalar
apps/web/src/components/servers/modals/              CreateCategory · CreateChannel · ChannelInvite ·
                                                     ChannelNotifications · CreateEvent · CreateServer
apps/web/src/components/servers/shared/              ToggleRow · OptionChipGroup ·
                                                     DiscoveryTagPicker · PermissionGroupCard
packages/db/prisma/rebaseline-migrations/<ts>_server_screen/migration.sql
packages/db/prisma/schema-server-screen.test.mjs
apps/web/e2e/specs/design/server-parity.spec.ts
```

**Silinen**

```
apps/web/src/components/shell/server-settings-overlay.tsx   (K4 — davranışı 9 bölüme taşınır)
```

**Ağır düzenlenen**

```
apps/web/src/components/shell/channel-sidebar.tsx      (Ş4)
apps/web/src/components/shell/server-member-panel.tsx  (Ş5)
apps/web/src/components/shell/workspace-modals.tsx     (Ş8–Ş10 — yönlendiriciye iner)
apps/web/src/components/voice/voice-channel-view.tsx   (Ş7 — yalnız görsel)
apps/web/src/components/chat/chat-area.tsx             (Ş6 — başlık + sabitlenen çubuk)
packages/types/src/workspace.ts                        (Ş0)
```

---

## 6. Veri ve migration

Tek migration, Dalga 0'da:

```sql
ALTER TABLE "Server" ADD COLUMN "iconColor" TEXT;
ALTER TABLE "Server" ADD COLUMN "slowModeDelay" INTEGER NOT NULL DEFAULT 0;
```

- `iconColor` `null` = eski deterministik türetme (harf kodları toplamı % palet uzunluğu) — geri
  doldurma yapılmaz, mevcut sunucuların görünümü değişmez.
- `slowModeDelay` `CHANNEL_SLOW_MODE_DELAYS` değer kümesini paylaşır; uygulama kuralı
  **`max(server.slowModeDelay, channel.slowModeDelay)`** ve tek yerde (`channel-message-send-service.ts`)
  yaşar.
- Ban, zaman aşımı ve hedefli davet için **migration yok** — `ServerBan`,
  `ServerMember.communicationDisabledUntil` ve `ServerInvite.targetUserId` zaten var.

---

## 7. Riskler ve tuzaklar

| #   | Risk                                                                                     | Önlem                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | K6 daraltması mevcut veriyi reddedebilir (60'tan uzun etkinlik adı, 32'den uzun rol adı) | Ş0 daraltmadan **önce** yerel ve UAT'ta `SELECT` ile ihlal sayar; ihlal varsa daraltma öncesi düzeltme scripti yazılır                                                 |
| R2  | Panel 228/280 çelişkisi parity anlık görüntülerinde yakalanır                            | K1 sapması `lib/servers/metrics.ts` içine yorumla yazılır ve `parity.test.ts` bu tek sapmayı beyaz listeye alır                                                        |
| R3  | Ses yüzeyi yenilenirken abonelik/codec regresyonu                                        | K5: yalnız sunum katmanı; `video-quality.test.ts`, `video-subscription.test.ts`, `screen-share.test.ts` her Ş7 commit'inde koşar                                       |
| R4  | `server-settings-overlay.tsx` silinince davranış kaybı                                   | Ş11 başlamadan mevcut dosyanın **davranış envanteri** çıkarılır (hangi mutation, hangi guard, hangi testid) ve 9 bölüme dağıtılır; eski testler yeni dosyalara taşınır |
| R5  | Yetki modeli sızıntısı                                                                   | PROMPT §4: yetkisiz kullanıcıya bölüm **hiç render edilmez**; `yalnızca sahip` çipli kontroller sahip dışına çizilmez. Ş13 bunun için negatif test yazar               |
| R6  | i18n: `serverSettings.*` → `server.*` taşınması sırasında anahtar kaybı                  | Ş0 eski anahtar listesini çıkarır, Ş14 `*-screen-copy.test.ts` düzeninde `server-screen-copy.test.ts` ile iki dilde eşitliği denetler                                  |
| R7  | Katman kuralı (K11) mevcut modal yığınıyla çakışabilir                                   | Ş8 tek bir `useLayerStack` kancası yazar; ayarlar/pencere/popover üçü de ondan geçer                                                                                   |
| R8  | Sanallaştırma (PROMPT §11) mevcut `@tanstack/react-virtual` kullanımıyla çelişebilir     | Kanal listesi ve mesaj listesi **mevcut** sanallaştırmayı kullanır; yeni sanallaştırıcı eklenmez                                                                       |

---

## 8. Kabul kriterleri

PROMPT'un kabul listesi **aynen** geçerlidir (kabuk 5 · metin kanalı 3 · ses kanalı 6 ·
pencereler 7 · sunucu ayarları 12 · ortak 5 madde). Ek olarak:

- [ ] `Server.iconColor` ve `Server.slowModeDelay` uçtan uca yazılıp okunuyor; sayfa yenilendiğinde korunuyor.
- [ ] Sahiplik devri gerçekten sahibi değiştiriyor, eski sahip Admin'e düşüyor, audit log satırı yazılıyor.
- [ ] Ban · zaman aşımı · QR · hedefli davet · bekleyen davetler çalışıyor; hiçbir yerde "yakında" çipi kalmadı.
- [ ] Yeni hex araması temiz (`--accent-2` hariç); `rg "#[0-9a-fA-F]{3,8}"` yeni dosyalarda sıfır.
- [ ] `pnpm --filter @wizards/web typecheck`, `lint`, `test`; `pnpm --filter @wizards/types test`;
      `pnpm --filter @wizards/db test` yeşil.
- [ ] `pnpm --filter @wizards/web e2e:a11y` ve `e2e/specs/design/server-parity.spec.ts` yeşil.
- [ ] 1360×920 · 1920×1080 · 2560×1440 · 3840×2160, açık + koyu: taşma ve kırpma yok.

---

## 9. Doğrulama komutları

```bash
pnpm --filter @wizards/types test && pnpm --filter @wizards/db test && pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

`typecheck`/`lint` **pnpm üzerinden** koşmalı (runner `npm_execpath` denetliyor).
Migration yalnız `packages/db/prisma/rebaseline-migrations/` altına yazılır.
