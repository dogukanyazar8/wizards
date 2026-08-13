# 02 — Kimlik doğrulama yüzeyi: 2FA, oracle'lar, CAPTCHA

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 01 landed (aynı `auth.ts` dosyasına dokunuyor).

## Sorun

İkinci faktör bir yoldan tamamen atlanıyor; üç ayrı uç hesabın var olup olmadığını söylüyor; CAPTCHA bypass'ı üretimde açılabiliyor.

## Kapsam

### 1. TOTP, Google OAuth ile atlanıyor

`apps/web/src/auth.ts:712`, `:736` · `apps/web/src/lib/mobile/google-native-auth.ts:222`

İki faktör yalnız credentials `authorize` yolunda zorlanıyor. `allowDangerousEmailAccountLinking: true` Google'ı e-postayla mevcut parolalı hesaba bağlıyor, `signIn` callback'i `twoFactorEnabled`'ı hiç okumuyor. 2FA açık kullanıcı "Google ile devam et" ile tek faktörle giriyor.

Yap:

- `signIn` callback'inde çözülen kullanıcı `twoFactorEnabled` ise OAuth girişini **reddet** ve step-up iste.
- Aynı kararı `linkMobileGoogleAccount` çağıranında da uygula — mobil yol web'den bağımsız.
- Step-up akışının UI'ı yoksa: minimum çözüm, 2FA açık hesapta OAuth girişini reddedip kullanıcıyı parola+TOTP yoluna göndermek. Yeni ekran yazma.

**Karar gerekiyor:** `allowDangerousEmailAccountLinking` tamamen kapatılsın mı, yoksa yalnız 2FA'lı hesaplarda mı engellensin? İkincisi daha az kırıcı — onu uygula, birincisini kullanıcıya seçenek olarak sun.

### 2. `disableTwoFactor` parola oracle'ı

`apps/web/src/lib/auth/two-factor.ts:545` · `apps/web/src/lib/account/actions.ts:372`

Yanlış parola `invalid_credentials`, doğru parola + yanlış kod `invalid_code` dönüyor. Parola dalında deneme sayacı çalışmıyor, çağıran server action'da rate limit yok.

Yap:

- Parola dalını da `twoFactorAttemptTracker.recordFailure`'dan geçir.
- İki hata için **aynı** genel hata kodunu dön.
- `disableTwoFactorAction`'a rate limit ekle — mevcut `enforceApiRateLimit` tablosuna yeni bir bütçe girişi, yeni mekanizma değil.

### 3. Hesap varlık oracle'ı — mobil kayıt ve giriş

`apps/web/src/lib/mobile/auth.ts:767`, `:643`

Kayıt: doğrulanmış e-posta `EMAIL_TAKEN`/409, bilinmeyen 200. Giriş: bilinmeyen e-postada bcrypt hiç koşmuyor (cost 12 ≈ birkaç yüz ms) — yanıt süresi ayırt ediyor.

Yap:

- Kayıt: alınmış doğrulanmış e-posta için de 200 `verification-required` dön; sahibine "birisi adresinle kayıt olmaya çalıştı" bildirimi gönder.
- Giriş: eksik kullanıcı dalında sabit bir dummy bcrypt hash'ine karşı `comparePassword` çalıştır (aynı cost), sonra `null` dön.
- Web tarafında aynı iki uç varsa onları da hizala; yoksa dokunma.

### 4. Turnstile bypass'ı host kontrolsüz

`apps/web/src/lib/auth/turnstile.ts:96` · `apps/web/src/lib/e2e/route-guard.ts:62`

Sabit `E2E_TURNSTILE_TOKEN` yalnız iki env değişkenine bakılarak kabul ediliyor; kardeş E2E kapısının uyguladığı `isLocalE2EHost` kontrolü yok. `E2E_ALLOW_PRODUCTION_BUILD=true` desteklenen bir üretim yapılandırması, token `NEXT_PUBLIC_*` ile istemci paketinde.

Yap: bypass yoluna `assertE2EApiRouteEnabled`'ın host ve yapılandırılmış-URL kontrollerini uygula. Kontrolü kopyalama — var olan yardımcıyı çağır.

### 5. Şifre sıfırlama uçlarında CAPTCHA yok

`apps/web/src/lib/auth/actions.ts:369`, `:436`

`forgotPasswordAction` ve `resetPasswordAction` kimliksiz uçlar ama Turnstile doğrulaması yok; kayıt ve giriş var. Ağ kovası da (03 no'lu prompt) çöktüğünde tek sınır adres başına 5/saat kalıyor — sınırsız adrese markalı e-posta göndermek mümkün.

Yap: `forgotPasswordAction`'a `verifyTurnstileToken` ekle. `resetPasswordAction` token taşıdığı için ikinci önceliktir; eklemek ucuzsa ekle.

## Yapılmayacak

- Yeni 2FA yöntemi (WebAuthn, SMS).
- Oturum/çerez yaşam döngüsüne dokunma — 01'in işi.
- IP güveni ve rate limit altyapısı — 03'ün işi.
- Yeni step-up ekranı tasarlama.

## Kabul kriterleri

1. `twoFactorEnabled` hesapta OAuth girişi ikinci faktör olmadan tamamlanmıyor — web ve mobil.
2. `disableTwoFactor` yanlış parola ile yanlış kodu ayırt edilemez biçimde reddediyor ve deneme sayacını artırıyor.
3. Mobil kayıt, alınmış ve alınmamış e-posta için aynı durum kodu ve gövde şeklini dönüyor.
4. Mobil giriş, bilinmeyen e-postada da bcrypt karşılaştırması kadar süre harcıyor.
5. Turnstile bypass token'ı yerel olmayan bir host'ta reddediliyor.
6. `forgotPasswordAction` geçersiz Turnstile token'ıyla e-posta göndermiyor.

## Testler

- OAuth 2FA reddi: `signIn` callback'i saf bir karar fonksiyonuna çekilip test edilir.
- `disableTwoFactor`: iki hata dalının aynı sonucu dönmesi + sayacın artması.
- Kayıt/giriş oracle: yanıt şekli eşitliği; bcrypt çağrısının her iki dalda da yapıldığı (enjekte edilmiş `comparePassword` casusu ile).
- Turnstile: yerel olmayan host'ta bypass reddi.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
