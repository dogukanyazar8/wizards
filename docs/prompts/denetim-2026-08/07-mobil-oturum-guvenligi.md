# 07 — Mobil oturum güvenliği

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 01 landed (sunucu tarafı iptal semantiği oradan gelir).

## Sorun

Derin bağlantıyla oturum değiştirilebiliyor; uygulama kilidi kilitlemeden içerik gösteriyor; çıkış yapmış kullanıcı geri diriliyor; tanınmayan ortam adı HTTPS zorlamasını kapatıyor.

## Kapsam

### 1. Derin bağlantıyla oturum ele geçirme — `state` yok

`apps/mobile/src/app/providers/mobile-deep-link-provider.tsx:66` · `apps/mobile/src/deep-link/mobile-deep-links.ts:119`, `:296` · `apps/mobile/src/auth/mobile-auth-context.tsx:576`, `:789`

Gelen her `whispr://oauth/<token>` koşulsuz oturuma çevriliyor. `buildMobileWebSocialSignInUrl` yalnız `callbackUrl`/`provider`/`client` gönderiyor — nonce/state yok. `whispr:` düz özel şema; herhangi bir web sayfası veya yüklü uygulama tetikleyebilir. Saldırgan kendi hesabı için token üretip kurbana iletirse uygulama sessizce takas edip **kullanıcıyı değiştiriyor**.

Yap:

- `startSocialSignIn` rastgele bir `state` üretsin, bellekte (ref) ve tercihen SecureStore'da tutsun.
- `state`'i `/mobile/oauth/start` sorgu parametresi olarak taşı; web `/mobile/oauth/complete` onu `whispr://oauth/...` bağlantısına geri koysun. **Sunucu tarafı değişikliği gerekiyorsa** bu prompt onu da yapar — `apps/web/src/app/mobile/oauth/**`.
- `parseAuthHandoffIntent` `state` taşımayan veya eşleşmeyen bağlantıyı **düşürsün**.
- Uçuşta bir giriş akışı yokken gelen handoff intent'i yok say.
- Zaten `signed-in` durumdayken handoff **oturumu değiştirmesin**.

Bu, paketin en yüksek riskli maddesi ve tek gerçek protokol değişikliği. Karşılıklı iki taraf (mobil + web oauth complete) aynı anda değişmeli.

### 2. Uygulama kilidi iyimser

`apps/mobile/src/auth/mobile-auth-context.tsx:882`, `:329`, `:310`, `:496` · `apps/mobile/src/app/mobile-product-app.tsx:470`

`appLockLocked = appLockStatus === "locked"`. `refreshSessionFromStorage` depodan `"signed-in"` yazıyor; SecureStore tercihi + `hasHardwareAsync()` + `isEnrolledAsync()` çözülene kadar durum `"idle"`/`"checking"` ve kilitli sayılmıyor. Her soğuk açılış ve her resume'da DM listesi ve sohbet içeriği boyanıyor.

Yap: kötümser başla. Her iki okuma en az bir kez çözülene dek `"idle"` ve `"checking"`'i **kilitli** say. Çözüm sonrası kilit gerekmiyorsa aç.

### 3. Çıkış sonrası oturum dirilmesi

`apps/mobile/src/auth/mobile-auth-context.tsx:429`, `:501`, `:526`

Uçuştaki refresh iptal edilmiyor, jenerasyon kontrolü yok. `signOut` iki ağ çağrısını beklerken bir `getAccessToken()` refresh'i tetikliyor; refresh `repository.clear()`'dan sonra çözülünce **yeni (iptal edilmemiş) token'ları geri yazıp** `signed-in`'e dönüyor.

Yap: `signOut`'ta artan bir jenerasyon sayacı tut. Refresh sonucu yazılmadan önce jenerasyonu kontrol et; ilerlemişse sonucu at, kaydetme, durumu değiştirme.

### 4. Çıkış 24 sn'ye kadar bloklu

`apps/mobile/src/auth/mobile-auth-context.tsx:504`, `:517`, `:526` · `apps/mobile/src/api/mobile-api-client.ts:54`

İki ağ çağrısı (`DEFAULT_TIMEOUT_MS = 12_000` × 2) sırayla bekleniyor, arayüz tam yetkili kalıyor. Aynı pencere yukarıdaki yarışı kolaylaştırıyor.

Yap: önce `repository.clear()` + `signed-out` commit; iki iptal çağrısını arka planda best-effort yap.

### 5. Push kaydı iptali bayat token ile gidiyor

`apps/mobile/src/auth/mobile-auth-context.tsx:507`, `:510`

Revoke çağrısı `getAccessToken()`'ı (yenileme yapan) bilerek atlıyor ve 401'i yutuyor. Access token süresi dolmuşsa cihaz eski kullanıcının push'ları için kayıtlı kalıyor — kilit ekranında mesaj önizlemeleri gelmeye devam ediyor.

Yap: revoke için `ensureFreshSession` üzerinden token çöz. #4'teki sıralamayla birlikte: temizlik önce, revoke arkada — ama arkadaki revoke taze token kullansın.

### 6. Refresh token'sız oturum sonsuza kadar "signed-in"

`apps/mobile/src/auth/session-manager.ts:169` · `mobile-auth-context.tsx:415`, `:472`

`refreshToken` null olan bir oturum yenilenemiyor ve hiç geçersizleştirilmiyor. Access token dolduğunda uygulama `signed-in` görünüyor, her istek 401 alıyor, kullanıcı giriş ekranına hiç dönmüyor.

Yap: `isMobileSessionExpired` true ve refresh token yoksa depoyu temizle ve `signed-out` commit et.

### 7. Ortam adı tanınmazsa `development`

`apps/mobile/src/config/environment.ts:64`, `:132`

Tanınmayan `EXPO_PUBLIC_WHISPR_MOBILE_ENV` sessizce `"development"` oluyor; HTTPS ve yerel-olmayan-host iddiaları yalnız o ortamda atlanıyor. EAS profilindeki bir yazım hatası cleartext gönderen bir yapı üretir; `PerformanceDiagnostics` rotası da açılır.

Yap: tanınmayan değerde **fırlat**. Fallback yalnız `__DEV__` altında kalsın.

### 8. SecureStore okuma hatası kullanıcıyı çıkışa atıyor

`apps/mobile/src/auth/mobile-auth-context.tsx:481`

Android Keystore geçici hataları (reboot sonrası ilk açılış, cihaz geri yükleme) oturumu diskte bırakırken kullanıcıyı hoş geldin ekranına düşürüyor; doğal tepki yeniden giriş yapıp ikinci oturum üretmek.

Yap: bir kez yeniden dene; yine olmazsa hata durumunda **yeniden dene** eylemi sun, giriş yığınına düşürme.

## Yapılmayacak

- Biyometri sağlayıcısı değiştirme.
- Yeni oturum deposu.
- Sunucu tarafı oturum semantiğine dokunma — 01'in işi.
- Derin bağlantı rota tablosunu genişletme.

## Kabul kriterleri

1. `state` taşımayan veya eşleşmeyen `whispr://oauth/...` bağlantısı oturumu değiştirmiyor; zaten girişli kullanıcıda hiçbir handoff kullanıcıyı değiştirmiyor.
2. Soğuk açılışta ve resume'da, kilit tercihi çözülene kadar korumalı içerik çizilmiyor.
3. `signOut` sırasında çözülen bir refresh oturumu diriltmiyor.
4. `signOut` çağrıldığı anda arayüz çıkışa geçiyor; ağ çağrıları arkada.
5. Refresh token'sız süresi dolmuş oturum `signed-out` oluyor.
6. Tanınmayan ortam adı yapı zamanında hata veriyor.

## Testler

- Deep link: `state` yok / yanlış / doğru üçlüsü; girişliyken handoff reddi.
- Kilit: tercih okuması çözülmeden `appLockLocked === true`.
- Çıkış yarışı: sahte refresh `clear()` sonrası çözülsün, oturum yazılmasın.
- Refresh token'sız süresi dolmuş oturum: `signed-out`.
- Ortam: tanınmayan değerde fırlatma.
- Bileşen testi: kilit ekranı boyanmadan DM listesi görünmüyor.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
cd apps/mobile && npx jest component-tests
```
