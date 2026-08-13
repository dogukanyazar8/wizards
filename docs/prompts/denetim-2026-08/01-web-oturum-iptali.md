# 01 — Web oturum iptali gerçekten iptal etsin

`docs/prompts/denetim-2026-08/00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok. Paketin ilk promptu.

## Sorun

Oturum iptali üç ayrı yerden delik. Şifre sıfırlayan kullanıcı hâlâ ele geçirilmiş durumda kalıyor, iptal edilen kullanıcı ise uygulamaya hiç giremiyor.

## Kapsam

### 1. `iat` kayması — çalınan çerez iptali atlıyor

`apps/web/src/auth.ts:812` · `apps/web/src/lib/auth/session-revocation.ts:100`

İptal kontrolü `token.iat`'i `sessionsRevokedAfter` ile karşılaştırıyor. Auth.js `encode` her oturum okumasında `setIssuedAt()` çağırıyor, kontrol ise `SESSION_REVOCATION_CHECK_INTERVAL_SECONDS = 60` ile kısılmış. Çalınmış çerez o 60 sn içinde tek istek atarsa `iat` iptal damgasının önüne geçiyor ve oturum kalıcı olarak hayatta kalıyor.

Yap:

- Token'a girişte bir kez yazılan, `encode`'un dokunmadığı bir alan koy (ör. `sessionStartedAt`). `jwt` callback'inde yalnız yoksa yaz.
- `isUserSessionRevoked`'a `token.iat` yerine bu alanı geçir.
- `token.revocationCheckedAt = nowSeconds` satırını kontrol **sonrasına** al — şu anda kontrolden önce yazıldığı için geçici bir Redis+Postgres hatası bedava 60 sn veriyor.

### 2. Şifre sıfırlama mobil oturumları düşürmüyor

`apps/web/src/lib/auth/password-reset.ts:395` · `apps/web/src/lib/mobile/refresh-token-family.ts:871`

`revokeUserSessions` yalnız web JWT'sini etkileyen Redis anahtarını yazıyor. `isMobileRefreshFamilyActive` yalnız `sessionId`/`userId` eşliyor, `sessionsRevokedAfter`'ı hiç okumuyor.

Yap: iki seçenekten **birini** seç, ikisini birden yapma.

- (a) `isMobileRefreshFamilyActive` ailenin oluşturulma zamanını `sessionsRevokedAfter` ile karşılaştırsın. Ailede zaman damgası yoksa ekle.
- (b) `revokeUserSessions` kullanıcının refresh ailelerini de silsin.

(a) tercih edilir: tek okuma noktası, silme taraması gerektirmez, yeni anahtar deseni doğurmaz.

### 3. İptal sonrası yönlendirme kilidi

`apps/web/src/proxy.ts:251` · `apps/web/src/auth.ts:242`

`clearJwtUserState` token payload'ını boşaltıyor ama çerez yeniden yayınlanıyor ve decode oluyor; proxy `isAuthenticated = Boolean(token)` diyor. Korumalı sayfa `/login`'e, proxy `/login`'den `/channels`'a atıyor → `ERR_TOO_MANY_REDIRECTS`. `token.id` de silindiği için yasaklı kullanıcı itiraz ekranına ulaşamıyor.

Yap:

- `proxy.ts`'te `token.revoked === true` veya boş `sub` durumunu **kimliksiz** say.
- İptal edilen oturumda süresi dolmuş çerez başlıklarını gönder (`expireAuthSessionCookies` zaten var).
- Yasaklı kullanıcının `user.id`'ye ihtiyacı olan itiraz yolunu kontrol et: `clearJwtUserState` id'yi siliyorsa itiraz akışı `requireBannedApiUserId` ile hâlâ çalışıyor mu? Çalışmıyorsa yasaklı ile iptal edilmiş durumu ayır.

### 4. `Session` satırları hiç süpürülmüyor

`packages/db/prisma/schema.prisma:723`

Her giriş kalıcı bir bearer + refresh token satırı bırakıyor; `expiresAt` indekssiz. Kardeş token tabloları hem indeksli hem süpürülüyor.

Yap:

- `outbox/worker.ts` saatlik bloğuna süresi geçmiş `Session` silmesi ekle. **Ama** 04 no'lu promptun bu bloğu try/catch'e böleceğini unutma — bu prompt yalnız çağrıyı ekler, blok yapısını değiştirmez.
- İndeks 12 no'lu promptta eklenecek; burada **şemaya dokunma**, yalnız süpürmeyi ekle ve 12'ye not bırak.

## Yapılmayacak

- Auth.js sürüm yükseltmesi.
- Yeni oturum deposu, yeni token formatı.
- Mobil tarafta oturum yaşam döngüsüne dokunma — o 07 no'lu promptun işi.
- Rate limit / IP güvenine dokunma — 03'ün işi.

## Kabul kriterleri

1. İptal damgasından sonra yapılan bir istek, token 59 sn önce yeniden damgalanmış olsa bile reddediliyor.
2. Redis okuması hata verirse `revocationCheckedAt` ilerlemiyor; sonraki istek tekrar kontrol ediyor.
3. Şifre sıfırlama sonrası mobil refresh ailesi reddediliyor.
4. İptal edilmiş çerezle `/channels` isteği `/login`'e gidiyor ve orada **kalıyor** — yönlendirme döngüsü yok.
5. Saatlik blok süresi geçmiş `Session` satırlarını siliyor.

## Testler

- `apps/web/src/lib/auth/session-revocation.test.ts` (veya yanına): iptal damgası + yeniden damgalanmış `iat` senaryosu; kontrol hatasında `revocationCheckedAt` ilerlememesi.
- Mobil refresh ailesi reddi için `refresh-token-family` testine iptal senaryosu.
- Proxy kararı için saf fonksiyon testi (`isAuthenticated` türetimi) — Next request'i mock'lamaya çalışma, kararı ayrılabilir bir fonksiyona çek ve onu test et.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
