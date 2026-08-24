# 00 — Ortak bağlam (okunur, uygulanmaz)

Dokuz fazın paylaştığı zemin. **Kod değişikliği içermez.** Her faz promptunun başında okunur; faz
dosyaları buradaki numaralara atıf yapar (ör. "§6.3 tuzağı").

---

## 1. Çalışma kuralları

1. Branch **`uat`**. Yeni branch açma, worktree açma yok.
2. **İzinsiz commit yok.** Faz bitince rapor yazılır, commit için kullanıcıya sorulur.
3. Kararsız kalınan her yerde **kullanıcıya sorulur**. "Muhtemelen böyledir" ile ilerleme yok.
4. **Test önce.** Yeni saf fonksiyon → önce `*.test.ts`. Yeni bileşen → önce render testi iskeleti.
   Yeni uç → önce yetki + redaksiyon + sorgu bütçesi testi.
5. Faz başında `graphify query "<dokunulacak yüzey>"`, faz sonunda `graphify update .`.
6. Faz sonunda `docs/prompts/whispr-ana-sayfa-1a/raporlar/<no>-rapor.md`: ne yapıldı, hangi kapı
   koşuldu, hangi sayı ölçüldü, açık kalan ne var.

### Tasarım kaynağı — tek doğru

| Öncelik | Kaynak                                                                        |
| ------- | ----------------------------------------------------------------------------- |
| 1       | `design_handoff/app/design/1a-komuta-merkezi.html` — inline `style` değerleri |
| 2       | `design_handoff/app/SPEC-ANA-SAYFA.md` — §1 token, §2–3 ölçü, §8 ölçekleme    |
| 3       | `design_handoff/app/PROMPT.md` — kurallar, kabul kriterleri                   |

Çelişki varsa **HTML kazanır**. HTML'de olmayan bir ölçüyü uydurma; SPEC §1 yarıçap/tip
ölçeğinden türet, türetemiyorsan sor.

Referans HTML'in üst çubuğu (tema + çözünürlük seçici) **ürüne taşınmaz**. Referanstaki `zoom`
mekanizması da taşınmaz — üretimde rem + kök font boyutu geçerlidir (SPEC §8.4 sonu).

### Pazarlığa kapalı üç kural

- **Yeni renk yok.** Yalnızca mevcut token'lar. İki istisna: `Takvim` butonu (`bg-amber-400
text-slate-900`) ve grup ikonu renk seçicisindeki `info` / `accent` swatch'ları (Mesajlar
  paketinde).
- **Yeni tipografi ailesi yok.** Outfit (display) + Figtree (body), token üzerinden. Bileşen içine
  font adı yazılmaz.
- **Metin birebir.** SPEC'teki Türkçe metinler kısaltılmaz, "iyileştirilmez", yeniden yazılmaz;
  i18n anahtarına taşınırken karakter karakter korunur.

---

## 2. Over-engineering yasağı

- Soyutlama, ikinci bir çağıran ortaya çıkınca yazılır. Tek çağıranlı "provider", "factory",
  "strategy" yok.
- Feature flag yok — paket tek sürümde tamamlanır. (Tek istisna §5.2'de tanımlı ölçek motoru
  kill-switch'i.)
- Yeni paket, yeni bağımlılık, yeni state kütüphanesi yok. Sunucu: Prisma + Zod + mevcut socket
  katmanı. İstemci: TanStack Query + Zustand (`@/lib/store`) + mevcut provider zinciri.
- Mevcut bir şey yeterse **yenisi yazılmaz**: presence `@/lib/presence.ts`, arkadaş listesi
  `@/lib/friends/queries.ts`, bildirim `@/lib/notifications/service.ts`, ses `@/lib/voice/service.ts`,
  DM `@/lib/dm/service.ts`, rate limit `@/lib/api-rate-limit.ts`.
- Ama **kopyala-yapıştır da yasak.** Aynı kural iki yerde uygulanacaksa `packages/types` içinde saf
  bir fonksiyona çıkar.

---

## 3. Doğrulanmış gerçekler — mevcut kod (2026-08-19, `uat` @ `bc8d6bba`)

### 3.1 Renk token'ları — **sapma yok**

`apps/web/src/app/globals.css`:

| Blok              | Satır | Durum                                            |
| ----------------- | ----- | ------------------------------------------------ |
| `:root` (light)   | 40    | SPEC §1 `theme-light` sütunuyla **birebir aynı** |
| `html.theme-dark` | 103   | SPEC §1 `theme-dark` sütunuyla **birebir aynı**  |

`--surface-rail`, `--surface-panel`, `--surface-card`, `--surface-soft`, `--surface-secondary`,
`--surface-tertiary`, `--surface-main-top`, `--surface-main-bottom`, `--text-primary`,
`--text-secondary`, `--text-muted`, `--primary`, `--success`, `--warning`, `--danger`,
`--shadow-color` — hepsi mevcut. **Yeni token tanımlanmayacak.**

Uygulamada **32 tema sınıfı** var (`theme-light`, `theme-dark`, `theme-midnight`, `theme-onyx`,
`theme-ash`, `theme-dawn`, … ). Ekran token üzerinden yazıldığında hepsinde çalışır; parity
denetimi iki temada yapılır, geri kalanı token sözleşmesiyle güvenceye alınır.

### 3.2 Tipografi — **sapma var**

`apps/web/src/app/layout.tsx:19` `--font-sans` = Plus Jakarta Sans, `:25` `--font-display` = Space
Grotesk. SPEC Figtree + Outfit istiyor.

`apps/web/src/app/fonts/` içinde `outfit-latin.woff2` **var** (bugün yalnız mesaj fontu seçeneği
olarak, `--font-message-outfit`). **`figtree-latin.woff2` yok — eklenecek.**

### 3.3 Kabuk — **sapma var**

| Şey                   | Bugün                                                                   | SPEC           |
| --------------------- | ----------------------------------------------------------------------- | -------------- |
| Sunucu rayı genişliği | `COMPACT_SERVER_RAIL_WIDTH = 68` (`apps/web/src/lib/appearance.ts:333`) | 74             |
| 2. sütun              | `ChannelSidebar` — **sunucuya bağlı** kanal listesi                     | 272 nav paneli |
| Kabuk bileşeni        | `WizardsShell` 1608 satır; `NavigationPanel` satır 262                  | —              |
| Ray bileşeni          | `ServerRail` 533 satır (`components/shell/server-rail.tsx`)             | —              |
| Kullanıcı ayağı       | `UserProfileFooter` (`components/shell/channel-sidebar.tsx`)            | —              |

Global navigasyon (Ana Sayfa / Mesajlar / Bahsedilmeler / Etkinlikler / Keşfet + SUNUCULARIM)
**bugün hiç yok**. Yeni bileşen.

### 3.4 Rotalar

- `apps/web/src/app/page.tsx`: `/` → oturum varsa `/channels`, yoksa `/login`.
- `(main)/channels`, `(main)/channels/[serverId]/[channelId]`, `(main)/discover`,
  `(main)/servers/[serverId]/about` var.
- `/home`, `/mentions`, `/events`, `/inbox` **yok**.
- `(main)/layout.tsx` oturum + ban kontrolü yapar, `AuthenticatedAppProviders` + `WizardsShell`
  sarar. Yeni rotalar bu grubun altına girer — auth zinciri kendiliğinden gelir.

### 3.5 Bileşen envanteri — PROMPT.md'nin listesini düzelt

`packages/ui/src/components/` içinde **yalnız `button.tsx`** var. PROMPT.md'de `@wizards/ui`
altında sayılan diğer bileşenler aslında web uygulamasında:

| Bileşen                                                                                                 | Gerçek yol                                          |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Button`                                                                                                | `@wizards/ui`                                       |
| `Avatar`, `Badge`, `Input`, `Textarea`, `Modal`, `Skeleton`, `ContextMenu`                              | `@/components/ui/*`                                 |
| `BrandLogo`                                                                                             | `@/components/brand/brand-logo.tsx`                 |
| `VoiceLevelWaveform`                                                                                    | `@/components/voice/room/voice-room-primitives.tsx` |
| `NotificationBell`                                                                                      | `@/components/shared/notification-bell.tsx`         |
| `UserProfilePopover`                                                                                    | `@/components/shared/user-profile-popover.tsx`      |
| `FriendCard`, `FriendsView`                                                                             | `@/components/friends/*`                            |
| `ServerRail`, `ServerIcon`, `ChannelSidebar`, `ChannelItem`, `UserProfileFooter`, `MobileDrawerTrigger` | `@/components/shell/*`                              |

### 3.6 Veri modelleri — `packages/db/prisma/schema.prisma`

| Model                    | Satır | İşe yarayan alanlar                                                                                        |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| `User`                   | 420   | `status` (`UserStatus`), `customStatus`, `customStatusEmoji`, `customStatusExpiresAt`; `@@index([status])` |
| `Message`                | 1287  | `channelId`, `userId`, `replyToId`, `threadParentId`, `deletedAt`, `createdAt`                             |
| `MessageMention`         | 1395  | `messageId`, `userId`; `@@unique([messageId,userId])`, **yalnız `@@index([userId])`**                      |
| `ChannelReadState`       | 1437  | `lastReadAt`, `lastReadMessageId`, `mentionCount`; `@@unique([channelId,userId])`                          |
| `DMParticipant`          | ~1530 | `unreadCount`, `mentionCount`, `lastReadAt`, `muted`, `hiddenAt`                                           |
| `Notification`           | 1667  | `type` (`MENTION`/`FRIEND_REQUEST`/`SERVER_INVITE`/`DM`/…), `read`, `actionUrl`, `metadata`, `dedupeKey`   |
| `VoiceState`             | 1896  | `userId @unique`, `channelId`, `serverId`, `sessionId`, `lastHeartbeat`, `selfMute`, `selfStream`          |
| `ScheduledEvent`         | 1923  | `serverId`, `channelId?`, `scheduledStartAt`, `status`, `entityType`, `interestedCount`                    |
| `ScheduledEventInterest` | ~1954 | `eventId` + `userId` — "Hatırlat"ın idempotent kaydı                                                       |
| `FriendRequest`          | 1015  | `status` (`FriendStatus`), `senderId`, `receiverId`                                                        |

**Bugün olmayan üç şey:** durum sona erme zamanı (`statusExpiresAt`), durum geri dönüş hedefi
(`statusRestoreTo`), bahsedilme listesini zamana göre sıralayan bileşik indeks.

### 3.7 Sunucu servisleri

| Yol                                        | İçerik                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `@/lib/presence.ts`                        | `readPresenceState`, `VisiblePresenceStatus`, Redis socket seti, invisible kümesi |
| `@/lib/friends/queries.ts:94`              | `listFriends` — presence + last-seen + **görünürlük redaksiyonu** birlikte        |
| `@/lib/notifications/service.ts`           | `listNotifications`, `getUnreadCount`, `markRead`, `serializeNotificationToDTO`   |
| `@/lib/voice/service.ts`                   | `buildVoiceStateParticipantsForChannel`, `emitVoiceStateUpdate`, cleanup kilidi   |
| `@/lib/dm/service.ts` + `group-service.ts` | DM/grup konuşmaları, okunmamış sayaçları                                          |
| `@/lib/api-rate-limit.ts:6`                | `API_RATE_LIMITS` kayıt defteri; tip `ApiRateLimitAction` (satır 333)             |
| `@/lib/api.ts`                             | `ApiError`, `jsonError`                                                           |
| `@/lib/auth/api.ts`                        | `requireApiUserId`                                                                |

### 3.8 Mevcut uçlar ve boşlukları

| Uç                                   | Durum                                                            |
| ------------------------------------ | ---------------------------------------------------------------- |
| `GET /api/v1/friends`                | Var. Presence + redaksiyon dahil. `statusText` türetimi **yok**. |
| `GET /api/v1/friends/pending`        | Var.                                                             |
| `GET /api/v1/notifications`          | Var (limit'li liste) + `unread-count`.                           |
| `GET /api/v1/voice/states?serverId=` | Var ama **sunucu başına**. Global toplayıcı yok.                 |
| `GET /api/v1/servers/[id]/events`    | Var ama **sunucu başına**. Çapraz sunucu "yaklaşan" yok.         |
| `POST .../events/[id]/interest`      | Var — "Hatırlat" bunun üstüne oturur.                            |
| `PATCH /api/v1/users/me`             | Var. Durum + odak modu için genişletilecek (ya da ayrı uç).      |

### 3.9 Realtime — mevcut socket olayları

`apps/web/src/lib/socket/events.ts`. Ana Sayfa'yı besleyecek olanlar:

`presence:update` · `friends:updated` · `friends:voice:update` · `voice:state:update` ·
`voice:audio-level:update` · `notification:new` · `server:unread:update` ·
`dm:conversation:updated` · `dm:conversation:read` · `message:new` · `dm:message:new`

**Yeni socket olayı ancak mevcutlardan türetilemiyorsa eklenir.** Ekleniyorsa hem
`ServerToClientEvents` tipine hem sunucu tarafı yayımcısına aynı turda girer.

### 3.10 Migration yolu — tuzak

Prisma bu repoda **`packages/db/prisma/rebaseline-migrations/`** dizinini okur. `prisma/migrations`
değil. Yeni migration `<UTCtimestamp>_<snake_case_ad>/migration.sql` biçiminde bu dizine yazılır.

`packages/db` test paketi `scripts/schema-index-audit.test.mjs` çalıştırır — yeni indeks eklenince
bu denetim güncellenir.

### 3.11 Test ve kapı komutları

| Katman          | Komut                                                              | Not                                           |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| Birim/entegre   | `pnpm --filter @wizards/web test`                                  | `node:test`, `src/**/*.test.ts(x)` eş konumlu |
| Tip             | `pnpm typecheck`                                                   | özel tsc runner                               |
| Lint            | `pnpm lint`                                                        | eslint + config testleri                      |
| Görsel          | `pnpm --filter @wizards/web e2e:visual`                            | `e2e/specs/visual`                            |
| Erişilebilirlik | `pnpm --filter @wizards/web e2e:a11y`                              | `e2e/specs/a11y`                              |
| Tasarım         | `pnpm --filter @wizards/web exec playwright test e2e/specs/design` | mevcut örnek: `whispr-chat-preview.spec.ts`   |
| Şema            | `pnpm --filter @wizards/db test`                                   | indeks denetimi dahil                         |

---

## 4. Ölçekleme gerçeği — 1208 sayısı

`apps/web/src` içinde **1208 adet arbitrary px değeri, 120 dosyada** (`text-[13px]`, `w-[272px]`
gibi). Kök font boyutu adım adım büyütülünce bunlar büyümez.

Karar (README #3): motor **app-wide** açılır, göç **faz faz** yapılır. Sonuç:

- Bu paketin dokunduğu her ekran rem tabanlıdır ve 4K'da doğru büyür.
- Henüz göç etmemiş ekranlar 2K/4K'da fiziksel boyutunu korur — **bozulmaz, sadece küçük kalır.**
- Her fazın raporunda "kaç px kaldı" sayısı yazılır; sayı monoton azalır.

`--density-*` değişkenleri de px (`globals.css:6019`). Faz 1'de rem'e çevrilir, yoksa 4K'da
yoğunluk ayarı görünmez hale gelir.

---

## 5. Kalite çıtası — pazarlık dışı

### 5.1 Güvenlik

Bu paketin yeni uçları **başka kullanıcıların** presence, ses ve etkinlik verisini döndürüyor.
Aşağıdakiler her uç için ayrı test maddesidir, "servis zaten yapıyordur" kabul edilmez:

1. **Kimlik.** Her uç `requireApiUserId()` ile başlar. Oturumsuz istek 401.
2. **Yetki.** Kanal/sunucu/konuşma erişimi çağrı anında doğrulanır. Kullanıcının üye olmadığı
   sunucunun kanalı, göremediği özel kanal, çıktığı grup — hiçbiri listeye giremez. Test: yetkisiz
   kullanıcı ile çağır, boş dön.
3. **Görünürlük redaksiyonu.** Presence taşıyan her yanıt `redactPresenceCollectionForViewer`
   (`@/lib/friends/queries.ts` içinde kullanılıyor) üzerinden geçer. "Görünmez" moddaki kullanıcı
   Ana Sayfa'da çevrimiçi görünmez, last-seen sızmaz. Test: invisible kullanıcı ile fixture.
4. **Rate limit.** Her yeni uç `API_RATE_LIMITS` kaydına eklenir; anahtar tiplidir, uydurulmaz.
5. **Girdi doğrulama.** Query/body zod ile parse edilir. `parse` başarısızsa 400, iç hata sızmaz.
6. **Nesne referansı sızıntısı yok.** DTO'ya yalnız ekranın kullandığı alanlar konur; `select` ile
   sınırlandırılır, `include` ile tüm satır dökülmez.
7. **Metadata güvenilmez.** `Notification.metadata` istemciden gelmiş olabilir; ekranda
   gösterilmeden önce zod ile şekli doğrulanır, `actionUrl` yalnız uygulama içi göreli yola izin
   verir (açık yönlendirme koruması).
8. **⌘K komutları yetki kontrol eder.** Palet, kullanıcının çalıştıramayacağı komutu listelemez ve
   listelense bile sunucu tarafı reddeder.

### 5.2 Performans

| Bütçe                      | Hedef                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Ana Sayfa uç sayısı        | ≤ 6 paralel istek; hiçbiri diğerini beklemez                                               |
| Uç başına SQL sorgusu      | **sabit** — kart başına satır sayısıyla artmaz. Testte sorgu sayısı sabitlenir             |
| `app/summary` yanıt süresi | p95 < 120 ms (yerel, ısıtılmış cache)                                                      |
| Ana Sayfa ilk anlamlı boya | Kartlar bağımsız gelir; en yavaş kart ekranın kalanını **bloklamaz**                       |
| Yeniden render             | Kart bileşenleri `React.memo`; socket olayı yalnız ilgili kartı günceller                  |
| Animasyon                  | Dalga formu yalnız aktif konuşmacı varken çalışır; sessizde `animation-play-state: paused` |
| Interval                   | Odak geri sayımı dakikada bir; sekme gizliyken durur (`visibilitychange`)                  |
| Bundle                     | ⌘K paleti ve takvim görünümü `dynamic()` ile bölünür                                       |

Ek kurallar:

- `prefers-reduced-motion` → nabız animasyonu ve dalga formu durur.
- Liste sorguları `take` ile sınırlı, **her zaman** indeksli sütuna göre sıralı.
- Aynı veriyi iki kart istiyorsa tek query key paylaşılır (ör. arkadaş presence'ı).
- Ölçek motorunun kill-switch'i: `data-ui-scale="off"` kökte verildiğinde adım seçimi devre dışı
  kalır (yalnız acil durum için; ürün kodunda kullanılmaz).

### 5.3 Erişilebilirlik

- Tıklanabilir her satır gerçek `button` veya `a` — `div onClick` yok.
- İkon-only butonlarda `aria-label`.
- Presence noktasının metin karşılığı var (`aria-label` veya `sr-only`), renk tek taşıyıcı değil.
- Okunmamış sayacı okunabilir etiket taşır: "3 okunmamış mesaj".
- Modal/menü klavyeyle gezilir: `Esc` kapatır, focus tuzağı, açılışta ilk öğeye focus, kapanışta
  tetikleyiciye dönüş.
- Focus stili token'dan (`ring-ring`), `outline: none` tek başına yasak.
- Canlı güncellenen sayaçlar için `aria-live="polite"` — ama saniyede bir değişen değerde değil.

### 5.4 Kod kalitesi

- Saf mantık (ölçek adımı seçimi, göreli zaman biçimleme, durum metni türetimi, satır yoğunluğu
  tablosu) React'tan ayrı saf fonksiyonda ve **testli**.
- Bileşenler sunum odaklı; veri çekme hook'ta, hook tek sorumlulukta.
- `any` yok, `as` ile tip zorlama yok. Zod şeması ↔ TypeScript tipi tek kaynaktan türer.
- Yeni dosya adları kebab-case, mevcut düzene uyar.

---

## 6. Tuzaklar

1. **`zoom` kullanma.** Referans HTML `zoom` ile ölçekliyor çünkü işaretleme inline px ile
   çıkarıldı. Üretimde rem + kök font boyutu (SPEC §8.4).
2. **Ölçek adımı iki eksene bakar.** `min(100vw/1360, 100dvh/920)`. Yalnız genişliğe bakılırsa
   5120×1440 ultra geniş ekranda ×2 seçilir ve Arkadaşlar şeridi alttan kırpılır.
3. **1920×1080'de üst sınır 1.17'dir.** Bu yüzden adım ×1.15'te durur; ×1.25 kırpar.
4. **Hairline'lar ölçeklenmez.** `max(1px, 0.0625rem)`. Aksi halde 4K'da 2px olur ve tasarım
   kabalaşır.
5. **`MessageMention` yalnız `@@index([userId])` taşıyor.** Bahsedilmeler listesi zamana göre
   sıralanacaksa `Message.createdAt` üzerinden join gerekir — indeks eklenmeden bu sorgu
   kullanıcı başına tüm bahsedilmeleri tarar.
6. **`VoiceState.lastHeartbeat` bayat olabilir.** Canlı oda listesi heartbeat penceresine göre
   filtrelenir; ölü satır "canlı oda" gibi görünmemeli. Mevcut cleanup mantığı
   `@/lib/voice/service.ts` içinde, yeniden yazma — eşiği oradan oku.
7. **Presence "OFFLINE" iki şey demek olabilir.** Gerçekten çevrimdışı ya da görünmez. `@/lib/presence.ts`
   üstündeki yorum bunu anlatıyor; last-seen ve "boşta süresi" metni bu ayrımı bozmamalı.
8. **`(main)` grubu zaten auth uyguluyor.** Yeni rotalarda ikinci kez `requireAuth` çağırıp
   yönlendirme kurma; layout'un sözleşmesine güven.
9. **Kök font boyutu değişimi tüm uygulamayı etkiler.** Faz 1'in kapısı yalnız yeni ekran değil,
   mevcut ekranların görsel taramasıdır.
10. **`Notification.actionUrl` dış bağlantı taşıyabilir.** Ekranda tıklanabilir yapmadan önce
    göreli yol kontrolü şart (§5.1.7).

---

## 7. Yüzey haritası — dokunulacak dosyalar

**Yeni (tahmini):**

```
apps/web/src/lib/home/metrics.ts                 ölçü sözlüğü (Faz 0)
apps/web/src/lib/home/scale.ts                   ölçek adımı seçimi, saf (Faz 1)
apps/web/src/hooks/use-ui-scale.ts               kök font boyutu uygulayıcı (Faz 1)
apps/web/src/components/shell/app-nav-panel.tsx  272 navigasyon paneli (Faz 2)
apps/web/src/lib/home/types.ts                   DTO + zod (Faz 3)
apps/web/src/lib/home/service.ts                 toplayıcı sorgular (Faz 3)
apps/web/src/lib/home/client.ts                  query key + fetch (Faz 3)
apps/web/src/app/api/v1/app/summary/route.ts     (Faz 3)
apps/web/src/app/api/v1/app/recent/route.ts      (Faz 3)
apps/web/src/app/api/v1/app/awaiting/route.ts    (Faz 3)
apps/web/src/app/api/v1/voice/live/route.ts      (Faz 3)
apps/web/src/app/api/v1/events/upcoming/route.ts (Faz 3)
apps/web/src/app/api/v1/events/calendar/route.ts (Faz 3)
apps/web/src/app/api/v1/mentions/route.ts        (Faz 3)
apps/web/src/app/api/v1/search/command/route.ts  (Faz 3)
apps/web/src/app/(main)/home/page.tsx            (Faz 4)
apps/web/src/components/home/*.tsx               6 kart + ızgara (Faz 4)
apps/web/src/components/command/command-palette.tsx (Faz 5)
apps/web/src/app/(main)/mentions|events|inbox/   (Faz 6)
packages/db/prisma/rebaseline-migrations/<ts>_home_focus_mode/migration.sql (Faz 3)
```

**Değişecek:**

```
apps/web/src/app/layout.tsx                 font bağlama (Faz 1)
apps/web/src/app/globals.css                density rem, ölçek değişkenleri (Faz 1)
apps/web/src/app/page.tsx                   / → /home (Faz 4)
apps/web/src/components/shell/wizards-shell.tsx  rota başına 2. sütun (Faz 2)
apps/web/src/components/shell/server-rail.tsx    74 hizalaması (Faz 2)
apps/web/src/lib/appearance.ts              ray genişliği (Faz 2)
apps/web/src/lib/api-rate-limit.ts          yeni anahtarlar (Faz 3)
apps/web/src/lib/locale/messages/{tr,en}.ts anahtarlar (Faz 7)
packages/db/prisma/schema.prisma            odak modu alanları + indeks (Faz 3)
```

---

## 8. Alınmış kararlar

README'deki 10 maddelik tablo bağlayıcıdır. Faz dosyaları bunları yeniden tartışmaz.

Kararların doğrudan sonuçları:

- **#4 (odak = süreli DND):** `Durumun` kartındaki dört çip presence'ı, `Rahatsız etmeyin`
  toggle'ı odak katmanını yönetir. Toggle açıkken presence `DND` olur, `statusRestoreTo` önceki
  değeri tutar, `statusExpiresAt` dolunca geri döner. Üst çubuktaki "Odak · 25 dk" pill'i ve
  kullanıcı ayağındaki "Odak modu · 25 dk" satırı **aynı** kaynaktan okur.
- **#5 (türetilmiş durum metni):** Öncelik sırası — sesli odada → "<oda adı>'da"; DND →
  "Rahatsız etmeyin"; boşta → "<n> dk boşta"; aksi halde `customStatus`; o da yoksa presence
  etiketi. Sıra saf fonksiyonda ve testli.
- **#6 (canlı kapsam):** Sunucu sesli kanalları `VoiceState` üzerinden, DM/grup aramaları mevcut
  çağrı durumundan. İkisi tek DTO'ya normalize edilir (`kind: 'voice' | 'game' | 'call'`).
- **#8 (rota başına 2. sütun):** `WizardsShell` içinde tek bir seçici; kopyalanmış üç kabuk yok.
