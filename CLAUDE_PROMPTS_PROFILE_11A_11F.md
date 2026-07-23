# Whispr Mobil Kullanıcı Profili — Sıralı Prompt'lar (11a → 11f)

Bu dosya 6 bağımsız prompt içerir. Her birini ayrı bir Claude Code oturumuna tek başına
yapıştırabilirsin; her biri kendi bağlamını taşır.

**Sıra:** 11a → 11b → 11c → 11d → 11e → 11f.
Zorunlu bağımlılıklar: **11b–11f hepsi 11a'dan sonra** (kontrat + backend temeli).
**11c, 11b'den sonra** (ortak kart bileşenleri 11b'de doğar). **11e, 11b + 11c'den
sonra** (sheet'lerin giriş noktaları o ekranlarda). **11f, 11c'den sonra** ("Tümünü gör"
girişi). 11d yalnız 11a'ya bağımlıdır, istenirse 11b–11c ile paralel ayrı oturumda koşabilir.

**Her oturumda ilk mesajdan önce `/caveman ultra` çalıştır** (yanıtlar kısa olsun,
kod ve teknik içerik etkilenmez).

## Tasarım referansı (her prompt için geçerli)

- `design_handoff_whispr_profil/README.md` — **önce bunu TAMAMEN oku.** Görev tanımı,
  token tabloları (açık+koyu), ölçüler, ekran spec'leri, durumlar, kabul kriterleri orada.
- `design_handoff_whispr_profil/Whispr Profil Ekranı.dc.html` — **kanonik piksel
  kaynağı.** 10 ekran, 390×844, tüm değerler inline style. Tereddütte kaldığın her ölçü,
  renk ve yazı değerini bu dosyadan oku; **tahmin etme.** Bölüm satır aralıkları:
  - 2a Profil düzenleme: satır 34–110 · 2b Not yazma: 111–171 · 2c Durum seçici: 172–226
  - 2d Medya galerisi: 227–276 · 1a Hızlı profil (kanal): 277–377 · 1b Hızlı profil
    (DM, arkadaş değil): 378–464 · 1c Tam profil: 465–586 · 1d Kendi profil: 587–661
  - 1e Koyu hızlı profil: 662–748 · 1f Koyu tam profil: 749–871
- `design_handoff_whispr_profil/screenshots/*.png` — hızlı görsel referans; Read
  aracıyla görüntüle. Piksel değeri için HTML esastır.
- Mock'taki isimler/veriler yalnız görseldir; **dummy/sahte veri YASAK** — her alan
  gerçek API / store / socket verisinden gelir.

## Ortak kurallar (her prompt'un içinde kısaltılmış hali var)

- Branch `uat`. Working tree'de önceki fazların **commit'lenmemiş** işi var. **Commit
  atma; revert/stash/checkout yapma**; yalnız kendi görevinin dosyalarına dokun.
- Emülatör/cihaz/Metro başlatma YOK. Doğrulama = typecheck + testler. Gerçek cihaz
  kontrolünü kullanıcı emülatörde kendisi yapacak; raporun sonunda kısa bir
  **"emülatör el-test listesi"** ver.
- Tüm kullanıcı metinleri `apps/mobile/src/locale/mobile-copy.ts` üzerinden, **tr + en
  birlikte**. Web tarafına metin gerekirse `apps/web/src/lib/locale/messages/{tr,en}.ts`.
- **Ham renk yasak** — README'deki açık/koyu token değerleri
  `apps/mobile/src/design/themes.ts` token'larına eklenir, bileşenler token okur
  (design-contract testi). Her ekran **açık + koyu** birlikte çıkar.
- Overlay'ler RN `Modal` kullanmaz: `kit/overlay-registry` + `OverlaySurface` (host
  `MobileProductApp` içinde). Sheet UI'ları `kit/sheet-primitives`
  (SheetHeader/OptionSheet/ActionSheet/SheetOptionRow/SheetActionRow/useSheetPresentation);
  onaylar `kit/destructive-confirmation-sheet`. Avatar için mevcut squircle
  `kit/avatar` kullanılır; ikonlar `design/mobile-line-icon-definitions.ts` setinden
  (eksik ikon oraya eklenir, stroke 1.8–2px round).
- Feature hook içinde doğrudan client send yasak (phase-zero-boundary testi).
- `apps/mobile/src/app/mobile-product-app.tsx` < 520 satır kapağı (mimari test).
- Yeni davranışa test yaz; davranış değiştiren her şeyde ilgili kontrat testini anlamlı
  güncelle: maestro-testid contract, theme-contract, `apps/web/src/app/api/v1/
  route-contract.test.ts` mutating-route allowlist'i, `packages/types` fixture testleri.
- Yeni her mobil endpoint'e `enforceApiRateLimit` anahtarı + oturum/yetki kontrolü.
- Dokunma hedefleri ≥44px; tek satır metinler ellipsis; kart açılışı ~200ms
  scale(.96→1)+fade, sheet'ler alttan ~250–300ms ease-out.
- Doğrulama komutları (hepsi geçmeli):
  ```
  pnpm --filter @wizards/types test
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/mobile typecheck
  pnpm --filter @wizards/mobile test
  pnpm --filter @wizards/mobile test:components
  ```
  (Node testleri `apps/mobile` klasöründen `node --test --import tsx scripts/<ad>.test.ts`
  ile tek tek koşulabilir; repo kökünden `--import tsx` çalışmaz.)

---
---

## PROMPT 1 / 6 — 11a: Profil kontratları + backend temeli (UI yok)

Whispr monorepo'sunda (pnpm workspaces; mobil: Expo SDK 56 / RN 0.85, `apps/mobile`;
backend: Next.js, `apps/web`; kontratlar: `packages/types`; DB: Prisma,
`packages/db/prisma/schema.prisma`) yeni kullanıcı profili ekran ailesinin (hızlı profil
kartı, tam profil sayfası, not, durum, medya galerisi) ihtiyaç duyduğu **kontrat + backend
+ mobil client katmanını** kur. Bu prompt'ta UI yok; 11b–11f bu temeli tüketecek.

Önce `design_handoff_whispr_profil/README.md` dosyasını TAMAMEN oku — hangi ekran hangi
veriyi istiyor oradan çıkar (özellikle "EKRANLAR", "DURUMLAR", "KABUL KRİTERLERİ").

### Bağlam ve kurallar
- Branch `uat`; working tree'de başka fazların commit'lenmemiş işi var — **commit yok,
  revert yok**. Emülatör yok; doğrulama typecheck + testler (üstteki ortak blok).
- Yeni her endpoint'e rate limit + yetki; route-contract allowlist güncellenir; types
  fixture testleri (`packages/types/src/mobile-social.test.ts` kalıbı) genişletilir.

### Mevcut durum (keşifle doğrula)
- **DB çoğu alanı ZATEN içeriyor** — `packages/db/prisma/schema.prisma`:
  - `User` (satır ~238): `bannerUrl`, `bannerColor`, `bio` (VarChar 500), `pronouns`,
    `status UserStatus`, `customStatus`, `customStatusEmoji`, `customStatusExpiresAt`,
    `premiumType`/`premiumSince`, `registeredAt`, `createdAt`.
  - `ServerMember` (~629): `joinedAt`; roller `MemberRole` → `Role`.
  - `ServerInvite` (~697): davetçi rozeti türetmek için kullanım sayıları (alan adlarını keşfet).
  - `FriendRequest` (~561): ACCEPTED kayıtlarından ortak arkadaş kesişimi hesaplanır.
  - **`UserNote` modeli YOK. Kullanıcı bildirme (report) modeli YOK.** Migration klasör
    kalıbı: `packages/db/prisma/migrations/2026MMDDHHMMSS_<ad>/migration.sql`.
- **Kontratlar** — `packages/types/src/mobile-social.ts`:
  - `MobileFriendPresenceStatusSchema` = ONLINE/IDLE/DND/OFFLINE (INVISIBLE yok);
    `MobilePresenceUpdateSchema` OFFLINE'ı kabul ediyor → "Görünmez" = OFFLINE yazmak.
    `PUT /api/v1/mobile/account/presence` mevcut; profil düzenleme ekranı zaten 4 durumu
    yazıyor (`apps/mobile/src/social/mobile-profile-edit-screen.tsx` PRESENCE_OPTIONS).
  - `MobileProfileUpdateSchema`: bio/customStatus/displayName/username — **banner,
    customStatusEmoji, expiry, pronouns YOK.**
  - `MobileProfileResponseSchema`: yalnız kendi profilin; **başka kullanıcı için profil
    endpoint'i YOK.**
  - `MobileFriendRelationshipSchema` ("none/friend/incoming/outgoing/blocked") ve
    kullanıcı arama ilişki mantığı hazır (`friends/search`).
  - `MobileDMDetailsResponseSchema`: `mutualServers` (max 12) + `sharedAttachments`
    (media/files, max 30) + `participant` — ortak arkadaş YOK.
  - `packages/types/src/workspace.ts`: `RoleBadgeSchema` (id/name/color int) — rol
    chip'lerinin veri şekli; `WorkspaceMemberSchema.roles` üye rollerini taşıyor.
- **API rotaları** — `apps/web/src/app/api/v1/mobile/`: `account/profile` (kendi),
  `account/presence`, `friends/*` (requests yaşam döngüsü, `blocks/[userId]`, `search`,
  `[userId]` silme), `dm` (create by userId), `dm/[conversationId]/details`,
  `servers/[serverId]/members`. Route'lar ince; mantık `route-logic.ts` + testleri yanında.
- **Mobil katman**: `apps/mobile/src/social/mobile-social-client.ts` +
  `mobile-social-query.ts` (query/mutation kalıpları), `query/mobile-query-keys.ts`,
  `query/mobile-profile-cache.ts` (avatar cache patch kalıbı), socket presence akışı
  (`packages/types/src/socket.ts` presence şemaları + `realtime/realtime-query-bridge.ts`).

### Uygulama hedefi
1. **Peer profil endpoint'i** — `GET /api/v1/mobile/users/[userId]/profile?serverId=`
   (yol adını mevcut adlandırmayla tutarlı seç; route-contract'a ekle):
   - Dönen şema (yeni `MobileUserProfileSchema` + response, `packages/types`):
     `user` (id/username/displayName/avatarUrl), `bannerUrl`, `bannerColor`, `bio`,
     `pronouns`, `presence { status, customStatus, customStatusEmoji }`,
     `registeredAt`, `relationship` (mevcut enum), `badges[]`,
     `mutualServers { count, preview[] }` (preview: id/name/iconUrl/shortName/memberCount —
     `MobileDMMutualServerSchema` şekliyle uyumlu), `mutualFriends { count, preview[] }`
     (preview: `MobileFriendUserSchema` şekli), `note` (yalnız istek atan görüntüleyenin
     kendi notu), `serverContext` (yalnız `serverId` verilmiş VE hem görüntüleyen hem
     hedef o sunucuda üyeyse: `roles: RoleBadge[]` + `joinedAt`), `blocked`/`blockedBy`
     bilgisi (kart kısıtlı görünümü için; `blockedBy` durumunda alanları kırp).
   - **Gizlilik kuralları sunucuda:** arkadaş olmayana kişisel banner görseli dönme
     (README 1b: nötr banner); engellenmişte yalnız kimlik + engel durumu; bio/rozet/
     ortaklar görünürlük kurallarını README'ye göre uygula. OFFLINE kullanıcıda
     customStatus dönme kararını README 1b'ye göre ver ("Çevrimdışı" + son görülme yok —
     lastSeen altyapısı YOK ve bu prompt'ta EKLENMEZ; UI yalnız "Çevrimdışı" yazacak).
   - `customStatusExpiresAt` geçmişse customStatus'u null say (okuma yolunda; kalıcı
     temizlik için ucuz bir strateji seç ve gerekçele).
2. **Rozet türetme (server tarafı, deterministik):** `earlyMember` (registeredAt, eşiği
   config/env sabiti yap), `supporter` (premiumType != NONE), `inviter` (kullanıcının
   davetlerinden en az 1 kullanım — ServerInvite'tan; sorgu maliyetine dikkat, gerekirse
   count'u tek sorguda al). Şemada `MobileProfileBadgeSchema` enum + fixture testleri.
3. **Not (UserNote):** yeni Prisma modeli (authorId+subjectId unique, body ≤256) +
   migration; `PUT /api/v1/mobile/users/[userId]/note` (boş gövde = sil) + profil
   response'unda `note`. **Yalnız yazan okur/yazar** — route-logic testinde kanıtla.
4. **Bildir (report):** yeni Prisma modeli (reporter, subject, sebep enum, opsiyonel
   açıklama ≤500, createdAt) + migration; `POST /api/v1/mobile/users/[userId]/report`
   (sıkı rate limit; kendini bildirme reddi). Admin görünürlüğü kapsam DIŞI.
5. **Profil güncelleme genişletmesi:** `MobileProfileUpdateSchema` + `PATCH
   account/profile` mantığına `bannerColor` (README paletindeki hex doğrulaması),
   `bannerUrl` (mevcut mobil upload akışının ürettiği URL; `apps/web/.../uploads`
   route'unu keşfet, avatar nasıl doğrulanıyorsa aynı kurallar), `customStatusEmoji`,
   `customStatusExpiresAt` (istemci mutlak zaman yollar), `pronouns` ekle.
   `MobileProfileResponseSchema`'yı ve `account/settings` response'unu yeni alanlarla
   genişlet (eski sunucuyla parse uyumu için `.default()` kalıbını koru — dosyadaki
   mevcut yorumlu örneklere bak).
6. **Username 30 gün kuralı:** `User`'a `usernameChangedAt` (migration) + PATCH'te
   enforce; ihlalde alan-hedefli hata kodu; response'a `nextUsernameChangeAt` (11d UI
   gösterecek). Benzersizlik hatası zaten varsa aynı kalıpla döndür.
7. **Mobil client + query katmanı (UI YOK):** `mobile-social-client.ts`'e
   `fetchMobileUserProfile`, `saveMobileUserNote`, `reportMobileUser` + tipler;
   `mobile-query-keys.ts`'e profil anahtarı (`userId+serverId`); `mobile-social-query.ts`'e
   query/mutation hook'ları (not kaydetme profil cache'ini optimistic günceller; engelle/
   arkadaş ekle mevcut mutation'ları profil query'sini invalidate eder). Socket presence
   olayı geldiğinde açık profil query'lerinin presence alanını güncelleyen köprüyü
   `realtime-query-bridge.ts` kalıbıyla ekle.
8. **Testler:** types fixture'ları (geçerli+geçersiz), route-logic testleri (yetki,
   gizlilik kırpması, not gizliliği, rozet türetme, username cooldown, rate limit
   anahtarları), mobil client/query node testleri. route-contract mutating allowlist'e
   yeni PUT/POST/PATCH'leri ekle (8c'de bu unutulmuştu — regresyon olmasın).

### Korunacak sözleşmeler
- Mevcut `account/profile` GET/PATCH davranışı (eski istemci alan göndermeden çalışmaya
  devam eder); friends/blocks akışları; DM details şeması (dokunma — genişletme yalnız
  yeni profil endpoint'inde).
- `packages/types` sürüm uyumu: yeni alanlar optional/default — un-redeployed server
  parse kırmaz (dosyadaki mevcut yorum kalıbı).

### Kabul kriterleri
1. Profil endpoint'i tek istekte 11b/11c'nin tüm verisini veriyor (README 1a–1f alan
   dökümüyle karşılaştırılmış); gizlilik kırpmaları route-logic testinde kanıtlı.
2. Not yalnız yazana görünür (farklı kullanıcıyla test); bildir kaydı yazılıyor.
3. Banner/emoji/expiry/pronouns PATCH ile yazılıp GET ile dönüyor; username cooldown
   enforce + `nextUsernameChangeAt` dönüyor.
4. Rozetler deterministik ve testli; presence OFFLINE yazımı socket fanout'ta OFFLINE
   yayınlıyor (görünmezlik sızıntısı yok — testle kanıtla).
5. Tüm doğrulama komutları yeşil; commit yok.

### Rapor
Eklenen kontratlar/endpoint'ler tablosu, gizlilik kararları, rozet eşikleri, migration
listesi; 11b–11f'nin tüketeceği hook/fonksiyon adları. Emülatör el-testi bu prompt'ta yok
(UI yok) — ama migration'ların UAT DB'ye uygulanma komutunu rapora yaz
(`pnpm --filter @wizards/db db:migrate:deploy`).

---
---

## PROMPT 2 / 6 — 11b: Hızlı profil kartı (1a, 1b, 1d + koyu 1e)

Whispr monorepo'sunda (`apps/mobile` Expo SDK 56 / RN 0.85) **hızlı profil kartını**
uygula: uygulamanın herhangi bir yerinde bir kullanıcının avatarına/adına dokununca
ortada açılan yüzen kart (Discord tarzı; bottom sheet DEĞİL). 11a'nın profil
endpoint'i/hook'ları hazır — keşfet ve tüket.

Önce `design_handoff_whispr_profil/README.md` TAMAMEN oku; sonra
`Whispr Profil Ekranı.dc.html` satır 277–377 (1a), 378–464 (1b), 587–661 (1d),
662–748 (1e koyu) bölümlerinden birebir değerleri çıkar;
`screenshots/1a…1b…1d…1e…png` dosyalarına Read ile bak. **Tahmin yok, dummy veri yok.**

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör yok; doğrulama typecheck + testler.
- Metinler `mobile-copy.ts` (tr+en); ham renk yasak — README token tabloları
  `design/themes.ts`'e yeni token grubu olarak girer (açık+koyu), bileşenler token okur.
- Overlay: `kit/overlay-registry` + `OverlaySurface` (RN Modal yasak); onaylar
  `kit/destructive-confirmation-sheet`; avatar `kit/avatar` squircle; ikonlar
  `design/mobile-line-icon-definitions.ts` (eksikleri oraya ekle).

### Mevcut durum (keşifle doğrula)
- **Veri:** 11a'dan `fetchMobileUserProfile` + query hook (`mobile-social-query.ts`),
  not/bildir mutation'ları, relationship enum'u, rozetler, serverContext rolleri.
  Engelle: `friends/blocks/[userId]` mevcut mutation; arkadaş ekle/istek: friends
  akışı (`friends-hub.tsx` kullanımına bak). DM aç/oluştur: `POST /api/v1/mobile/dm`
  (`MobileDMCreateRequestSchema`) — mevcut kullanım yerini bul.
- **Sesli/görüntülü arama:** mevcut DM çağrı akışı — `screens/mobile-outgoing-call-screen*`,
  `mobile-direct-call-screen*`, `mobile-direct-video-call-screen*`; DM ekranından nasıl
  tetikleniyorsa aynı yoldan başlat (yeni akış kurma).
- **Giriş noktaları (avatar/isim dokunuşu):** kanal mesajları
  `app/components/message-primitives.tsx`; DM başlığı `app/screens/dm-screen.tsx`
  (+ `dm-chat-primitives.tsx` — DM mesaj satırında avatar var mı keşfet); üye listesi
  `workspace/mobile-server-members-screen.tsx` (+ `mobile-server-member-model.ts`);
  tepki listesi `app/components/message-reaction-detail-sheet.tsx`; thread
  `app/screens/message-thread-screen.tsx`. Bugün hiçbirinde profil açma davranışı YOK.
- **Kendi kullanıcın:** oturum kullanıcısı kimliği (`auth/mobile-auth-context` /
  bootstrap query) — kendi karta karar vermek için.
- Overlay kayıt/aç kalıbı: mevcut bir overlay'i örnek al (`app/overlays/` +
  `kit/overlay-registry.ts`); sheet redesign'ın `useSheetPresentation` kalıbı yalnız
  sheet'ler için — bu kart SHEET DEĞİL, ortada dialog.

### Uygulama hedefi
1. **`ProfileCardOverlay`** (öneri: `apps/mobile/src/social/profile-card/…` + kayıt):
   330px kart, ortalanmış; %45 overlay (token), overlay dokunuşu kapatır; ~200ms
   scale(.96→1)+fade açılış; `role="dialog"` erişilebilirlik + ikon butonlara etiket.
   Parametre: `{ userId, serverId? }`. Açılışta **anında skeleton** (gerçek satır
   geometrisi), veri gelince dolar; hata durumunda kart içinde "Profil yüklenemedi" +
   yeniden dene; engellenmişte kısıtlı görünüm (avatar+ad+"Engeli kaldır").
2. **Ortak parça bileşenleri** (11c yeniden kullanacak — `social/profile-card/` içinde
   dışa açık): `ProfileBadgeChips` (28×28 r10; earlyMember=yıldız/lavanta,
   supporter=şimşek/turuncu, inviter=kişi+/yeşil — README renkleri token'dan),
   `ProfileRoleChips` (8px renkli nokta + 12px/700 ad; renk `RoleBadge.color` int →
   hex; rol rengi id'den değil server verisinden), `ProfileStatusDot` (18–19px, 3px
   kenarlık; ONLINE yeşil / IDLE turuncu ay / DND kırmızı / OFFLINE içi boş gri —
   HTML'deki birebir çizim), `ProfileMutualRow` (üst üste 22px mini avatarlar + "N ortak
   sunucu · M ortak arkadaş" + chevron), `ProfileActionRow` (Mesaj birincil + 44px
   sesli + 44px görüntülü / arkadaş-değil seti).
3. **Varyant mantığı (README 1a/1b/1d):**
   - Kanal/sunucu bağlamı: banner (kullanıcının bannerColor/bannerUrl; yoksa indigo
     token), rozetler, ad+kullanıcıadı, durum satırı ("Çevrimiçi — {customStatus}"
     tek satır ellipsis; OFFLINE'da yalnız "Çevrimdışı"), "{SUNUCU} — ROLLER" + rol
     chip'leri (**yalnız serverId bağlamıyla açıldıysa**), ortak özet satırı (tam
     profildeki ilgili bölüme gider), buton seti: arkadaşsa Mesaj+aramalar; altta tam
     genişlik "Profili görüntüle" (lavanta yüzey) → 11c rotası (11c henüz yoksa
     navigasyon çağrısını tek noktada topla ve raporda işaretle).
   - DM bağlamı / arkadaş değil: nötr banner (server zaten kırpıyor — yine de client
     fallback), rol bölümü YOK, "Arkadaş ekle" birincil (tap → istek; buton "İstek
     gönderildi" pasif durumuna döner; relationship'e göre incoming/outgoing/blocked
     durumlarını da doğru butonla karşıla) + 44px Mesaj; arama yok; bilgi satırı
     "Arkadaş olmadığınız için sesli arama kapalı".
   - Kendi kartın (1d): banner'da "Düzenle" chip'i → `ProfileEdit` rotası; durum
     seçici satırı (yeşil nokta + "Çevrimiçi" + chevron) → 2c sheet'i (11e'de gelecek —
     açma çağrısını tek hook'ta topla, şimdilik mevcut profil düzenlemedeki durum
     akışına düşmesin, no-op + TODO işaretle ve raporla) ve "Durum mesajı ekle" kesikli
     satırı (aynı şekilde 11e hook'u); butonlar "Profili düzenle" + "Profili görüntüle".
4. **Üç-nokta menüsü (1b'deki):** 196px bağlam menüsü (`kit/context-menu` uygunsa onu
   genişlet; değilse kart içi mini menü) — "Engelle" (kırmızı; destructive onay →
   blocks mutation; başarıda kart kapanır, toast) + "Bildir" (kırmızı; sebep seçimli
   onay → 11a report mutation). "Not ekle" satırını 11e ekleyecek — menü yapısını buna
   hazır kur.
5. **Giriş noktaları:** yukarıdaki 5 yüzeye dokunuş bağla (mesaj avatarı+yazar adı, üye
   satırı, DM başlık kimliği, tepki satırı, thread avatarı). serverId'yi bağlamdan geçir
   (kanal/üye listesi → var; DM/tepki-DM → yok). Kendi avatarına dokunuş → 1d varyantı.
   Mevcut dokunma davranışlarını bozma (ör. üye satırında moderasyon menüsü varsa uzun
   basış/ikincil aksiyon ilişkisini keşfet ve koru).
6. **Haptik:** arkadaş ekle + engelle başarısında hafif titreşim (repo'da mevcut haptik
   kalıbını keşfet; yoksa expo-haptics kullanımını tek util'e koy).
7. **Testler:** kart varyant mantığı (arkadaş/değil/kendi/engelli) + menü aksiyonları
   jest component testleri; relationship→buton seti eşlemesi node testi; maestro-testid
   kontratına yeni testID'ler; theme-contract yeni token'larla yeşil.

### Korunacak sözleşmeler
- `message-primitives.tsx` satır düzeni (8c flat) ve mevcut uzun-basış mesaj menüsü;
  dokunma hedefi eklerken mesaj balonu davranışı değişmez.
- Overlay host/geri davranışı (Android geri = en üstteki overlay kapanır — 10g);
  `mobile-product-app.tsx` 520 satır kapağı.
- DM başlığındaki mevcut arama/çağrı butonları çalışmaya devam eder.

### Kabul kriterleri
1. Beş giriş noktasının hepsi aynı kartı açıyor; kanal bağlamında roller görünüyor,
   DM'de görünmüyor; arkadaş/değil/kendi/engelli buton setleri README'ye uygun.
2. Kart skeleton'la anında açılıyor; hata/yeniden dene çalışıyor; overlay dokunuşu ve
   Android geri kapatıyor.
3. Engelle/Bildir onaylı çalışıyor; engellenince kart kapanıp ilgili listeler
   invalidate oluyor; arkadaş ekle "İstek gönderildi"ye dönüyor.
4. Açık+koyu tema HTML 1a/1e ile birebir (330px kart, 92px banner, 76px avatar r26,
   ölçüler README "Ölçüler" tablosundan); ham renk yok.
5. Tüm doğrulama komutları yeşil; commit yok.

### Rapor
Varyant matrisi, giriş noktası listesi, 11c/11e'ye bırakılan hook noktaları; emülatör
el-test listesi (5 giriş noktası × arkadaş/değil/kendi, engelle akışı, koyu tema,
overlay geri tuşu).

---
---

## PROMPT 3 / 6 — 11c: Tam profil sayfası (1c + koyu 1f) + derin bağlantı

Whispr monorepo'sunda (`apps/mobile`) **tam ekran profil sayfasını** uygula ve hızlı
profil kartındaki "Profili görüntüle"ye bağla. 11a (veri) + 11b (ortak kart bileşenleri
`social/profile-card/…`) hazır — keşfet, yeniden kullan.

Önce `design_handoff_whispr_profil/README.md` TAMAMEN oku; `Whispr Profil Ekranı.dc.html`
satır 465–586 (1c) ve 749–871 (1f koyu) bölümlerinden birebir değerleri çıkar;
`screenshots/1c…1f…png`'ye Read ile bak.

### Bağlam ve kurallar
Ortak blok geçerli: `uat`, commit yok, emülatör yok; mobile-copy tr+en; token'lar
`themes.ts`; 44px hedefler; testler + kontrat testleri.

### Mevcut durum (keşifle doğrula)
- Navigasyon: `navigation/mobile-navigation-types.ts` `MobileRootStackParamList` —
  UserProfile rotası YOK; navigator `navigation/mobile-navigator.tsx`; route intent
  birliği aynı dosyada (`MobileNavigationRouteIntent`). 10g'nin geri davranış kuralları
  geçerli (duplicate-route yığılması yapma).
- Derin bağlantı: `deep-link/mobile-deep-links.ts` — `whispr://` şeması mevcut (oauth,
  `channels/@me/...`); `user/{id}` intent'i YOK. `navigation/mobile-linking.ts` benzeri
  eşleme katmanını keşfet.
- Veri: 11a profil endpoint'i (mutualServers/mutualFriends preview+count, serverContext
  joinedAt+roles, registeredAt, note); sunucuya gitme: mevcut sunucu seçim/navigasyon
  akışı (`workspace/mobile-workspace-selection.ts` + ChannelChat rotası) keşfet.
- Medya önizleme verisi: `dm/[conversationId]/details` `sharedAttachments.media`
  (max 30) — profildeki kişiyle DM varsa konuşma id'sini nasıl bulacağını keşfet
  (DM listesi cache'i / `MobileDMCreateRequest` OLUŞTURMADAN; DM yoksa medya bölümü
  gizlenir). "Tümünü gör" → 11f rotası (henüz yoksa tek noktada topla, raporla).
- Görsel büyütme: `app/components/message-image-lightbox.tsx` mevcut.

### Uygulama hedefi
1. **Rota:** `UserProfile: { userId, serverId? }` — types + navigator + route intent +
   (varsa) route allowlist testleri. Kartın "Profili görüntüle"si push eder; geri
   kaynağa döner.
2. **Sayfa (1c):** 148px banner (status bar içeride; 36px geri + 36px üç-nokta,
   `rgba(255,255,255,.18)` r13 token'ı); kimlik kartı (margin -30px, r24, 84px avatar
   r28 taşmalı, rozet chip'leri, ad 20px/800, durum satırı, rol chip'leri, 11b
   `ProfileActionRow`); HAKKINDA kartı (bio 13.5/1.5; ayraç; "{Ay Yıl}'te Whispr'a
   katıldı" ← registeredAt; sunucu bağlamı varsa "{Ay Yıl}'te {sunucu}'ya katıldı" ←
   serverContext.joinedAt; tarih formatı locale'e uygun — mevcut tarih util'ini keşfet);
   NOT kartı (not varsa metin, yoksa "Not ekle (yalnız sana görünür)" placeholder; tap →
   2b sheet'i — 11e hook noktası, tek yerde topla); ORTAK SUNUCULAR — N (+"Tümünü gör";
   satır: 40px squircle + ad + "{üye} üye · {karşı tarafın rolü}" + chevron; satır tap →
   o sunucuya git; "Tümünü gör" kart içi genişletme/ayrı liste — spec'te ayrı ekran yok,
   basit çöz ve gerekçele); ORTAK ARKADAŞLAR — N (üst üste 30px avatarlar + "+X" taşma
   rozeti + "isim, isim ve N kişi daha"; satır tap → kişinin profil kartı); PAYLAŞILAN
   MEDYA — N (3'lü kare önizleme r14, gerçek thumbnail; tap → lightbox; "Tümünü gör" →
   11f). Dikey scroll.
3. **Üç-nokta:** 11b'deki bağlam menüsünün aynısı (Engelle/Bildir; 11e "Not ekle"
   ekleyecek).
4. **Varyantlar:** arkadaş-değil → buton seti 1b'deki; roller yalnız serverContext'le;
   engellenmiş → kısıtlı sayfa (11b kalıbı); kendi profilin → aksiyon satırı yerine
   "Profili düzenle" (README 1d mantığının sayfa hali; HTML'de ayrı mock yok — kart
   varyantından türet, raporda işaretle).
5. **Durumlar:** skeleton (bölüm bölüm, gerçek geometri), empty (ortak sunucu yoksa
   bölüm gizlenir; medya yoksa "Henüz paylaşılan medya yok"; bio yoksa HAKKINDA yalnız
   tarihler), error (sayfa içi uyarı + yeniden dene).
6. **Derin bağlantı:** `whispr://user/{id}` → UserProfile (cold + warm start; 10g stack
   kuralı: altında MainTabs olsun). Deep-link intent testleri güncelle.
7. **Koyu tema (1f):** README koyu token seti; theme-contract yeşil.
8. **Testler:** sayfa bölüm render'ları (jest), tarih formatlama + bölüm gizleme
   mantığı (node), rota/derin bağlantı intent testleri, maestro-testid kontratı.

### Korunacak sözleşmeler
- 11b kart bileşenleri API'si (değişiklik gerekiyorsa geriye uyumlu genişlet).
- Navigasyon geri davranış matrisi (10g); lightbox mevcut davranışı.

### Kabul kriterleri
1. Kart → sayfa → geri akışı doğru; derin bağlantı çalışıyor (test + el-test adımı).
2. Tüm bölümler gerçek veriyle doluyor; empty/error/skeleton üçü de var.
3. Ortak sunucu satırı sunucuya, ortak arkadaş satırı kişinin kartına gidiyor;
   medya önizleme lightbox açıyor.
4. Açık+koyu HTML 1c/1f ile birebir; ham renk yok; tüm komutlar yeşil; commit yok.

### Rapor
Bölüm→veri kaynağı tablosu, 11e/11f hook noktaları, kendi-profil sayfa kararı;
emülatör el-testi (kart→sayfa→geri, deep link cold/warm, arkadaş-değil, koyu tema,
uzun bio/çok rozet taşmaları).

---
---

## PROMPT 4 / 6 — 11d: Profili düzenle redesign (2a)

Whispr monorepo'sunda (`apps/mobile`) mevcut **Profili düzenle** ekranını
(`src/social/mobile-profile-edit-screen.tsx` + `.styles.ts`) README 2a spec'ine
birebir **redesign** et ve 11a'nın yeni alanlarına bağla. Bu bir yeniden yazım değil
zorunlu değil — mevcut ekranın çalışan akışlarını koruyarak görsel/işlevsel hedefe taşı;
gerekirse parçalara böl.

Önce `design_handoff_whispr_profil/README.md` TAMAMEN oku; `Whispr Profil Ekranı.dc.html`
satır 34–110 (2a); `screenshots/2a-profil-duzenleme.png`.

### Bağlam ve kurallar
Ortak blok geçerli (uat, commit yok, tr+en, token'lar, testler).

### Mevcut durum (keşifle doğrula)
- Ekran bugün: displayName/username/bio/customStatus düzenliyor, presence seçici
  (ONLINE/IDLE/DND/OFFLINE) + avatar upload (`media/use-mobile-image-upload`,
  `mobile-profile-avatar-editor.tsx`, `query/mobile-profile-cache.ts` cache patch)
  içeriyor; sheet-primitives kullanıyor; `useMobileSocialMutations` üzerinden PATCH.
- 11a ile geldi: `bannerColor`/`bannerUrl`/`customStatusEmoji`/`customStatusExpiresAt`/
  `pronouns` PATCH alanları + `nextUsernameChangeAt` + username cooldown hatası.
- Upload rotası: `apps/web/.../mobile/uploads` — avatar için hangi doğrulama/limit
  varsa banner'a aynısı (11a keşfi; eksikse burada tamamla, rate limit + tip kontrolü).
- Kaydet davranışı bugün nasıl (alan bazlı mı toplu mu) — keşfet.

### Uygulama hedefi
1. **Başlık:** 36px geri + "Profili düzenle" 17px/800 + sağda **Kaydet** birincil chip
   (9×16, r12) — yalnız kirli (değişmiş) alan varken aktif; kaydette tüm kirli alanlar
   tek PATCH; başarıda toast + cache güncelleme (avatar kalıbındaki gibi).
2. **Önizleme kartı:** 88px banner (görsel > renk > varsayılan indigo) + 34px kamera
   (banner görseli seç/çek → upload → bannerUrl); 76px avatar + 28px indigo kamera
   rozeti (3px kenarlık) → mevcut avatar akışı. **BANNER RENGİ** satırı: HTML'deki 5
   renk dairesi (34px; seçilide beyaz+indigo halka); görsel banner seçiliyken renk
   seçimi pasif (spec); görseli kaldırma yolu ekle (küçük "kaldır" aksiyonu — spec'te
   yok, UX gereği; raporda işaretle).
3. **Form kartı:** GÖRÜNEN AD input; KULLANICI ADI (kilit ikonu; altında "Kullanıcı
   adı 30 günde bir değiştirilebilir" 11px; cooldown aktifse input pasif +
   `nextUsernameChangeAt` tarihiyle metin; benzersizlik/cooldown hatası input altında
   kırmızı); HAKKINDA textarea + "62/190" tarzı sağ-alt sayaç (limit kontrattaki bio
   max'ı — 500; HTML'deki 190 mock'tur, kontrat değeri esas, README "gerçek
   kaynak" kuralı) — input stilleri HTML'den (r14, 11×14 padding, 14px/600).
4. **DURUM MESAJI kartı:** emoji seçici (mevcut `message-emoji-picker` altyapısını
   keşfet — uygunsa yeniden kullan, değilse basit emoji girişi) + metin + × temizle;
   altında "{süre} sonra otomatik temizlenir" — süre seçenekleri (30dk/1s/4s/bugün/
   kalıcı gibi; README "kullanıcının seçtiği süre") → `customStatusExpiresAt` mutlak
   zamana çevrilir. Presence seçici mevcut ekranda vardı — 2c sheet'i 11e'de geliyor;
   bu ekranda spec'te presence yok: mevcut presence bölümünü koru ya da kaldırıp 1d/2c
   akışına bırak — **kaldırıyorsan** 11e'nin gelmemiş olabileceğini hesaba kat
   (11e'den önce koşulursa erişilebilir bir durum değiştirme yolu bırak; kararını
   raporda gerekçele).
5. Altta bilgi satırı: "Profilin tüm sunucularda aynı görünür".
6. **Testler:** dirty-state/Kaydet aktivasyonu, cooldown UI, sayaçlar, banner
   renk/görsel etkileşimi (jest); expiry hesaplama (node); theme/testid kontratları.

### Korunacak sözleşmeler
- Mevcut avatar upload + cache patch akışı bozulmaz; `ProfileEdit` rotası ve ekrana
  gelen mevcut girişler (ayarlar, 11b "Düzenle") çalışır kalır.
- Alan validasyonları kontratla birebir (`MobileProfileUpdateSchema` limitleri).

### Kabul kriterleri
1. Ekran HTML 2a ile açık+koyu birebir; Kaydet yalnız değişiklikte aktif; tek PATCH.
2. Banner görsel + renk akışı spec'teki pasifleşme dahil çalışıyor; avatar akışı
   regresyonsuz.
3. Username cooldown gerçek sunucu hatası/`nextUsernameChangeAt` ile doğru; bio sayacı
   kontrat limitiyle.
4. Durum mesajı emoji+süre PATCH'leniyor; süre dolunca görünmüyor (11a okuma kuralı).
5. Komutlar yeşil; commit yok.

### Rapor
Alan→kontrat eşleme tablosu, presence bölümü kararı, banner kaldırma UX notu;
emülatör el-testi (kaydet dirty akışı, banner foto çek/seç, cooldown görünümü,
emoji+süre, koyu tema).

---
---

## PROMPT 5 / 6 — 11e: Not yazma sheet'i (2b) + Durum seçici (2c)

Whispr monorepo'sunda (`apps/mobile`) iki sheet'i uygula ve 11b/11c'de bırakılan hook
noktalarına bağla: **Not yazma** (2b) ve **Durum seçici** (2c). 11a (not API + presence),
11b (kart + menü), 11c (tam sayfa NOT kartı) hazır — hook noktalarını keşfet
(11b/11c raporlarında "11e" işaretli TODO'lar).

Önce `design_handoff_whispr_profil/README.md` TAMAMEN oku; HTML satır 111–171 (2b),
172–226 (2c); `screenshots/2b…2c…png`.

### Bağlam ve kurallar
Ortak blok geçerli. Sheet'ler `kit/sheet-primitives` + `overlay-registry` ile; RN Modal
yasak; klavye davranışı için `app/mobile-chat-keyboard-region.tsx` kalıbını ve sheet'in
klavyeyle ilişkisini keşfet (transform-persistent bölge — 9a).

### Mevcut durum (keşifle doğrula)
- Not: 11a `saveMobileUserNote` mutation + profil query'sindeki `note` alanı +
  optimistic cache güncellemesi.
- Presence: `PUT account/presence` mevcut; "Görünmez" = OFFLINE yazımı (11a
  doğrulamıştı); presence seçimi bugün `mobile-profile-edit-screen.tsx` içinde —
  oradan sheet'e taşınma kararı 11d'de verildi (keşfet).
- Durum mesajı: 11a alanları (customStatus/emoji/expiresAt); 11d'nin DURUM MESAJI
  kartı varsa giriş bileşenini yeniden kullan.
- Sheet kalıbı: `useSheetPresentation` + SheetHeader/OptionSheet/ActionSheet; klavyeli
  sheet örneği var mı keşfet (yoksa kur: sheet klavye yüksekliğine göre yukarı iter).

### Uygulama hedefi
1. **NoteSheet (2b):** overlay + alt sheet (üst r28, 44×5 tutamaç) klavye üstüne oturur;
   başlık "Not — {kullanıcı}" 16px/800 + sağda "Kaydet" (indigo 13px/700; boş ve
   değişmemişken pasif); textarea `#F6F7FB`-token zemin, odakta 1.5px indigo kenarlık +
   3px `rgba(79,70,229,.12)` halka (token), sağ-alt "49/256" sayaç (kontrat limiti 256);
   altında kilit ikonu + "Yalnız sana görünür — {kullanıcı} bunu göremez" 11.5px.
   Kaydet → not API; 1c NOT kartı ve kart menüsü anında güncellenir (optimistic).
   Mevcut notla açılırsa metin dolu gelir; tamamen silme = boş kaydet.
2. **Girişler:** 1c NOT kartı tap; 11b/11c üç-nokta menüsüne "Not ekle" satırı (kalem
   ikonu; not varsa "Notu düzenle" — locale'e ikisi de) ekle.
3. **StatusPickerSheet (2c):** overlay + sheet (üst r28, tutamaç, "Durum" 19px/800);
   4 satır (36px ikon kutusu r13 + 15px etiket + 11.5px alt metin): Çevrimiçi (yeşil
   dolu nokta), Boşta (turuncu ay), Rahatsız etmeyin (kırmızı eksi-daire; "Tüm
   bildirimler susturulur"), Görünmez (içi boş gri halka; "Çevrimdışı görünürsün, her
   şeyi kullanabilirsin"). Seçili satır: lavanta zemin + kenarlık r16 + indigo 700 +
   sağda check (koyu tema eşdeğerleri token'dan). Seçim → anında `PUT presence`
   (Görünmez=OFFLINE) → sheet kapanır; tüm ekranlardaki durum noktaları socket/query
   üzerinden güncellenir (11a köprüsü — çalıştığını testle göster).
   Ayraç + **"Durum mesajı ekle"** satırı (kalem, lavanta kutu) + mevcut durum mesajı
   önizleme + chevron → durum mesajı girişi (11d bileşeni varsa onu sheet içinde/üstünde
   aç; yoksa mini giriş sheet'i: emoji + metin + süre → PATCH profile).
4. **Girişler:** 1d kartındaki durum satırı + "Durum mesajı ekle" kesikli satırı; 11d
   presence bölümünü kaldırdıysa ayarlardaki giriş de bu sheet'e gelsin (keşfet).
5. **Haptik:** durum değişiminde hafif geri bildirim (11b util'i).
6. **Testler:** not kaydet/sil + optimistic senkron (jest + node), sayaç/pasif Kaydet,
   presence seçim → PUT + kapanış, seçili durum stili; testid + theme kontratları.
   Klavye davranışı el-testine.

### Korunacak sözleşmeler
- 9a klavye bölgesi davranışı (composer'lar) bozulmaz; overlay geri davranışı; 11b kart
  menü yapısı geriye uyumlu.

### Kabul kriterleri
1. Not akışı uçtan uca: karttan/sayfadan aç → yaz → kaydet → 1c kartı + menü etiketi
   güncel; yalnız yazana görünür (farklı hesap el-testi adımı).
2. Durum seçici 4 durumu yazıyor; Görünmez OFFLINE görünüyor; seçim anında her yerde
   (kart, üye listesi, DM) güncelleniyor.
3. Durum mesajı girişi emoji+süreyle çalışıyor; 1d önizlemesi güncel.
4. İki sheet açık+koyu HTML 2b/2c ile birebir; komutlar yeşil; commit yok.

### Rapor
Hook bağlama listesi (nereden nereye), presence giriş noktaları haritası; emülatör
el-testi (klavyeyle sheet itilmesi, not senkronu iki ekran arası, durum değişiminin
üye listesine yansıması, koyu tema).

---
---

## PROMPT 6 / 6 — 11f: Paylaşılan medya galerisi (2d) + sayfalama backend'i

Whispr monorepo'sunda **paylaşılan medya galerisini** uçtan uca uygula: DM konuşmasındaki
medya/dosya/bağlantıların sayfalanmış tam listesi. 11a/11c hazır; 1c "Tümünü gör" bu
ekrana bağlanacak (11c raporundaki hook noktası).

Önce `design_handoff_whispr_profil/README.md` TAMAMEN oku; HTML satır 227–276 (2d);
`screenshots/2d-medya-galerisi.png`.

### Bağlam ve kurallar
Ortak blok geçerli (uat, commit yok, tr+en, token'lar, rate limit + yetki, kontrat
testleri, route-contract allowlist).

### Mevcut durum (keşifle doğrula)
- `GET dm/[conversationId]/details` bugün `sharedAttachments` (media/files, **max 30**)
  dönüyor — route-logic'ini oku: hangi tablodan, hangi filtreyle. `MobileDMShared
  AttachmentSchema` = attachment + messageId + messageCreatedAt.
- DB: `DMMessage` + `Attachment` (+ `MobileMediaUpload`) modelleri; video/süre metadata
  var mı keşfet (`Attachment` alanları) — süre yoksa rozet yalnız metadata'lı
  öğelerde görünür (uydurma yok).
- Bağlantılar: mesaj içi URL'ler için mevcut altyapı — `MobileLinkPreview*` (on-demand
  preview) + `dm/.../messages/search` route'u. DMMessage content'inde URL taraması
  gerekecek; maliyet/index kararını keşfe göre ver.
- Mobil: DM medya görselleri `app/components/media-primitives.tsx` +
  `mobile-cached-image.tsx`; lightbox `message-image-lightbox.tsx`; sonsuz liste
  kalıbı (FlashList) hangi ekranda nasıl kullanılıyor keşfet; segment chip bileşeni
  (5a-5i SegmentChip) `kit/` içinde mi bak.
- DMDetails ekranı (`DMDetails` rotası) bugün medyayı nasıl gösteriyor — tutarlılık.

### Uygulama hedefi
1. **Backend:** `GET /api/v1/mobile/dm/[conversationId]/attachments?tab=media|files|links
   &cursor&limit` (adlandırmayı mevcut kalıpla hizala): katılımcı yetki kontrolü +
   rate limit; `media` = görsel/video attachment'lar, `files` = diğer dosyalar,
   `links` = URL içeren mesajlardan çıkarılmış bağlantılar (mesaj başına çoklu olabilir;
   title/preview alanlarını ucuza dolduramıyorsan URL + mesaj tarihi yeter, preview'i
   istemci mevcut link-preview endpoint'iyle tembel yükler — kararını gerekçele).
   Cursor tabanlı sayfalama (mevcut messages cursor kalıbı); yeni kontrat şemaları +
   fixture testleri; `details` içindeki 30'luk özet DEĞİŞMEZ.
2. **Rota + ekran:** `SharedMedia: { conversationId, userId? }` (başlıkta "{kullanıcı}
   ile · N öğe" için katılımcı adı — details/cache'ten); başlık (geri + "Paylaşılan
   medya" 17px/800 + alt satır 12px); **segment chip'leri** Medya/Dosyalar/Bağlantılar
   (aktif: koyu zemin beyaz 700 — token; gerçek sekme state'i, sekme başına ayrı
   query + cache).
3. **Medya sekmesi:** ay başlıkları ("TEMMUZ 2026" — messageCreatedAt'ten, locale'e
   uygun büyük harf) + 3 sütun grid (6px gap, r14 kare); video öğede sağ-alt süre
   rozeti (metadata varsa); thumbnail'ler `mobile-cached-image` ile; tap → mevcut
   lightbox (grid bağlamında gezinme davranışını lightbox'ın mevcut API'siyle çöz);
   sonsuz scroll (cursor), alt yükleme göstergesi.
4. **Dosyalar sekmesi:** dosya ikonu + ad + boyut satırları (attachment metadata);
   tap → mevcut dosya açma/indirme davranışı neyse o (keşfet; yoksa görüntüleme
   kapsam dışı — raporla).
5. **Bağlantılar sekmesi:** link satırları (URL/başlık + tarih); tap → sistem tarayıcı
   (mevcut güvenli açma util'i keşfet); preview tembel yükleme kararına göre.
6. **Durumlar:** skeleton grid; empty ("Henüz paylaşılan medya yok" + sekme başına
   eşdeğeri); error + yeniden dene; offline banner davranışıyla uyum.
7. **Bağlama:** 1c PAYLAŞILAN MEDYA "Tümünü gör" → bu rota; DMDetails ekranındaki
   mevcut medya bölümünde de "tümünü gör" mantığı varsa aynı rotaya bağla (keşfet).
8. **Testler:** route-logic (yetki, sekme filtreleri, cursor, link çıkarımı), ay
   gruplama + görünüm modeli (node), ekran render + sekme geçişi (jest), testid/theme/
   route-contract güncellemeleri.

### Korunacak sözleşmeler
- `details` response şeması ve mevcut tüketicileri; lightbox mevcut davranışı;
  FlashList performans kalıpları (memoize, sabit boyutlu hücre).

### Kabul kriterleri
1. Üç sekme gerçek veriyle sayfalanıyor; 1c'den giriş çalışıyor; geri 1c'ye dönüyor.
2. Ay başlıkları gerçek tarihlerden; grid HTML 2d ile açık+koyu birebir; süre rozeti
   yalnız gerçek metadata ile.
3. Tap → lightbox/dosya/tarayıcı davranışları çalışıyor; sonsuz scroll akıcı
   (görünür jank yok — hücre memoization raporda).
4. Komutlar yeşil; commit yok.

### Rapor
Endpoint sözleşmesi + link çıkarım kararı, sekme→veri kaynağı tablosu; emülatör
el-testi (uzun geçmişte scroll + sayfalama, sekme geçişleri, video rozeti, lightbox
dönüşü, koyu tema, boş konuşma).
