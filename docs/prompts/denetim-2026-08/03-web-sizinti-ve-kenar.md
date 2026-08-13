# 03 — Sızıntı yüzeyleri ve istek kenarı

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok. 01/02 ile paralel koşabilir (dosya çakışması yok).

## Sorun

Canlı kimlik bilgileri telemetriye gidiyor; rate limit kimliği saldırgan kontrolünde ve bozuk değerde sessizce çöküyor; iki sink kullanıcı girdisini doğrulamadan çalıştırıyor.

## Kapsam

### 1. Sentry canlı token ve DB kimlik bilgisi alıyor

`apps/web/instrument.ts:67`, `:30` · `apps/web/src/lib/logger.ts:10`, `:28`

`beforeSend` yalnız `event.message`, exception değerleri ve breadcrumb mesajlarını temizliyor — `event.request.url` / `query_string`'i değil. `?accountReauthToken=…` (hesap silme yetkisi) ve `?token=…` (şifre sıfırlama) query'de taşınıyor. Ayrıca sunucu temizleyicisi `logger.ts`'in beş kalıbından ikisini uyguluyor: `postgresql://user:PASS@host` içeren Prisma/Redis hataları maskesiz gidiyor.

Yap:

- Kalıp listesini **tek** bağımlılıksız modüle taşı; `instrument.ts` ve `logger.ts` onu import etsin. (SRP: bir kalıp listesi, bir sahip.)
- `beforeSend`'e `event.request.url` ve `event.request.query_string` temizlemesi ekle; kimlik taşıyan parametreleri düşür.

### 2. `getTrustedClientIp` hiçbir güven doğrulaması yapmıyor

`apps/web/src/lib/security/client-ip.ts:46`, `:25`, `:59`

Ham `x-real-ip` başlığı rate limit anahtarı oluyor. Değer yoksa veya virgüllüyse `normalizeIpAddress` `null` dönüyor ve kimlik sessizce **subject hash'ine çöküyor** — "ağ" ve "konu" kovaları tek kovaya iniyor. Parola spreyi ve sıfırlama e-postası bombardımanı sınırsız hâle geliyor.

Yap:

- Fallback'i kaldır. Ağ kimliği çözülemiyorsa **paylaşılan tek bir "güvenilmeyen" kovası** kullan, subject değerine düşme.
- IP'yi yapılandırılmış güvenilir proxy setinden veya sabit hop sayısıyla `x-forwarded-for`'dan çöz. Yapılandırma yoksa bunu ortam değişkeni olarak ekle — bu paketteki tek yeni config anahtarı, gerekçesi rate limit doğruluğu.
- Fonksiyonun adı davranışını anlatsın; anlatmıyorsa adı düzelt.

### 3. Admin konsolunda XSS — hata raporu ekran görüntüsü

`apps/web/src/components/admin/sections/admin-support-reports.tsx:206` · `packages/types/src/mobile.ts:1325` · `apps/web/src/lib/support/bug-report-service.ts:108`

`screenshotUploadKey` şeması `.url()` veya şema kontrolü taşımıyor; değer aynen saklanıp admin konsolunda `href` olarak basılıyor. `javascript:` şeması geçiyor. Mesaj render'ı aynı sorunu `defaultUrlTransform` ile çözmüş.

Yap: iki katman birden.

- Şemada doğrula: yalnız `https:` kabul et, veya upload key'i sunucuda CDN URL'ine çöz.
- Sink'i koru: mesaj render'ının kullandığı aynı URL dönüşümünden geçir.

### 4. CSRF kapısı sinyal yokluğunda izin veriyor

`apps/web/src/proxy.ts:73`, `:86`

`Sec-Fetch-Site`, `Origin` ve `Referer`'ın üçü de yoksa mutasyon **kabul ediliyor**. Kapı proxy'de fail-closed olmak için var.

Yap: durum değiştiren istekte hiçbir köken sinyali yoksa **reddet**. Tarayıcı olmayan istemciler çerez yerine Bearer token yolunu kullansın; kullanmıyorsa hangi istemcinin kırıldığını raporla — düzeltmeyi kullanıcıya sor.

### 5. Hesap silme re-auth token'ı query parametresinde

`apps/web/src/lib/auth/reauth-email.ts:123`

10 dakikalık, geri alınamaz hesap silmeyi yetkilendiren kimlik bilgisi `/settings?accountReauthToken=…` olarak gönderiliyor: tarayıcı geçmişi, proxy log'ları, Sentry request URL'i.

Yap: token'ı yola taşı (`/settings/reauth/<token>`) veya tüketildikten hemen sonra istemcide URL'den temizle. Düşük efor olanı seç; ikisini birden yapma.

## Yapılmayacak

- Yeni telemetri sağlayıcısı, yeni log altyapısı.
- Sentry örnekleme oranı, performans izleme ayarları.
- Rate limit **bütçelerini** değiştirme — bu prompt yalnız kimliğin doğru çözülmesini sağlar. Eksik bütçeler 13 no'lu promptta.

## Kabul kriterleri

1. `postgresql://user:pass@host` içeren bir exception Sentry'ye maskeli gidiyor; `?token=` içeren bir request URL'i maskeli gidiyor.
2. Temizleme kalıpları tek yerde tanımlı; iki tüketici de aynı listeyi kullanıyor.
3. `x-real-ip` yok/bozukken ağ kimliği subject'e çökmüyor.
4. `javascript:` şemalı `screenshotUploadKey` ne saklanıyor ne render ediliyor.
5. Köken sinyali olmayan `POST /api/v1/...` reddediliyor.

## Testler

- Temizleyici: beş kalıbın hepsi için tek tabloda parametreli test; `instrument.ts` ve `logger.ts`'in aynı sonucu ürettiği.
- `client-ip`: başlık yok / virgüllü / geçerli üç durum, subject'e çökmeme iddiası.
- Bug report şeması: `javascript:` reddi.
- CSRF karar fonksiyonu: sinyal yokluğunda `false`.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
