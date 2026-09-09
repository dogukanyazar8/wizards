# Dalga 2 — Şifre sıfırlama + istek bağlamı + uçtan uca doğrulama

> Bu dosyanın **"Başlatma promptu"** bölümünü olduğu gibi kopyalayıp yeni bir oturuma ver.
> Dalga 1 bitmiş ve raporu yazılmış olmalı.

Kapsam: istek bağlamı çözücü (cihaz + zaman) → şifre sıfırlama şablonu → web ve mobil
uçlardan bağlam iletimi → `/dev/email-preview` galerisi → görsel doğrulama → e2e ve tam kapı.

---

## Başlatma promptu

```
Whispr `uat` dalında çalışıyorsun. Dalga 1'de e-posta tasarım katmanı kuruldu ve doğrulama
kodu + kayıt denemesi e-postaları yeni tasarıma geçti. Bu Dalga 2: şifre sıfırlama e-postası,
istek bağlamı ve uçtan uca doğrulama.

ÖNCE OKU (sırayla, tamamını):
1. `docs/prompts/eposta-sablonlari/00-ortak-baglam.md`  ← bağlayıcı
2. `docs/prompts/eposta-sablonlari/raporlar/dalga-1.md`
3. `design_handoff/eposta-handoff/SPEC.md` §5 ve §6
4. `design_handoff/eposta-handoff/html/sifre-sifirlama.html`  ← üreteceğin çıktının kendisi
5. `design_handoff/eposta-handoff/ekran-goruntuleri/02-sifre-sifirlama-masaustu.png`
   ve `04-sifre-sifirlama-mobil-390px.png` (Read aracıyla görsel olarak aç)
6. Dalga 1'in bıraktığı modüller: `apps/web/src/lib/email/*`

SONRA kod tabanını tanı:
- `graphify query "password reset request headers analytics client info time zone"`
- `apps/web/src/lib/auth/password-reset.ts` (13, 196, 288. satırlar)
- `apps/web/src/lib/auth/actions.ts:618` (`headerStore` bu fonksiyonda zaten var)
- `apps/web/src/lib/mobile/auth.ts:1169` (`requestMobilePasswordReset`)
- `apps/web/src/app/api/v1/mobile/auth/forgot-password/route-logic.ts`
- `apps/web/src/lib/analytics/client-info.ts:176` (`getAnalyticsClientInfo`)
- `apps/web/src/app/dev/auth-states/page.tsx` (galeri deseni)

KURALLAR
- 00-ortak-baglam.md §2, §3, §4, §5, §6, §7 (K1-K8), §13, §16 bağlayıcıdır.
- Tasarımın dışına çıkma; SPEC'te olmayan metin/blok/renk/boşluk ekleme.
- Kararsız kaldığın her noktada dur ve sor.
- Kütüphane ekleme, rota ekleme, env ekleme, migration yazma, commit atma.
- Analitik uçlarının tel biçimi (`AnalyticsClientInfo`) **değişmez**; şehir okuması e-posta
  modülünde yaşar.

YAPILACAKLAR

Ş7 · İstek bağlamı — `apps/web/src/lib/email/email-request-context.ts`
  a) Tip: `EmailRequestContext = { deviceLine: string | null; requestedAtLabel: string }`.
  b) `resolveEmailRequestContext({ headers, now, locale, timeZone })`:
     - Cihaz satırı (K5): `getAnalyticsClientInfo(headers)` ile `browser` + `os`;
       şehir bu modülde okunur — `x-vercel-ip-city` (URL-decode edilir),
       `cloudfront-viewer-city`, `cf-ipcity` sırasıyla; ülke `getAnalyticsClientInfo().countryCode`.
       Birleşim: `Chrome · macOS · İstanbul, TR`.
       Eksik parça sessizce düşer: `Chrome · macOS · TR` → `Chrome · macOS` → `null`.
       `null` ise meta ızgarasında **Cihaz hücresi hiç çizilmez** (uydurma değer yok).
     - Zaman (K6): `timeZone` = `UserSettings.timeZone` varsa o, yoksa `Europe/Istanbul`.
       Geçersiz saat dilimi dizesi gelirse `Europe/Istanbul`a düş (try/catch).
       Biçim: `Intl.DateTimeFormat` ile gün + ay adı + yıl + `HH:mm` (24 saat) ve ayrı bir
       `timeZoneName:'shortOffset'` çağrısıyla `(GMT+3)` eki.
       tr çıktı: `27 Ağustos 2026, 14:32 (GMT+3)`
       en çıktı: `27 August 2026, 14:32 (GMT+3)`  ← **E4**: SPEC yalnız tr örneği veriyor;
       düzen genişliği bozulmasın diye en tarafında da 24 saat ve aynı sıra kullanılır.
       Bu sapmayı rapora yaz.
     - `headers` yoksa (`null`): `deviceLine = null`, zaman yine üretilir (sunucu saati).
  c) `email-request-context.test.ts`: her düşüş basamağı, geçersiz saat dilimi, yaz saati
     (Ocak / Temmuz aynı saat diliminde farklı ofset), URL-encoded şehir (`%C4%B0stanbul`),
     iki locale.

Ş8 · Şablon — `templates/password-reset-email.ts`
  `renderPasswordResetEmail({ accountEmail, locale, name, requestContext, resetUrl, ttlMinutes })`
  → `{ html, subject, text }`. SPEC §5 sırası:
  göz üstü → H1 → paragraf (alt 22px) → buton (`padding:15px 36px`) → buton altı not
  (10px üst / 20px alt, "30 dakika" `#B4761A` 600) → yedek bağlantı kutusu → istek özeti
  (iki eşit kolon, 18px üst / 20px alt, **ayırıcı hücrede dolgu yok**) → ayırıcı →
  güvenlik bloğu (20px üst, `tüm oturumlarını kapat` bağlantısı `/settings/account/security`).
  - Yedek URL kutusundaki metin buton `href`i ile **aynı** adrestir.
  - `requestContext.deviceLine === null` ise Cihaz hücresi çizilmez; İstek zamanı hücresi
    tek kolon olarak tam genişliğe yayılır (`width:100%`), düzen bozulmaz.
  - Medya kuralları: `w-wrap`, `w-px`, `w-h1`, `w-url`, `w-meta` (kod kuralı yok).

Ş9 · Bağlama
  a) `apps/web/src/lib/auth/password-reset.ts`
     - `renderPasswordResetEmail` (yerel) silinir, yeni şablon çağrılır.
     - Yerel `escapeHtml` ve `getAppUrl` silinir; `email-html` / `email-links` kullanılır.
     - `sendPasswordResetEmail(user, locale, context?)` — üçüncü parametre isteğe bağlı
       `{ headers?: HeadersLike; now?: Date }`. Verilmezse cihaz satırı `null` olur.
       Mevcut çağrılar kırılmaz.
     - Kullanıcının saat dilimi: `prisma.userSettings.findUnique({ where:{userId}, select:{timeZone:true} })`
       tek sorgu, hata durumunda `null` (log'la, akışı kesme).
     - `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` tek doğruluk kaynağı olarak kalır (30).
     - Gönderim, hata sınıfları, `SENDER_RESTRICTED` davranışı **aynen** korunur.
  b) `apps/web/src/lib/auth/actions.ts:618` — `sendPasswordResetEmail(..., { headers: headerStore })`.
  c) `apps/web/src/lib/mobile/auth.ts` — `MobilePasswordResetOptions` içine
     `requestHeaders?: HeadersLike` eklenir ve `sendPasswordReset`e geçirilir.
  d) `apps/web/src/app/api/v1/mobile/auth/forgot-password/route-logic.ts` —
     `dependencies.requestPasswordReset(body, { requestHeaders: request.headers })`.
     `route.test.ts` buna göre güncellenir.
  e) Masaüstü: Tauri kabuğu web akışını kullanır, ayrı gönderim yolu **yoktur**.
     Bunu `apps/desktop` içinde grep ile doğrula ve raporda tek satırla belirt.

Ş10 · Önizleme galerisi (K8)
  - `apps/web/src/app/dev/email-preview/page.tsx` — `process.env.NODE_ENV === "production"`
    ise `notFound()`.
  - Üç şablon × iki locale; her biri için 600 px ve 390 px `<iframe srcDoc>` kartı.
  - **Gerçek** renderer çağrılır; veriler sahte ama SPEC'teki örnek değerler
    (`Ada`, `482915`, `27 Ağustos 2026, 14:32 (GMT+3)`, `Chrome · macOS · İstanbul, TR`).
  - Ayrıca her kart altında: bayt boyutu, preheader karakter sayısı, `<img>`/`<script>` sayacı.
  - Kod kutusuz doğrulama (kod `null`) ve cihazsız sıfırlama varyantları da gösterilir.

Ş11 · Doğrulama
  a) Testler:
     - `password-reset-email.test.ts` — SPEC §5 metinleri birebir, iki locale, cihazsız varyant.
     - `email-reference-parity.test.ts` genişletilir: `sifre-sifirlama.html` da karşılaştırılır
       (Dalga 1'deki normalizasyon kurallarıyla).
     - `email-contract.test.ts` üç şablonu birden tarar (00 §15 ölçütleri).
     - `messages.test.ts` yeşil (tr/en anahtar eşitliği).
  b) Görsel: `preview_start` ile dev sunucusunu aç, `/dev/email-preview` sayfasına git,
     600 px ve 390 px kartların ekran görüntüsünü al ve
     `design_handoff/eposta-handoff/ekran-goruntuleri/*.png` ile karşılaştır.
     Fark varsa kaynağı düzelt (ekran görüntüsünü değil).
  c) Kapı:
     - `pnpm --filter @wizards/web typecheck`
     - `pnpm --filter @wizards/web test`
     - `pnpm --filter @wizards/web lint`
     - `pnpm --filter @wizards/web e2e:api` (çalıştırılamıyorsa nedenini raporda yaz)
     - `graphify update .`

RAPOR
`docs/prompts/eposta-sablonlari/raporlar/dalga-2.md` ve paket kapanışı olarak
`docs/prompts/eposta-sablonlari/SONUC.md` yaz:
- Eklenen/değişen/silinen dosyalar
- Üç şablonun bayt boyutları (tr / en, en büyük varyant)
- `email-reference-parity` sonucu (iki referans dosya için)
- 00 §15 kabul ölçütlerinin tek tek durumu (11 madde, geçti/kaldı)
- Ekran görüntüsü karşılaştırma bulguları
- E4 dâhil tüm bilinçli sapmalar
- Koşulamayan doğrulamalar ve nedenleri
```

---

## Bitiş ölçütü

- Üç e-posta da yeni tasarımda; şifre sıfırlama istek özeti gerçek veriyle dolu.
- Web, mobil ve masaüstü akışlarının hepsi aynı şablonu üretiyor; mobil uçtan gelen
  isteklerde de cihaz satırı doluyor.
- 00 §15'teki 11 kabul ölçütü yeşil, `email-reference-parity` iki referans dosya için de yeşil.
- Görsel karşılaştırma ekran görüntüleriyle uyumlu.
