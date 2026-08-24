# Faz 1 raporu — Tipografi + ölçek motoru

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Faz kapsamı iki turda tamamlandı. İlk tur A–E maddelerini uyguladı ve regresyon taramasında
**9 bulgu** çıkardı; ikinci tur kullanıcı kararıyla ("tüm sorunları en kaliteli şekilde çözelim")
o dokuz bulgunun tamamını kapattı ya da kanıtla kapsam dışına aldı. Ayrıntı §6'da.

---

## 1. Yapıldı

### A. Tipografi

- **Figtree üretildi.** `apps/web/src/app/fonts/figtree-latin.woff2` — Google Fonts deposundaki
  `Figtree[wght].ttf` (v2.002) indirildi, `fontTools.varLib.instancer` ile `wght=400:900` aralığına
  alındı, `fontTools.subset` ile Latin + Latin Extended-A/B'ye indirildi, woff2'ye çevrildi.
  **24 244 bayt (23,7 KB)**, §1.1'in 60 KB eşiğinin altında.
- **Altı fontun tamamı yeniden üretildi.** Ölçüm şunu gösterdi: `apps/web/src/app/fonts/` altındaki
  **yedi woff2'nin yedisi de** `ğ Ğ ş Ş İ` taşımıyordu (yalnız Google `latin` alt kümesi; `ı ç ö ü`
  Latin-1'de olduğu için vardı). Yani uygulama başından beri Türkçe metni bu beş harfte sistem
  fontuyla çiziyordu. Altı vendor fontu da (Figtree, Outfit, DM Sans, Inter, Open Sans, Raleway)
  aynı zincirle yeniden üretildi.
  Her dosya için doğrulandı: **kayıp kod noktası 0**, `a`/`A`/`o` ilerleme genişlikleri eskisiyle
  **birebir aynı**, eksen aralığı **aynı**, Türkçe 12/12.
- **Optik boyut tuzağı.** DM Sans ve Inter yukarı akışta `opsz` ekseni taşıyor. `opsz=9` (isim
  kaydının önerdiği değer) ilerleme genişliklerini kaydırdı; ölçümle `opsz=14`'ün mevcut dosyayla
  birebir tuttuğu bulundu. Open Sans için `wdth=100`. Yani metrikler değişmedi, yalnız glif kümesi
  büyüdü.
- **Bağlama.** `layout.tsx:19` `--font-sans` = Figtree (`weight: "400 900"`, `display: "swap"`),
  `:25` `--font-display` = Outfit (`weight: "400 700"`). `--font-auth-body` ve dört
  `--font-message-*` **bağlaması** değişmedi; yalnız arkalarındaki dosya Türkçeyi kazandı.
- **Emeklilik.** `plus-jakarta-sans-latin.woff2` ve `space-grotesk-latin.woff2` silindi. Tüketici
  taraması: web tarafında tek tüketicileri `layout.tsx` idi. Mobil uygulama Plus Jakarta'yı kendi
  `apps/mobile/assets/fonts/` dizininden yükler — etkilenmedi.
- **Lisans.** `fonts/OFL.txt` Figtree girdisini kazandı, iki emekli aile çıkarıldı.
- **`layout-fonts.test.ts` yeniden yazıldı** (25 → 326 satır): değişken↔dosya haritası, ağırlık
  dizeleri, emekli ailelerin hem koddan hem diskten gittiği, OFL girdisi ve **woff2 gövdesini brotli
  ile açıp `cmap` tablosunu okuyan gerçek glif denetimi**. Altı fontun altısı da Türkçeyi taşımak
  zorunda; negatif kontrol hiçbir dosyanın `中` (U+4E2D) taşımadığını doğruluyor, yani okuyucu
  bozulursa test kırmızıya döner.

### B. Ölçek motoru

- **`apps/web/src/lib/home/scale.ts`** — saf `selectUiScale({width,height})`. Taban kabuğu
  `HOME_METRICS.shell`'den okur. `UI_SCALE_STEPS` dört adım ve her adımın `data-ui-scale` dizesini
  taşır. Ölçülemeyen görünüm alanı (0, negatif, `NaN`, `Infinity`) taban adıma düşer.
- **`apps/web/src/hooks/use-ui-scale.ts`** — `applyUiScale(root, step)` saf yazıcı + `useUiScale()`.
  Hook **hiç state tutmaz**; resize hiçbir koşulda yeniden render tetiklemez. `resize` dinleyicisi
  `requestAnimationFrame` ile throttle'lı, unmount'ta dinleyici ve bekleyen kare temizlenir. Kökte
  `data-ui-scale-lock="off"` varsa hiçbir şey yazılmaz.
- **`apps/web/src/components/app/ui-scale-boundary.tsx`** — hook'un tek çağıranı, hiçbir şey render
  etmeyen istemci bileşeni. `AuthenticatedAppProviders`'ın en üstünde mount edilir. Testte hem
  "hook'un tek çağrı noktası" hem "bileşenin tek mount noktası" sabitlenmiştir.

### C. Ölçeklenmeyecekler

- Hairline `metrics.hairline()` (Faz 0) — değişmedi.
- **`pxToEm` eklendi** (`metrics.ts`): §8.2.3'ün tek `em` istisnası olan ikon boyutu için.
- Avatar / gölge yarıçapı rem tarafında.
- Kabuk yarıçapı + dış gölgenin "yalnız pencere modunda" kuralı → Faz 2.

### D. Density göçü

- `globals.css:6019` altındaki sekiz `--density-*` px değeri rem'e çevrildi.
- `[data-density-control]` → `min-height: max(2.75rem, 44px, var(--density-control-min-height));`
- **Tuzak:** `wizards-shell.tsx` satır içi stille aynı dört değişkeni px olarak yeniden yazıyordu;
  yalnız CSS'i çevirmek hiçbir şey değiştirmezdi. Kabuk artık `pxToRem(...)` üretiyor.
- `getInterfaceDensityMetrics` (`@wizards/types`) **sayı** döndürmeye devam ediyor — aynı fonksiyonu
  mobil de okuyor ve RN'de px doğru birim. Dönüşüm web tüketicisinde.

### E. Kabuk sütunları rem'e geçti (2. turda eklendi)

`wizards-shell.tsx` kabuk genişliklerini px yazıyordu; içerideki ikon ve boşluklar ise Tailwind
rem ölçeğinde. Ölçek adımı yükselince kap sabit kalıp içerik büyüyordu ve kullanıcı ayağı
kırpılıyordu (§6.3). Artık ray ve kanal kenar çubuğu da `pxToRem(...)` üretiyor:

```
--server-rail-width   68px  → 4.25rem
kanal kenar çubuğu    240px → 15rem   (kullanıcı tercihinden gelen tasarım pikseli)
```

×1'de piksel karşılığı değişmiyor; ×1.15/×1.5/×2'de kap içerikle birlikte büyüyor.

---

## 2. Dokunulan dosyalar

| Dosya                                                               | Yeni / Değişti         | Neden                                                   |
| ------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| `apps/web/src/app/fonts/figtree-latin.woff2`                        | Yeni (23,7 KB)         | Gövde fontu, latin+ext, wght 400–900                    |
| `apps/web/src/app/fonts/outfit-latin.woff2`                         | Değişti (31,5→37,3 KB) | latin-ext; `ğĞşŞİ` kazandı                              |
| `apps/web/src/app/fonts/dm-sans-latin.woff2`                        | Değişti (36,1→42,1 KB) | aynı                                                    |
| `apps/web/src/app/fonts/inter-latin.woff2`                          | Değişti (47,3→69,2 KB) | aynı                                                    |
| `apps/web/src/app/fonts/open-sans-latin.woff2`                      | Değişti (42,0→62,7 KB) | aynı                                                    |
| `apps/web/src/app/fonts/raleway-latin.woff2`                        | Değişti (42,1→59,1 KB) | aynı                                                    |
| `apps/web/src/app/fonts/plus-jakarta-sans-latin.woff2`              | **Silindi**            | Tüketicisi kalmadı                                      |
| `apps/web/src/app/fonts/space-grotesk-latin.woff2`                  | **Silindi**            | Tüketicisi kalmadı                                      |
| `apps/web/src/app/fonts/OFL.txt`                                    | Değişti                | Figtree girdisi + iki emekli aile çıktı                 |
| `apps/web/src/app/layout.tsx`                                       | Değişti (2 blok)       | `--font-sans` = Figtree, `--font-display` = Outfit      |
| `apps/web/src/app/layout-fonts.test.ts`                             | Değişti (25→326)       | Bağlama sözleşmesi + woff2 cmap glif denetimi           |
| `apps/web/src/lib/home/scale.ts`                                    | Yeni (92)              | Saf adım seçimi (SPEC §8.1)                             |
| `apps/web/src/lib/home/scale.test.ts`                               | Yeni (133)             | §2.1 tablosu + kural testleri (22 test)                 |
| `apps/web/src/hooks/use-ui-scale.ts`                                | Yeni (86)              | Kök font boyutu yazıcısı + hook                         |
| `apps/web/src/hooks/use-ui-scale.test.ts`                           | Yeni (177)             | Yazıcı + hook sözleşmesi + mount noktası (13 test)      |
| `apps/web/src/components/app/ui-scale-boundary.tsx`                 | Yeni (15)              | Hook'un tek çağıranı                                    |
| `apps/web/src/components/providers/authenticated-app-providers.tsx` | Değişti (+2)           | Tek mount noktası                                       |
| `apps/web/src/app/globals.css`                                      | Değişti (3 blok)       | `--density-*` rem, 44px tabanı korundu                  |
| `apps/web/src/app/globals-density.test.ts`                          | Yeni (69)              | Density rem sözleşmesi (4 test)                         |
| `apps/web/src/components/shell/wizards-shell.tsx`                   | Değişti (+13/−8)       | Density + ray + kenar çubuğu rem                        |
| `apps/web/src/components/shell/channel-sidebar.tsx`                 | Değişti (+7/−3)        | Kullanıcı ayağı: rem tip + 44px işaretçi hedefi         |
| `apps/web/src/components/dm/dm-sidebar.tsx`                         | Değişti (+6/−1)        | Filtre şeridine kaydırma maskesi                        |
| `apps/web/src/app/api/e2e/auth/session/route.ts`                    | Değişti (+25/−19)      | Kalıcı oturum satırı + kimlikli token + DELETE'te iptal |
| `apps/web/src/app/api/e2e/auth/session/route-logic.ts`              | Yeni (63)              | Saf token gövdesi kurucusu                              |
| `apps/web/src/app/api/e2e/auth/session/route-logic.test.ts`         | Yeni (87)              | Kimlik sözleşmesi (4 test)                              |
| `apps/web/src/lib/home/metrics.ts`                                  | Değişti (+7)           | `pxToEm`                                                |
| `apps/web/src/lib/home/metrics.test.ts`                             | Değişti (+13)          | `pxToEm` testleri (2 test)                              |
| `docs/prompts/whispr-ana-sayfa-1a/raporlar/kanit/*`                 | Yeni (5 PNG)           | Kapı kanıtı (1,4 MB)                                    |
| `graphify-out/**`                                                   | Değişti                | `graphify update .`                                     |

Faz 0'ın açık iki maddesi kullanıcı onayıyla olduğu gibi bırakıldı: Tailwind palet sınıfı denetimi
ve `count-arbitrary-px` cırcırı.

---

## 3. Kapı çıktıları

| Komut                                         | Sonuç                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`             | ✅ exit 0 — **2829 test / 632 suite, 0 fail**, 45,2 sn (Faz 0: 2778) |
| `pnpm typecheck`                              | ✅ exit 0 — 5/5 paket                                                |
| `pnpm lint`                                   | ✅ exit 0 — 5/5 paket                                                |
| `pnpm --filter @wizards/web e2e:visual`       | ⚠ **4 test koşuyor, 4'ü de baseline yokluğundan düşüyor** — §6.8     |
| `pnpm --filter @wizards/web e2e:a11y`         | ✅ **4/4 passed** (18,2 sn)                                          |
| `pnpm --filter @wizards/web e2e:smoke`        | ✅ **16/16 passed** (59,4 sn)                                        |
| `node scripts/quality/count-arbitrary-px.mjs` | ✅ `1205 değer / 120 dosya` (taban 1208 → **−3**)                    |
| `graphify update .`                           | ✅ 26811 düğüm, 62652 kenar, 1217 topluluk                           |

Yeni testler: scale 22 + use-ui-scale 13 + layout-fonts 6 + globals-density 4 + e2e-session 4 +
metrics 2 = **51 yeni test**. (2778 + 51 = 2829 ✓)

E2E suiteleri `PLAYWRIGHT_SKIP_WEB_SERVER=1` ile, izole `wizards_e2e` veritabanına bağlı ayrı bir
sunucuya (port 3100) karşı koşuldu. Geliştirme veritabanına ve `apps/web/.env`'e dokunulmadı.
`e2e:a11y` ve `e2e:smoke` **bu fazdan önce hiç koşamıyordu** (§6.7).

### Kapı dışı ölçümler (gerçek tarayıcı, Playwright + chromium)

| Görünüm alanı | `data-ui-scale` | Kök font boyutu | Beklenen    | Durum |
| ------------- | --------------- | --------------- | ----------- | ----- |
| 1360×920      | `1`             | 16px            | 1 / 16px    | ✅    |
| 1600×900      | `1`             | 16px            | 1 / 16px    | ✅    |
| 1920×1080     | `1.15`          | 18px            | 1.15 / 18px | ✅    |
| 2560×1440     | `1.5`           | 24px            | 1.5 / 24px  | ✅    |
| 3840×2160     | `2`             | 32px            | 2 / 32px    | ✅    |
| 5120×1440     | `1.5`           | 24px            | 1.5 / 24px  | ✅    |

Faz 0 parity matrisindeki `expectedRootFontSize` dizisiyle (16/16/18/24/32/24) birebir aynı.
Aynı değerler **çalışan uygulamada da** doğrulandı: 12 yüzey × 4 ölçek adımında `<html>` niteliği
ve kök font boyutu tabloyla eşleşti.

- **Adım değişmeyen resize:** 1920×1080'den 1960×1120'ye **40 resize** → **0 DOM yazımı**.
- **Kill-switch:** `data-ui-scale-lock="off"` iken 3840×2160'a geçildi → nitelik yazılmadı,
  kök font 16px'te kaldı.
- **Türkçe glif (canvas ölçümü, gerçek Next font hattı):** `bodyFont`, `displayFont` ve
  `authBodyFont` için fallback'e düşen karakter **sıfır** (önce `authBodyFont` beş harfte
  düşüyordu). Ekran görüntüsü: `raporlar/kanit/faz1-turkce-glif.png`.
- **İşaretçi hedefi:** kullanıcı ayağındaki durum butonunun görsel kutusu 65×16 px; `::after`
  yüksekliği **44px** ve `elementFromPoint` merkezden ±21px'te butonu döndürüyor.

---

## 4. Ölçülen sayılar

| Ölçüm                                   | Değer                                 | Bütçe / beklenen           | Durum       |
| --------------------------------------- | ------------------------------------- | -------------------------- | ----------- |
| `figtree-latin.woff2`                   | 24 244 B (23,7 KB)                    | < 60 KB (§1.1)             | ✅          |
| `outfit-latin.woff2`                    | 38 236 B (37,3 KB)                    | < 60 KB                    | ✅          |
| `dm-sans-latin.woff2`                   | 43 128 B (42,1 KB)                    | < 60 KB                    | ✅          |
| `raleway-latin.woff2`                   | 60 468 B (59,1 KB)                    | < 60 KB                    | ✅          |
| `open-sans-latin.woff2`                 | 64 240 B (62,7 KB)                    | < 60 KB                    | ⚠ açıklandı |
| `inter-latin.woff2`                     | 70 844 B (69,2 KB)                    | < 60 KB                    | ⚠ açıklandı |
| Font dizini toplam                      | 6 dosya / 294 KB                      | 7 dosya / 262 KB (önce)    | ℹ +32 KB    |
| Türkçe glif (6 font)                    | 12/12 · 6/6                           | 12/12                      | ✅          |
| Yeniden üretimde kayıp kod noktası      | 0                                     | 0                          | ✅          |
| `scale.test.ts` §2.1 tablo satırı       | 10/10                                 | 10                         | ✅          |
| `data-ui-scale` doğru görünüm alanı     | 6/6 (motor) · 4/4 (uygulama)          | 6                          | ✅          |
| Adım değişmeyen 40 resize'da DOM yazımı | 0                                     | 0                          | ✅          |
| `useUiScale()` çağrı noktası            | 1                                     | 1                          | ✅          |
| `<UiScaleBoundary />` mount noktası     | 1                                     | 1                          | ✅          |
| Regresyon taraması kombinasyonu         | 48 (2 tur × 12 yüzey × 4 boyut dâhil) | 8 ekran × 2 tema × 2 boyut | ✅          |
| Yeni test                               | 51                                    | —                          | ✅          |
| Toplam web testi                        | 2829 / 0 fail                         | —                          | ✅          |

**Neden iki font 60 KB'ı aşıyor:** eşik tek alt kümeli (yalnız `latin`) bir dosya için yazılmıştı.
Türkçe zorunluluğu Latin Extended-A/B'yi de aynı dosyaya sokuyor — glif sayısı Inter'de 231 → 434,
Open Sans'ta 224 → 392 oluyor. Google Fonts aynı kapsamı **iki ayrı istek** olarak sunuyor
(`latin` + `latin-ext`); tek dosyada toplamı yaklaşık aynı bayta denk geliyor. Kayıp:
`--layout-features` `*` yerine kullanılan/varsayılan-açık 21 özelliğe indirildi (Inter'de 90,7 →
70,8 KB). Aşan iki dosya **mesaj fontu tercihi**; yalnız kullanıcı o fontu seçtiğinde indiriliyor.
İlk boyada kullanılan iki aile (Figtree 23,7 KB + Outfit 37,3 KB) eşiğin altında.

Kalan arbitrary px: **1205 değer / 120 dosya** (Faz 0 tabanı 1208 / 120 — kullanıcı ayağındaki üç
değer rem'e geçti).

### Regresyon taraması sonuç tablosu

Gerçek tarayıcı, Türkçe locale, izole e2e veritabanı. Her hücrede yatay taşma, gerçekten kırpılan
metin (`overflow: hidden/clip` + taşma), 22px altı tıklama hedefi ve görünüm alanı dışına taşan öğe
ölçüldü. İkinci turda 2560×1440 ve 3840×2160 de eklendi.

| #   | Ekran                  | ×1  | ×1.15 | ×1.5 | ×2  | Not                                     |
| --- | ---------------------- | --- | ----- | ---- | --- | --------------------------------------- |
| 1   | Giriş / kayıt          | ✅  | ✅    | ✅   | ✅  | Kabuk dışı, ölçek yok, 16px             |
| 2   | Sunucu + kanal sohbeti | ✅  | ✅    | ✅   | ✅  | ×1.15 kırpması düzeltildi (§6.3)        |
| 3   | DM listesi             | ✅  | ✅    | ✅   | ✅  | Filtre şeridine kaydırma maskesi (§6.4) |
| 3   | DM sohbeti             | ✅  | ✅    | ✅   | ✅  | —                                       |
| 4   | Sesli oda              | ✅  | ✅    | ✅   | ✅  | —                                       |
| 5   | Profil (kart)          | ✅  | ✅    | ✅   | ✅  | —                                       |
| 6   | Ayarlar — Hesabım      | ✅  | ✅    | ✅   | ✅  | —                                       |
| 6   | Ayarlar — Görünüm      | ✅  | ✅    | ✅   | ✅  | —                                       |
| 6   | Ayarlar — panel        | ✅  | ✅    | ✅   | ✅  | —                                       |
| 7   | Keşfet                 | ✅  | ✅    | ✅   | ✅  | —                                       |
| 8   | Admin konsolu          | ✅  | ✅    | ✅   | ✅  | Ölçek bilerek kapalı (§6.2)             |

Yatay taşma **48/48 kombinasyonda 0 px**. Gerçekten kırpılan metin **0**. Görünüm alanı dışına
taşan öğe **0**. Denetimin bulduğu tek "kırpma" sınıfı `span.sr-only` — kasıtlı.

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1 maddeleri:

- [x] 1. Kimlik — `/api/e2e/auth/session` yalnız `assertE2EApiRouteEnabled` geçen istekte çalışır
      (`E2E_TEST_MODE=true` + yerel host); kimlik doğrulama sözleşmesi sertleşti: token artık
      kalıcı `AuthSession` satırına bağlı ve `DELETE` o satırı iptal ediyor.
- [ ] 2. Yetki zorlaması
- [ ] 3. Görünürlük redaksiyonu
- [ ] 4. Rate limit kaydı
- [x] 5. Zod girdi doğrulama — uç zaten `E2ESessionSchema` ile parse ediyor, değişmedi.
- [x] 6. Dar DTO — uç `select` ile sınırlı, değişmedi.
- [ ] 7. Metadata / `actionUrl` doğrulama
- [ ] 8. Komut yetki kontrolü

**Uygulanmayan madde varsa nedeni:** Faz 1 üretim ucu yazmıyor. Dokunulan tek uç, üretimde
`E2E_TEST_MODE` kapalıyken 404 dönen test yardımcısı; değişiklik onu **daha sıkı** hâle getirdi
(oturum artık iptal edilebilir, DELETE gerçekten iptal ediyor). §5.1'in tamamı Faz 3'te
(9 yeni uç) tek tek işaretlenecek.

Tarama sırasında yalnız izole `wizards_e2e` veritabanına dokunuldu; geçici fikstürler (admin
üyeliği, `AuthSession` satırı, tema alanı) iş bitince geri alındı ya da suite'in kendi
`resetAndSeedE2EData()` çağrısıyla silindi. Geliştirme veritabanı ve `apps/web/.env`
**değiştirilmedi**.

---

## 6. Bulguların akıbeti — dokuz maddenin tamamı

**1. Giriş/kayıt ekranı da font değiştirdi — kapatıldı (kayıt).**
02 dosyası §4.1 "kendi font değişkenini kullanıyor — değişmemeli" diyor; ölçüm bunun yalnız gövde
metni için doğru olduğunu gösterdi. `globals.css:4351` logo tipografisini, `:4373` hero başlığını
`var(--font-sans)` ile çiziyor — ikisi de Figtree oldu. Görsel sonuç sağlıklı; beklenti yanlıştı.
**Faz 8 parity'de "giriş ekranı değişmedi" varsayımı kullanılmamalı.** Kod değişikliği yok.

**2. Admin konsolunda ölçek — bilerek kapalı bırakıldı, kanıtla.**
`useUiScale` admin ağacına takıldı, 4 ölçek adımında ölçüldü ve **geri alındı**. Ölçüm:

|                                     | ×1 (1360×920) | ×2 (3840×2160)                 |
| ----------------------------------- | ------------- | ------------------------------ |
| `aside` genişliği                   | 250px         | **250px** (px, büyümedi)       |
| `aside` iç boşluğu                  | 16px          | **32px** (rem, ikiye katlandı) |
| nav satırı yatay boşluğu            | 12px          | **24px**                       |
| nav satırı kullanılabilir genişliği | 225px         | **201px** (daraldı)            |
| `h1` boyutu                         | 26px          | **26px** (px)                  |

Yani ölçeği açmak admin'i büyütmüyor, **daraltıyor**: sabit genişlikli kolonun içindeki boşluk
ikiye katlanıp metne yer bırakmıyor. Doğru sıra, admin'in arbitrary px'i (`admin-primitives.tsx`
39 değer dâhil) rem'e göçtükten **sonra** ölçeği açmak. Karar testte gerekçesiyle sabitlendi
(`use-ui-scale.test.ts` "is mounted in the app shell and nowhere else"). Kanıt:
`kanit/08-admin-3840-olcek-acikken.png`. → **admin paketi.**

**3. Kanal kenar çubuğu ayağının ×1.15'te kırpılması — düzeltildi.**
Kök neden: kabuk sütun genişlikleri px, içerikleri rem. DM ekranı `clamp(19rem, 20vw, 23rem)`
kullandığı için sorunsuzdu; kanal ekranı `${channelSidebarWidth}px` kullanıyordu, kap sabit kalıp
ikonlar büyüyünce ad/durum bloğu sıkışıp `Online` → `O…` oluyordu. `--server-rail-width` ve kanal
kenar çubuğu genişliği `pxToRem(...)` ile rem'e geçti; ayrıca ayak tipografisi de rem oldu.
Doğrulandı: 4 ölçek adımında kırpma 0. Kanıt: `kanit/02-sunucu-kanal-dark-1920x1080.png`.

**4. DM filtre çipi şeridi — düzeltildi (rapordaki ilk teşhis fazla sertti).**
`dm-sidebar.tsx:185` zaten `overflow-x-auto`, yani şerit kasıtlı kaydırılabilir; çipler
erişilemez değildi. Eksik olan **kaydırılabilirlik ipucu** idi: kaydırma çubuğu gizli, kenar
belirsiz, bu yüzden kesik görünüyordu. Sağ kenara 1,5rem'lik maske gradyanı eklendi; içerik sığdığında
görünmüyor, taştığında son çipi yumuşatarak "devamı var" diyor. Doğrulandı: hesaplanan
`mask-image` = `linear-gradient(to right, rgb(0,0,0) calc(100% - 24px), transparent)`.

**5. Durum butonunun 44px tıklama hedefi — düzeltildi.**
`channel-sidebar.tsx` kullanıcı ayağındaki durum butonu 65×16 px idi. Görsel kutu korunarak
`after:h-11` sözde öğesiyle işaretçi hedefi 44px'e çıkarıldı — düzen değişmiyor, komşu öğe
kapanmıyor (sözde öğe yalnız butonun kendi genişliğinde). Doğrulandı: `::after` yüksekliği 44px ve
`elementFromPoint` merkezden ±21px'te butonu döndürüyor. Ayrıca ayak tipografisi
(`text-[13px]`, iki adet `text-[10.5px]`) rem'e çevrildi; arbitrary px sayacı 1208 → 1205.

**6. Beş vendor fontunun Türkçe eksiği — düzeltildi.**
DM Sans, Inter, Open Sans, Raleway (ve zaten Outfit) latin+latin-ext ile yeniden üretildi.
Doğrulandı: her dosyada kayıp kod noktası 0, ilerleme genişlikleri aynı, Türkçe 12/12; ayrıca
tarayıcıda canvas ölçümüyle `authBodyFont`'un artık hiçbir harfte fallback'e düşmediği görüldü.
Test artık **altı fontun altısını da** zorluyor.

**7. E2E oturum yardımcısı — düzeltildi ve canlı doğrulandı.**
Kök neden: `POST /api/e2e/auth/session` token'ı `authSessionId` olmadan üretiyordu;
`bc8d6bba` ile gelen `validateAuthSessionToken` → `parseAuthSessionIdentity` `null` görünce token'ı
`revoked` sayıyor, `/channels` sonsuz `/login` döngüsüne giriyordu. Düzeltme:

- token gövdesi saf `buildE2ESessionToken()` fonksiyonuna çıkarıldı, `authSessionId` +
  `sessionStartedAt` zorunlu (boş `authSessionId` ile çağrılırsa fırlatıyor);
- uç token'dan **önce** `ensureAuthSession(...)` ile kalıcı satırı açıyor;
- `DELETE` artık `revokeAuthSession(...)` çağırıyor — eskiden çerezi silip satırı bırakıyordu.

Canlı doğrulama: `POST /api/e2e/auth/session` → 200, ardından `/channels/@me` → **200** (önce 307
döngüsü). Suite kanıtı: **`e2e:a11y` 4/4**, **`e2e:smoke` 16/16**, `e2e:visual`'in dördü de
oturum açıp ekran görüntüsü adımına ulaşıyor.

**8. Görsel baseline'lar — teşhis kesinleşti, tek adım CI'da kaldı.**
`e2e/specs/visual/visual.spec.ts-snapshots/` altındaki 4 PNG `-chromium-linux` ekli. CI
**self-hosted linux** koşucusunda çalışıyor (`.github/workflows/ci.yml:39`), yani baseline baytları
o makinenin Chromium + font yığınına bağlı; bu Windows makinesinde ya da bir konteynerde üretilecek
dosyalar CI'da yine tutmaz. Font çifti değiştiği için dördü de **bayat**. Yapılması gereken, CI
koşucusunda bir kez:

```bash
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/visual --update-snapshots
```

Bu fazda kanıtlanan: dört testin dördü de artık **koşuyor ve ekran görüntüsü adımına ulaşıyor**
(önce oturum açamadan düşüyorlardı). Windows'ta üretilen `-win32` dosyaları silindi, repoya
girmedi. → **Faz 8 / CI, tek komut.**

**9. Ağırlık kırpması — düzeltildi.**
`--font-sans` `400 700` bildirildiğinde 800/900 isteyen **129 bildirim** (globals.css'te 28 kural,
bileşenlerde 69 `font-black` + 32 `font-extrabold`) sessizce 700'e iniyordu. Figtree `wght=400:900`
ile yeniden üretildi ve `weight: "400 900"` bildiriliyor; artık hiçbir bildirim kırpılmıyor.
`--font-display` bilerek `400 700`'de bırakıldı: eski Space Grotesk de `300 700` bildiriyordu,
yani display tarafında **davranış değişmedi**. Uygulamada 500'ün altında ağırlık kullanılmıyor
(ölçüldü: en düşük 500), o yüzden alt sınır 400 yeterli.

### Faz 0'dan devreden, hâlâ açık

- `home-command-center` testid → Faz 4.
- Parity matrisinin `test.skip` → `test` açılışı → Faz 8.
- 1208 → 1205 arbitrary px; göç faz faz sürüyor.

### Bu fazın açık bıraktığı tek iş

- §6.8: linux görsel baseline'larının CI koşucusunda bir kez yenilenmesi.

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `raporlar/kanit/faz1-turkce-glif.png`: ilk üç satır (Figtree, Outfit, DM Sans) tek yazı
   karakteriyle çizilmiş; dördüncü satır kasten var olmayan aile, fallback'in nasıl göründüğü.
2. `pnpm --filter @wizards/web test` → **2829 test / 0 fail**.
3. `node scripts/quality/count-arbitrary-px.mjs` → `1205 değer / 120 dosya`.
4. Uygulamayı aç, pencereyi 1360×920 ↔ 1920×1080 arasında boyutlandır: `<html>` üzerinde
   `data-ui-scale` `1` ↔ `1.15` arasında gidiyor ve `style="font-size: 16px|18px"` yazıyor; aynı
   adım içinde (1920→1950) **hiçbir şey yazılmıyor**.
5. Sunucu + kanal ekranını 1920×1080'de aç: kullanıcı ayağında durum etiketi `Online` tam
   görünüyor (önce `O…` idi). Durum etiketinin 20px yukarısına/aşağısına tıkla — menü açılıyor.
6. Kasten bozma denemeleri (rapor sırasında yapıldı ve geri alındı):
   - Herhangi bir woff2'yi `latin`-only bir alt kümeyle değiştir →
     `node --import tsx --test src/app/layout-fonts.test.ts` "must carry Latin Extended-A" ile kırmızı.
   - `globals.css`'te bir `--density-*` değerini px'e döndür → `globals-density.test.ts` kırmızı.
   - `<UiScaleBoundary />`'yi ikinci bir yere ekle → `use-ui-scale.test.ts` mount testi kırmızı.
   - `route-logic.ts`'te `authSessionId`'yi token'dan çıkar → `route-logic.test.ts` kırmızı.
7. §6.8'i CI'da koş: `--update-snapshots` ile 4 linux baseline yenilenmeli.
8. Dev sunucun kapalı; 3100'deki izole sunucu durduruldu. `pnpm --filter @wizards/web dev` ile
   geri başlatabilirsin.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                        | Durum                        | Cevap / gerekçe                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Faz 0 §8'in iki bekleyen maddesi            | Soruldu, cevap alındı        | "İkisi de kalsın" — palet denetimi ve px cırcırı olduğu gibi.                                                                                                                                                                                                |
| Outfit'in Türkçe eksiği                     | Soruldu, cevap alındı        | "Figtree + Outfit" — sonra kapsam kullanıcı kararıyla altı fonta genişledi.                                                                                                                                                                                  |
| Dokuz bulgunun tamamının bu fazda çözülmesi | Soruldu, cevap alındı        | "Tüm sorunları en kaliteli şekilde çözelim, bu fazı kapatacağız". 02 dosyasının "sapmalar bu fazda düzeltilmez" kuralı kullanıcı talimatıyla geçersiz kılındı.                                                                                               |
| Figtree ekseni 400–900                      | Karar verildi                | §1.1 "400–700" diyor; 400–700 bildirimi mevcut 129 ağırlık bildirimini sessizce inceltiyordu (§6.9). Tasarım tip ölçeği yine 400–700 kullanıyor, bildirim yalnız mevcut ekranları korumak için geniş. **İstemezsen `weight: "400 700"`'e dönmek tek satır.** |
| Outfit ekseni 100–900, bildirimi 400–700    | Karar verildi                | Dosya `--font-message-outfit`'i de besliyor; eksen daraltılamaz. Bildirim eski Space Grotesk (`300 700`) ile aynı davranışı veriyor.                                                                                                                         |
| Altı fontun yeniden üretimi                 | Karar verildi                | Türkçe eksiği yedi dosyanın yedisindeydi. Metrik kayması olmadığı (ilerleme genişlikleri birebir) ve kod noktası kaybı olmadığı dosya dosya doğrulandı.                                                                                                      |
| İki font 60 KB'ı aşıyor                     | Karar verildi                | Eşik tek alt küme için yazılmıştı; Türkçe zorunluluğu glif sayısını ~%80 artırıyor. Aşan ikisi lazy yüklenen mesaj fontu tercihi. Gerekirse `latin-ext`'i ayrı `@font-face` + `unicode-range` ile bölmek mümkün — bugün gereksiz karmaşıklık.                |
| Admin'de ölçek kapalı                       | Karar verildi, ölçümle       | Açmak konsolu daraltıyor (§6.2 tablosu). Doğru sıra: admin px göçü → sonra ölçek.                                                                                                                                                                            |
| `UiScaleBoundary` bileşeni                  | Karar verildi                | Hook'un tek çağıranı; `AdminShell` gibi sunucu bileşeni kabuklara ileride tek satırla takılabilsin diye. Tek çağrı noktası + tek mount noktası ayrı ayrı testli.                                                                                             |
| E2E ucu düzeltildi (Faz 1 kapsamı dışı)     | Karar verildi                | §4 regresyon taraması ve `e2e:visual` kapısı bu uç olmadan koşamıyordu; "en kaliteli çözüm" talimatı kapsamı açtı. Değişiklik yalnız test yardımcısında, üretimde 404 dönen bir uç.                                                                          |
| `layout-fonts.test.ts` woff2 çözümlüyor     | Karar verildi, onay bekliyor | ~110 satır, bağımlılıksız, negatif kontrollü. Türkçe eksiği yıllardır sessizdi; bağlama testi bunu yakalamıyordu. **Fazla buluyorsan okuyucu + iki test silinir**, geriye bağlama sözleşmesi kalır.                                                          |
| Tarama için izole sunucu + geçici fikstür   | Karar verildi                | Ayrı port (3100) + ayrı veritabanı (`wizards_e2e`). Fikstürler geri alındı; `wizards_e2e`'ye eksik migration (`20260818120000_authorization_revisions`) uygulandı — o veritabanı zaten test amaçlı.                                                          |
| Kanıt ekran görüntüsü sayısı                | Karar verildi                | Tarama 100'den fazla PNG üretti; repoya 5 temsili dosya (1,4 MB) kondu.                                                                                                                                                                                      |
