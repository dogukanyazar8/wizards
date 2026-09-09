# Dalga 1 — Tasarım katmanı + kayıt tarafı e-postaları

> Bu dosyanın **"Başlatma promptu"** bölümünü olduğu gibi kopyalayıp yeni bir oturuma ver.

Kapsam: `email-theme` → `email-html` → `email-links` → `email-shell` → `email-blocks` →
`email-text` → sözlük (tr + en, **her üç şablonun anahtarları**) → doğrulama kodu şablonu →
kayıt denemesi şablonu → gönderim yoluna bağlama → testler.

Kapsam dışı (Dalga 2): şifre sıfırlama şablonu, istek bağlamı (cihaz / zaman),
`/dev/email-preview`, e2e.

---

## Başlatma promptu

```
Whispr `uat` dalında çalışıyorsun. Görev: kayıt akışının e-posta şablonlarını
`design_handoff/eposta-handoff/` teslim paketindeki tasarıma **birebir** sadık kalarak yeniden
kurmak. Bu Dalga 1; Dalga 2 ayrı oturumda gelecek.

ÖNCE OKU (sırayla, tamamını):
1. `docs/prompts/eposta-sablonlari/00-ortak-baglam.md`  ← bağlayıcı, her şeyin kaynağı
2. `design_handoff/eposta-handoff/SPEC.md`
3. `design_handoff/eposta-handoff/PROMPT.md`
4. `design_handoff/eposta-handoff/html/dogrulama-kodu.html`  ← üreteceğin çıktının kendisi
5. `design_handoff/eposta-handoff/ekran-goruntuleri/01-dogrulama-kodu-masaustu.png`
   ve `03-dogrulama-kodu-mobil-390px.png` (Read aracıyla görsel olarak aç)

SONRA kod tabanını tanı:
- `graphify query "email verification password reset transactional email rendering"`
- `apps/web/src/lib/auth/email-verification.ts` (169, 285, 362. satırlar)
- `apps/web/src/lib/locale/messages/tr.ts:1248-1275` ve `en.ts` karşılıkları
- `apps/web/src/lib/locale/messages.test.ts` (tr/en anahtar eşitliği kapısı)

KURALLAR
- 00-ortak-baglam.md §2 (katı teknik kurallar), §3 (renk), §4 (tipografi), §5 (iskelet),
  §6 (duyarlılık), §7 (kararlar K1-K8), §13 (güvenlik), §16 (yasaklar) bağlayıcıdır.
- Tasarımın dışına **çıkma**. SPEC'te olmayan metin/blok/renk/boşluk ekleme.
- Kararsız kaldığın her noktada dur ve sor; varsayımla ilerleme.
- Kütüphane ekleme, rota ekleme, env ekleme, migration yazma, commit atma.
- Test-önce çalış: her modülün testi kodla birlikte gelir.

YAPILACAKLAR

Ş1 · Temel katman — `apps/web/src/lib/email/`
  a) `email-theme.ts`
     - `EMAIL_COLORS` (00 §3 tablosunun tamamı, isimli sabitler; başka yerde ham hex yok).
     - `EMAIL_FONTS`: `heading` = "'Outfit','Trebuchet MS',Tahoma,Arial,sans-serif",
       `body` = "'Figtree',Arial,Helvetica,sans-serif".
     - `EMAIL_TYPE`: 00 §4 tablosundaki 14 rolün her biri için
       `{ fontFamily, fontSize, lineHeight, fontWeight, letterSpacing?, textTransform?, color }`.
     - `EMAIL_RADIUS`: card 16, box 14, button 12, mark 10.
     - `EMAIL_MARK_BARS = [12, 18, 24, 17, 13]`, çubuk genişliği 3, ara 3, yarıçap 2.
     - `EMAIL_BRAND_GRADIENT` ve `EMAIL_BRAND_GRADIENT_FALLBACK` (`#5B62FF`).
     - `EMAIL_MAX_BYTES = 15 * 1024`, `EMAIL_CARD_WIDTH = 600`, `EMAIL_BREAKPOINT = 520`.
  b) `email-html.ts`
     - `escapeHtml(value)` — `& < > " '` (mevcut üç kopyayla birebir aynı davranış).
     - `style(...parts)` — `Record<string,string|number|undefined>` alıp satır içi stil dizesi
       üretir; `undefined` atlanır; her kural `;` ile biter; boşluk yok (bayt tasarrufu).
     - `typeStyle(role, overrides?)` — `EMAIL_TYPE` rolünü satır içi stile çevirir ve
       `mso-line-height-rule:exactly` ekler.
     - `stripHeaderNewlines(value)` — `\r` ve `\n` siler (konu satırı için).
  c) `email-links.ts`
     - `getEmailAppUrl()` — `APP_URL` / `AUTH_URL` / `NEXTAUTH_URL` sırasıyla; `email-verification.ts`
       ve `password-reset.ts` içindeki mevcut `getAppUrl` davranışını birebir taşır (http/https
       doğrulaması dâhil), ama hata tipi bağımsız olsun (`EmailConfigurationError`).
     - `buildVerifyEmailUrl(token)` → `${app}/verify-email?token=…`
     - `buildResetPasswordUrl(token)` → `${app}/reset-password?token=…`
     - `EMAIL_FOOTER_LINKS` → `/privacy`, `/terms`, `/cookies` (mutlak URL üretir)
     - `buildSecurityUrl()` → `${app}/settings/account/security`
     - (K1: SPEC'teki Türkçe yollar kullanılmaz.)

Ş2 · Kabuk — `email-shell.ts`
  `renderEmailShell({ lang, documentTitle, preheader, bandLabel, bodyHtml, mediaRules })` döner.
  - `<!DOCTYPE html>` + `<html lang>` + `xmlns:v` / `xmlns:o` (referans dosyadaki hâliyle).
  - `<head>`: charset, viewport, `x-ua-compatible`, `color-scheme`, `supported-color-schemes`,
    `<title>`, `<!--[if mso]>` `OfficeDocumentSettings` / `PixelsPerInch 96`,
    `<!--[if !mso]><!-->` içinde `preconnect` + Google Fonts `<link>`, `<style>` içinde
    `@import` + `@media only screen and (max-width:520px){…}`.
    Medya kuralları **şablona göre** değişir: her şablon yalnız kullandığı sınıfları geçirir
    (`w-wrap`, `w-px` her zaman; `w-code`, `w-h1`, `w-url`, `w-meta` isteğe bağlı).
  - `<body>` ilk elemanı gizli preheader `<span>` (00 §2).
  - Tam genişlik tablo → `td align=center padding:24px 12px 32px` → 600 px `.w-wrap` kart.
  - Marka bandı: `renderBrandBand(bandLabel)` — 36 px işaret (00 §5 çubuk ölçüleri), 12 px
    boşluktan sonra "Whispr", sağa yaslı bant etiketi.
  - Gövde hücresi: `.w-px` `#FFFFFF` `padding:30px 32px 26px` + yan kenarlıklar.
  - Alt bilgi: `renderFooter(locale)` — Gizlilik · Şartlar · Çerezler + telif (00 §5).

Ş3 · Bloklar — `email-blocks.ts`
  Her biri saf fonksiyon, HTML dizesi döner, tümü satır içi stil kullanır:
  - `eyebrow(text)`, `heading(text)` (`class="w-h1"`), `paragraph(html, { marginBottom })`
  - `codeBox({ label, code, expiryPrefix, expiryValue, expirySuffix })` — `#F9FAFB`, 1 px
    `#CED4DE`, radius 14, `padding:18px 16px 16px`, kod `class="w-code"` 34/40 `ls:11px`,
    süre satırında vurgu `#B4761A` 600
  - `button({ href, label, padding })` — bulletproof; `padding` şablona göre
    (`14px 32px` doğrulama, `15px 36px` sıfırlama)
  - `note(text, { paddingTop, paddingBottom, fontSize })`
  - `fallbackUrlBox({ label, url })` — `class="w-url"`, `#4C59E0`, altı çizili, `word-break:break-all`
  - `metaGrid([{ label, value }, …])` — iki eşit kolon, `class="w-meta"`,
    **ayırıcı hücresine dolgu verilmez** (SPEC §5 notu)
  - `divider()` — 1 px `#E3E6EE`
  - `securityBlock({ label, bodyHtml })` — 20 px üst dolgu
  Ölçüler referans HTML'den birebir alınır; tahmin yok.

Ş4 · Düz metin + sözlük
  a) `email-text.ts` — 00 §12 kuralları. `buildEmailText(sections)` biçiminde,
     satır sonu enjeksiyonuna karşı temizleyerek.
  b) `apps/web/src/lib/locale/messages/tr.ts` ve `en.ts`:
     00 §11'deki **tüm** anahtarları ekle (doğrulama + sıfırlama + kayıt denemesi + ortak).
     Sıfırlama anahtarları Dalga 2'de kullanılacak; sözlük tek seferde tamamlanır.
     Metinler tabloyla **birebir** aynı, tek karakter sapma yok.
  c) Eski, yalnız e-postada kullanılan anahtarları sil. Silmeden önce her anahtar için
     `grep -rn "<anahtar>" apps packages` çalıştır; ekranlarda da kullanılan varsa dokunma
     ve neden dokunmadığını rapora yaz.

Ş5 · Şablonlar + bağlama
  a) `templates/verification-code-email.ts`
     `renderVerificationCodeEmail({ code, locale, name, verificationUrl, codeTtlMinutes })`
     → `{ html, subject, text }`. SPEC §4 sırası: göz üstü → H1 → paragraf (alt boşluk 22px)
     → kod kutusu → buton (üst 22px) → buton altı not (10px üst / 22px alt) → ayırıcı →
     güvenlik bloğu (20px üst).
     - `code === null` (hız sınırı) ise: kod kutusu **çizilmez**, konu `subjectNoCode`,
       preheader `{spacedCode}` içeren biçim yerine kodsuz biçime düşer. Bu düşüş yolunu
       teste bağla.
     - `spacedCode` = kodun üçerli grupları (`482915` → `482 915`).
     - Kod yalnız `^\d{6}$` ise kod kabul edilir; değilse `null` gibi davran.
  b) `templates/registration-attempt-email.ts` — K4 + E1/E2/E3.
  c) `apps/web/src/lib/auth/email-verification.ts`:
     - `renderVerificationEmail` ve `renderRegistrationAttemptEmail` **silinir**, yerlerine
       yeni şablonlar çağrılır.
     - Yerel `escapeHtml` ve `getAppUrl` silinir, `email-html` / `email-links` kullanılır.
     - `sendVerificationEmail` / `sendRegistrationAttemptEmail` **imzaları değişmez**;
       gönderim, hata yolları, token iptali, `SENDER_RESTRICTED` davranışı aynen korunur.
     - `password-reset.ts` bu dalgada **değişmez** (Dalga 2).
  d) `apps/web/src/lib/auth/password-reset.ts` ve `reauth-email.ts` içindeki `escapeHtml`
     kopyalarına dokunma (Dalga 2 ve kapsam dışı).

Ş6 · Testler (kodla birlikte)
  - `email-theme.test.ts` — 00 §3 tablosundaki her hex tam olarak bir kez tanımlı.
  - `email-html.test.ts` — kaçış, stil birleştirme, satır sonu temizleme.
  - `email-shell.test.ts` — preheader gövdenin ilk elemanı; `<style>` yalnız `@import` +
    `@media` içeriyor; MSO koşullu blokları var; marka işareti çubuk yükseklikleri
    `12/18/24/17/13`; alt bilgi yalnız üç bağlantı + telif.
  - `email-blocks.test.ts` — buton `<td bgcolor="#5966F2">` + `display:block` `<a>`;
    meta ayırıcı hücresinde dolgu yok.
  - `verification-code-email.test.ts` — SPEC §4 metinleri birebir; iki locale; kodsuz düşüş;
    konu satırı K7; preheader uzunluğu 85–110.
  - `registration-attempt-email.test.ts` — E1/E2/E3; metin değişmemiş.
  - `email-contract.test.ts` (kabul kapısı, 00 §15):
    `<img`, `<script`, `display:flex`, `display:grid`, `float:`, `position:`, `<button`,
    `monospace`, `courier` geçmiyor; bayt boyutu < 15 360; tüm `href` değerleri `https://`
    veya `http://localhost` ile başlıyor.
  - `email-reference-parity.test.ts` — **birebirlik kapısı**:
    `design_handoff/eposta-handoff/html/dogrulama-kodu.html` dosyasını oku ve üretilen HTML ile
    "yapı imzası" karşılaştır. İmza = belge sırasında her elemanın
    `[etiket, bgcolor, width, height, align, valign, class, satır içi stil kuralları (sıralı)]`
    dizisi. Karşılaştırmadan önce şu normalizasyonlar uygulanır:
      · tüm `href` değerleri `URL` yer tutucusuna çevrilir (K1 yol farkı),
      · metin düğümleri kaldırılır (metin ayrı testlerde denetlenir),
      · ardışık boşluklar tek boşluğa iner.
    İmza farkı çıkarsa test farkı satır satır yazdırır. Bu test tasarımdan sapmanın
    tek ve yeterli kanıtıdır; yeşil olmadan dalga bitmiş sayılmaz.

DOĞRULAMA (hepsi yeşil olmadan bitirme)
- `pnpm --filter @wizards/web typecheck`
- `pnpm --filter @wizards/web test`
- `pnpm --filter @wizards/web lint`
- `graphify update .`

RAPOR
`docs/prompts/eposta-sablonlari/raporlar/dalga-1.md` yaz:
- Eklenen/değişen/silinen dosyalar (yol + tek satır gerekçe)
- Silinen sözlük anahtarları ve her biri için grep kanıtı
- `email-reference-parity` imza karşılaştırmasının sonucu (fark varsa neden)
- Üretilen HTML bayt boyutları (tr / en)
- Test sayıları (önce / sonra)
- Tasarımdan bilinçli sapma listesi (K1 dışında sapma olmamalı)
- Dalga 2'ye devredilen açık uçlar
```

---

## Bitiş ölçütü

- Doğrulama kodu ve kayıt denemesi e-postaları yeni tasarımda, üç istemcinin de kullandığı
  gönderim yolunda canlı.
- `email-reference-parity.test.ts` yeşil.
- Şifre sıfırlama e-postası **hâlâ eski tasarımda** (Dalga 2'nin işi) — bu beklenen durumdur,
  rapora böyle yazılır.
