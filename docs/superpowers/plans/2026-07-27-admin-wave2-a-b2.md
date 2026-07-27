# Admin Dalga 2 — A Telemetri Omurgası + B2 Handoff Kabuğu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A: platform + sürüm boyutunu metriklere doğru ekle (geri dönüşsüz veri saati). B2: paneli handoff tasarımıyla gerçek rotalara taşı; ortak kit + 4 modül.

**Architecture:** A tek taşıyıcı tip (`ClientAttribution`) ile üç akışı (REST, socket, outbox) besler; eski `AppSession` verisi `attributionVerified` bayrağıyla kesilir. B2 `components/admin/kit/` altında handoff ölçülerini bir kez kurar; sayfalar bölünmüş snapshot yükleyicilerinden beslenir.

**Tech Stack:** Prisma 7 (`rebaseline-migrations`), Socket.IO handshake, Next.js App Router segmentleri, handoff kaynağı `design_handoff/design_handoff_admin_panel/` (`.dc.html` esas).

**Spec'ler:** `2026-07-26-admin-telemetry-backbone-design.md` (A), `2026-07-26-admin-panel-shell-design.md` §1-3 (B2), `2026-07-27-admin-design-handoff-implementation.md` (G — görsel otorite).

## Global Constraints

- Commit YOK (duran kural). TDD. `graphify update .` dalga sonunda.
- Migration dizini: `packages/db/prisma/rebaseline-migrations`.
- Görselde G kazanır: ölçüler G §1 tablosundan; sabit hex yalnızca avatar-gradient sabit dosyasında.
- Panel dili Türkçe; sayı biçimi `1.204` / `%4,2` / `4,21M`.
- A ve B2 farklı dosyalara dokunur — iki ayrı oturumda paralel koşulabilir; tek çakışma noktası `apps/web/src/lib/admin/dashboard.ts` (B2'nin; A dokunmaz).

---

## A — Telemetri (Görev 1-8)

### Task 1: Adım 0 — ölçüm (kod değişikliği yok)

**Files:** Create: `packages/db/scripts/audit-appsession-clienttype.mjs`

- [ ] Script: generated Prisma client ile son 7 gün `AppSession` `groupBy(clientType, deviceType)` + son 20 farklı `os/browser` çifti yazdırır.
- [ ] Koş; çıktıyı A spec'inin "Adım 0 sonucu" bölümüne yaz (spec dosyasına ekle). Gerçek mobil cihazdan bir istek at, sunucu logundan `user-agent` dizesini kaydet.
- [ ] Çıkarım yanlışlanırsa yalnızca `detectClientType` dal beklentisi değişir — plan geri kalanı geçerli (spec kararı).

### Task 2: Şema migration

**Files:** Modify `packages/db/prisma/schema.prisma` (`UserDailyMetric:438`, `AppSession:410`, `MediaUsageSession:461`); Create `rebaseline-migrations/<ts>_telemetry_platform_dims/migration.sql`

- [ ] Spec §1 şemasını birebir uygula: `UserDailyMetric.clientType @default(UNKNOWN)` + `appVersion VarChar(32)`; unique `[date,userId]` → `[date,userId,clientType]`; `@@index([date, clientType])`. `AppSession.appVersion` + `attributionVerified Boolean @default(false)` + `@@index([clientType, startedAt])`. `MediaUsageSession.clientType @default(UNKNOWN)`.
- [ ] SQL: `ALTER TABLE "UserDailyMetric" DROP CONSTRAINT "UserDailyMetric_date_userId_key";` → kolonlar → `CREATE UNIQUE INDEX "UserDailyMetric_date_userId_clientType_key" ...`. Mevcut satırlar default `UNKNOWN` alır — çakışma imkânsız (eski çiftler tekil).
- [ ] Test (db): migration sonrası aynı `(date,userId)` için `MOBILE` + `UNKNOWN` iki satır yazılabilmeli (spec test 2).
- [ ] `pnpm db:generate` + `pnpm --filter @wizards/db test` yeşil. Checkpoint.

### Task 3: `ClientAttribution` + client-info sürüm okuma

**Files:** Create `apps/web/src/lib/analytics/client-attribution.ts`; Modify `apps/web/src/lib/analytics/client-info.ts`; Test `client-attribution.test.ts` + mevcut `client-info.test.ts` genişletmesi

**Interfaces (Produces):**

```ts
export type ClientAttribution = { appVersion: string | null; clientType: AnalyticsClientType };
export const UNKNOWN_ATTRIBUTION: ClientAttribution; // { clientType: "UNKNOWN", appVersion: null }
export function toClientAttribution(info: AnalyticsClientInfo): ClientAttribution;
```

- [ ] Kırmızı testler: (a) `x-whispr-client-version: 0.8.15` → `appVersion "0.8.15"`; (b) desen dışı (`<img>`, 33+ karakter) → `null` (beyaz liste `^[0-9A-Za-z.\-+]{1,32}$`); (c) `x-whispr-client` varken UA tamamen yok sayılır; (d) başlıksız istekte mevcut UA davranışı bit-bit korunur (mevcut testler değişmeden geçer).
- [ ] `AnalyticsClientInfo`'ya `appVersion: string | null` alanı; `getAnalyticsClientInfo` başlığı okur.
- [ ] Yeşil. Checkpoint.

### Task 4: Oturum yolu + kesim bayrağı

**Files:** Modify `apps/web/src/lib/analytics/service.ts` (`incrementUserDailyMetric:80`, `startAppSession:135`, `endAppSession:204`, `incrementMetricAcrossInterval:123`); Modify `apps/web/src/lib/socket/server.ts:422` bölgesi; Test `service.test.ts` + tip testi `apps/web/scripts/analytics-attribution-typecheck.ts`

- [ ] `incrementUserDailyMetric(userId, increments, attribution: ClientAttribution, date?, client?)` — **zorunlu** parametre; upsert `where: { date_userId_clientType }`; `appVersion` update dalında üzerine yazılır ("o gün son görülen").
- [ ] Tip testi: attribution'sız çağrı `// @ts-expect-error` satırıyla sabitlenir (spec test 8) — dosya `pnpm --filter @wizards/web typecheck` kapsamında.
- [ ] `startAppSession`: `clientInfo`'dan attribution türet; `AppSession.appVersion` yaz; başlık kaynaklıysa (`x-whispr-client` mevcut) `attributionVerified: true`. `sessionCount` artışı attribution'la.
- [ ] `endAppSession`: select'e `clientType, appVersion, attributionVerified` ekle; `attributionVerified === false` ise metrik `UNKNOWN_ATTRIBUTION` ile yazılır (kesim politikası, spec test 9); gece bölmesi iki güne aynı attribution (spec test 1).
- [ ] Socket handshake: `socket.data.clientType/appVersion` sakla (`appSessionKey` yanına) — `startAppSession`'a geçir.
- [ ] Yeşil. Checkpoint.

### Task 5: Medya yolu

**Files:** Modify `apps/web/src/lib/voice/service.ts:900` bölgesi + `startMediaUsageSession/endMediaUsageSession` (`analytics/service.ts:259,300`); voice socket handler'ları (`apps/web/src/lib/socket/handlers/voice.ts`)

- [ ] `startMediaUsageSession` attribution parametresi alır → `MediaUsageSession.clientType` yazar; `endMediaUsageSession` satırdan okuyup günlük metriğe geçirir (spec test 7). Handler `socket.data`'dan geçirir.
- [ ] Yeşil. Checkpoint.

### Task 6: Outbox yolu

**Files:** Modify `apps/web/src/lib/outbox/service.ts:76` (şema) + `:374` (`processMessageCreatedAnalytics`); enqueue çağıranlar: `apps/web/src/lib/workspace/message-service.ts`, `apps/web/src/lib/dm/message-send-service.ts` (+ `grep -rn enqueueMessageCreatedAnalytics apps/web/src` ile tam liste — mobil route-logic'ler dahil)

- [ ] Şema: `clientType: z.enum(["WEB","DESKTOP","MOBILE","UNKNOWN"]).default("UNKNOWN")`, `appVersion: z.string().max(32).optional()`.
- [ ] Kırmızı test: alansız eski payload parse olur, `UNKNOWN` yazar (spec test 3 — deploy uyumluluğu).
- [ ] Enqueue tarafları `getAnalyticsClientInfo(request.headers)` → attribution payload'a koyar; işleyici `recordMessageCreated`'a geçirir.
- [ ] Yeşil. Checkpoint.

### Task 7: İstemci başlıkları

**Files:** Modify `apps/mobile/src/api/mobile-api-client.ts:138` bölgesi; Modify `apps/mobile/src/realtime/mobile-realtime-client.ts` (socket `extraHeaders`); Create `apps/mobile/src/api/mobile-client-headers.ts` (tek kaynak: `{ "x-whispr-client": "mobile", "x-whispr-client-version": <package.json version> }` — sürüm build sabitiyle gömülür, runtime `require` değil); Web: `apps/web/src/lib/socket/client` bağlantı opsiyonlarına aynı başlıklar (`WHISPR_CLIENT` build sabiti: Tauri global işareti varsa `desktop`, yoksa `web` — desktop tespiti mevcut `desktop_init_script` global'i üzerinden, uygulama sırasında `window.__WHISPR_DESKTOP*` adayları doğrulanır)

- [ ] Sözleşme testleri (mevcut `apps/mobile/scripts/mobile-*-contract.test.ts` deseni, spec test 6): REST header + socket extraHeaders gerçekten gönderiliyor.
- [ ] Web REST notu: tarayıcı UA'sı zaten `WEB` çözüyor; kritik istemci mobil. Desktop REST'i web kodundan geçtiği için socket + UA işareti yeterli; tam başlık F'de derinleşir.
- [ ] Mobil typecheck + testler: `pnpm --filter @wizards/mobile typecheck`; testler `apps/mobile` dizininden (tsx kök-dizin tuzağı — memory).
- [ ] Checkpoint.

### Task 8: Raporlama kesimi + gizlilik

**Files:** Modify `apps/web/src/lib/admin/dashboard.ts` clientGroups sorgusu (yalnızca `attributionVerified` filtresi — B2 bölünmesinden bağımsız minimal dokunuş; B2 ile aynı oturumda koşuluyorsa B2'nin activity yükleyicisine uygulanır); privacy export şema testi (`apps/web/src/lib/account/privacy-service` testleri) iki yeni kolonu kapsar

- [ ] Kesim testi: `attributionVerified=false` + `clientType=WEB` satır platform kırılımında `UNKNOWN` kovasında (spec test 9).
- [ ] Bitti kanıtı sorgusu README'ye değil rapora: `UserDailyMetric` groupBy — deploy sonrası `MOBILE > 0` beklenir.
- [ ] Checkpoint — A kapanış: web+db+mobile typecheck/test yeşil.

---

## B2 — Kabuk + kit + 4 modül (Görev 9-14)

### Task 9: Ortak kit

**Files:** Create `apps/web/src/components/admin/kit/` — `admin-shell.tsx`, `admin-nav.tsx`, `admin-page-header.tsx`, `admin-kpi-card.tsx`, `admin-mini-stat.tsx`, `admin-pill.tsx`, `admin-grid-table.tsx`, `admin-chip.tsx`, `admin-toggle.tsx`, `admin-bar-chart.tsx`, `admin-progress.tsx`, `admin-pulse-dot.tsx`, `avatar-gradients.ts` (tek hex istisna dosyası); Create `apps/web/src/components/admin/format/admin-format.ts`; Test `admin-kit.test.tsx` + `admin-format.test.ts` + `admin-kit-contract.test.ts`

**Interfaces (Produces):** her bileşen G §1 tablosundaki ölçülerle; `formatAdminNumber(4210000) === "4,21M"`, `formatAdminPercent(4.2) === "%4,2"`, `formatAdminInt(1204) === "1.204"` (locale `tr-TR`).

- [ ] Kırmızı: format testleri; kit sözleşme testi — (a) `components/admin/**` içinde `#[0-9a-fA-F]{3,8}` deseni yalnızca `avatar-gradients.ts`'te (G test 1), (b) `AdminShell` DOM'unda rail 250px / bar 62px / içerik `max-width:1360px` (G test 3).
- [ ] Uygula — ölçü kaynağı G §1 + handoff README "Ortak Bileşen Desenleri"; şüphede `Whispr Admin.dc.html`. Tüm renkler `hsl(var(--…))`.
- [ ] Yeşil. Checkpoint.

### Task 10: Snapshot bölünmesi (davranış önce sabitlenir)

**Files:** Create `apps/web/src/lib/admin/snapshots/{overview,users,servers,activity,audit,notifications}.ts`; Modify `apps/web/src/lib/admin/dashboard.ts` (26 sorgu dağılır; `buildDailyMetricSeries`, `getDashboardDateRange`, cache deseni paylaşımlı kalır — cache anahtarı `${loader}:${days}`); Test `snapshot-equivalence.test.ts`

- [ ] **Önce** eşdeğerlik testi: yükleyici birleşimi ≡ mevcut `getAdminDashboardSnapshot` çıktısı (B spec test 6). Refactor boyunca yeşil kalır.
- [ ] Sorgu izolasyon testi: audit yükleyicisi koşarken prisma mock'unda user/server/media çağrısı 0 (B spec test 7).
- [ ] Böl; `AdminDashboardSnapshot` tipi yükleyici başına `Awaited<ReturnType<...>>` olarak daralır.
- [ ] Checkpoint.

### Task 11: Rota iskeleti + yetki + shim

**Files:** Modify `apps/web/src/app/admin/layout.tsx` (AdminShell + capability-nav); Create `apps/web/src/app/admin/{users,servers,activity,audit}/page.tsx` + her segmentte `loading.tsx` (kart-koruyan skeleton); Modify `apps/web/src/app/admin/page.tsx` (overview + anchor shim); Create `apps/web/src/components/admin/shell/admin-anchor-shim.tsx`; Create `apps/web/src/components/admin/shell/admin-nav-items.ts` (capability → modül haritası — Task 1/W1 `ADMIN_CAPABILITIES`'ten türetilir, ayrı liste değil)

- [ ] Nav görünürlük + sayfa koruması testleri: modül × rol matrisi (B spec test 8; her `page.tsx` kendi `requireAdminCapability` çağrısı).
- [ ] Anchor shim: client `useEffect`, `window.location.hash` bilinen modülse `router.replace("/admin/<modül>")`; bilinmeyen yok sayılır (B spec test 9 — sunucu tarafı yönlendirme YOK, fragment sunucuya ulaşmaz). Dosyaya kaldırma tarihi yorumu (+3 ay).
- [ ] Checkpoint.

### Task 12: Genel Bakış modülü (G harita: handoff modül 1)

**Files:** Create `apps/web/src/components/admin/sections/admin-overview.tsx`; Modify `apps/web/src/app/admin/page.tsx`

- [ ] Handoff yerleşimi: tarih chip'leri (7g/14g/30g/90g), "Rapor İndir" → mevcut `activity.csv` (yalnızca `export.activity` görünür), 4 KPI, `1fr 340px` iki sütun, bar grafik (elle, gradient), mini kartlar, En Aktif Sunucular, Şu Anda Canlı, Moderasyon Özeti (D1 gelene dek gizli), **Platform Dağılımı**: A verisi + `attributionVerified` kesimi; `UNKNOWN` dördüncü bar + kalıcı not (G §2 kuralı). A henüz deploy değilse kart "veri yok" durumunda.
- [ ] Boş/yükleniyor/hata durumları; testler render + davranış.
- [ ] Checkpoint.

### Task 13: Kullanıcılar + Sunucular modülleri (handoff modül 2-3)

**Files:** Create `apps/web/src/components/admin/sections/admin-users.tsx`, `admin-servers.tsx`

- [ ] Users: mini kartlar ("Askıya alınmış" YOK → "Doğrulanmamış"; G §4), filtreler (`listAdminUsers` parametreleri: query/status/verified/banned), `AdminGridTable` `2.2fr 1.9fr 1.1fr 1fr 1fr 1.1fr 36px`, ban/kaldır modal — neden zorunlu (500 kırpma zaten serviste), aksiyon `user.ban` capability'sine bağlı.
- [ ] Servers: "Büyüme %" ve "Ortak" rozeti YOK (G §4) — "24s aktif" + Doğrulanmış/Herkese açık rozetleri; `listAdminServers`.
- [ ] Sayfalama iki tabloda da (mevcut `AdminManagementPagination`).
- [ ] Checkpoint.

### Task 14: Audit modülü + tema seçici + ⌘K gezinme

**Files:** Create `apps/web/src/components/admin/sections/admin-audit.tsx`; Create `apps/web/src/components/admin/shell/admin-theme-picker.tsx`, `admin-nav-search.tsx`

- [ ] Audit: `130px 1.5fr 1.7fr 1.4fr 120px` grid; aktör "system" (adminUserId null) gri gradient; **IP kolonu `ipHash` kısaltması** (ilk 10 karakter + "…") — ham IP yok (G §4). Filtre chip'leri: Tümü/Kullanıcı/Güvenlik/Sistem (action önekine göre).
- [ ] Tema seçici: 6 tema (G §3.3), mevcut `ThemeProvider`; `localStorage` + `ThemeSessionSync` zinciri korunur.
- [ ] Arama kutusu: placeholder "Modüle git…", yerel eşleştirme, ağ isteği yok (G §3.2).
- [ ] Eski `admin-dashboard.tsx` içeriği tamamen bölündükten sonra dosya silinir; `admin-management-panel.tsx`/`admin-feedback-panel.tsx`/`notification-composer.tsx` yeni rotalardan çağrılır (iç bölünme D1/E fazlarına).
- [ ] Dalga kapanışı: typecheck + lint + web/db/mobile test + `graphify update .` + rapor.

## Self-review notları

- A spec test 1-9 → Task 4 (1,8,9), Task 2 (2), Task 6 (3), Task 3 (4,5), Task 7 (6), Task 5 (7).
- B spec test 6-10 → Task 10 (6,7), Task 11 (8,9), Task 9 (10 — hex yasağı G-1 olarak).
- G kit ölçüleri Task 9'da tek yerde; modül görevleri kiti tüketir, varyant üretmez.
