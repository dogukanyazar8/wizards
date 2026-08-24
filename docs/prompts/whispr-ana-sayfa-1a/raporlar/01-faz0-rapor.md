# Faz 0 raporu — Sözleşme ve parity altyapısı

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

## 1. Yapıldı

- **Ölçü sözlüğü.** `apps/web/src/lib/home/metrics.ts` — `1a-komuta-merkezi.html` içindeki her inline
  ölçü tek modülde: **15 grup, 378 sayısal değer**. `pxToRem` (px ÷ 16, kayan nokta artığı yok) ve
  `hairline(px = 1)` (`max(1px, 0.0625rem)`) saf yardımcıları. Sözlük renk taşımıyor.
- **Tip ölçeği.** `HOME_TYPE_SCALE` — SPEC §1'in 12 satırı, 13 rol anahtarı olarak. "Arkadaş kartı
  adı / durumu" satırı iki ayrı stil taşıdığı için `friendCardName` + `friendCardStatus` diye
  ayrıldı.
- **Token denetimi.** `token-audit.ts` + `token-audit.test.ts` — 7 kural (hex, `rgb(`, `rgba(`,
  değişkensiz `hsl(`, `oklch(`, Tailwind palet sınıfı, gömülü font adı / değişkensiz
  `font-family:`). Kapsam yalnız bu paketin 7 yeni yüzeyi; izin listesi 4 madde. Sapma
  `dosya:satır:sütun` ile raporlanıyor.
- **Arbitrary-px lint kuralı.** `apps/web/eslint.config.mjs` içine dosya-yolu kapsamlı
  `no-restricted-syntax` bloğu (`Literal` + `TemplateElement`). Kapsam yalnız yeni yüzeyler;
  mevcut 120 dosya dokunulmadı.
- **Sayaç.** `scripts/quality/count-arbitrary-px.mjs` — repo genelindeki Tailwind kaynak
  ağaçlarını tarar, taban karşılaştırmalı çıktı verir. `count-arbitrary-px.test.mjs` hem saf
  fonksiyonu doğrular hem de **cırcır (ratchet)** kurar: sayı tabanın üstüne çıkarsa
  `pnpm test:toolchain` kırmızıya döner.
- **Parity matrisi.** `apps/web/e2e/specs/design/home-parity.spec.ts` — 6 görünüm alanı × 2 tema =
  **12 kombinasyon**, hepsi `test.skip`. Yardımcılar `e2e/helpers/design-parity.ts` içinde ve
  gerçek: `expectNoOverflow` (yatay + dikey), `expectNoClippedText`, `readRootFontSize`,
  `expectMinTapTarget`, `applyParityTheme`.
- **Kopyalama yok.** `whispr-chat-preview.spec.ts` içindeki yerel `expectNoHorizontalOverflow`
  silinip paylaşımlı yardımcıdan içe aktarıldı (Faz 0 §4 "genelleştir, kopyalama"). O spec'in
  sözleşmesi bozulmasın diye yardımcı yatay/dikey/ikisi diye üçe ayrıldı.

## 2. Dokunulan dosyalar

| Dosya                                                   | Yeni / Değişti   | Neden                                                     |
| ------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| `apps/web/src/lib/home/metrics.ts`                      | Yeni (505)       | Ölçü sözlüğü + `pxToRem` + `hairline` + `HOME_TYPE_SCALE` |
| `apps/web/src/lib/home/metrics.test.ts`                 | Yeni (180)       | 12 test — rem dönüşümü, sözlük bütünlüğü, tip ölçeği      |
| `apps/web/src/lib/home/token-audit.ts`                  | Yeni (195)       | Denetim kuralları, kapsam, izin listesi, dosya toplayıcı  |
| `apps/web/src/lib/home/token-audit.test.ts`             | Yeni (114)       | 13 test — kural birimleri + gerçek yüzey taraması         |
| `apps/web/e2e/helpers/design-parity.ts`                 | Yeni (150)       | Parity yardımcıları (paylaşımlı)                          |
| `apps/web/e2e/specs/design/home-parity.spec.ts`         | Yeni (59)        | 6×2 matris iskeleti, `test.skip`                          |
| `scripts/quality/count-arbitrary-px.mjs`                | Yeni (128)       | Repo geneli px sayacı + CLI                               |
| `scripts/quality/count-arbitrary-px.test.mjs`           | Yeni (80)        | 8 test — sayaç birimleri + taban cırcırı                  |
| `apps/web/eslint.config.mjs`                            | Değişti (+30)    | Yeni yüzeyler için arbitrary-px kuralı                    |
| `apps/web/scripts/eslint-config.test.mjs`               | Değişti (+56)    | Kuralın kapsamı ve kırmızıya döndüğü kalıcı kanıt         |
| `apps/web/e2e/specs/design/whispr-chat-preview.spec.ts` | Değişti (+1/−18) | Yerel yardımcı → paylaşımlı yardımcı                      |
| `graphify-out/**`                                       | Değişti          | `graphify update .` çıktısı (faz sonu adımı)              |

**Üretim davranışı değişmedi.** `git diff` yalnız yeni dosyalar, lint yapılandırması, lint
yapılandırma testi ve bir e2e spec'inin import satırı. Hiçbir bileşen, rota, uç ya da şema
dosyasına dokunulmadı.

## 3. Kapı çıktıları

| Komut                                                         | Sonuç                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                             | ✅ exit 0 — **2778 test / 625 suite, 0 fail**, 35.4 sn    |
| `pnpm typecheck`                                              | ✅ exit 0 — 5/5 paket                                     |
| `pnpm lint`                                                   | ✅ exit 0 — 5/5 paket; eslint config testleri 10/10       |
| `node scripts/quality/count-arbitrary-px.mjs`                 | ✅ exit 0 — `1208 değer / 120 dosya (taban, taban)`       |
| `node --test scripts/quality/count-arbitrary-px.test.mjs`     | ✅ 8/8 (kapı dışı, `pnpm test:toolchain` kapsamında)      |
| `playwright test e2e/specs/design/home-parity.spec.ts --list` | ✅ **12 test in 1 file**, hepsi `expectedStatus: skipped` |

Yeni testler: metrics 12 + token-audit 13 + eslint-config 2 + toolchain 8 = **35 yeni test**.

## 4. Ölçülen sayılar

| Ölçüm                             | Değer      | Bütçe / beklenen      | Durum                                               |
| --------------------------------- | ---------- | --------------------- | --------------------------------------------------- |
| Kalan arbitrary px                | 1208 / 120 | taban 1208 / 120      | ✅ eşit                                             |
| Negatif arbitrary px (taban dışı) | 2          | —                     | ℹ ayrı raporlanıyor                                 |
| Parity matrisi kombinasyon        | 12         | 6 × 2 = 12            | ✅                                                  |
| `HOME_METRICS` grup / değer       | 15 / 378   | §1.2'deki 16 grup adı | ✅ (`typography` = ayrı `HOME_TYPE_SCALE` export'u) |
| Tip ölçeği rol                    | 13         | SPEC §1'in 12 satırı  | ✅ (12. satır iki stil taşıyor)                     |
| `pxToRem` örnek doğruluğu         | 6/6        | 74·272·13·16·20·10.5  | ✅                                                  |

Kalan arbitrary px: **1208 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120)

En yoğun 5 dosya (göç sırası için): `settings-panel.tsx` 67 · `channel-sidebar.tsx` 57 ·
`voice-preferences-panel.tsx` 55 · `server-profile-card.tsx` 52 · `admin-primitives.tsx` 39.

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1 maddeleri:

- [ ] 1. Kimlik (`requireApiUserId`)
- [ ] 2. Yetki zorlaması
- [ ] 3. Görünürlük redaksiyonu
- [ ] 4. Rate limit kaydı
- [ ] 5. Zod girdi doğrulama
- [ ] 6. Dar DTO (`select`)
- [ ] 7. Metadata / `actionUrl` doğrulama
- [ ] 8. Komut yetki kontrolü

**Uygulanmayan madde varsa nedeni:** Faz 0 uç yazmıyor, veri okumuyor, kullanıcı girdisi almıyor.
Eklenen her şey ya saf fonksiyon ya da yalnız testte/lint'te koşan araç. §5.1'in tamamı Faz 3'te
(9 yeni uç) tek tek işaretlenecek.

## 6. Açık kalan / devreden

- **Ölçek motoru.** `HOME_METRICS.shell.minWidth/minHeight` (1360/920) ve parity matrisindeki
  `expectedRootFontSize` (16/16/18/24/32/24) sözleşme olarak duruyor; adım seçimi saf fonksiyonu
  ve kök font uygulayıcısı → **Faz 1**.
- **`data-ui-scale="off"` kill-switch** (§5.2) henüz yok → **Faz 1**.
- **`home-command-center` testid.** Parity spec'i bu testid'i bekliyor; ekranın kök düğümüne
  konacak → **Faz 4**.
- **`test.skip` → `test`.** 12 kombinasyonun açılması ve ekran görüntüsü karşılaştırması →
  **Faz 8** (`09-faz8` §1 aynı tabloyu tekrar ediyor, birebir uyumlu).
- **Göç.** 1208 px değerinin rem'e dönüşü faz faz; her raporda sayı yazılacak, cırcır testi
  yukarı çıkmayı engelliyor.
- **İlgisiz dosya.** Çalışma sırasında `docs/superpowers/plans/2026-08-19-railway-cost-optimization.md`
  untracked olarak belirdi — bu fazın çıktısı **değil**, arka plandaki başka bir araç yazdı.
  Commit'e dahil edilmemeli.

## 7. Kullanıcı doğrulaması gereken maddeler

1. `node scripts/quality/count-arbitrary-px.mjs` çıktısının `1208 değer / 120 dosya` olduğunu gör.
2. `pnpm --filter @wizards/web exec playwright test e2e/specs/design/home-parity.spec.ts --list`
   ile 12 test listelendiğini gör.
3. `apps/web/src/lib/home/metrics.ts` içindeki `rail.width: 74`, `panel.width: 272`,
   `grid.gap: 13`, `card.radius: 20` değerlerini referans HTML'in inline stilleriyle karşılaştır.
4. Kasten bozma denemesi (rapor sırasında yapıldı ve geri alındı):
   `apps/web/src/components/home/probe.tsx` içine `className="w-[272px] bg-amber-500"` +
   `style={{ color: "#fbbf24", fontFamily: "Outfit" }}` yaz →
   `node --import tsx --test src/lib/home/token-audit.test.ts` 4 sapma ile **kırmızı**,
   `pnpm exec eslint src/components/home/probe.tsx` **exit 1**. Dosyayı sil, ikisi de yeşile döner.
5. §8'deki üç kararın (aşağıda) kabul edilebilir olduğunu onayla.

## 8. Sorulan / sorulacak kararlar

| Konu                                     | Durum                        | Cevap / gerekçe                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind palet sınıfı denetime eklendi   | Karar verildi, onay bekliyor | §2'nin yasak kalıp listesinde yok; ama izin listesi `bg-amber-400` + `text-slate-900` diyor. Bu iki sınıfı "istisna" yapan bir kural olmadan izin listesi anlamsız kalıyordu. `bg-red-500` gibi palet sınıfları artık yakalanıyor. **İstemezsen tek satırlık kural silinir.** |
| Negatif arbitrary px                     | Karar verildi                | Taban (1208) negatifleri saymıyordu; sayaç tabanı bozmamak için onları ayrı satırda raporluyor (2 adet). Lint kuralı ise negatifi de reddediyor — koruma tarafında asimetri kasıtlı.                                                                                          |
| `hairline()` isteğe bağlı parametre aldı | Karar verildi                | §1.1 `hairline()` → `max(1px, 0.0625rem)` diyor; varsayılan tam bu. Referans HTML'de ray "+" ve katıl butonlarında `1.5px` kenar var, `hairline(1.5)` onu karşılıyor — uydurulmuş ölçü değil.                                                                                 |
| `contextLabel` satır yüksekliği yok      | Karar verildi                | SPEC §1 o satırda satır yüksekliği vermiyor, HTML'de de yalnız `font-size:11.5px` var. Uydurmak yerine alan opsiyonel bırakıldı.                                                                                                                                              |
| `shadow` grubunda sıfır/negatif serbest  | Karar verildi                | `0 40px 100px -55px` gibi gölgelerde `offsetX = 0` ve `spread < 0` normal. §1.4'ün "sıfır/negatif yok" kuralı sözlüğün geri kalanına uygulanıyor, `shadow` altı ayrıca "hepsi sonlu sayı" diye test ediliyor.                                                                 |
| `whispr-chat-preview.spec.ts` değişti    | Karar verildi                | §4 "kopyalama, genelleştir" diyor. Değişiklik yalnız import; o spec'in yatay-only sözleşmesi `expectNoHorizontalOverflow` olarak korundu, `expectNoOverflow` yeni ve iki eksenli.                                                                                             |
| Sayaç cırcırı (`test:toolchain`)         | Karar verildi, onay bekliyor | "sayı monoton azalır" (§4) otomatik zorlanıyor: taban aşılırsa `pnpm test:toolchain` ve dolayısıyla `pnpm ci` kırmızı. İstenmiyorsa tek `assert` silinir.                                                                                                                     |
