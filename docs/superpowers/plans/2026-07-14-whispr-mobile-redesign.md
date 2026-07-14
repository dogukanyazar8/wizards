# Whispr Mobile Redesign — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `design_handoff_whispr_mobile/` içindeki 10 ekranlık hi-fi mock'u, mevcut Whispr mobil kod tabanının kendi mimarisi (Expo 56 / RN 0.85, React Navigation, react-query + zustand + socket.io, LiveKit) üzerinde **piksel piksel, dummy verisiz** yeniden inşa etmek: 4 sekmeli navigasyon, mini ses çubuğu, tam ekran ses odası, sunucu değiştirici bottom sheet, açık+koyu tema.

**Architecture:** Önce `docs/superpowers/specs/2026-07-14-whispr-mobile-redesign-design.md` içindeki bounded API, pagination, realtime, read-watermark ve LiveKit sözleşmeleri tamamlanır; ekran işi capability gate yeşil olmadan başlamaz. Ardından mevcut ekran-provider deseni korunarak (`mobile-product-app.tsx` → screen-provider context'leri → `mobile-screen-containers.tsx` → ekranlar) semantik tasarım sistemi ve 1a-1g yüzeyleri kurulur. Ses odası korumalı root-stack rotasıdır; ölçülen mini ses çubuğu ve dört sekmeli floating chrome yalnız tab-root ekranlarının inset sahibidir.

**Tech Stack:** Expo 56, React Native 0.85, React 19, React Navigation, vendored Plus Jakarta Sans TTF, `react-native-svg`, FlashList, TanStack Query, Zustand, Socket.IO, LiveKit, Prisma/PostgreSQL, Jest/RNTL, Node test runner, Playwright, Maestro.

## Global Constraints

- Kaynak önceliği: HTML görsel geometri/ikon/font için, README davranış/veri/erişilebilirlik için, PNG yalnız hızlı referans için kanoniktir.
- 1a-1g uygulanır; 1h uygulanmaz; 1i/1j yalnız koyu tema kanıtıdır.
- Runtime UI'ya fixture, örnek kullanıcı/sunucu/mesaj veya istemciye gömülü seed eklenmez. Eksik capability gizlenmez; bu planın Faz -1 görevinde gerçek API olarak tamamlanır.
- Tüm dış yanıtlar shared Zod şemasıyla doğrulanır; endpoint'ler bearer auth, active-user, ownership/permission, rate limit ve bounded input uygular.
- Her davranış değişikliği red-green TDD ile başlar; focused test yeşil olmadan uygulama commit'i yapılmaz.
- Plus Jakarta Sans aynı lisanslı TTF dosyalarından native ve HTML renderer'a yüklenir; Google Fonts veya ağ fontu kullanılmaz.
- Tüm normal metin 2.0 font ölçeğinde içerik/fonksiyon kaybetmeden çalışır; 390×844 pixel kabulü font ölçeği 1.0'da yapılır.
- Light/dark renk normalizasyonu ve kontrast eşlemeleri tasarım spec'indeki exact değerlerdir; ekranda ham hex yasaktır.
- Side-effecting mutation'lar offline fail-fast, `networkMode: "always"`, `retry: false` kullanır; pause/replay kuyruğu yoktur.
- Her görev PowerShell-safe `corepack pnpm --filter ...` komutlarıyla doğrulanır ve tek cohesive commit üretir.

---

## 0. KAYNAKLAR VE ÇALIŞMA KURALLARI

### Kanonik referanslar

- **`design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html`** — tek gerçek kaynak. 10 ekran, her biri 390×844 div, **tüm ölçü/renk/yazı değerleri inline style**. Ekran anchor'ları: `#1a` Sunucular, `#1b` Kanal sohbet, `#1c` Mesajlar, `#1d` Bildirimler, `#1e` Ses odası, `#1f` Profil, `#1g` Sunucu sheet, `#1h` Sol rail (UYGULANMAYACAK), `#1i`/`#1j` koyu tema. Tereddütte kalınan HER değer HTML'den okunur, tahmin edilmez.
- `design_handoff_whispr_mobile/README.md` — görev tanımı, token tabloları, kabul kriterleri.
- `design_handoff_whispr_mobile/screenshots/*.png` — hızlı görsel referans (düşük çözünürlük; piksel değeri için HTML esas).

### Kesin kurallar (README'den — ihlali kabul edilmez)

1. **Dummy/sahte veri YASAK.** Her liste doğrulanmış bootstrap/domain API/React Query/realtime/LiveKit üretim yolundan gelir. Mock'taki "UAT ENV", "welcome-chat", "CodeX" vb. içerikler koda YAZILMAZ; görsel kabul hesabı sunucu tarafı UAT CLI ile gerçek servis sınırlarından hazırlanır.
2. Mimari gereksiz yere değiştirilmez; mevcut provider/container deseni korunur.
3. Her ekranda **loading (skeleton) / empty / error** durumları zorunlu.
4. Açık+koyu tema; sistem takibi + Profil > Görünüm'den elle seçim (mevcut `useThemePreference` bunu zaten yapıyor — sadece token değerleri ve seçim UI'ı yenilenir).
5. Mikrofon/bildirim izinleri **yalnızca kullanıcı aksiyonuyla** (mevcut "requires-native-permission" davranışı aynen korunur).
6. Metinler Türkçe; tüm yeni string'ler `src/locale/mobile-copy.ts` içine **hem `tr` hem `en`** olarak eklenir. Koda literal Türkçe metin yazılmaz.
7. 1h (sol rail) **uygulanmaz**; ayar bayrağı da eklenmez (YAGNI).

### Çalışma düzeni

- İzole çalışma alanı hazırdır: `C:\Users\doguk\Desktop\Wizards-mobile-redesign`, dal `codex/mobile-redesign`, taban `uat@1f194c2b`. Ana dirty `uat` checkout'una dokunulmaz.
- Her task sonunda commit (aşağıda mesajlar verildi). Her ekran task'ının sonunda **390×844 görsel karşılaştırma döngüsü** çalıştırılır (bkz. "Görsel doğrulama döngüsü").
- Temel test komutları repo kökünden çalışır:
  - `corepack pnpm --filter @wizards/types test`
  - `corepack pnpm --filter @wizards/web typecheck` ve `corepack pnpm --filter @wizards/web test`
  - `corepack pnpm --filter @wizards/mobile typecheck`
  - `corepack pnpm --filter @wizards/mobile test`
  - `corepack pnpm --filter @wizards/mobile test:components -- --runInBand`
  - `corepack pnpm --filter @wizards/mobile quality:check`
- **Görsel doğrulama döngüsü:** Her ekran görevi component/style manifest testini çalıştırır. Faz 5'teki pinned renderer hazır olduktan sonra `visual:reference:verify`, Android/iOS capture ve `visual:diff` ilgili 1a-1g light/dark kanıtını fail-closed üretir; düşük çözünürlüklü PNG'ye manuel tolerans verilmez.

---

## 1. DOSYA HARİTASI

### Oluşturulacak

| Dosya                                                                 | Sorumluluk                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/mobile/src/design/mobile-avatar-color.ts`                       | Kullanıcı/sunucu id'sinden deterministik avatar renk çifti (bg/fg)                     |
| `apps/mobile/src/design/mobile-line-icons.tsx`                        | Mock'taki stroke SVG ikonların react-native-svg portu (1.8–2px stroke, round cap/join) |
| `apps/mobile/src/voice/mobile-mini-voice-bar.tsx`                     | Kalıcı mini ses çubuğu (tüm sekmelerde, tab bar üstünde)                               |
| `apps/mobile/src/workspace/mobile-server-switcher-sheet.tsx`          | 1g sunucu değiştirici bottom sheet                                                     |
| `apps/mobile/src/app/components/kit/segment-chips.tsx`                | 1c segment chip'leri (Konuşmalar/Arkadaşlar/İstekler)                                  |
| `apps/mobile/src/app/components/kit/settings-row.tsx`                 | 1f ayar satırı (ikon kutusu + etiket + değer/chevron)                                  |
| `apps/mobile/component-tests/mobile-avatar-color.test.tsx`            | Renk türetimi birim testi                                                              |
| `apps/mobile/component-tests/mobile-bottom-tab-bar-redesign.test.tsx` | 4 sekme + kırmızı nokta + aktif pill testi                                             |
| `apps/mobile/component-tests/mobile-mini-voice-bar.test.tsx`          | Mini çubuk görünürlük/aksiyon testleri                                                 |
| `apps/mobile/component-tests/mobile-server-switcher-sheet.test.tsx`   | Sheet: gerçek sunucu listesi, aktif işaret, seçim                                      |

### Değiştirilecek (ana hatlar)

| Dosya                                                                                                          | Değişiklik                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/package.json`                                                                                     | `@expo-google-fonts/outfit` kaldırılır; Expo-uyumlu `react-native-svg` doğrudan dependency olur; runtime font package'ı eklenmez                           |
| `apps/mobile/src/design/palette.ts`                                                                            | README token tablosundaki yeni açık+koyu palet                                                                                                             |
| `apps/mobile/src/design/tokens.ts`                                                                             | Tipografi (Plus Jakarta Sans), radius/spacing/gölge ölçüleri                                                                                               |
| `apps/mobile/src/design/themes.ts`                                                                             | `MobileTheme` yeni roller (`surface.inverse`, `accent.softBorder`, `text.placeholder`, `avatarTints`, `status.successText` …) + iki temanın yeni değerleri |
| `apps/mobile/src/design/mobile-fonts.ts`                                                                       | Outfit → Plus Jakarta Sans (400/500/600/700/800), `useMobileFonts`                                                                                         |
| `apps/mobile/src/navigation/mobile-navigation.ts`                                                              | `voice` sekmesi kaldırılır (4 sekme)                                                                                                                       |
| `apps/mobile/src/navigation/mobile-navigation-types.ts`                                                        | `voice` tab param'ı çıkar, `VoiceRoom: undefined` root-stack rotası eklenir                                                                                |
| `apps/mobile/src/navigation/mobile-navigator.tsx`                                                              | Voice tab ekranı silinir; `VoiceRoom` stack rotası eklenir                                                                                                 |
| `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx`                                                         | Yüzer kart tab bar + lavanta pill + kırmızı nokta + MiniVoiceBar yerleşimi                                                                                 |
| `apps/mobile/src/navigation/mobile-linking.ts`                                                                 | `voice` tab deep-link eşlemesi → `VoiceRoom` rotası                                                                                                        |
| `apps/mobile/src/app/screens/mobile-screen-containers.tsx`                                                     | `VoiceTabScreenContainer` → `VoiceRoomStackScreenContainer`                                                                                                |
| `apps/mobile/src/app/mobile-product-app.tsx`                                                                   | `useMobileFonts` çağrısı; voice tab'a bağlı `currentTab`/`getSyncHealth("voice")` düzenlemesi                                                              |
| `apps/mobile/src/app/screens/home-screen.tsx` + `.styles.ts`                                                   | 1a Sunucular ekranı                                                                                                                                        |
| `apps/mobile/src/app/screens/workspace-channel-section-list.tsx`                                               | Kategori başlıkları, kanal satırları, sesli kanal satırları (1a)                                                                                           |
| `apps/mobile/src/app/screens/channel-screen.tsx` + `message-primitives.tsx` + `composer/mobile-composer.tsx`   | 1b Kanal sohbet                                                                                                                                            |
| `apps/mobile/src/app/screens/dm-screen.tsx` + `.styles.ts` + `src/social/friends-hub.tsx`                      | 1c Mesajlar                                                                                                                                                |
| `apps/mobile/src/app/screens/notifications-screen.tsx`                                                         | 1d Bildirimler                                                                                                                                             |
| `apps/mobile/src/app/screens/voice-screen.tsx` (→ ses odası içeriği) + `src/voice/mobile-voice-room-panel.tsx` | 1e Aktif ses odası                                                                                                                                         |
| `apps/mobile/src/app/screens/settings-screen.tsx`                                                              | 1f Profil & Ayarlar                                                                                                                                        |
| `apps/mobile/src/app/components/kit/avatar.tsx`                                                                | Squircle + çevrimiçi noktası + deterministik renk                                                                                                          |
| `apps/mobile/src/app/components/kit/badge.tsx`                                                                 | Okunmamış rozeti (min 20–22px, indigo, beyaz 700)                                                                                                          |
| `apps/mobile/src/app/components/kit/bottom-sheet.tsx`                                                          | Generic davranışı koruyan semantic redesign variant: radius 36, handle 44×5, dark overlay .55, 280ms ease-out                                              |
| `apps/mobile/src/app/components/kit/skeleton.tsx`                                                              | Gerçek satır geometrisiyle parlama animasyonlu iskeletler                                                                                                  |
| `apps/mobile/src/locale/mobile-copy.ts`                                                                        | Tüm yeni string'ler (tr+en)                                                                                                                                |
| `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`                                                   | `mobile-bottom-tab-voice` çıkarılır; yeni testID'ler eklenir                                                                                               |
| `.maestro/*.yml`                                                                                               | Voice sekmesi akışları yeni navigasyona uyarlanır                                                                                                          |
| İlgili mevcut component testleri                                                                               | Yeni tasarıma göre güncellenir                                                                                                                             |

---

## FAZ -1 — CAPABILITY GATE: GERÇEK VERİ, PAGINATION, READ, REALTIME, VOICE

Bu fazdaki A1-A7 görevleri yeşil olmadan Faz 0 veya ekran görevleri başlamaz.

### Task A1: Shared mobile redesign schemas

**Files:**

- Create: `packages/types/src/mobile-pagination.ts`
- Create: `packages/types/src/mobile-notification-feed.ts`
- Create: `packages/types/src/mobile-directory.ts`
- Create: `packages/types/src/mobile-voice-state.ts`
- Create: matching `*.test.ts` files beside each module
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/socket.ts` and `packages/types/src/socket.test.ts`

**Produces:** user-bound opaque page cursors; notification actor/kind/target/read schemas; DM/server/channel page + high-watermark response schemas; `MobileVoiceStatesWatchSchema`, `MobileVoiceStatesQuerySchema`, and authoritative update schema; `notification:feed:invalidated`, DM row/aggregate revision, and server-unread revision DTOs.

- [ ] **Step 1: Failing schema tests** — add parse/reject cases for valid maximum pages, `limit` overflow, malformed cursor, unknown notification target, raw URL/metadata/user-ID leakage, duplicate/>80 voice IDs, missing revisions, and unknown socket keys.

```ts
assert.equal(
  MobileVoiceStatesQuerySchema.safeParse({ serverId: "s1", channelIds: ids(81) }).success,
  false,
);
assert.equal(
  MobileNotificationTargetSchema.safeParse({ type: "url", url: "https://evil.test" }).success,
  false,
);
assert.equal(
  MobileNotificationFeedInvalidatedSchema.parse({ feedRevision: 2, reason: "read-all" })
    .feedRevision,
  2,
);
```

- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile-pagination.test.ts src/mobile-notification-feed.test.ts src/mobile-directory.test.ts src/mobile-voice-state.test.ts
```

Beklenen: yeni modüller/exportlar bulunamadığı için FAIL.

- [ ] **Step 3: Implement exact discriminated schemas** — unknown keys `strict()` ile reddedilir; excerpts/body/cursor/ID arrays bounded; target union yalnız `none | channel-message | dm-conversation | messages-segment | channel | server | voice-channel | settings` kabul eder; page result `{ items, nextCursor, snapshotRevision }` ve typed stale-cursor result'tur.

- [ ] **Step 4: Verify and commit**

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/types typecheck
git add packages/types/src
git commit -m "feat(types): add bounded mobile redesign contracts"
```

### Task A2: Notification feed, read-all watermark, and safe invalidation

**Files:**

- Create: `apps/web/src/lib/notifications/mobile-feed-service.ts` and `.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/notification-feed/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/notification-feed/route-logic.ts` and `.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/notification-feed/[notificationId]/read/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/notification-feed/read-all/route.ts`
- Modify: `apps/web/src/lib/socket/notification-payload.ts` and tests
- Modify: web notification listener/mapper files found by `rg -n "notification:new" apps/web/src`

**Produces:** `listMobileNotificationFeed`, `markMobileNotificationRead`, `markMobileNotificationFeedRead`; `(createdAt,id) DESC` page max 50; signed snapshot watermark; user-scoped monotonic `feedRevision`; atomically migrated `notification:feed:invalidated` event.

- [ ] **Step 1: Write failing service/route/socket tests** for bearer auth, ownership, rate limit, target conversion, post-snapshot row preservation, rollback revision, and two devices receiving `new/read/read-all` invalidation without metadata/action URL.
- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/notifications/mobile-feed-service.test.ts src/app/api/v1/mobile/notification-feed/route-logic.test.ts src/lib/socket/notification-payload.test.ts
```

- [ ] **Step 3: Implement service and routes** using access-aware notification mappers, HMAC watermark bound to user/snapshot, `take: limit + 1`, typed target allowlist, transactionally advanced feed revision, and no raw client URL parsing.
- [ ] **Step 4: Remove legacy payload atomically, verify, commit**

```powershell
rg -n "notification:new" apps/web/src apps/mobile/src packages/types/src
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
git add packages/types apps/web/src
git commit -m "feat(notifications): add secure mobile feed and read state"
```

Beklenen `rg`: yalnız migration-denial contract testindeki yasak ifade.

### Task A3: Complete DM pagination and forward-only read state

**Files:**

- Create: `apps/web/src/lib/dm/mobile-list-service.ts` and `.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/dm/route.ts`, `route-logic.ts`, and `route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/read/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/read/route-logic.ts` and `.test.ts`
- Modify: `apps/web/src/lib/dm/realtime-service.ts` and tests

**Produces:** `GET /api/v1/mobile/dm?cursor=&limit=` with page max 50 and batched presence; `PATCH .../[conversationId]/read` with validated `throughMessageId`; per-row `revision` plus user-scoped `dmAggregateRevision` on mutations/events.

- [ ] **Step 1: Write failing tests** for 51-row pagination, stable `(lastMessageAt,id)` ordering, attachment/deleted/blocked preview fallback, no N+1 presence, stale cursor, reverse-completion high-watermarks, and incomparable revision refetch result.
- [ ] **Step 2: Verify red, implement keyset service/GET/PATCH, then verify green**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/dm/mobile-list-service.test.ts src/app/api/v1/mobile/dm/route-logic.test.ts src/app/api/v1/mobile/dm/[conversationId]/read/route-logic.test.ts src/lib/dm/realtime-service.test.ts
corepack pnpm --filter @wizards/web typecheck
git add apps/web/src/lib/dm apps/web/src/app/api/v1/mobile/dm
git commit -m "feat(mobile-api): add complete DM pagination and read watermarks"
```

### Task A4: Complete server/channel pages, previews, counts, and read state

**Files:**

- Create: `apps/web/src/lib/mobile/server-directory-service.ts` and `.test.ts`
- Create: `apps/web/src/lib/mobile/channel-directory-service.ts` and `.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/servers/route.ts`, `route-logic.ts`, and tests to add GET without changing POST
- Modify: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/route.ts`, `route-logic.ts`, and tests
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/read/route.ts`
- Create: matching `route-logic.ts` and `.test.ts`
- Modify: `apps/web/src/lib/workspace/unread-service.ts` and realtime serializer tests

**Produces:** accepted-membership server keyset max 50; ordered channel keyset max 80; batched counts/previews/online count; atomic `(createdAt,id)` high-watermark `max`; revisioned `server:unread:update`.

- [ ] **Step 1: Write failing tests** for large memberships/channels, category ordering, stable dedupe, no N+1, hidden preview redaction, stale cursor, permission loss, and delayed older read request becoming a no-op.
- [ ] **Step 2: Verify red, implement bounded services/routes, verify green, commit**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/mobile/server-directory-service.test.ts src/lib/mobile/channel-directory-service.test.ts src/app/api/v1/mobile/servers/route-logic.test.ts src/app/api/v1/mobile/servers/[serverId]/channels/route-logic.test.ts src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/read/route-logic.test.ts
corepack pnpm --filter @wizards/web typecheck
git add apps/web/src/lib/mobile apps/web/src/lib/workspace apps/web/src/app/api/v1/mobile/servers
git commit -m "feat(mobile-api): add paginated server and channel summaries"
```

### Task A5: LiveKit-confirmed bounded voice occupancy

**Files:**

- Create: `apps/web/src/lib/voice/mobile-occupancy-projection.ts` and `.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/voice/states/query/route.ts`
- Create: matching `route-logic.ts` and `.test.ts`
- Modify: `apps/web/src/lib/socket/handlers/voice.ts` and tests
- Modify: `apps/web/src/lib/socket/server.ts` and tests

**Produces:** read-only POST query for ≤80 authorized channel IDs; complete replacement summaries capped to three preview actors; `(serverId,channelId)` monotonic revision; strict per-socket watch/unwatch cap 80; revoke purge plus emit-time authorization.

- [ ] **Step 1: Write failing tests** for pending `VoiceState` exclusion, 81/duplicate IDs, unauthorized omission, complete replacement update, role/channel revoke eviction, server switch, scroll-window diff, reconnect, and subscription rate limit.
- [ ] **Step 2: Verify red, implement projection/query/watch registry, verify green, commit**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/voice/mobile-occupancy-projection.test.ts src/app/api/v1/mobile/voice/states/query/route-logic.test.ts src/lib/socket/server.test.ts
corepack pnpm --filter @wizards/web typecheck
git add apps/web/src/lib/voice apps/web/src/lib/socket apps/web/src/app/api/v1/mobile/voice/states/query
git commit -m "feat(voice): add bounded confirmed occupancy projection"
```

### Task A6: Voice lifecycle, notification fanout, and durable revoke

**Files:**

- Create: `packages/db/prisma/migrations/20260714000000_add_voice_room_lifecycle/migration.sql`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `apps/web/src/lib/voice/room-lifecycle-service.ts` and `.test.ts`
- Create: `apps/web/src/lib/voice/room-lifecycle-reconciler.ts` and `.test.ts`
- Create: `apps/web/src/app/api/internal/livekit/webhook/route.ts` and route test
- Modify: `apps/web/src/lib/outbox/service.ts`, `worker.ts`, and tests
- Modify: member/role/channel permission mutation services and tests

**Produces:** one active lifecycle pointer per channel; signed webhook as reconciliation trigger; RoomService-before-open authorization; unique lifecycle recipient rows; delivery/revoke outbox; reconnect grace; 7/30-day bounded GC; immediate viewer invalidation plus retryable LiveKit/VoiceState eviction.

- [ ] **Step 1: Write failing migration/service tests** for concurrent distinct joins, expired Redis lock, `left` then stale `join` with RoomService empty, unauthorized participant eviction, crash-safe fanout cursor, duplicate recipient, 30-second grace, member/role/channel revoke provider failure/retry, and GC preserving active/pending rows.
- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/voice/room-lifecycle-service.test.ts src/lib/voice/room-lifecycle-reconciler.test.ts src/lib/outbox/service.test.ts src/lib/outbox/worker.test.ts
```

- [ ] **Step 3: Implement additive schema and worker-first handlers** — producers remain disabled by env gate; unsupported-job contract fails deployment; external LiveKit/push/socket delivery is represented by per-delivery idempotent outbox rows.
- [ ] **Step 4: Verify migration, races, worker compatibility, and commit**

```powershell
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
git add packages/db/prisma apps/web/src/lib/voice apps/web/src/lib/outbox apps/web/src/app/api/internal/livekit apps/web/src/lib/workspace
git commit -m "feat(voice): add durable room lifecycle and authorization jobs"
```

### Task A7: Mobile query clients, pagination state machine, and realtime registry

**Files:**

- Create: `apps/mobile/src/notifications/mobile-notification-feed-client.ts`
- Create: `apps/mobile/src/dm/mobile-dm-list-client.ts`
- Create: `apps/mobile/src/workspace/mobile-server-directory-client.ts`
- Create: `apps/mobile/src/workspace/mobile-channel-directory-client.ts`
- Create: `apps/mobile/src/voice/mobile-voice-states-client.ts`
- Create: focused `apps/mobile/scripts/mobile-redesign-*-client.test.ts` files
- Modify: `apps/mobile/src/query/mobile-bootstrap-query.ts`, `mobile-realtime-cache.ts`, and tests
- Modify: `apps/mobile/src/realtime/realtime-query-bridge.ts`, contract/state files, and tests
- Modify: owning feature/provider files under `apps/mobile/src/app/features` and `apps/mobile/src/app/providers`
- Create: `apps/web/e2e/specs/realtime/mobile-redesign-realtime.spec.ts`
- Create: `apps/web/e2e/specs/voice/mobile-redesign-voice.spec.ts`

**Produces:** bounded infinite-query options for four lists; initial/refresh/next/error/end/stale-cursor atomic-swap state; optimistic read mutation CAS rollback; row/aggregate revision guards; three-window voice LRU; one event-to-cache registry.

- [ ] **Step 1: Write failing client/cache tests** for response parsing, all pagination states in all four domains, next-page error row retention, stale-cursor replacement failure, cross-device read, old/incomparable revision, reconnect active/inactive refetch, voice LRU and permission purge.
- [ ] **Step 2: Verify red, implement clients/query factories/cache registry, verify green**

```powershell
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/web e2e:realtime
```

- [ ] **Step 3: Capability gate commit**

```powershell
git add apps/mobile/src apps/mobile/scripts apps/web/e2e packages/types
git commit -m "feat(mobile): connect bounded redesign data and realtime caches"
```

**Gate:** A1-A7'nin package typecheck/test komutları ve iki-client realtime testi yeşil değilse Task 1'e geçilmez.

---

## FAZ 0 — ZEMİN: FONT, PALET, TEMA, İKON, AVATAR RENGİ

### Task 1: Plus Jakarta Sans fontları

**Files:**

- Create: `apps/mobile/assets/fonts/PlusJakartaSans-{Regular,Medium,SemiBold,Bold,ExtraBold}.ttf`
- Create: `apps/mobile/assets/fonts/OFL.txt`
- Create: `apps/mobile/assets/fonts/manifest.json`
- Create: `apps/mobile/scripts/mobile-font-contract.test.ts`
- Modify: `apps/mobile/package.json` ve `pnpm-lock.yaml`
- Modify: `apps/mobile/src/design/mobile-fonts.ts`
- Modify: `apps/mobile/src/design/tokens.ts` (yalnız `mobileTypography.fontFamily*` alanları — tam tipografi ölçeği Task 4'te)
- Modify: `apps/mobile/src/app/mobile-product-app.tsx:7,43` (`useOutfitFonts` → `useMobileFonts`)

- **Produces:** `useMobileFonts(): readonly [boolean, Error | null]`, `WhisprJakarta_{400Regular,500Medium,600SemiBold,700Bold,800ExtraBold}` family adları ve HTML/native tarafından ortak kullanılan hash manifesti.

- [ ] **Step 1: Font sözleşmesi için kırmızı testi yaz**

`mobile-font-contract.test.ts`, beş TTF + OFL dosyasının varlığını, `manifest.json` içindeki SHA-256 ile gerçek hash eşitliğini, runtime source içinde Outfit/remote Google font kalmadığını ve her weight'in farklı `WhisprJakarta-*` ailesine map edildiğini assert eder.

```ts
assert.deepEqual(Object.keys(manifest.files).sort(), [
  "PlusJakartaSans-Bold.ttf",
  "PlusJakartaSans-ExtraBold.ttf",
  "PlusJakartaSans-Medium.ttf",
  "PlusJakartaSans-Regular.ttf",
  "PlusJakartaSans-SemiBold.ttf",
]);
assert.equal(source.includes("@expo-google-fonts"), false);
assert.equal(source.includes("https://fonts.googleapis.com"), false);
```

- [ ] **Step 2: Kırmızı testi çalıştır**

```powershell
corepack pnpm --filter @wizards/mobile test -- mobile-font-contract
```

Beklenen: `assets/fonts/manifest.json` bulunamadığı için FAIL.

- [ ] **Step 3: Lisanslı release'i geçici kaynaktan çıkar ve runtime dependency'yi kaldır**

```powershell
corepack pnpm add --filter @wizards/mobile --save-exact @expo-google-fonts/plus-jakarta-sans@0.4.2
# package içindeki 400/500/600/700/800 TTF ve OFL-1.1 dosyasını apps/mobile/assets/fonts altına kopyala.
corepack pnpm remove --filter @wizards/mobile @expo-google-fonts/plus-jakarta-sans @expo-google-fonts/outfit
```

`manifest.json`, kaynak paket/version/lisans, her dosyanın runtime family/weight'i ve hesaplanmış SHA-256'sını içerir. TTF'ler commit edilir; runtime ağ fontu veya font paketi dependency'si kalmaz.

- [ ] **Step 4: `mobile-fonts.ts`'i vendored dosyalarla yeniden yaz**

```tsx
import { useFonts } from "expo-font";
import { Text, TextInput } from "react-native";

import { mobileTypography } from "./tokens";

type FontDefaultTarget = {
  defaultProps?: {
    style?: unknown;
  };
};

let defaultsInstalled = false;

export function useMobileFonts(): readonly [boolean, Error | null] {
  return useFonts({
    WhisprJakarta_400Regular: require("../../assets/fonts/PlusJakartaSans-Regular.ttf"),
    WhisprJakarta_500Medium: require("../../assets/fonts/PlusJakartaSans-Medium.ttf"),
    WhisprJakarta_600SemiBold: require("../../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    WhisprJakarta_700Bold: require("../../assets/fonts/PlusJakartaSans-Bold.ttf"),
    WhisprJakarta_800ExtraBold: require("../../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
  });
}

export function installMobileFontDefaults() {
  if (defaultsInstalled) {
    return;
  }

  const defaultStyle = { fontFamily: mobileTypography.fontFamily };

  for (const Component of [Text, TextInput]) {
    const target = Component as FontDefaultTarget;
    target.defaultProps = target.defaultProps ?? {};
    target.defaultProps.style = [defaultStyle, target.defaultProps.style].filter(Boolean);
  }

  defaultsInstalled = true;
}
```

- [ ] **Step 5: Token ve app loader'ını geçir**

`tokens.ts` aileleri `WhisprJakarta_*` değerlerini kullanır ve `fontFamilyExtraBold` ekler. `mobile-product-app.tsx` yalnız `useMobileFonts` çağırır.

```powershell
rg -n "useOutfitFonts|Outfit|@expo-google-fonts" apps/mobile/src apps/mobile/component-tests apps/mobile/package.json
```

Beklenen: sonuç yok.

- [ ] **Step 6: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/mobile test -- mobile-font-contract
corepack pnpm --filter @wizards/mobile typecheck
git add apps/mobile/assets/fonts apps/mobile/scripts/mobile-font-contract.test.ts apps/mobile/package.json apps/mobile/src/design/mobile-fonts.ts apps/mobile/src/design/tokens.ts apps/mobile/src/app/mobile-product-app.tsx pnpm-lock.yaml
git commit -m "feat(mobile): vendor Plus Jakarta Sans typography"
```

### Task 2: Palet — README token tablosunun koda dökümü

**Files:**

- Modify: `apps/mobile/src/design/palette.ts`
- Create: `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`

- [ ] **Step 1: Mevcut `palette.ts`'i oku**; tüketicilerini `rg -l "mobilePalette\." apps/mobile/src` ile bul.
- [ ] **Step 2: Redesign paletini ekle.** Mevcut anahtar yapısını koru (kırılmayı önlemek için), değerleri README + HTML'den güncelle ve yeni gruplar ekle:

```ts
// README "TASARIM TOKEN'LARI" + HTML inline değerleri — birebir
export const redesignLight = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  border: "#E7E9F4",
  hairline: "#F0F1F8",
  text: "#1E2235",
  canonicalTextSecondary: "#6B7194",
  textSecondary: "#62688B",
  canonicalTextFaint: "#8A90B0",
  textFaint: "#676D90",
  canonicalPlaceholder: "#9AA0BC",
  placeholder: "#676D90",
  primary: "#4F46E5",
  primaryStrong: "#3F38C9",
  lavender: "#EEF0FE",
  lavenderBorder: "#DFE2FC",
  success: "#22C55E",
  canonicalSuccessText: "#22A366",
  successSurface: "#E8F8EE",
  canonicalSuccessTextDeep: "#1B8A55",
  successText: "#187A4C",
  canonicalDanger: "#E05252",
  danger: "#C94343",
  dangerSurface: "#FCE9E9",
  inkSurface: "#1E2235", // mini ses çubuğu + "Konuşmalar" aktif chip
} as const;

export const redesignDark = {
  bg: "#131529",
  card: "#1C1F3A",
  border: "#2B2F52",
  hairline: "#232644",
  text: "#ECEEFA",
  textSecondary: "#9BA1C7",
  canonicalTextFaint: "#6E7398",
  textFaint: "#8288AD",
  canonicalPrimary: "#6D66F0",
  primary: "#6D66F0",
  primaryWithWhiteText: "#6B63EC",
  accentText: "#A5A8F5",
  selectedSurface: "#2A2D55",
  selectedBorder: "#3B3F73",
  success: "#34D399",
  successSurface: "rgba(52,211,153,.12)",
} as const;

// Avatar tint çiftleri (açık tema) — HTML'de kullanıcı/sunucu avatarlarında geçen çiftler
export const redesignAvatarTintsLight = [
  { bg: "#EEF0FE", fg: "#4F46E5" }, // lavanta/indigo
  { bg: "#FDEBD7", fg: "#C77A2B" }, // turuncu
  { bg: "#E0F0FA", fg: "#2B7AC7" }, // mavi
  { bg: "#F3E8FA", fg: "#8A46C7" }, // mor
  { bg: "#E8F8EE", fg: "#1B8A55" }, // yeşil
] as const;

export const redesignAvatarTintsDark = [
  { bg: "#2A2D55", fg: "#A5A8F5" },
  { bg: "#3A2E1B", fg: "#E8B36A" },
] as const;
```

> Bu iki koyu çift HTML 1i/1j'deki bütün fallback avatar çiftleridir; renderer unknown pair gördüğünde fail eder.

- [ ] **Step 3:** `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-theme-contract.test.ts` önce eksik mapping için FAIL, implementasyondan sonra PASS; mobile typecheck PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): add redesign palette tokens"`

### Task 3: Tema nesneleri — `MobileTheme` yeni roller + iki temanın değerleri

**Files:**

- Modify: `apps/mobile/src/design/themes.ts`
- Modify: `apps/mobile/src/design/mobile-theme-compat.ts` (tüketiyorsa uyum)
- Modify: `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`

- [ ] **Step 1: `MobileTheme` arayüzüne yeni roller ekle** (mevcut roller korunur; tüm ekranlar bu rollerden beslenecek):

```ts
export interface MobileTheme {
  // ...mevcut alanlar aynen...
  readonly accent: {
    readonly default: string; // 4F46E5 / 6D66F0
    readonly soft: string; // EEF0FE / 2A2D55
    readonly softBorder: string; // DFE2FC / 3B3F73  (YENİ)
    readonly strong: string; // 3F38C9 / A5A8F5
  };
  readonly surface: {
    // ...mevcut...
    readonly inverse: string; // 1E2235 (iki temada — mini bar, aktif chip, ses odası zemini)
  };
  readonly text: {
    // ...mevcut...
    readonly placeholder: string; // 676D90 / 8288AD normal-size accessible mapping
    readonly onInverse: string; // FFFFFF
  };
  readonly status: {
    // ...mevcut...
    readonly successText: string; // 187A4C / 34D399 (audited context only)
    readonly onStatus: string; // 1E2235 / ECEEFA
  };
  readonly avatarTints: readonly { readonly bg: string; readonly fg: string }[]; // YENİ
}
```

- [ ] **Step 2: `lightTheme` / `darkTheme` değerlerini redesign paletiyle doldur.** Eşleme:
  - light: `surface.base=#F6F7FB`, `surface.card/elevated=#FFFFFF`, `border.subtle=#E7E9F4`, `border.default=#F0F1F8`, `text.primary=#1E2235`, normal-size `text.secondary=#62688B`, `text.soft/muted/placeholder=#676D90`, `accent.default=#4F46E5`, `accent.strong=#3F38C9`, `accent.soft=#EEF0FE`, `accent.softBorder=#DFE2FC`, normal-size `status.danger=#C94343`, `status.dangerSoft=#FCE9E9`, `status.successText=#187A4C`, `status.successSoft=#E8F8EE`, `status.onStatus=#1E2235`.
  - dark: `surface.base=#131529`, `surface.card=#1C1F3A`, `border.subtle=#2B2F52`, ayraç `#232644`, `text.primary=#ECEEFA`, `text.secondary=#9BA1C7`, normal-size `text.soft/placeholder=#8288AD`, `accent.default=#6D66F0`, white normal text taşıyan primary action `#6B63EC`, `accent.strong=#A5A8F5`, `accent.soft=#2A2D55`, `accent.softBorder=#3B3F73`, plain dark normal-size danger text `#E45A5A`, `status.onStatus=#ECEEFA`, `status.success=#34D399`, `status.successSoft=rgba(52,211,153,.12)`.
  - Gölgeler (light): `elevation.card = 0 8px 24px rgba(30,34,53,.08)` → `{ shadowColor:"#1E2235", shadowOffset:{width:0,height:8}, shadowOpacity:0.08, shadowRadius:24, elevation:6 }`; `elevation.soft` (birincil buton) `= 0 6px 14px rgba(79,70,229,.35)` → `{ shadowColor:"#4F46E5", shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:14, elevation:6 }`. Dark'ta mevcut "gölgesiz" yaklaşım korunur (HTML #1i'de gölge yok — doğrula).
  - `systemBars`: light `{statusBar:"dark", androidNavigationBar:"#F6F7FB"}`, dark `{statusBar:"light", androidNavigationBar:"#131529"}`.
- [ ] **Step 3:** `corepack pnpm --filter @wizards/mobile typecheck` ile kırılan tüketicileri semantic role geçir.
- [ ] **Step 4:** theme key-parity + bütün role/context kontrast testleri ve `corepack pnpm --filter @wizards/mobile test:components -- mobile-communication-theme --runInBand` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): rebuild light/dark theme objects from redesign tokens"`

### Task 4: Ölçü ve tipografi ölçeği

**Files:**

- Modify: `apps/mobile/src/design/tokens.ts`
- Modify: `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`

- [ ] **Step 1: Radius/spacing/sizing token'larını README "Ölçüler" bölümünden güncelle:**

```ts
export const mobileRadii = {
  card: 22, // kartlar 20–24 → başlık kartı 22 (HTML #1a)
  cardLarge: 24,
  row: 16, // liste satırı 14–18
  control: 14, // input/chip 14–16
  chip: 16,
  bubble: 18, // mesaj balonu
  sheet: 36, // bottom sheet üst radius
  tabBar: 26,
  tabPill: 18,
  pill: 999,
} as const;

export const mobileSizing = {
  maxInlineContentWidth: 520,
  minTouchTarget: 44,
  presenceDot: 14, // 2.5px yüzey renkli kenarlıkla
  presenceDotBorder: 2.5,
  unreadBadgeMinHeight: 20, // 20–22
  avatarS: 36,
  avatarSRadius: 12,
  avatarM: 40,
  avatarMRadius: 14,
  avatarL: 44,
  avatarLRadius: 16, // 44–46 → r16
  avatarXL: 50,
  avatarXLRadius: 18, // 50–52 → r18
  avatarXXL: 76,
  avatarXXLRadius: 26, // 76–80 → r26–28
  iconStroke: 1.8, // 1.8–2
} as const;

export const mobileSpacing = {
  page: 20, // ekran yatay padding 20–24
  pageWide: 24,
  section: 16,
  row: 12,
} as const;
```

- [ ] **Step 2: Tipografi ölçeğini Plus Jakarta ile yeniden kur** (ekran başlığı 26/800, kart başlığı 17–19/800, satır başlığı 15/600–700, ikincil 12.5–13, kategori 11.5/700 + letterSpacing ≈1.38):

```ts
export const mobileTypography = {
  fontFamily: "WhisprJakarta_400Regular",
  fontFamilyMedium: "WhisprJakarta_500Medium",
  fontFamilySemiBold: "WhisprJakarta_600SemiBold",
  fontFamilyBold: "WhisprJakarta_700Bold",
  fontFamilyExtraBold: "WhisprJakarta_800ExtraBold",
  display: { fontFamily: "WhisprJakarta_800ExtraBold", fontSize: 26, lineHeight: 32 },
  headline: { fontFamily: "WhisprJakarta_800ExtraBold", fontSize: 19, lineHeight: 24 },
  title: { fontFamily: "WhisprJakarta_800ExtraBold", fontSize: 17, lineHeight: 22 },
  bodyStrong: { fontFamily: "WhisprJakarta_600SemiBold", fontSize: 15, lineHeight: 21 },
  body: { fontFamily: "WhisprJakarta_400Regular", fontSize: 15, lineHeight: 21 },
  message: { fontFamily: "WhisprJakarta_400Regular", fontSize: 14.5, lineHeight: 21 },
  secondary: { fontFamily: "WhisprJakarta_500Medium", fontSize: 12.5, lineHeight: 17 },
  caption: { fontFamily: "WhisprJakarta_600SemiBold", fontSize: 11.5, lineHeight: 15 },
  overline: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 1.38, // .12em × 11.5px — kategori başlıkları
  },
  button: { fontFamily: "WhisprJakarta_700Bold", fontSize: 14, lineHeight: 18 },
  label: { fontFamily: "WhisprJakarta_600SemiBold", fontSize: 12, lineHeight: 16 },
} as const;
```

> Mevcut `label`/`caption` tüketicileri kırılmasın diye eski anahtarlar korunur; typecheck kırılanları gösterir.

- [ ] **Step 3:** mobile typecheck + component tests → PASS; bütün text rolleri 2.0 scale ve explicit line-height contract testinden geçer.
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): redesign sizing and typography scale"`

### Task 5: react-native-svg + çizgi ikon seti

Mock'taki ikonlar stroke tabanlı özel SVG'ler (Ionicons dolgulu ikonlarla birebir eşleşmez). Piksel parite için mock'un SVG path'leri porta alınır.

**Files:**

- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/design/mobile-line-icons.tsx`
- Create: `apps/mobile/scripts/mobile-redesign-icon-contract.test.ts`

- [ ] **Step 1:** `corepack pnpm --filter @wizards/mobile exec expo install react-native-svg`
- [ ] **Step 2: HTML'den ikon path'lerini çıkar.** `Whispr Mobile Redesign.dc.html` içinde geçen tüm `<svg …>` bloklarını tara; benzersiz ikonları isimlendir. Asgari set (HTML'de geçtiği yerler): `chevron-down`, `chevron-right`, `back-arrow`, `search`, `invite-user` (kişi+artı), `hash`, `speaker`, `mic`, `mic-off`, `send`, `plus`, `emoji`, `bell`, `crown`, `check`, `close`, `headphones/output`, `chat-bubble`, `leave/phone-down`, `at-badge`, `edit`. Her biri `viewBox="0 0 24 24"`, `fill="none"`, `strokeWidth 1.8–2`, `strokeLinecap="round"`, `strokeLinejoin="round"` — path verileri HTML'den AYNEN kopyalanır.
- [ ] **Step 3: Bileşeni yaz:**

```tsx
import Svg, { Path, Circle } from "react-native-svg";

export type MobileLineIconName =
  | "back-arrow"
  | "at-badge"
  | "bell"
  | "chat-bubble"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "close"
  | "crown"
  | "edit"
  | "emoji"
  | "hash"
  | "headphones"
  | "invite-user"
  | "leave"
  | "mic"
  | "mic-off"
  | "plus"
  | "search"
  | "send"
  | "speaker";

interface MobileLineIconProps {
  readonly name: MobileLineIconName;
  readonly size?: number; // 17–24
  readonly color: string;
  readonly strokeWidth?: number; // varsayılan 1.8
  readonly accessibilityLabel?: string;
}

export function MobileLineIcon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
  accessibilityLabel,
}: MobileLineIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    >
      {renderIconPaths(name, color, strokeWidth)}
    </Svg>
  );
}
// renderIconPaths: name → HTML'den kopyalanan <Path d=… stroke={color} …/> öğeleri
```

- [ ] **Step 4:** `mobile-redesign-icon-contract.test.ts`, Expo dependency check ve mobile typecheck → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): add stroke line icon set from design mock"`

### Task 6: Deterministik avatar rengi

**Files:**

- Create: `apps/mobile/src/design/mobile-avatar-color.ts`
- Test: `apps/mobile/component-tests/mobile-avatar-color.test.tsx`

- [ ] **Step 1: Önce başarısız test:**

```tsx
import { getMobileAvatarTint, getMobileAvatarInitials } from "../src/design/mobile-avatar-color";
import { lightTheme } from "../src/design/themes";

describe("mobile avatar color", () => {
  it("aynı id her çağrıda aynı tint'i verir", () => {
    const first = getMobileAvatarTint("user-123", lightTheme);
    const second = getMobileAvatarTint("user-123", lightTheme);
    expect(first).toEqual(second);
  });

  it("tint tema paletinden gelir", () => {
    const tint = getMobileAvatarTint("user-456", lightTheme);
    expect(lightTheme.avatarTints).toContainEqual(tint);
  });

  it("baş harfleri üretir", () => {
    expect(getMobileAvatarInitials("UAT ENV", "tr")).toBe("UA");
    expect(getMobileAvatarInitials("dogukan", "en")).toBe("DO");
    expect(getMobileAvatarInitials("", "tr")).toBe("?");
  });
});
```

- [ ] **Step 2:** `corepack pnpm --filter @wizards/mobile test:components -- mobile-avatar-color --runInBand` → FAIL ("Cannot find module").
- [ ] **Step 3: İmplementasyon:**

```ts
import type { MobileTheme } from "./themes";

export function getMobileAvatarTint(
  id: string,
  theme: MobileTheme,
): { readonly bg: string; readonly fg: string } {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  const tints = theme.avatarTints;
  return tints[hash % tints.length] ?? tints[0];
}

export function getMobileAvatarInitials(name: string, locale: "tr" | "en"): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  const words = trimmed.split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[1]?.[0] ?? "") : (words[0]?.[1] ?? "");
  return (first + second).toLocaleUpperCase(locale);
}
```

- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): deterministic avatar tint derivation"`

---

## FAZ 1 — NAVİGASYON: 4 SEKME + VOICEROOM ROTASI + TAB BAR + MİNİ SES ÇUBUĞU

### Task 7: `voice` sekmesini kaldır, `VoiceRoom` rotasını ekle

**Files:**

- Modify: `apps/mobile/src/navigation/mobile-navigation.ts:3-19,56-62`
- Modify: `apps/mobile/src/navigation/mobile-navigation-types.ts:4-10,12-36`
- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx:204-210` (voice tab silinir), yeni stack rotası
- Modify: `apps/mobile/src/app/screens/mobile-screen-containers.tsx:99-103`
- Modify: `apps/mobile/src/navigation/mobile-linking.ts` (voice tab eşlemesi)
- Modify: `apps/mobile/src/app/mobile-product-app.tsx` (`getSyncHealth("voice")` ve `voiceScreenProps` kullanımı korunur; ekran artık stack'te)

- [ ] **Step 1: Etki analizini çalıştır:** `rg -n '"voice"' apps/mobile/src apps/mobile/scripts apps/mobile/component-tests .maestro` — her sonucu bu task'ta ya da Task 10'da ele al.
- [ ] **Step 2: `mobile-navigation.ts`:** `MOBILE_TAB_IDS = ["overview","messages","notifications","settings"]`, `MOBILE_BOTTOM_TAB_IDS` aynı, `MOBILE_TABS`'tan voice satırı silinir. (`MobileTabId` tipi otomatik daralır.)
- [ ] **Step 3: `mobile-navigation-types.ts`:** `MobileBottomTabParamList`'ten `voice` çıkar; `VoiceRoomRouteIntent = { kind: "active-session"; generation: number }` ekle ve `MobileRootStackParamList` içinde `VoiceRoom: { intent: VoiceRoomRouteIntent }` kullan. Route yalnız doğrulanmış in-app join sonrası oluşturulur; cold-start/bare route guard Servers'a döner, external voice target izin+join akışına girer.
- [ ] **Step 4: `mobile-screen-containers.tsx`:**

```tsx
export function VoiceRoomStackScreenContainer(
  _props: NativeStackScreenProps<MobileRootStackParamList, "VoiceRoom">,
) {
  return <VoiceScreen {...useMobileVoiceScreenProps()} />;
}
```

- [ ] **Step 5: `mobile-navigator.tsx`:** voice `BottomTabs.Screen` bloğunu sil; RootStack'e ekle:

```tsx
<RootStack.Screen
  name="VoiceRoom"
  options={{ animation: reducedMotion ? "none" : "slide_from_bottom" }}
>
  {(props) => (
    <ProtectedStackRoute>
      <VoiceRoomStackScreenContainer {...props} />
    </ProtectedStackRoute>
  )}
</RootStack.Screen>
```

- [ ] **Step 6: Linking/deep-link:** legacy voice tab path'i doğrudan `VoiceRoom` rotasına çevrilmez; allowlisted `voice-channel` intent normal confirmation, microphone permission ve join akışını tamamladıktan sonra generation-bound route oluşturur. Pending server invite yalnız SecureStore'daki 10 dakikalık tek-kullanımlık handle ile taşınır.
- [ ] **Step 7:** voice sync health'ı `MobileTabId`'den bağımsız domain key yap; Overview'a yeniden adlandırma. `isVoiceSessionActive` ve `hasVoiceRoomContext` tek saf predicate kaynağıdır.
- [ ] **Step 8:** `corepack pnpm --filter @wizards/mobile typecheck`, mobile node/component navigation testleri ve deep-link contract testleri → PASS.
- [ ] **Step 9: Commit** — `git commit -m "feat(mobile): move voice room to root stack, four-tab navigation"`

### Task 8: Yeni yüzer TabBar

**Referans:** HTML `#1a` alt kısmı + README "Navigasyon" bölümü: yüzer kart `left/right:16, bottom:18`, radius 26, padding 8, kenarlık + `0 8px 24px rgba(30,34,53,.08)` gölge; aktif sekme lavanta pill (radius 18) + indigo ikon + 700 etiket; okunmamış DM varsa Mesajlar ikonunda **8px kırmızı nokta** (sayı rozeti değil).

**Files:**

- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx` (tam yeniden yazım)
- Test: `apps/mobile/component-tests/mobile-bottom-tab-bar-redesign.test.tsx`

- [ ] **Step 1: Önce başarısız test** (mevcut component-test altyapısındaki render yardımcılarını `component-tests/` içindeki örneklerden kopyala — ör. `settings-appearance.test.tsx` kurulumunu):

```tsx
// Özet: MobileBottomTabBar'ı 4 rotalı sahte BottomTabBarProps ile render et.
it("dört sekme render eder ve voice içermez", () => {
  render(<Harness />); // overview, messages, notifications, settings
  expect(screen.getByTestId("mobile-bottom-tab-overview")).toBeTruthy();
  expect(screen.getByTestId("mobile-bottom-tab-messages")).toBeTruthy();
  expect(screen.getByTestId("mobile-bottom-tab-notifications")).toBeTruthy();
  expect(screen.getByTestId("mobile-bottom-tab-settings")).toBeTruthy();
  expect(screen.queryByTestId("mobile-bottom-tab-voice")).toBeNull();
});

it("okunmamış DM varsa mesajlar sekmesinde nokta gösterir", () => {
  render(<Harness directMessageUnreadCount={3} />);
  expect(screen.getByTestId("mobile-tab-messages-unread-dot")).toBeTruthy();
});
```

- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: `FloatingNavigationChrome` ile tab bar'ı yeniden yaz.** Yapı:
  - Chrome flow içinde tam mini-bar+tab yüksekliğini `onLayout` ile ölçer ve React Navigation'a tek bottom inset olarak bildirir; tab-root ekranlar kopya `100/+60` padding eklemez. Görsel kart `marginHorizontal:16`, `marginBottom:max(insets.bottom,18)` ile yüzer.
  - Kart: `borderRadius:26, padding:8, backgroundColor:theme.surface.card, borderWidth:1, borderColor:theme.border.subtle, flexDirection:"row"` + light gölge `theme.elevation.card`.
  - Sekme butonu: `flex:1, minHeight:44`; aktif: `backgroundColor:theme.accent.soft, borderRadius:18`; ikon `MobileLineIcon` (sekme başına: overview=`hash` yerine HTML'deki sunucu ikonu — HTML `#1a` tab bar SVG'lerinden AYNEN al), aktif renk `theme.accent.default`, pasif `theme.text.soft`; etiket aktifken `fontFamilyBold` + `theme.accent.default`, pasifken `theme.text.soft`.
  - Etiketler `mobile-copy`: `tabServers` ("Sunucular"), `tabMessages`, `tabNotifications`, `tabProfile` — `tabServers` ve gerekliyse diğerlerini `mobile-copy.ts`'e ekle (tr+en).
  - Kırmızı nokta: `width:8, height:8, borderRadius:4, backgroundColor:theme.status.danger`, ikonun sağ üstünde `position:absolute`, `testID="mobile-tab-messages-unread-dot"`, yalnız `directMessageUnreadCount > 0` iken.
  - Haptik: sekme basışında `expo-haptics` hafif darbe — mevcut `mobile-haptics-provider.tsx` API'sini kullan (dosyayı oku, mevcut deseni uygula).
  - Erişilebilirlik: mevcut `accessibilityRole="tab"` + `accessibilityState` korunur.
- [ ] **Step 4:** Test → PASS; `corepack pnpm --filter @wizards/mobile typecheck` → PASS.
- [ ] **Step 5: Görsel doğrulama döngüsü** (`#1a` alt bölge + `screenshots/1a-sunucular.png`), açık+koyu.
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): floating pill tab bar per redesign"`

### Task 9: MiniVoiceBar

**Referans:** HTML `#1a` (mini çubuk mock'ta 1a'da görünür) + README 1a bölümü: koyu `#1E2235` yüzer kart, tab bar'ın **12px üstünde**; yeşil nokta + kanal adı (13.5/700 beyaz) + "Sese bağlısın · {sunucu}" (11.5) + mikrofon toggle (36px, %12 beyaz zemin `rgba(255,255,255,.12)`) + kırmızı ayrıl (36px). Dokun → `VoiceRoom` tam ekran.

**Files:**

- Create: `apps/mobile/src/voice/mobile-mini-voice-bar.tsx`
- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx` (tab bar kartının üstüne yerleştirme)
- Test: `apps/mobile/component-tests/mobile-mini-voice-bar.test.tsx`

- [ ] **Step 1: Önce başarısız test:**

```tsx
it("sese bağlı değilken render olmaz", () => {
  render(
    <MobileMiniVoiceBar
      roomState={idleRoomState}
      onToggleMute={jest.fn()}
      onLeave={jest.fn()}
      onOpen={jest.fn()}
      serverName={null}
    />,
  );
  expect(screen.queryByTestId("mobile-mini-voice-bar")).toBeNull();
});

it("bağlıyken kanal adını gösterir, mute ve ayrıl aksiyonlarını iletir", () => {
  const onToggleMute = jest.fn();
  const onLeave = jest.fn();
  render(
    <MobileMiniVoiceBar
      roomState={connectedRoomState}
      onToggleMute={onToggleMute}
      onLeave={onLeave}
      onOpen={jest.fn()}
      serverName="Takım"
    />,
  );
  expect(screen.getByText(connectedRoomState.channelName!)).toBeTruthy();
  fireEvent.press(screen.getByTestId("mobile-mini-voice-mute"));
  expect(onToggleMute).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("mobile-mini-voice-leave"));
  expect(onLeave).toHaveBeenCalled();
});
```

(`idleRoomState`/`connectedRoomState`: `createInitialMobileVoiceRoomState()` tabanlı; `mobile-voice-room-contract.ts`'ten import.)

- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Bileşen.** Saf props alır (test edilebilirlik):

```tsx
interface MobileMiniVoiceBarProps {
  readonly roomState: MobileVoiceRoomState;
  readonly serverName: string | null;
  readonly onOpen: () => void; // navigate("VoiceRoom")
  readonly onToggleMute: () => void;
  readonly onLeave: () => void;
}
```

- Görünürlük yalnız `isVoiceSessionActive(roomState)` ile; predicate tam olarak `connecting | connected | reconnecting` kabul eder, permission-denied/failed/leaving/idle durumlarını reddeder.
- Stil: `backgroundColor: theme.surface.inverse, borderRadius: 18, padding: 10 14` — kesin değerleri HTML `#1a` mini çubuk bloğundan oku; alt metin: `copy.voiceConnectedTo` şablonu ("Sese bağlısın · {server}").
- Mikrofon ikonu: `roomState.selfMuted ? "mic-off" : "mic"`; ayrıl butonu `theme.status.danger` zemin.
- Haptik: mikrofon toggle + ayrılmada.
- [ ] **Step 4: Yerleşim:** `FloatingNavigationChrome` içinde tab kartının üstünde `marginBottom:12` ile render et. `useMobileVoiceRuntime()` room/toggle/leave sağlar; sunucu adı `mobile-server-directory` cache'inden stable server ID ile seçilir ve yoksa erişilebilir bounded fallback kullanılır. Mini mikrofon voice-activation modunda mute toggle, push-to-talk modunda press-in/press-out konuşma semantiğini kullanır.
  - `onOpen`: `mobileNavigationRef.navigate("VoiceRoom")` (`mobile-navigation-ref.ts` mevcut).
  - `VoiceRoom` ekranı açıkken mini çubuk zaten görünmez (root-stack ekranı tab bar'ı örter).
- [ ] **Step 5:** Test → PASS; typecheck → PASS.
- [ ] **Step 6: Cihazda akış doğrulaması:** sesli kanala katıl → mini çubuk tüm 4 sekmede görünür; mikrofon toggle anında; ayrıl → çubuk kaybolur; dokun → tam ekran açılır.
- [ ] **Step 7: Commit** — `git commit -m "feat(mobile): persistent mini voice bar above tab bar"`

### Task 10: Maestro testID sözleşmesi ve akışları

**Files:**

- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`
- Modify: `.maestro/whispr-mobile-smoke.yml`, `.maestro/phase*.yml`, `.maestro/helpers/login-uat.yml` (voice sekmesine dokunan adımlar)

- [ ] **Step 1:** Sözleşme testini oku; `mobile-bottom-tab-voice` beklentisini çıkar, yeni testID'leri ekle: `mobile-mini-voice-bar`, `mobile-mini-voice-mute`, `mobile-mini-voice-leave`, `mobile-tab-messages-unread-dot`, (ekran fazlarında eklenecekler için yer: `mobile-server-switcher-*`, `mobile-status-selector` vb. kendi task'larında eklenir).
- [ ] **Step 2:** `.maestro/` akışlarında `mobile-bottom-tab-voice` tıklamalarını yeni akışa çevir: sesli kanal satırı → katıl onayı → tam ekran; veya mini çubuğa dokunma.
- [ ] **Step 3:** `corepack pnpm --filter @wizards/mobile test` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "test(mobile): update maestro flows and testid contract for four-tab nav"`

---

## FAZ 2 — ORTAK BİLEŞEN KİTİ

> İlke (README önerisi 2): Bu bileşenler tek yerde tanımlanır ve HER ekranda aynı ölçülerle kullanılır. Ekranlar kendi avatar/rozet/satır stilini yazamaz.

### Task 11: Avatar — squircle + çevrimiçi noktası

**Files:**

- Modify: `apps/mobile/src/app/components/kit/avatar.tsx`
- Create: `apps/mobile/component-tests/mobile-avatar-redesign.test.tsx`

- [ ] **Step 1:** Mevcut `avatar.tsx`'i oku; API'sini koruyarak genişlet:

```tsx
interface AvatarProps {
  readonly id: string; // renk türetimi için (kullanıcı/sunucu id)
  readonly name: string; // baş harfler
  readonly locale: "tr" | "en";
  readonly imageUrl?: string | null;
  readonly size?: 36 | 40 | 44 | 50 | 76; // squircle radius eşlemesi tokens'tan
  readonly presence?: "online" | "idle" | "dnd" | "invisible" | null; // nokta
  readonly presenceSurfaceColor?: string; // nokta kenarlığının zemin rengi (kart/base)
}
```

- Squircle: `borderRadius = mobileSizing.avatar{S|M|L|XL|XXL}Radius` eşlemesi; DAİRE YOK.
- Baş harfler: `getMobileAvatarInitials(name, locale)`, renk `getMobileAvatarTint(id, theme)`.
- Görsel varsa `expo-image` (`mobile-cached-image.tsx` mevcut deseni) ile.
- Çevrimiçi noktası: 14px yeşil (`theme.status.success`), `borderWidth:2.5, borderColor:presenceSurfaceColor ?? theme.surface.card`, sağ-alt köşe (`position:absolute, right:-2, bottom:-2` — kesin ofseti HTML `#1c` konuşma satırından oku).
- [ ] **Step 2:** Tüm mevcut Avatar tüketicilerini yeni API'ye geçir (`rg -n "kit/avatar" apps/mobile/src`).
- [ ] **Step 3:** typecheck + component testleri → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): squircle avatar with presence dot and deterministic tint"`

### Task 12: UnreadBadge + kategori başlığı + segment chip + ayar satırı

**Files:**

- Modify: `apps/mobile/src/app/components/kit/badge.tsx` — `UnreadBadge`: `minHeight:20, minWidth:20, borderRadius:999, backgroundColor:theme.accent.default, paddingHorizontal:6`, metin beyaz `fontFamilyBold` 12px; 99+ kısaltması.
- Create: `apps/mobile/src/app/components/kit/segment-chips.tsx` — `SegmentChips`: yatay chip dizisi; aktif chip `backgroundColor:theme.surface.inverse, color:#fff`; pasif `theme.surface.card` + kenarlık; sayaç eki ("İstekler ·2" — sayaç `theme.accent.strong` renkli, ayrı Text). Kesin padding/radius HTML `#1c` segment bloğundan.
- Create: `apps/mobile/src/app/components/kit/settings-row.tsx` — `SettingsRow`: 38px renkli ikon kutusu (`borderRadius:12`, tint çifti prop'u) + etiket 15/600 + sağda değer metni ve/veya chevron + `minHeight:44`, `paddingVertical:11`, altta ince ayraç (`theme.border.default` hairline). Varyant: `destructive` (kırmızı ikon kutusu + kırmızı 700 metin).
- Modify: `apps/mobile/src/app/components/kit/list-row.tsx` — kategori başlığı için `SectionHeader` ekle (11.5/700, letterSpacing 1.38, `theme.text.soft`, sağda opsiyonel collapse chevron'u, `accessibilityRole="button"`).
- Create: `apps/mobile/component-tests/mobile-redesign-kit.test.tsx`

- [ ] **Step 1:** Her bileşeni HTML'deki karşılığından ölçülerle yaz (yukarıda özetlendi; tereddütte HTML).
- [ ] **Step 2:** Mevcut `badge.tsx` tüketicilerini güncelle.
- [ ] **Step 3:** typecheck + testler → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): shared kit components for redesign (badge, chips, rows, headers)"`

### Task 13: BottomSheet ve Skeleton güncellemesi

**Files:**

- Modify: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
- Modify: `apps/mobile/src/app/components/kit/skeleton.tsx`
- Modify: `apps/mobile/component-tests/mobile-redesign-kit.test.tsx`

- [ ] **Step 1: BottomSheet:** generic mevcut davranışı değiştirme; yalnız `variant="redesign"` üst radius 36, 44×5 handle, dark overlay `rgba(0,0,0,.55)` ve motion açıksa sabit 280ms ease-out kullanır. Reduced motion statik açılır. Destructive/management sheet'leri default varyantta kalır ve regresyon testleri yeşil olmalıdır.
- [ ] **Step 2: Skeleton:** parlama (shimmer) animasyonu `theme.surface.soft` üzerinde; **gerçek satır geometrisi** prop'ları: `ChannelRowSkeleton` (36 ikon + 2 satır metin), `ConversationRowSkeleton` (50 avatar + 2 satır), `NotificationRowSkeleton`, `MessageSkeleton`. Ölçüler ilgili gerçek satır bileşenlerinin sabitlerinden türetilir (yükleme sırasında zıplama olmaması kabul kriteri).
- [ ] **Step 3:** typecheck + görsel kontrol (bir sheet aç, bir listeye loading durumu zorla).
- [ ] **Step 4: Commit** — `git commit -m "feat(mobile): redesign bottom sheet chrome and geometry-true skeletons"`

---

## FAZ 3 — EKRANLAR

> Ortak kurallar: (a) kesin yatay padding HTML anchor'ından alınır, (b) tab-root alt rezervini yalnız ölçülen `FloatingNavigationChrome` sağlar; detail composer/footer ve sheet kendi safe-area formülünü uygular, (c) büyük listeler FlashList ve stable props/callback kullanır, (d) tüm yeni string'ler `mobile-copy.ts` tr+en, (e) mevcut testID'ler korunur veya atomik contract migration ile değiştirilir, (f) her ekran görevi light/dark component/style manifest testini çalıştırır.

### Task 14: 1a — Sunucular (ana ekran)

**Referans:** HTML `#1a` (+koyu `#1i`), `screenshots/1a-sunucular.png`. README 1a bölümü.

**Files:**

- Modify: `apps/mobile/src/app/screens/home-screen.tsx`, `home-screen.styles.ts`
- Modify: `apps/mobile/src/app/screens/workspace-channel-section-list.tsx`
- Modify: `apps/mobile/src/app/screens/workspace-browser.tsx` (rail chrome kaldırılır; mevcut channel search/collapse behavior korunur)
- Create: `apps/mobile/component-tests/mobile-redesign-servers.test.tsx`

**Veri bağlama (`MobileOverviewScreenProps` — mobile-product-app.tsx:243-294):**
| UI öğesi | Kaynak |
|---|---|
| Sunucu adı, üye/kanal sayısı, avatar | A4 `mobile-server-directory` ve aktif workspace detail query |
| Kanal listesi + kategoriler | A4 paginated `mobile-channel-directory` query; bütün page state'leri korunur |
| Son mesaj önizlemesi, okunmamış rozeti | A4 sanitized preview/read revision cache + typed realtime registry |
| Sesli kanal canlı durumu ("N kişi konuşuyor", avatar yığını) | A5 LiveKit-confirmed bounded voice-state query/watch; başka kanal için `voiceRoomState` okumak yasaktır |
| Kanal seç | `onOpenWorkspaceChannel` → `ChannelChat` rotası |
| Sesli kanala katıl | mevcut katılma onayı akışı (`handleOpenWorkspaceChannel`/voice join yolu — mikrofon izni BURADA istenir, mevcut davranış) |
| Davet butonu | mevcut davet akışı (`onSendVoiceInvite` değil — sunucu davet akışını `mobile-server-management-*` içinde bul) |
| Sunucu kartına dokun | Task 15'teki sheet'i aç |

- [ ] **Step 1:** İlgili mevcut dosyaları tamamen oku (`home-screen.tsx`, `workspace-channel-section-list.tsx`, `home-screen.styles.ts`).
- [ ] **Step 2: Üst başlık kartı:** beyaz kart radius 22, 44px squircle sunucu avatarı (lavanta zemin, baş harfler `getMobileAvatarInitials`), ad 17/800, altında "X üye · Y kanal" 12.5 ikincil (`copy.serverMetaSummary` şablonu: `"{members} üye · {channels} kanal"`), sağda chevron; yanında 46×46 davet butonu (`invite-user` ikonu, beyaz kart, kenarlık). Kesin padding'ler HTML `#1a` satır 47-58'deki inline değerlerden.
- [ ] **Step 3: Arama girişi:** mevcut `workspace-browser.tsx` içindeki `channelQuery` local filter'ını ve `isSearchingChannels` davranışını koru; radius/placeholder rengi HTML'den gelir, no-result copy mevcut locale key'den gelir.
- [ ] **Step 4: Kanal listesi:** mevcut server-scoped `collapsedSectionIds` state'ini koruyan `SectionHeader`; arama sırasında collapse disabled kalır:
  - Yazı kanalı satırı: 36px squircle `#` kutusu; ad 15/600; altında "Gönderen: mesaj" tek satır ellipsis (`copy` şablonu); sağda `UnreadBadge`. Seçili/okunmamış: lavanta zemin + `accent.softBorder` kenarlık + indigo ad.
  - Sesli kanal satırı: 36px `theme.status.successSoft` zeminli squircle hoparlör; altında canlı durum "N kişi konuşuyor" (`copy.voiceChannelLiveCount`, `successText` 600) yalnız katılımcı varsa; sağda üst üste binen 24px avatarlar (`marginLeft:-8`).
- [ ] **Step 5: Boş durum:** sunucu yoksa `empty-state.tsx` ile "Sunucu kur / davetle katıl" CTA'ları → Task 15'teki katıl/kur sheet'i.
- [ ] **Step 6: Loading:** `ChannelRowSkeleton` listesi; **Error/offline:** üstte ince uyarı bandı + yeniden dene (`mobile-offline-banner.tsx` mevcut — yeni tasarıma stillendir, tüm ekranlarda aynı bileşen).
- [ ] **Step 7:** Mevcut component testlerini güncelle/ekle: kategori collapse davranışı, okunmamış satır stili (`toHaveStyle` yerine testID + snapshot değil, davranış assertion'ları).
- [ ] **Step 8:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-servers.test.tsx component-tests/mobile-server-create-join.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 9: Görsel doğrulama döngüsü** (1a + 1i koyu).
- [ ] **Step 10: Commit** — `git commit -m "feat(mobile): redesign servers home screen (1a)"`

### Task 15: 1g — Sunucu değiştirici bottom sheet

**Referans:** HTML `#1g`, `screenshots/1g-sunucu-sheet.png`.

**Files:**

- Create: `apps/mobile/src/workspace/mobile-server-switcher-sheet.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.tsx` (başlık kartı → sheet açar)
- Test: `apps/mobile/component-tests/mobile-server-switcher-sheet.test.tsx`

**Veri bağlama:** A4'ün eksiksiz paginated server query'si; aktif sunucu `selectedWorkspaceServerId`; seçim `onOpenWorkspaceServer(serverId)`; member/channel/unread/mention sayıları authoritative summary'den; initial/refresh/next/error/end/stale-cursor UI A7 state machine'inden. "Katıl / Kur" ve "Yeni sunucu" mevcut `mobile-server-create-join-sheet.tsx` akışını açar.

- [ ] **Step 1: Önce başarısız test:** gerçek-şekilli sahte bootstrap payload'ı ile (test fixture'ı `MobileBootstrapPayloadSchema`'ya uygun) sheet render → sunucu adları listede, aktif sunucuda check işareti testID'si, satıra basınca `onSelectServer` çağrılır.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Bileşen:** `kit/bottom-sheet.tsx` üzerine: başlık "Sunucuların" 19/800 + sağda lavanta "Katıl / Kur" chip'i; satır: 52px squircle avatar (gerçek ikon yoksa baş harf + `getMobileAvatarTint(serverId)`), ad 15.5, "N üye · M kanal"; aktif satır lavanta zemin + indigo check; diğerlerinde `UnreadBadge`; en altta kesikli kenarlıklı "Yeni sunucu" satırı (`borderStyle:"dashed"`). Seçimde: `onOpenWorkspaceServer` → sheet kapanır (kanal listesi zaten yenilenir).
- [ ] **Step 4:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-server-switcher-sheet.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 5:** testID sözleşmesine ekle: `mobile-server-switcher-sheet`, `mobile-server-switcher-row-<id>` deseni sözleşme testinin desenine göre.
- [ ] **Step 6: Görsel doğrulama döngüsü** (1g).
- [ ] **Step 7: Commit** — `git commit -m "feat(mobile): server switcher bottom sheet (1g)"`

### Task 16: 1b — Kanal sohbet

**Referans:** HTML `#1b` (+koyu `#1j`), `screenshots/1b-kanal-sohbet.png`.

**Files:**

- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`
- Modify: `apps/mobile/src/app/components/message-primitives.tsx` (balon, tarih ayracı, reply bloğu, tepki chip'leri)
- Modify: `apps/mobile/src/app/composer/mobile-composer.tsx`
- Modify: `apps/mobile/src/app/components/message-emoji-picker.tsx`, `apps/mobile/src/app/components/media-primitives.tsx`
- Create: `apps/mobile/component-tests/mobile-redesign-channel.test.tsx`

**Veri bağlama (`MobileOverviewScreenProps`):** mesajlar `channelMessagesState`; gönderme `onSendChannelMessage` (+`channelSendState`, optimistic update mevcutsa koru); tepki `onToggleMessageReaction`; düzenle/sil `onEditMessage`/`onDeleteMessage`; yazıyor `channelTypingLabel`; üye/çevrimiçi sayıları `workspaceServerState`; medya `mediaState` + picker handler'ları; arama `onSearchMessages`.

- [ ] **Step 1:** Mevcut `channel-screen.tsx` + `message-primitives.tsx` + `mobile-composer.tsx`'i oku.
- [ ] **Step 2: Başlık çubuğu:** alt kenarlıklı; geri oku (navigation.goBack), 38px `#` squircle, kanal adı 16.5/800 + "N üye · M çevrimiçi" (`copy.channelHeaderMeta`), sağda 38px arama ve üye listesi butonları (üye listesi → mevcut `ServerMembers` rotası).
- [ ] **Step 3: Mesaj akışı** (FlashList, mevcut liste yapısı korunur):
  - Tarih ayracı: aktif ürün locale'i ile `Intl.DateTimeFormat` kullanan saf formatter; bugün/dün locale key'leri, diğer tarihler locale-aware uppercase olur.
  - Mesaj author DTO/mapper'ına access-safe `isServerOwner` ekle; gerçek true değerinde exact crown SVG görünür, aksi halde görünmez.
  - Balon: `theme.surface.card`, radius `6 18 18 18`; saf grouping helper aynı author + zaman farkı ≤5 dakika için sonraki balonu 18 yapar ve boundary testleri vardır.
  - Link: `theme.accent.default` + altı çizili (mevcut `mobile-link-preview-card.tsx` korunur).
  - Reply bloğu: balon içi üstte lavanta zemin, 3px indigo sol çizgi, yazar 11.5/700 indigo, alıntı 12 tek satır.
  - Tepkiler: balon altı chip'ler (lavanta zemin, emoji + sayı 12/700 indigo); uzun basma menüsü (yanıtla/tepki/kopyala/sil) mevcut `context-menu.tsx` ile korunur.
  - Yazıyor: 18px mini avatar + italik 12, `channelTypingLabel`.
- [ ] **Step 4: Composer:** 44px `+` (mevcut ek/medya menüsü), input hap radius 22 + `copy.composerPlaceholder` ("Bir mesaj gönder…") + içinde sağda emoji ve mikrofon ikonları, 44px indigo gönder FAB (`theme.elevation.soft` gölgesi). Mevcut gönderme/medya davranışları AYNEN korunur.
- [ ] **Step 5: Boş kanal:** "İlk mesajı sen gönder" empty-state; **loading:** MessageSkeleton; **error:** uyarı bandı.
- [ ] **Step 6:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-channel.test.tsx component-tests/mobile-message-loading-skeleton.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 7: Görsel doğrulama döngüsü** (1b + 1j koyu).
- [ ] **Step 8: Commit** — `git commit -m "feat(mobile): redesign channel chat screen (1b)"`

### Task 17: 1c — Mesajlar (DM)

**Referans:** HTML `#1c`, `screenshots/1c-mesajlar.png`.

**Files:**

- Modify: `apps/mobile/src/app/screens/dm-screen.tsx`, `dm-screen.styles.ts`
- Modify: `apps/mobile/src/social/friends-hub.tsx` (Arkadaşlar/İstekler segment içerikleri)
- Create: `apps/mobile/component-tests/mobile-redesign-messages.test.tsx`

**Veri bağlama (`MobileMessagesScreenProps`):** konuşmalar A3/A7 paginated DM query + row/aggregate revision cache'inden; bootstrap'ın beş satırlık özeti yalnız ilk placeholder olabilir ve tam listenin kaynağı olamaz. Açma `onOpenConversation`; arkadaş/istek listeleri mevcut `mobile-social-query.ts`; yeni mesaj FAB mevcut kullanıcı seçici akışı.

- [ ] **Step 1:** `dm-screen.tsx` + `friends-hub.tsx`'i oku.
- [ ] **Step 2: Başlık:** "Mesajlar" 26/800 + alt açıklama; sağda 46px indigo FAB.
- [ ] **Step 3: `SegmentChips`:** Konuşmalar / Arkadaşlar / İstekler (·N sayaç). Segmentler GERÇEK: Arkadaşlar/İstekler friends-hub içeriğini bu ekranda gösterir (friends-hub'ı segment gövdesi olarak yeniden kullan).
- [ ] **Step 4: Konuşma satırı:** 50px Avatar + presence dot (grup DM'de nokta yerine grup mini-rozeti — HTML `#1c`'deki grup satırından ölç); ad 15/700; son mesaj 13 tek satır ("Sen: " öneki `copy.dmYouPrefix`); sağda zaman (okunmamışsa indigo/600) + `UnreadBadge`. **Okunmamış satır beyaz kart + kenarlık; okunmuş düz zemin.** Sıralama son mesaj zamanına göre (mevcut sıralamayı doğrula).
- [ ] **Step 5:** Arama ("Mesajlarda ara"), pull-to-refresh (`onRefreshBootstrap`), boş durum ("Henüz konuşma yok" + CTA), loading `ConversationRowSkeleton`, error bandı.
- [ ] **Step 6:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-messages.test.tsx component-tests/mobile-performance-surfaces.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 7: Görsel doğrulama döngüsü** (1c, açık+koyu).
- [ ] **Step 8: Commit** — `git commit -m "feat(mobile): redesign messages screen with segments (1c)"`

### Task 18: 1d — Bildirimler

**Referans:** HTML `#1d`, `screenshots/1d-bildirimler.png`.

**Files:**

- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.styles.ts`
- Create: `apps/mobile/component-tests/mobile-redesign-notifications.test.tsx`

**Veri bağlama (`MobileNotificationsScreenProps`):** izin durumu `notificationState.permissionStatus` + explicit `onRequestNotificationPermission`; akış A2/A7 paginated mobile feed; tekil/read-all mutation server watermark ve CAS rollback kullanır; satır hedefi typed allowlist üzerinden tap-time access recheck yapar.

- [ ] **Step 1:** Mevcut ekranı ve A2/A7 notification client/runtime'ını oku; feed, single-read, read-all ve typed target kontratlarını props'a bağla.
- [ ] **Step 2: Başlık:** "Bildirimler" 26/800 + açıklama; sağda gerçek server-watermark mutation'ına bağlı "Tümünü okundu say" 13/700 indigo.
- [ ] **Step 3: İzin kartı:** yalnız `permissionStatus` verilmemişken: lavanta kart, indigo zil ikon kutusu, başlık + "İzin yalnızca sen istediğinde sorulur." + "İzin ver" butonu → `onRequestNotificationPermission` (native akış). Verilince kart kaybolur (state zaten reaktif).
- [ ] **Step 4: Gruplu akış:** BUGÜN/DÜN/tarih başlıkları (`SectionHeader` düz varyant); satır türleri: mention (avatar + sağ-alt indigo `@` rozeti, kalın kullanıcı/kanal vurgulu metin, alıntı, "{sunucu} · {zaman}", okunmamışsa beyaz kart + indigo nokta), ses odası başladı (yeşil hoparlör + yeşil "Katıl" chip'i → sesli kanala katılma akışı), sunucuya katılım/tepki satırları. Mevcut bildirim tipleri neyse ONLAR render edilir — mock'taki tip seti sadece stil referansı.
- [ ] **Step 5:** Pull-to-refresh, boş durum ("Henüz gösterilecek bildirim yok."), loading skeleton, error bandı.
- [ ] **Step 6:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-notifications.test.tsx component-tests/mobile-screen-containers.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 7: Görsel doğrulama döngüsü** (1d).
- [ ] **Step 8: Commit** — `git commit -m "feat(mobile): redesign notifications screen (1d)"`

### Task 19: 1e — Aktif ses odası (tam ekran)

**Referans:** HTML `#1e`, `screenshots/1e-ses-odasi.png`. **Her iki temada da koyu** (`surface.inverse` zemin).

**Files:**

- Modify: `apps/mobile/src/app/screens/voice-screen.tsx`
- Modify: `apps/mobile/src/voice/mobile-voice-room-panel.tsx` (katılımcı grid'i buradaysa)
- Modify: `apps/mobile/src/voice/mobile-voice-settings-sheet.tsx` (secondary camera/share/input/noise/device controls burada korunur)
- Create: `apps/mobile/src/voice/mobile-voice-participant-grid.tsx`
- Create: `apps/mobile/component-tests/mobile-redesign-voice.test.tsx`

**Veri bağlama (`MobileVoiceScreenProps`):** generation-guarded `voiceRoomState` (channel/server, connecting/connected/reconnecting/recoverable-error/leaving, immutable-per-session `connectedAt`, participants speaking/muted, self mute ve audio devices), `onToggleVoiceMute`, PTT controller, `onLeaveVoiceChannel`, `onSelectVoiceAudioOutputDevice`, `onSendVoiceInvite`; süre yalnız `connectedAt`'ten hesaplanır. "Sohbete git" yalnız doğrulanmış ilgili text-channel intent'i varsa açılır; keyfi fallback kanal seçmez.

- [ ] **Step 1:** `voice-screen.tsx` + `mobile-voice-room-panel.tsx`'i oku.
- [ ] **Step 2: Başlık/back:** `isVoiceSessionActive` true ise minimize edip oda açık kalır. Recoverable error'da başarısız attempt/context temizlenip Servers'a dönülür; `leaving` sırasında bounded cleanup tamamlanmadan route kapanmaz. Başlık oda/sunucu/`connectedAt` süresi ve bağlantı chip'ini gösterir.
- [ ] **Step 3: Katılımcı grid'i:** 2 sütun ortalanmış; kart `rgba(255,255,255,.05)` radius 28; 80px squircle avatar; ad 15/700; durum 11.5. **Konuşan:** 2px yeşil kart kenarlığı + avatar halkası `0 0 0 6px rgba(52,211,153,.2)` (RN'de iç içe View halkası) + "Konuşuyor" yeşil — `participants[].speaking`/audioLevel alanından (kontrat alan adını `mobile-voice-room-contract.ts`'ten doğrula). **Sessizde:** kırmızı çapraz-mikrofon köşe rozeti + "Sessizde". Altta tam genişlik kesikli "Arkadaşlarını davet et" kartı → `onSendVoiceInvite` akışı (mevcut davet UI'ı).
- [ ] **Step 4: Kontroller:** 60px, radius 22: input-mode aware mikrofon/PTT, hoparlör-çıkış aygıtı, geçerli sohbete git, kırmızı ayrıl. Leave LiveKit + heartbeat + projection cleanup'ını tamamlar, sonra generation-bound route'u kapatır; success haptic yalnız tamamlanan aksiyonda çalışır.
- [ ] **Step 5: Alt bilgi satırı:** "Mikrofon izni yalnızca sen katılınca istenir" (`copy`).
- [ ] **Step 6:** Kamera/ekran paylaşımı gibi MEVCUT yetenekler kaybolmayacak — mock'ta görünmeyen mevcut kontrolleri `mobile-voice-settings-sheet` içine taşı (işlev kaybı yasak; görsel hiyerarşi mock'a uyar).
- [ ] **Step 7:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-voice.test.tsx component-tests/voice-screen-components.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 8: Cihaz akış testi:** katıl → konuşma halkaları gerçek speaking eventleriyle; minimize → mini çubuk; geri dön; ayrıl.
- [ ] **Step 9: Görsel doğrulama döngüsü** (1e — tek tema, koyu).
- [ ] **Step 10: Commit** — `git commit -m "feat(mobile): redesign full-screen voice room (1e)"`

### Task 20: 1f — Profil & Ayarlar

**Referans:** HTML `#1f`, `screenshots/1f-profil.png`.

**Files:**

- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/social/social-account-screens.tsx`, `apps/mobile/src/social/mobile-profile-avatar-editor.tsx`
- Create: `apps/mobile/component-tests/mobile-redesign-profile.test.tsx`

**Veri bağlama (`MobileSettingsScreenProps` + `useMobileAuth`):** kullanıcı `session.user`; Düzenle → `ProfileEdit`; durum seçici mevcut gerçek `updatePresence` mutation'ını kullanır ve failure'da önceki seçimi korur; read-only fallback yoktur. Güvenli oturum gerçek auth status'tan; Görünüm `useThemePreference`; Bildirimler/Language mevcut detail route'lardan; Hakkında build metadata/runtime config'ten; Çıkış mevcut destructive confirmation'dan gelir.

- [ ] **Step 1:** `settings-screen.tsx`'i oku (büyük dosya — bölümlerini haritala; mevcut işlevlerden hiçbiri kaybolmayacak: app lock, izin özetleri, sosyal ayarlar vb. mock'taki "Hesap/Güvenli oturum/Bildirimler" detay ekranlarına dağıtılır).
- [ ] **Step 2: Kimlik kartı:** 72px indigo banner (`accent.default`), üstüne bindirilmiş 76px squircle avatar (4px `surface.card` kenarlık) + presence dot; sağda "Düzenle" chip'i; ad 19/800 + @kullanıcıadı 13; altında durum seçici satırı (yeşil nokta + "Çevrimiçi" + chevron) → durum seçim sheet'i (Çevrimiçi/Boşta/Rahatsız etmeyin/Görünmez).
- [ ] **Step 3: Ayar kartı 1** (`SettingsRow` ×5): Hesap / Güvenli oturum (yeşil "Aktif" rozeti) / Görünüm (sağda tema adı) / Bildirimler / Dil (sağda seçili dil). Kart 2: Hakkında (sürüm string'i) / Çıkış yap (destructive).
- [ ] **Step 4:** Alt rezerv yalnız `FloatingNavigationChrome` ölçümünden gelir; sabit `100` padding eklenmez.
- [ ] **Step 5:** `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-redesign-profile.test.tsx component-tests/profile-settings-screen.test.tsx component-tests/mobile-destructive-confirmation.test.tsx --runInBand` ve typecheck → PASS.
- [ ] **Step 6: Görsel doğrulama döngüsü** (1f, açık+koyu).
- [ ] **Step 7: Commit** — `git commit -m "feat(mobile): redesign profile and settings screen (1f)"`

---

## FAZ 4 — DURUMLAR, ETKİLEŞİM CİLASI, i18n

### Task 21: Hata/çevrimdışı bandı ve websocket durumu

**Files:**

- Modify: `apps/mobile/src/app/components/mobile-offline-banner.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.tsx`, `channel-screen.tsx`, `dm-screen.tsx`, `notifications-screen.tsx`, `voice-screen.tsx`, `settings-screen.tsx`
- Create: `apps/mobile/component-tests/mobile-redesign-screen-state-matrix.test.tsx`

- [ ] **Step 1:** Banner 44pt minimum, `onStatus` kontrast rolü, 2.0 scale'de büyüyen/wrapping metin ve gerekirse alta stack olan 44pt retry action kullanır; websocket koptuğunda typed registry stale/reconnect durumunu gösterir.
- [ ] **Step 2:** `mobile-redesign-screen-state-matrix.test.tsx` loading/empty/error/offline/reconnecting ve dört liste için initial/refresh/next/error/end/stale-cursor davranışını doğrular; focused Jest command PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(mobile): unified offline/error banner with reconnect state"`

### Task 22: Haptik + animasyon + erişilebilirlik denetimi

**Files:**

- Create: `apps/mobile/component-tests/mobile-redesign-accessibility.test.tsx`
- Modify: `apps/mobile/scripts/validate-mobile-quality.ts`
- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx`, `apps/mobile/src/voice/mobile-mini-voice-bar.tsx`, `apps/mobile/src/app/components/kit/bottom-sheet.tsx`, `apps/mobile/src/app/components/mobile-offline-banner.tsx`, and 1a-1g screen files

- [ ] **Step 1: Haptik contract testi:** tamamlanan sekme geçişi, microphone/PTT action ve leave tam bir light haptic üretir; disabled/rejected/failed/no-op sıfır success haptic üretir. Implementation yalnız `mobile-haptics-provider` üzerinden çağrılır.
- [ ] **Step 2: Animasyonlar:** redesign sheet 280ms ease-out; tüm animasyonlar `useReducedMotion` true iken statik; loading shimmer da statik base frame olur.
- [ ] **Step 3: Erişilebilirlik denetimi:** 2.0 font scale'de unique control/status truncation yok; tüm icon action label/role/state/hint taşır; touch target ≥44pt; modal focus heading'e taşınır, trap edilir ve dismiss'te invoker'a döner; bounded live-region ve visual/screen-reader order test edilir; bütün role/context renkleri WCAG gate'inden geçer.
- [ ] **Step 4:** focused accessibility Jest test, `corepack pnpm --filter @wizards/mobile quality:check`, and mobile typecheck → PASS.
- [ ] **Step 5: Commit** — `git commit -m "chore(mobile): haptics, motion and accessibility pass for redesign"`

### Task 23: i18n tamamlama

- [ ] **Step 1:** `rg -n '"[A-ZÇĞİÖŞÜ][a-zçğıöşü]' apps/mobile/src -g '*.tsx'` taramasıyla koda sızmış literal Türkçe metin kalmadığını doğrula; hepsi `mobile-copy.ts`'e tr+en key parity ile taşınır.
- [ ] **Step 2:** `mobile-locale-preferences.test.ts`, locale key-parity contract ve 1a-1g long-copy 2.0-scale component testi → PASS.
- [ ] **Step 3: Commit** — `git commit -m "chore(mobile): complete tr/en copy for redesign"`

---

## FAZ 5 — KABUL

### Task 24: Deterministic reference renderer and native visual gate

**Files:**

- Create: `apps/mobile/capture-environment.json`
- Create: `apps/mobile/scripts/mobile-redesign-reference.ts`
- Create: `apps/mobile/scripts/mobile-redesign-capture.ts`
- Create: `apps/mobile/scripts/mobile-redesign-diff.ts`
- Create: `apps/mobile/scripts/mobile-redesign-acceptance.ts`
- Create: `apps/mobile/scripts/mobile-redesign-visual-contract.test.ts`
- Create: `apps/mobile/src/visual-testing/mobile-visual-test-contract.ts`
- Create: `apps/mobile/src/visual-testing/mobile-reference-metrics-provider.tsx`
- Create: `apps/mobile/src/visual-testing/mobile-visual-readiness.ts`
- Create: `apps/mobile/visual-baselines/whispr-redesign/{reference-map.json,theme-transform.json,masks.json}`
- Create: `.github/workflows/mobile-redesign-ios-acceptance.yml`
- Modify: `apps/mobile/package.json`, `apps/mobile/app.config.js`, `apps/mobile/eas.json`, environment contract, `.gitignore`, `.maestro/phase*.yml`

- [ ] **Step 1: Write failing visual contract test** for exact script names, 390×844/1170×2532, DPR 3, 480dpi Android, allowed masks only, vendored font hashes, normalized light/dark mapping, release-build exclusion, `capture-environment.json` fields, and no update-on-verify behavior.
- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-visual-contract.test.ts
```

- [ ] **Step 3: Add exact-pinned renderer dependencies and scripts**

```powershell
corepack pnpm --filter @wizards/mobile add -D -E @playwright/test@1.59.1 pixelmatch@7.1.0 sharp@0.34.5 ssim.js@3.5.0
```

Package scripts: `visual:reference:verify`, `visual:capture:android`, `visual:capture:ios`, `acceptance:dispatch:ios`, `visual:diff`, `visual:verify`, `maestro:phase:all`, `realtime:acceptance:two-client`, `device:matrix:smoke`, `acceptance:run`.

- [ ] **Step 4: Implement HTML renderer** — block remote fonts/network, load the same vendored TTFs, capture direct 390×844 anchor at DPR 3, export computed-style manifest, raw 1i/1j evidence, normalized dark composites, fail on unmapped color/selector/hash/geometry.
- [ ] **Step 5: Implement native readiness and capture** — UAT-only metrics/clock/measurement bridge; release/store builds reject it. Dedicated allowlisted UAT tenant is prepared server-side through real services. Two real clients join in manifest order; client 1 emits deterministic audio, client 2 mutes through production control; speaking/mute/identity-slot barriers must settle before capture.
- [ ] **Step 6: Pin environments and diff policy** — probe exact Android API/system image/emulator/AVD/GPU and macOS/Xcode/iOS runtime/device/runner versions; mismatch fails. Apply spec thresholds and only versioned native glyph masks.
- [ ] **Step 7: Generate reviewed baselines, verify, commit**

```powershell
corepack pnpm --filter @wizards/mobile visual:reference:verify
corepack pnpm --filter @wizards/mobile visual:capture:android
corepack pnpm --filter @wizards/mobile visual:diff
corepack pnpm --filter @wizards/mobile acceptance:dispatch:ios
git add apps/mobile .github/workflows/mobile-redesign-ios-acceptance.yml pnpm-lock.yaml
git commit -m "test(mobile): add deterministic redesign visual acceptance"
```

### Task 25: Full acceptance, rollout safety, and handoff

- [ ] **Step 1: Fresh automated gates**

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web e2e:realtime
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm --filter @wizards/mobile maestro:phase:all
corepack pnpm --filter @wizards/mobile realtime:acceptance:two-client
corepack pnpm --filter @wizards/mobile device:matrix:smoke
corepack pnpm --filter @wizards/mobile visual:verify
corepack pnpm --filter @wizards/mobile acceptance:run
corepack pnpm audit --audit-level moderate
```

- [ ] **Step 2: README acceptance oracle** — exactly four tabs; protected/minimizable voice; no runtime dummy data; real cross-client message/presence/notification/unread/occupancy/speaking/mute updates; persisted system/light/dark; explicit-action permissions; ≥44pt targets; 2.0 dynamic type; 1a-1g normalized light/dark pixel evidence; 1h absent.
- [ ] **Step 3: Expand/enable rollout proof** — additive migration, compatible worker deployed/healthy before disabled producers, UAT signing secret/webhook and UAT-only flag, observation, then feed enablement. Rollback disables/unregisters producer first and drains jobs with compatible worker; production enablement is separate approval.
- [ ] **Step 4: Refresh graph and scoped diff**

```powershell
graphify update .
git diff --check
git status --short
```

- [ ] **Step 5: Final commit and branch handoff**

```powershell
git add apps/mobile apps/web packages .github .maestro graphify-out docs
git commit -m "feat(mobile): complete Whispr mobile redesign acceptance"
```

`superpowers:verification-before-completion`, `requesting-code-review`, ardından `finishing-a-development-branch` kullanılır; merge/push yalnız kullanıcı onayıyla yapılır.

---

## SELF-REVIEW NOTLARI (spec kapsama kontrolü)

| README bölümü                                               | Karşılayan task(lar)                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Kesin kurallar 1-6                                          | Global Constraints + A1-A7 + tüm ekran veri bağlama tabloları                                                          |
| Fidelity / referans dosyalar                                | Task 1-6 tasarım sistemi + Task 24 deterministic renderer/diff                                                         |
| Navigasyon mimarisi (4 sekme, rail kaldırma, mini çubuk)    | Task 7, 8, 9, 15                                                                                                       |
| Tasarım token'ları (açık/koyu/ölçüler)                      | Task 2, 3, 4                                                                                                           |
| 1a                                                          | Task 14 · 1b → 16 · 1c → 17 · 1d → 18 · 1e → 19 · 1f → 20 · 1g → 15 · 1i/1j → her ekranın koyu doğrulaması             |
| 1h sol rail                                                 | Bilinçli olarak uygulanmıyor (README önerisi 8: ilk sürümde yok, bayrak da eklenmiyor — YAGNI)                         |
| Gerçek API/realtime/read/pagination/voice                   | A1-A7 capability gate                                                                                                  |
| Etkileşim özeti                                             | Task 7-10 navigation/mini bar, Task 13 sheet, Task 14-20 screens                                                       |
| Durumlar (loading/empty/error/offline/reconnect/pagination) | A7, Task 13, her ekran task'ı, Task 21                                                                                 |
| Kabul kriterleri                                            | Task 24, 25                                                                                                            |
| Öneriler 1-7                                                | 1→Task 2-4; 2→Faz 2; 3→Task 13; 4→FlashList+Task 6; 5→Task 22; 6→Task 8/9/19/22; 7→Task 18 + mevcut deep-link provider |

**Bilinçli kapsam sınırları:** yalnız 1h/rail, query persistence/offline mutation replay, framework/database-engine upgrades ve unrelated web/desktop redesign kapsam dışıdır. README'deki görünür capability'lerden hiçbiri "API yok" gerekçesiyle çıkarılamaz; A1-A7 gerçek yolu üretir. Mikro ölçü, path ve inline renk için kanonik HTML okunur, tahmin yapılmaz.
