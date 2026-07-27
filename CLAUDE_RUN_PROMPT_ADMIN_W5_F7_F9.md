# RUN PROMPT — Admin Dalga 5 kapanışı: F7 Mobil Ekranlar + F8 Desktop Konsol + F9 Tepsi Rozeti

Admin yeniden tasarımının **son üç görevi**. Öncesindeki her şey indi; bu oturum yalnızca F Task 7-9'u ve dalga kapanışını yapar.

## Nerede duruyoruz

| Dalga | Kapsam                                                                                 | Durum               |
| ----- | -------------------------------------------------------------------------------------- | ------------------- |
| W1    | B1 yetki haritası + E1 kampanya güvenliği                                              | ✅ commitli         |
| W2    | A telemetri + B2 kabuk/kit/modüller                                                    | ✅ commitli         |
| W3    | D1 moderasyon + C1 sağlık + C2 bayrak + C3 push telemetri                              | ✅ çalışma ağacında |
| W4    | C4 analitik/ses + E2 kampanya zamanlama/rapor + E3 feedback kümeleme                   | ✅ çalışma ağacında |
| W5    | D2 delil + itiraz ✅ · F5 mobil capability ✅ · F6 mobil vaka uçları ✅ · **F7-F9 ⬜** | 🟡                  |

Son ölçülen kapılar: web typecheck/lint + 1300/1300 · db 16/16 + 9/9 · types 84/84 · mobile typecheck + 1095/1095 · prettier temiz · graphify güncel. **Rust tarafı bu kapıların hiçbirinde koşmadı** (aşağıda "Kapı yalanı" tuzağına bak).

**Bu oturumda yapılacak:** F Task 7 (mobil ekranlar + derin bağlantı + push), F Task 8 (desktop konsol penceresi), F Task 9 (tepsi rozeti + dalga kapanışı).

## Okuma sırası

1. `docs/superpowers/plans/2026-07-27-admin-wave5-d2-f.md` — Task 7/8/9 (Task 1-6 kutuları işaretli; "D2 + F5-F6 uygulama notları" bölümü bu oturumun zeminini anlatır)
2. `docs/superpowers/specs/2026-07-26-admin-desktop-mobile-design.md` — tamamı
3. `docs/superpowers/specs/2026-07-27-admin-design-handoff-implementation.md` §9 (üç yüz: web / mobil / desktop)
4. Mevcut kod: `apps/web/src/app/api/v1/mobile/admin/**` (F6 uçları), `apps/web/src/lib/moderation/mobile-case-service.ts`
5. Desktop deseni: `apps/desktop/src-tauri/capabilities/voice-mini.json` + `apps/desktop/src-tauri/src/lib.rs`

Aşağıdaki "Doğrulanmış kod gerçekleri" bölümü bu dosyalardan **ölçülerek** çıkarıldı (2026-07-27). Satır numaraları o gündeki ağaca aittir; çelişki görürsen koda güven, prompta değil, ve sapmayı raporla.

## Bağlayıcı kurallar

- **Commit atma.** Dalga sonunda raporla.
- **TDD.** Kırmızı test önce; her görev sonunda checkpoint.
- **Mobil aksiyon seti sabit:** üstlen / reddet (neden zorunlu) / web'e yükselt. Ban ve mesaj silme mobilde **yok** — `apps/web/src/app/api/v1/mobile/admin/mobile-admin-contract.test.ts` rota listesini birebir sabitliyor; yeni uç eklemek bu testi kırar ve yeni spec ister.
- `isAdmin` bootstrap bayrağı **yalnızca görünürlük**. Her uç kendi yetkisini `requireMobileAdminCapability` ile doğrular; bayrağı elle `true` yapmak 403'ü değiştirmez.
- **Çevrimdışı aksiyon kuyruğu YOK.** Ağ yokken düğmeler devre dışı, istek atılmaz, son önbellek gösterilir.
- Bildirim tekilliği: vaka + **alıcı** + gün. Ham `modcase:{caseId}:alert:{yyyymmdd}` **kullanılamaz** (aşağıdaki tuzak 1).
- Mobil ekranlar **mobil uygulamanın kendi dilinde**: dikey akış, yan panel yok, web paneli kopyalanmaz.
- Desktop'ta **yeni frontend yok** — konsol penceresi web rotasını `?surface=console` ile yükler. Tepsi sayısı **sunucudan** gelir; desktop hesaplamaz.
- `admin-console` penceresi ana pencereye ayrılmış Tauri komutlarını çağıramaz. Bu **kod değişikliği değil, test**: allowlist zaten yalnız `main` diyor, genişletme yapma (tuzak 3).

## Doğrulanmış kod gerçekleri

**Mobil**

- Kök yığın: `MobileRootStackParamList` (`apps/mobile/src/navigation/mobile-navigation-types.ts:12`). Derin bağlantıyla açılan her rota ayrıca `MobileNavigationRouteIntent` union'ına (`:66`) girer.
- Derin bağlantı zinciri **dört durak**: `parseMobileDeepLink` (`apps/mobile/src/deep-link/mobile-deep-links.ts`) → `resolveMobileRoutePathIntent` (`apps/mobile/src/navigation/mobile-linking.ts:110`) → `config.screens` (`mobile-linking.ts:78`) → `MobileNavigationRouteIntent`. Biri eksikse bağlantı sessizce düşer.
- Ağ durumu: `apps/mobile/src/network/mobile-network-contract.ts` + `apps/mobile/src/app/providers/mobile-network-provider.tsx`. Yeni bir "online mu" mekanizması yazma.
- Özellik dizini deseni: `apps/mobile/src/feedback/` (ekran + `.styles.ts` + `-query.ts` + `-model.ts` aynı klasörde). `apps/mobile/src/admin/` bunu izlesin.
- Uçlar hazır (tam yollar):
  - `GET /api/v1/mobile/admin/cases`
  - `GET /api/v1/mobile/admin/cases/[caseId]`
  - `POST /api/v1/mobile/admin/cases/[caseId]/claim`
  - `POST /api/v1/mobile/admin/cases/[caseId]/dismiss` (`{ resolution }`)
  - `POST /api/v1/mobile/admin/cases/[caseId]/escalate` (`{ note? }`)

**Push**

- Bildirim satırı yazmak push göndermez. Push `sendMobilePushForNotifications` (`@/lib/mobile/push-sender`) ile ayrıca çağrılır — desen: `apps/web/src/lib/workspace/message-notification-service.ts:190` civarı.
- `NotificationType.MODERATION` enum'da var (`packages/db/prisma/schema.prisma:47`, `packages/types/src/mobile.ts:218`).
- Vaka bildirimi deseni mevcut: `apps/web/src/lib/moderation/case-actions.ts:350` (`modcase:{caseId}:subject:warn`) ve `:388` (`buildReporterDedupeKey`).

**Periyodik iş**

- Tek periyodik kanca: `apps/web/src/lib/outbox/worker.ts:81` — saatlik temizlik burada (`purgeExpiredEvidence` çağrısı). "24s+ `OPEN`" taraması başka bir zamanlayıcı icat etmeden buraya takılır; bağımlılıklar `worker.ts:23`/`:46` desenindeki gibi enjekte edilebilir (testte DB yok).

**Web / socket**

- Emit yardımcısı: `emitToUserRooms` (`apps/web/src/lib/socket/emitters.ts:16`).
- Olay sözleşmesi: `ServerToClientEvents` (`apps/web/src/lib/socket/events.ts:164`). Yeni olay önce buraya.
- Açık vaka sayısı zaten hesaplanıyor: `countOpenModerationCases` (`apps/web/src/lib/moderation/case-queries.ts:168`), admin layout'ta `badges={{ moderation: openCases }}` olarak veriliyor (`apps/web/src/app/admin/layout.tsx:31`). İlk değer buradan gelir; socket olayı yalnız tazeler.
- Konsol rotası: `apps/web/src/app/admin/moderation/page.tsx` (+ `[caseId]`).

**Desktop**

- `is_authorized_desktop_command_window_label` (`apps/desktop/src-tauri/src/lib.rs:760`) gövdesi tek satır: `label == DESKTOP_MAIN_WINDOW_LABEL`. Mevcut negatif testler `:3803-3807`.
- Ana pencere → yardımcı pencere veri köprüsü deseni: `publish_desktop_voice_mini_snapshot` (`lib.rs:1124`) → `publish_desktop_snapshot_to_window` (`lib.rs:1139`), olay adı `whispr:desktop-voice-mini-snapshot`, boyut sınırı `MAX_DESKTOP_VOICE_MINI_SNAPSHOT_BYTES` (`lib.rs:112`). Web tarafı köprüsü: `apps/web/src/lib/desktop/voice-mini.ts`.
- Pencere kurulumu deseni: `lib.rs:3313-3370` (voice-mini `WebviewWindowBuilder`), URL üretimi `desktop_app_url_with_path` (`lib.rs:3713`).
- Tepsi ipucu: `fn tray_tooltip(self) -> &'static str` (`lib.rs:397`), `tray.set_tooltip(...)` (`lib.rs:1046`).
- Capability dosyaları: `apps/desktop/src-tauri/capabilities/{main,voice-mini,game-overlay}.json`; kayıt listesi `tauri.conf.json:16`.
- `voice-mini.json` bir `remote.urls` allowlist'i taşır (whispr.team + localhost:3000 + 127.0.0.1:3000). Uzak URL yüklenen her yeni pencere aynı listeyi taşımak zorunda.

## Bu repoda bilinen tuzaklar

1. **`dedupeKey` global unique.** `packages/db/prisma/schema.prisma:1378` → `@@unique([dedupeKey])` — kullanıcı bazlı değil, **tablo genelinde**. `modcase:{caseId}:alert:{yyyymmdd}` çok alıcılı bir uyarıda ilk admin dışındaki herkeste unique ihlaline düşer. Repodaki her çok alıcılı anahtar userId taşır (`channel-mention:{messageId}:{userId}`, `dm-message:{messageId}:{userId}`). Kullan: **`modcase:{caseId}:alert:{userId}:{yyyymmdd}`**. Ayrıca `{yyyymmdd}` takvim günüdür, kayan 24 saat değil — testin ve rapor dilinin ikisi de "gün" demeli (UTC gün sınırı).
2. **Kapı yalanı: `pnpm --filter @wizards/desktop test` Rust çalıştırmaz.** Script gövdesi `node --test scripts/*.test.mjs` (`apps/desktop/package.json`). F7-F9'un Rust işi yalnız `cargo test` ile ölçülür (CI'da `.github/workflows/ci.yml:778`, `working-directory: apps/desktop/src-tauri`). Clippy ayrı: `pnpm --filter @wizards/desktop lint:rust` (`-D warnings`).
3. **`admin-console` için allowlist genişletme YOK.** `is_authorized_desktop_command_window_label` yalnız `main` döndürüyor; konsol penceresi zaten reddediliyor. Görev, `lib.rs:3803` bloğuna `assert!(!is_authorized_desktop_command_window_label("admin-console"));` eklemek ve konsolun kendi komutlarını (varsa) ayrı bir guard'tan geçirmek. Fonksiyonu `||` ile büyütmek F test 7'nin amacını tersine çevirir.
4. **Next.js layout `searchParams` almaz.** `apps/web/src/app/admin/layout.tsx` async RSC ve `AdminShell` sunucu bileşeni ("use client" yok). `?surface=console` layout'ta okunamaz. Üç seçenek aşağıda "Karar bekleyen" bölümünde; birini seçmeden Task 8'in web yarısına başlama.
5. **Derin bağlantı yolu allowlist'te değil.** `SAFE_ROUTE_PREFIXES` (`apps/mobile/src/deep-link/mobile-deep-links.ts:59`) = `["/channels", "/settings", "/server", "/invite", "/user"]`. `/admin` eklenmezse `whispr://admin/case/<id>` navigasyona hiç ulaşmaz, `unsupported-path` ile düşer — ekran doğru yazılmış olsa bile.
6. **Yeni API rotası eklerken üç kayıt zorunlu**, yoksa sözleşme testleri kırmızıya düşer:
   1. `apps/web/src/app/api/v1/route-contract.test.ts` → gövdesiz POST ise `BODYLESS_MUTATING_METHOD_PATHS` (liste **sıralı**; yanlış konum testi kırar)
   2. `apps/web/src/lib/api-rate-limit.ts` → `API_RATE_LIMITS` kapalı union; eylem eklenmeden `enforceApiRateLimit` tip hatası verir
   3. Yeni guard adı kullanılıyorsa `AUTH_GUARD_CALL_PATTERN`
7. **Web bileşen testi:** `renderToStaticMarkup` app-router context vermez — client bileşende `useRouter()` "invariant expected app router to be mounted" ile patlar. Admin panellerinde tazeleme `window.location.reload()`; client island'lar sayfadan prop olarak geçilir. Test dosyalarında `import React` zorunlu.
8. **Mobil testler `apps/mobile` dizininden** koşulur (tsx kök-dizin tuzağı). RNTL `render`/`fireEvent` await ister.
9. Bootstrap sözleşmesine alan eklenirse **mobil test fixture'ları** (`scripts/mobile-*-cache.test.ts`, `mobile-display-model.test.ts`) o alanı taşımak zorunda.
10. `exactOptionalPropertyTypes` açık: opsiyonel alan `undefined` ile geçilemez — koşullu spread kullan (`...(x ? { x } : {})`).
11. Nav'a modül eklemek `apps/web/src/components/admin/shell/admin-routing.test.ts` rol×modül matrisini ve page/loading/`requireAdminModule` kontrolünü tetikler. **Placeholder modül nav'da yayınlanamaz.**
12. Prettier: repo LF; `pnpm format` sonrası listelenen dosyaları `npx prettier --write` ile düzelt. Paralel oturum mobil ses dosyalarına dokunuyor olabilir — kendi dosyalarının dışına çıkma.

## Karar bekleyen (uygulamadan önce seç ve raporda gerekçelendir)

- **`?surface=console` nerede okunur?** (tuzak 4)
  - **(a) Önerilen:** `AdminShell`'i `surface` prop'u alacak şekilde genişlet, değeri `page.tsx` seviyesinden (searchParams alan tek yer) veya küçük bir client island'dan (`useSearchParams`) ver. Sunucu render'ı korunur, rail koşullu render edilir.
  - (b) Ayrı segment `/admin/moderation/console` — layout temiz kalır, ama rota + `admin-routing.test.ts` matrisi + `requireAdminModule` üçlüsünü tetikler (tuzak 11).
  - (c) Desktop'ın set ettiği çerez — layout okuyabilir, ama durum pencere değil tarayıcı bazlı olur; iki pencere aynı çereze bakar. **Kaçın.**
- **Yetkisiz derin bağlantıda "güvenli ekran" nedir?** Öneri: intent çözülür, ekran açılır, uç 403 döner ve ekran "yetkin yok" boş durumu gösterip geri düşer — bağlantının kendisi admin varlığını sızdırmasın diye ayrı bir "yasak" ekranı yapma. Alternatif: `isAdmin` bayrağı yokken intent'i hiç üretme (daha sessiz, ama bayrak eskiyse yanlış negatif).
- **Tepsi ipucu metni** dinamikleşince `tray_tooltip` `&'static str` olmaktan çıkar. Öneri: enum metni sabit kalsın, sayı `set_tooltip` çağrısında birleştirilsin (`lib.rs:1046`) — enum imzasına dokunma.

## Görevler

### Task 7 — Mobil ekranlar + derin bağlantı + bildirim

**Dosyalar:** `apps/mobile/src/navigation/mobile-navigation-types.ts` (+`AdminIncidents`, `AdminIncidentDetail: { caseId }` — **kök yığın rotaları, MainTabs sekmesi değil**; ayrıca `MobileNavigationRouteIntent` union'ı); `apps/mobile/src/deep-link/mobile-deep-links.ts` (`SAFE_ROUTE_PREFIXES` + `/admin`); `apps/mobile/src/navigation/mobile-linking.ts` (`config.screens` + `resolveMobileRoutePathIntent`, `whispr://admin/case/:caseId`); yeni `apps/mobile/src/admin/` (liste ekranı, detay ekranı, query/mutation hook'ları, `.styles.ts`); ayarlar ekranına admin satırı (`isAdmin` bayrağıyla); push tetikleyicisi web tarafında (`URGENT` veya 24s+ `OPEN` → admin üyelerine `NotificationType.MODERATION` + `sendMobilePushForNotifications`), tarama `apps/web/src/lib/outbox/worker.ts` saatlik bakımına takılır

- [ ] Kırmızı: yetkisiz derin bağlantı seçilen güvenli davranışa düşer (F test 4); çevrimdışında aksiyon düğmeleri devre dışı ve istek atılmaz (F test 6); push alıcı başına günde tek ve **iki admin aynı vakada çakışmadan** bildirim alır (F test 5 — `dedupeKey`, tuzak 1).
- [ ] Liste: öncelik + yaş sırası (sunucu zaten sıralı döner), `MOD-{publicNumber}`, konu handle'ı, rapor sayısı, üstlenen.
- [ ] Detay: raporlar + delil özetleri (`preview`, `scope`), üç aksiyon düğmesi. Reddetmede neden zorunlu.
- [ ] Derin bağlantı testi dört durağın hepsini geçer (tuzak 5).
- [ ] **DoD:** `pnpm --filter @wizards/mobile typecheck` + `test` (dizin: `apps/mobile`) yeşil, yeni testler sayıca raporlanır. Checkpoint.

### Task 8 — Desktop konsol penceresi

**Dosyalar:** `apps/desktop/src-tauri/capabilities/admin-console.json` (`voice-mini.json` şablonu — `remote.urls` listesi birebir taşınır, pencere etiketi `admin-console`, izinler minimum); `apps/desktop/src-tauri/tauri.conf.json:16` (`security.capabilities` listesine ekle); `apps/desktop/src-tauri/src/lib.rs` (konsol aç/kapa komutu → `desktop_app_url_with_path("/admin/moderation?surface=console")`, `WebviewWindowBuilder` voice-mini deseni `lib.rs:3313`; komut gövdesi `assert_desktop_main_command_window` ile korunur); web tarafı `?surface=console` → sol rail gizli + yoğun satır (karar (a)); web admin arayüzüne "Konsolu ayır" düğmesi (yalnız desktop'ta görünür — `apps/web/src/lib/desktop/runtime.ts` köprüsü)

- [ ] Kırmızı: `admin-console` etiketi komut allowlist'inde **değil** (`lib.rs:3803` bloğuna negatif assert — genişletme yok, tuzak 3) (F test 7); `?surface=console` ile rail render edilmez (F test 9).
- [ ] Rust tarafı mevcut test deseniyle; `apps/desktop/scripts/*` release script'lerine dokunma.
- [ ] **DoD:** `cargo test --locked` (`apps/desktop/src-tauri` dizininden) + `pnpm --filter @wizards/desktop lint:rust` + `pnpm --filter @wizards/desktop test` üçü de yeşil (tuzak 2). Checkpoint.

### Task 9 — Tepsi rozeti + dalga kapanışı

**Dosyalar:** `apps/web/src/lib/socket/events.ts:164` (`admin:open-case-count` olayı) + `apps/web/src/lib/socket/emitters.ts` yayını (kaynak sayı `countOpenModerationCases`); web köprüsü `apps/web/src/lib/desktop/` altında yeni dosya (`voice-mini.ts` deseni) → ana pencereden Tauri komutu; `apps/desktop/src-tauri/src/lib.rs` tepsi ipucu (`:1046` birleştirme, `tray_tooltip` imzası korunur — karar 3); yapılandırılabilir konsol kısayolu (`allow-configure-desktop-voice-shortcuts` deseni)

- [ ] Kırmızı: desktop sayıyı hesaplamaz, yalnız gösterir — komut yalnız ana pencereden kabul edilir ve sayı payload'dan gelir (F test 8).
- [ ] Sayının ilk değeri layout'taki `badges.moderation` ile aynı kaynaktan; socket olayı yalnız tazeler (çift kaynak yok).
- [ ] Dalga kapanışı: aşağıdaki tüm kapılar + `graphify update .` + rapor.

## Doğrulama

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/db test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/desktop test
```

```bash
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

```bash
pnpm --filter @wizards/desktop lint:rust
```

```bash
pnpm format
```

```bash
graphify update .
```

## Rapor formatı

- **F bitti kanıtı:** `URGENT` vaka → telefonda bildirim → dokunma detayı açıyor → "Üstlen" web konsolunda anında görünüyor; mobil uçtan ban denemesi 403; konsol penceresi bağımsız açık, tepsi sayısı canlı
- Yetkisiz derin bağlantı davranışı ve çevrimdışı davranış (kuyruk yok) kanıtı
- **İki admin, tek vaka** push kanıtı (dedupeKey çakışmıyor)
- "Karar bekleyen" üç maddede hangi seçenek seçildi ve neden
- Değişen dosyalar + plandan sapmalar
- Kapı çıktıları (test sayıları) — Rust kapıları ayrı satırda

## Bu oturumun dışında kalan, kullanıcıya ait açık kapılar

- UAT DB'de **Adım 0 ölçümü**: `packages/db` dizininden `node --import tsx --env-file=.env scripts/audit-appsession-clienttype.mjs` (salt okunur). Sonuç A spec'inin "Adım 0 sonucu" bölümüne yazılır.
- **Altı migration** UAT'ye uygulanmadı: `campaign_delivery`, `telemetry_platform_dims`, `moderation_cases`, `client_health_flags_push`, `feedback_cluster_suggestions` (+ baseline). Migration dizini `packages/db/prisma/rebaseline-migrations`.
- **Commit** kullanıcıda.
- **İçerik Denetimi modülü** (handoff modül 5) AutoMod fazına park edildi — bu oturumun kapsamı değil.
