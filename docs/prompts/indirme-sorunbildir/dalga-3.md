# Dalga 3 — "İndirme" penceresi, admin katalog yönetimi, kapanış

Önce `00-ortak-baglam.md` oku. Ön koşul: **Dalga 1 ve 2**. Branch `uat`, commit yok.

`referans.html`'de 14 ve 15 numaralı çipler bu dalganın hedefi.

---

## Ş13 · İndirme kabuğu + ortam seçimi (SPEC B.1–B.3)

**Dosya:** yeni `apps/web/src/components/downloads/download-modal.tsx` (+ alt bileşenler),
`apps/web/src/components/shell/workspace-modals.tsx`.

- Kabuk Ş9 ile aynı kurallar; **genişlik `min(560px,100%)`**.
- Başlık şeridi: 38×38 `H(success,.16)` tile + 19px indirme oku (stroke 2), başlık
  **"Whispr'i indir"**, alt satır **"Masaüstü ve mobil uygulamalar · {PROD|UAT} ortamı"** —
  seçili ortamla birlikte değişir.
- **ORTAM** grubu: iki kart `1fr 1fr`, `gap:9px`, `padding:11px 12px`, radius 14, `1.5px` çerçeve.
  PROD → `success` tonu, pil **Kararlı**; UAT → `warning` tonu, pil **Test**. Seçili kartta
  solda 17px dolu daire + beyaz onay (stroke 3.2); pasif kartta boş daire.
  `role="radiogroup"`/`role="radio"`.
- Varsayılan seçim **K4**: uçtan gelen `defaultEnvironment`. Kullanıcı değiştirince **ağa
  çıkılmaz** — iki katalog Ş4'te tek istekte geldi.
- **Uyarı şeridi** (B.3): PROD `H(success,.1)`/`H(success,.32)`/kalkan-onay;
  UAT `H(warning,.12)`/`H(warning,.38)`/uyarı üçgeni. Metinler SPEC'ten birebir, sağda sürüm pili.
- Veri `@tanstack/react-query` ile `GET /api/v1/app/downloads`; modal açılmadan istek atılmaz.
  Yükleniyor durumu: kartların iskeleti (mevcut `shell-skeletons` deseni), hata durumu: mevcut
  hata satırı deseni. **Tasarımda bu iki durum yok** — iskelet ve hata satırı en sade biçimde,
  yeni görsel dil icat etmeden çizilir.

**Kabul:** ortam değiştirmek başlık alt satırını, uyarı şeridini, sürüm pillerini, kart etiketlerini,
buton metinlerini ve fark tablosunun vurgulu sütununu **aynı anda** değiştiriyor; ikinci istek gitmiyor.

---

## Ş14 · Masaüstü/mobil kartlar + fark tablosu + alt bar (SPEC B.4–B.7)

**Dosya:** `download-modal.tsx` alt bileşenleri, `apps/web/src/lib/downloads/download-presentation.ts`
(+ testi).

- **MASAÜSTÜ** bölüm başlığı + sürüm pili + sağda yayın tarihi (`26 Ağustos 2026` biçimi,
  `Intl.DateTimeFormat` yerel `tr`/`en`).
- Kart radius 16, satır `padding:12px 13px`, satır arası `1px H(border,.5)` (ilk satır saydam).
  Satır anatomisi: 34×34 radius 11 tile · ad + uzantı pili · meta satırı (tek satır + ellipsis) ·
  **İndir** düğmesi (32 yükseklik, radius 10, solda 13px ok).
  Tile tonları: Windows `primary`, macOS `info`, Linux `warning`, Android `success`, iOS `info`.
  Düğme tonu **ortamdan** gelir: PROD `success`, UAT `warning`.
- **MOBİL** bölüm başlığı + sürüm pili + sağda not (`mağaza sürümü` / `yalnızca test kullanıcıları`).
  Düğme metni ve ikonu `delivery` alanından türer: `store` → dış bağlantı ikonu,
  `direct`/`testflight` → indirme oku. Mağaza/marka logosu **çizilmez**, nötr telefon ikonu.
- **Bağlantı güvenliği:** her `url` render öncesi `https://` doğrulamasından geçer
  (`admin-support-reports.tsx`'teki `getSafeSupportScreenshotUrl` deseni). Dış bağlantılar
  `target="_blank"` + `rel="noopener noreferrer"`. Doğrulamayı geçmeyen satır **çizilmez**.
- **Fark tablosu** (B.6): grid `minmax(0,96px) 1fr 1fr`, başlık satırı `H(surface-secondary,.5)`.
  4 satır, metinler SPEC'ten birebir. **Aktif ortamın sütunu** `600` + `H(foreground)`,
  diğeri `500` + `H(text-muted)`; aktif sütun başlığı kendi tonunda.
- **Alt bar** (B.7): solda not **"Tüm paketler imzalı HTTPS release bağlantısından iner."**,
  sağda **Sürüm notları** (çerçeveli) + **Kapat** (dolgulu).
- Boş ortam (yayınlanmış satır yok): bölüm başlığı kalır, kart yerine tek satırlık nötr bilgi metni.
- `download-presentation.ts` saf fonksiyonları: platform sırası, ton eşlemesi, düğme metni/ikon
  seçimi, boyut biçimlendirme, tarih biçimlendirme. Hepsi node testli.

**Kabul:** `ekranlar/14-indirme-prod.png` ve `15-indirme-uat.png` ile satır satır karşılaştırıldı;
`https` olmayan bir URL'in çizilmediği testle kanıtlandı.

---

## Ş15 · Admin katalog yönetimi

**Dosya:** `apps/web/src/app/api/v1/admin/downloads/…`,
`apps/web/src/components/admin/sections/admin-downloads.tsx`,
`apps/web/src/components/admin/shell/admin-nav-items.ts`, i18n.

K1 kataloğu DB kaynaklı olduğu için yönetim yüzeyi olmadan pencere beslenemez.

- Uçlar: `GET/POST /api/v1/admin/downloads`, `PATCH/DELETE /api/v1/admin/downloads/[artifactId]`.
  Yetki mevcut capability deseninden (`admin-nav-items.ts`'teki `capability` alanı) — yeni
  capability gerekiyorsa **mevcut releases/support yetkisiyle** hizala, yeni yetki icat etme.
- Hız sınırları `admin:downloads:list|write` olarak `api-rate-limit.ts`'e eklenir.
- Yazma şeması `.strict()`: `url` yalnız `https://`, `channel` + `platform` ikilisi unique,
  `publishedAt` alanı **açık bir yayınlama eylemiyle** dolar (taslak → yayında), `Release`
  modelindeki yayınlama sözleşmesiyle aynı.
- Konsol yüzeyi mevcut `AdminCard`/`AdminGridTable`/`AdminPill` primitifleriyle; yeni admin
  görsel dili yok.
- **Sürüm notları** düğmesinin hedefi (SPEC B.7) burada netleşir: yayınlanmış `Release`
  kayıtlarına dayanan mevcut sürüm notu yüzeyine bağlanır. Uygun bir yüzey yoksa **dur ve sor** —
  dış bağlantı uydurma.

**Kabul:** route testleri (yetki, 400, unique çakışması, yayınlama), konsol testi
(`renderToStaticMarkup`), `route-contract.test.ts` yeşil.

---

## Ş16 · Erişilebilirlik, tema, parity ve kapanış denetimi

**Dosya:** `apps/web/e2e/specs/design/downloads-report-parity.spec.ts` (yeni),
`apps/web/e2e/specs/a11y/a11y.spec.ts` (genişletme).

- **Parity e2e:** `applyParityTheme` ile koyu ve aydınlık; her iki pencere için taşma yok,
  metin kırpılmıyor, kabuk içinde bitiyor; tıklama hedefleri `MIN_TAP_TARGET_PX`.
- **a11y:** iki modal açıkken axe taraması (WCAG 2.0/2.1 A+AA, `critical`/`serious` bloklayıcı).
- **Klavye turu:** Tab tuzağı, Esc katman sırası (tam ekran → onay → modal), odak dönüşü
  ray düğmesine.
- **Kabul kriteri denetimi:** `design_handoff/indirme-sorunbildir-paketi/PROMPT.md`'deki
  **12 + 4 + 3 = 19 maddenin** her biri tek tek işaretlenir; işaretlenemeyen madde için ya düzeltme
  ya da gerekçeli sapma notu yazılır.
- **Performans:** iki modal da `next/dynamic`; ilk boyada bundle'a girmedikleri doğrulanır.
  Katalog isteği modal açılmadan atılmıyor.
- Kapanış raporu: `docs/prompts/indirme-sorunbildir/SONUC.md` — ne landed, hangi madde açık,
  hangi sapma bilinçli.

---

## Dalga 3 çıkış kriteri

- [ ] `typecheck` · `test` · `lint` yeşil; yeni e2e spec'leri yeşil.
- [ ] 15 ekran görüntüsünün hepsi karşılaştırıldı.
- [ ] PROMPT.md'deki 19 kabul maddesi işaretli.
- [ ] Admin konsolundan katalog satırı eklenip pencerede göründüğü uçtan uca doğrulandı.
