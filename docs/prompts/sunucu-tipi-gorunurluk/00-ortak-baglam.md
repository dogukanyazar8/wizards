# 00 — Ortak bağlam (her prompt bunu önce okur)

Bu dosya uygulanmaz. `01`–`04` arasındaki her prompt buradaki kuralları ve gerçekleri veri kabul eder.

Amaç: Whispr'da sunucuları **kişisel** ve **topluluk** olarak ayırmak, görünürlüğü açmak, her sunucuya profil kartı vermek ve keşif/katılım akışını kurmak.

---

## 1. Çalışma kuralları

- Dal `uat`. **Commit yok, push yok, rebase yok, `git add` yok.** İş çalışma ağacında bırakılır; sahibi kendi commit'ler.
- Web birim testlerinde **veritabanı yok**. Veritabanına dokunan her servis, saf bir yarıya (test edilebilir) ve enjekte edilen `PrismaClient` alan bir sorgu yarısına bölünür. Mevcut desen: `getMobileInvitePreviewWithDatabase`, `buildServerPublicProfile`.
- Test çerçevesi `node:test` + `node:assert/strict` (web, types, db) ve jest (mobil). Vitest yok.
- **Migration yalnız** `packages/db/prisma/rebaseline-migrations/` altına yazılır. `packages/db/prisma/migrations/` bayattır — Prisma orayı okumaz, oraya yazılan migration sessizce hiç koşmaz.
- Mevcut testler zayıflatılmaz. Bir test kırmızıya dönüyorsa değişiklik yanlıştır; test değil kod düzeltilir. Taklit (double) genişletmek serbesttir, iddia gevşetmek değildir.
- Bu ağaçta eşzamanlı başka işler var. **Dokunma:** `apps/web/src/lib/dm/**`, `packages/types/src/socket.ts`, `apps/web/src/lib/voice/**`, `apps/web/src/components/providers/live-voice-provider.tsx`, `apps/mobile/src/voice/**`, `docker-compose.yml`, `graphify-out/**`.

## 2. Over-engineering yasağı

Bu paketin en sık ihlal edilen kuralı. Her promptta geçerli:

- **Soyutlama, ikinci çağıran ortaya çıkmadan yazılmaz.** Tek kullanıcısı olan "genel" yardımcı yasak.
- **Feature flag, konfigürasyon anahtarı, ortam değişkeni** — prompt açıkça istemedikçe eklenmez.
- **Önbellek katmanı** — ölçülmüş bir yavaşlık olmadan eklenmez. "İleride lazım olur" gerekçe değildir.
- **Yeni paket/bağımlılık** eklenmez. Repoda olan kullanılır.
- **Geriye dönük uyumluluk kabuğu** yazılmaz; bu ürün tek dağıtımdır, eski istemci yoktur.
- **Genel amaçlı tip parametreleri (`<T>`)** — tek somut tipe uygulanıyorsa yazılmaz.
- Bir dosya promptun tarif ettiğinden büyüyorsa **dur ve bildir**, kendi kararınla bölme.

Ölçüt: promptun "Teslim" listesindeki her madde için bir satır kod eklendi mi? Listede olmayan bir şey eklendiyse gerekçesi rapora yazılır ya da geri alınır.

## 3. Hız kuralları

Önceki tur görev başına 3+ döngü harcadı çünkü her ajan bağlamı yeniden keşfetti ve plan hataları uygulama sırasında çıktı. Bu pakette:

- Her prompt **tek geçişte uygulanabilir bir dilim**dir. Alt görevlere bölünmez.
- Aşağıdaki "Doğrulanmış gerçekler" bölümü **yeniden keşfedilmez**. Bir gerçek yanlış çıkarsa düzeltilip rapora yazılır, ama arama zamanı harcanmaz.
- Test yazımı önce, ama **RED kanıtı görev başına bir kez** yeterlidir; her `it()` için ayrı RED turu değil.
- Kapı komutu prompt sonunda **bir kez** koşar. Her düzenlemeden sonra tam süit koşulmaz — düzenleme sırasında yalnız dokunulan dosyanın odaklı testi.
- Belirsizlik varsa: promptun "Bağlayıcı karar" bölümüne bak. Orada yoksa, **en küçük doğru davranışı seç, uygula, rapora yaz.** Sorup beklemek yerine varsayımı açıkça belgele.

## 4. Doğrulanmış gerçekler

### Platform

- `apps/desktop` **kendi UI'ı yok** — yalnız Tauri kabuğu (`src-tauri`). Web'de yapılan iş desktop'a bedava gelir. Yani "3 platform" değil, **iki istemci yüzeyi: web ve mobil**.

### Veri katmanı (S1'de landed)

`packages/db/prisma/schema.prisma`, `model Server`:

```prisma
type        ServerType @default(PERSONAL)   // enum: PERSONAL | COMMUNITY
memberCount Int        @default(0)           // denormalize, canlı
isPublic    Boolean    @default(false)       // davetsiz katılım açık mı
discoverable Boolean   @default(false)       // keşif listesinde mi
verificationLevel VerificationLevel @default(NONE)
features    String[]                          // "VERIFIED" burada
@@index([type, discoverable, memberCount])
```

- Migration: `rebaseline-migrations/20260807071604_server_type_and_counters/`. Backfill dahil.
- `@wizards/db` barrel `ServerType` ve `VerificationLevel` tiplerini dışa aktarır.
- **Üç kolon üç kavramdır:** `type` kim açabilir, `isPublic` kim katılabilir, `discoverable` kim görür. `COMMUNITY` ise `isPublic` zorunlu `true`.

### Sözleşme katmanı (S1'de landed)

`packages/types/src/workspace.ts`:

- `ServerTypeSchema`, `ServerVerificationLevelSchema`
- `AdminCreateServerSchema` — ayrıcalıklı alanları taşır, `.refine()` ile COMMUNITY ⇒ `isPublic`
- `CreateServerSchema` **`.strict()`** — tüketici sözleşmesi `type`/`isPublic`/`discoverable`/`verificationLevel` taşımaz, bilinmeyen alan 400 döner
- `UpdateServerFieldsSchema` + `isPublic?`, `discoverable?`; `UpdateServerSchema`'nın "en az bir alan" `.refine()` yüklemi ikisini sayar
- `ServerPublicProfileSchema` + `ServerPublicProfileChannelSchema` + `ServerPublicProfileFriendSchema`

### Yazma yolu (S1'de landed)

- `POST /api/v1/admin/servers` + `DELETE /api/v1/admin/servers/[serverId]` — **COMMUNITY yazabilen tek yol**. `requireAdminCapability("server.write")` (= `[OWNER, ADMIN]`) + `writeAdminAuditLog`.
- İş mantığı `apps/web/src/app/api/v1/admin/servers/route-logic.ts` içinde, DI'lı: `createAdminServer`, `deleteAdminServer`.
- `createWorkspaceServer(userId, input, options?)` — `options` yalnız admin rotasından geçer; tüketici rotası iki argümanla çağırır, bu yüzden her zaman `PERSONAL` üretir.
- `buildServerCreateData` saf; varsayılan `PERSONAL`/`false`/`false`/`"NONE"`, `memberCount: 1` (kurucu üye aynı transaction'da).
- Koruma kapıları `apps/web/src/lib/workspace/server-service.ts`: `assertServerIsDeletableByOwner` (COMMUNITY 403, `ensureOwner`'dan önce), `assertVisibilityFieldsWritable` (COMMUNITY'de görünürlük yazımı 403, `ensureServerPermission`'dan hemen sonra).

### Sayaçlar (S1'de landed)

- `apps/web/src/lib/workspace/server-member-counter.ts` — artırma Prisma `{ increment: 1 }`, azaltma `$executeRaw` + `GREATEST(0, "memberCount" - 1)`. Beş yazma noktası bağlı: `invite-service.ts`, `member-service.ts` (ekle/ayrıl/kick), `account/privacy-service.ts`. `buildServerCreateData` **bilinçli olarak bağlı değil** — çift sayım olurdu.

### Çevrimiçi presence sözleşmesi — S2/S3 buna dokunuyor, bozarsan sessizce yanlış sayı üretir

`apps/web/src/lib/socket/server-online-presence.ts`. S1 kapanışında üç Critical yarış/dayanıklılık kusuru düzeltildi; sonuçta ortaya çıkan değişmezler bağlayıcıdır:

- **Set türetilmiş durumdur**, kayıt değil. Yazma yardımcıları **asla fırlatmaz** (readiness kontrolü + `try/catch`). Okuma da `status` kontrolünden _sonra_ fırlayan komutu yutar — uçuş sırası zaman aşımı gerçek bir senaryo.
- **Tek yazıcı: `applyServerOnlinePresenceForSocket`.** Üç çağıranı var: `joinServerRoomsForUser` ve presence handler'ının iki noktası. **Yeni yazma noktası eklerken ham `addServerOnlineMember`/`removeServerOnlineMember` çağırma** — yarış kapısını atlarsın.
- **Yarış değişmezi:** her zincir _kendi alanını önce yazar, ötekininkini sonra okur_ (join → `onlineServerIds`, presence → `presenceStatus`). Uygunluk yazma anında değerlendirilir, eklemelerden sonra tekrar kontrol edilir, dönmüşse geri alınır. Sıra garantisi yok, gerek de yok. Bozarsan ya görünmez kullanıcı çevrimiçi kalır ya kalıcı hayalet oluşur — Redis `EXPIRE` anahtar seviyesindedir, başka üyenin join'i onu tazeler.
- **Sunucu listesi argüman değil**, `socket.data.onlineServerIds`'ten okunur. Aksi halde eşzamanlı kick'in temizliğini bayat bir kopya geri alır.
- **Disconnect'te ref-counting yok.** `user:{id}` odasına disconnect başına **tek** `fetchSockets`; kardeş socket'lerin `rooms` kümesinde `server:{id}` aranır. Sorgu fırlarsa hepsi bırakılır (fail-open — eksik sayım hayaletten iyidir). Yasak olan `fetchSockets`'ı _sayım_ yolunda kullanmaktı, disconnect'te değil.
- **`clearInterval` disconnect'in ilk senkron ifadesidir.** Eskiden Redis yazımının arkasındaydı ve bir reddetme 60 saniyelik interval sızdırıyordu. `runSocketDisconnectCleanup` (`lib/socket/server.ts`) test için çıkarıldı; `redis`, `endSession`, `io` enjekte edilebilir.

### Okuma modeli (S1'de landed)

`apps/web/src/lib/servers/server-public-profile-service.ts`:

```
getServerPublicProfile(serverId, viewerId | null) → ServerPublicProfile
buildServerPublicProfile(source, viewer)          → saf, veritabanısız test edilebilir
```

Üç yüzeyin tek kaynağı: profil kartı (S2), keşif kartı (S3), davet önizlemesi (mevcut). `resolveChannelPermissions` süzgeci **tek yerde** — ikinci kopya özel kanal adlarını sızdırır.

Üç sözleşme detayı, sezgiye aykırı ama doğru:

1. `verified` = `features.includes("VERIFIED")`. **`verificationLevel` değil** — o kolon hiçbir okuma yolunda kullanılmıyor.
2. `mutualFriends` sınırı **8**.
3. Profil modelinin çevrimiçi sayısı **veritabanından** gelir (`serverMember.count` + `user.status in ["ONLINE","IDLE","DND"]`), Redis setinden değil. Redis yolu S3'te çoklu-sunucu toplu okuması gerektiğinde bağlanır.

### Kırılgan noktalar — buraya dokunan prompt dikkat etsin

- `apps/web/src/app/api/v1/route-contract.test.ts:1327` — her mutasyon rotası ya `parseJsonBody` kullanır ya da `BODYLESS_MUTATING_METHOD_PATHS`'e kaydedilir. `:1347` ham gövde okuyucularını yasaklar. Yeni rota eklerken **ikisini de** karşıla.
- `apps/web/src/lib/api-rate-limit.ts` — eylem adları **kapalı union**. Yeni eylem önce oraya kaydedilir, yoksa derlenmez.
- **Mobil uç eklerken iki kapalı liste daha var** (S2/A'da acı verdi, derleyici yakalamaz, yalnız test koşunca çıkar): `apps/web/src/lib/api-rate-limit.test.ts` içindeki `M1_MOBILE_RATE_LIMITS` listesi ve `apps/web/src/app/api/v1/route-contract.test.ts` içindeki **sabit kodlanmış M1 rota sayacı**. Yeni `api/v1/mobile/**` rotası ikisini birden günceller.
- `apps/web/src/app/api/v1/admin/admin-route-capability.test.ts` — rota↔capability eşlemesini sabitler. Yeni admin rotası eklerken kaydını da ekle.
- `packages/types/src/workspace.test.ts` içindeki `assertSchemaBehaviorCoverage` — yeni bir şema dışa aktarırsan ona fixture eklemen gerekir, yoksa kırmızıya döner.

### Yüzey haritası

**Web** (`apps/web/src`):

- Kabuk: `components/shell/` — `wizards-shell.tsx`, `server-rail.tsx`, `channel-sidebar.tsx`, `server-settings-overlay.tsx`, `workspace-modals.tsx`
- Rotalar: `app/(main)/`, `app/invite/`, `app/settings/`, `app/admin/`
- Davet bileşeni: `components/invite/`

**Mobil** (`apps/mobile/src`):

- Sunucu yüzeyleri: `workspace/` — `mobile-server-settings-screen.tsx`, `mobile-server-members-screen.tsx`, `mobile-server-invites-screen.tsx`, `mobile-server-create-join-sheet.tsx`, `mobile-workspace-create-sheets.tsx`
- **2g zaten var ama davet koduna bağlı:** `app/screens/about/about-community-invite-screen.tsx` (+ `.styles.ts`), istemci `about/mobile-community-invite-client.ts`
- Navigasyon: `navigation/mobile-navigator.tsx`, `navigation/mobile-navigation-types.ts`, `navigation/mobile-linking.ts`

### Tasarım kaynağı

`design_handoff/design_handoff_whispr_hakkinda/Whispr Hakkında Ekranı.dc.html`, **2g bloğu satır 521–607**. İçerik: banner + ikon, ad + doğrulama rozeti, çevrimiçi/üye sayısı noktaları, açıklama, `KANALLAR` listesi (salt-okunur / CANLI / sesli kişi sayısı rozetleri), arkadaş avatar yığını + "Arkadaşlarından N kişi bu sunucuda", altta `Sunucuya katıl` + bağlantı kopyala.

Çelişkide sıra: HTML inline stil > metin. **Uydurma yasak** — dokümanda olmayan renk, gölge, yarıçap, boşluk üretilmez.

## 5. Kapı ve test koşturma — bu makineye özgü tuzaklar

S1 yürütmesinde öğrenildi, hepsi acı verdi. Denemeden uygula.

**Kapı komutu.** Bu makinede `pwsh` **yok**. `powershell` ve **mutlak yol** gerekiyor:

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
```

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Mobile
```

Geçerli profiller: `Fast`, `Standard`, `CI`, `Mobile`, `MobileRelease`, `Security`, `E2ESmoke`, `E2EApi`, `E2ERealtime`. **`Web` diye profil yoktur.**

**Tek test dosyası koşturamazsın.** Web'in `run-node-tests.mjs`'i ve mobilin `test`'i dosya argümanı **kabul etmez** — her zaman tüm süiti koşar. `--test-name-pattern` de pnpm üzerinden filtrelemiyor. Odaklı koşum istiyorsan `node --import tsx --test <yol>` ile doğrudan çağır.

**App Router yolları glob'dur.** `[code]`, `[serverId]` gibi köşeli parantezli dizinler `node --test`'e doğrudan verilirse glob olarak yorumlanır ve **sessizce sıfır test koşar** — yeşil sanırsın. `scripts/test-glob-path.mjs` kaçışını kullan (`[[]code[]]`).

Bilinen, bize ait olmayan kırmızı: `apps/web/src/lib/dm/group-service.test.ts` (eşzamanlı grup-DM işi). Dokunma, sayma.

## 6. Rapor biçimi

Her prompt sonunda `docs/prompts/sunucu-tipi-gorunurluk/raporlar/<prompt-no>-rapor.md`:

- Teslim edilenler, madde madde promptun "Teslim" listesine karşılık
- Test sonuçları, gerçek komut çıktısıyla
- Kapı sonucu
- **Sapmalar:** prompttan farklı yaptığın her şey + gerekçesi
- **Eklenmeyenler:** promptun istediği ama yapmadığın her şey + nedeni
- Bilinen boşluklar
