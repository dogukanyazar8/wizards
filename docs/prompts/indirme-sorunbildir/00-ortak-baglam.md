# 00 — Ortak bağlam · İndirme ve Sorun bildir pencereleri

Her dalga promptu önce bu dosyayı okur. Branch **`uat`**, **commit yok**.

---

## 1. Tek doğru kaynak

`design_handoff/indirme-sorunbildir-paketi/` — eksiksiz tasarım paketi:

| Dosya                                    | Rol                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `SPEC.md`                                | **Tek doğru kaynak.** Ölçüler, tonlar, tüm durumlar, tüm Türkçe metinler.          |
| `referans.html`                          | Çalışan referans. Tarayıcıda aç, 15 çipin hepsine tıkla, davranışı oradan doğrula. |
| `kaynak/Indirme ve Sorun Bildir.dc.html` | Referansın kaynağı. SVG path'leri ve renkleri **buradan aynen kopyala**.           |
| `ekranlar/01..15*.png`                   | 15 durumun ekran görüntüsü (koyu tema, 0.62 ölçek — ölçü için SPEC esas).          |
| `PROMPT.md`                              | Kapsam + kabul kriterleri listesi.                                                 |

**Tasarımın dışına çıkma.** Yeni renk, yeni ölçü, yeni durum, yeni metin icat etme.
Tasarımda karşılığı olmayan bir şeye ihtiyaç duyarsan **dur ve sor**.

## 2. Alınan kararlar (bağlayıcı)

| #      | Karar                                       | Sonuç                                                                                                                                                                          |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **K1** | İndirme verisi **DB kaynaklı katalog**      | Yeni `DownloadArtifact` tablosu + `GET /api/v1/app/downloads` + admin yönetimi. Env'e gömülü bağlantı yok.                                                                     |
| **K2** | Web'de **günlük halka tamponu yazılır**     | `reportError` üstüne son 500 kayıtlık in-memory ring + mobil `SENSITIVE_LOG_PATTERN` maskelemesi. "Sistem günlükleri" satırı çizilir, varsayılan açık.                         |
| **K3** | Ek yükleme **mevcut akıştan**               | `feedback-attachment` purpose'u oturum kimliğini de kabul eder. `screenshotUploadKey` sözleşmesi ve `submitMobileBugReport` servisi **değişmez**.                              |
| **K4** | PROD/UAT **otomatik seçili, ikisi de açık** | Uygulamanın koştuğu ortam varsayılan seçili gelir; kullanıcı diğerine geçebilir. Yetki kapısı yok.                                                                             |
| **K5** | Sunucu servisi **tek**                      | Web raporu da `submitMobileBugReport` üzerinden yazılır. İkinci bir yazma yolu açılmaz — bilet üretimi, 90 gün `purgeAfter`, ek claim'i ve `bugHunter` rozeti tek yerde kalır. |
| **K6** | Kuyruk yok                                  | Çevrimdışında buton pasif + sarı uyarı satırı (SPEC A.7). Mobildeki `whispr.report.queuedDrafts` web'e taşınmaz.                                                               |

## 3. Token ve tipografi eşlemesi

SPEC `H(x,a)` = `hsl(var(--x)/a)`. Tüm token'lar web'de mevcut:
`--primary --success --warning --danger --info --foreground --text-secondary --text-muted`
`--border --shadow-color --background --surface-base/card/panel/rail/soft/secondary/tertiary`

Font token'ları web'de **başka adla** duruyor — eşleme zorunlu:

| SPEC               | Web                   |
| ------------------ | --------------------- |
| `var(--w-display)` | `var(--font-display)` |
| `var(--w-body)`    | `var(--font-sans)`    |
| `var(--w-track)`   | `-.02em` (sabit)      |

- **Sabit hex yazma.** Tek istisna: toggle topuzu `#fff`, seçili çip metni `#fff`, dolgulu
  buton metni `#fff`.
- İkonlar 24×24 viewBox, `currentColor`, `stroke-linecap:round`. Path'ler kaynak dosyadan
  birebir.
- Aydınlık ve koyu temada da doğru görünmeli.

## 4. Metin ve i18n

- Türkçe metinler SPEC'ten **birebir** kopyalanır, tek karakter değişmez.
- Web i18n: `apps/web/src/lib/locale/messages/tr.ts` + `en.ts`. Anahtar öneki
  `report.*` (sorun bildir) ve `download.*` (indirme).
- SPEC yalnız Türkçe veriyor. İngilizce karşılıklar önce
  `apps/mobile/src/locale/mobile-copy.ts` `en` bloğundaki `report*` anahtarlarından devşirilir
  (`reportTitle`, `reportWhere`, `reportPlaceholder`, `reportHint`, `reportLogs`… hepsi mevcut);
  birebir eşi olmayan yeni metinler için yeni çeviri yazılır. Türkçe **asla** çeviriden türetilmez.

## 5. Değişmeyecek yerler

Sunucu rayının geri kalanı, kanal kenar çubuğu, sohbet alanı, üye paneli, diğer modallar
(kanal/kategori/etkinlik/rol/sunucu oluşturma, sunucu ayarları), mobil uygulamanın
`about-bug-report-screen` akışı, `mobile-feedback-*` akışı.

`server-rail.tsx` içindeki liste `flex: 0 1 auto` **bilerek** öyle — listeye `flex-1` verme,
yoksa "sunucu ekle" düğmesi rayın dibine kayar (SPEC-SUNUCU §2.1 madde 5 bozulur). Alt blok
`margin-top:auto` ile diplenir.

## 6. Mühendislik kuralları

- **Güvenlik:** her yeni uç `zod` `.strict()` şema, oturum kimliği, `enforceApiRateLimit`,
  `Cache-Control: no-store`. Dışarıdan gelen her URL `https://` doğrulamasından geçer.
  Günlük satırları istemcide **ve** sunucuda maskelenir/kırpılır.
- **Sözleşme:** `packages/types` tek kaynak; route'lar `route.ts` + `route-logic.ts` +
  `route-logic.test.ts` üçlüsü. `apps/web/src/app/api/v1/route-contract.test.ts` yeşil kalmalı.
- **Performans:** modal içerikleri `dynamic import` ile kod bölünür; katalog sorgusu tek
  `findMany`; ray düğmeleri render'da hesap yapmaz.
- **Erişilebilirlik:** `role="dialog"` + `aria-modal`, `aria-labelledby`, kategori çipleri
  `role="radiogroup"`/`role="radio"`, toggle'lar `role="switch"` + `aria-checked`,
  ilerleme çubuğu `role="progressbar"` + `aria-valuenow`.
- **Test:** saf mantık `node:test` (`src/**/*.test.ts(x)`, bileşenler `renderToStaticMarkup`),
  uçtan uca Playwright (`apps/web/e2e/specs/...`), parity yardımcıları
  `apps/web/e2e/helpers/design-parity.ts`.
- **Migration:** Prisma yalnız `packages/db/prisma/rebaseline-migrations` altını okur.
  Migration oraya yazılır.

## 7. Doğrulama komutları

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
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web lint
```

## 8. Dalga haritası

| Dalga | Şerit   | Konu                                                                         |
| ----- | ------- | ---------------------------------------------------------------------------- |
| **1** | Ş1–Ş7   | Sözleşme, DB katalog, iki uç, yükleme izni, günlük tamponu, i18n             |
| **2** | Ş8–Ş12  | Ray düğmeleri + Sorun bildir penceresinin 13 durumu                          |
| **3** | Ş13–Ş16 | İndirme penceresi, admin katalog yönetimi, erişilebilirlik + parity kapanışı |
