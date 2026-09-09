# Splash 1b “Işıklı panel” — 3 dalgalık uygulama paketi

Whispr açılış ekranının (web + masaüstü + mobil) tasarım devrini üretime çeviren run-prompt
paketi. Tasarım kaynağı: `design_handoff/splash-1b-paketi/`.

| Dosya                | Ne işe yarar                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00-ortak-baglam.md` | Değişmez kurallar, kullanıcının 13 bağlayıcı kararı, kod tabanında bulunan gerçekler, ortak sözleşme adları, kapı komutları. **Her dalga bunu önce okur.** |
| `dalga-1.md`         | Sözleşme + token + başlatma motoru. Ekran dosyası yok.                                                                                                     |
| `dalga-2.md`         | Web ve masaüstü yüzeyi + dört durum + parity turu.                                                                                                         |
| `dalga-3.md`         | Mobil yüzey + native açılış + kabul kriteri turu.                                                                                                          |
| `raporlar/`          | Her dalganın çıktısı (dalga koşarken yazılır).                                                                                                             |

---

## Dalga haritası

**Dalga 1 — sözleşme ve motor** (`packages/types`, `globals.css` tokenları, `app-version`,
`splash-machine`, i18n, mobil fontlar)
Altı şerit: Ş1 splash sözleşmesi · Ş2 koyu tema `-soft` tokenları · Ş3 sürüm/ortam kaynağı ·
Ş4 adım+durum motoru · Ş5 metinler (tr/en) · Ş6 mobil font varlıkları.
Çıktı: üç yüzeyin ortak dili hazır, hiçbir piksel çizilmedi.

**Dalga 2 — web + masaüstü** (`components/splash/*`, `wizards-shell`, `desktop/start`, Tauri)
Beş şerit: Ş7 bileşen ailesi · Ş8 web ekranı ve devralma · Ş9 masaüstü penceresi (630×420,
saydam, `zoom:1.5`) · Ş10 dört durum · Ş11 parity + e2e.
Çıktı: iki yüzey tasarımdaki hâliyle çalışır, eski `AppStartupScreen` silinmiştir.

**Dalga 3 — mobil + native + kapanış** (`apps/mobile`, Android/iOS açılış katmanı)
Dört şerit: Ş12 mobil ekran · Ş13 mobil dört durum · Ş14 native açılış katmanı ·
Ş15 kabul kriteri turu ve kapanış.
Çıktı: SPEC §10'un altı kriteri üç yüzeyde kanıtlı.

Sıra zorunludur: Dalga 2 ve 3, Dalga 1'in sözleşmelerini tüketir.

---

## Başlatma promptları

Her dalga **temiz bir oturumda** başlatılır. Aşağıdaki metin olduğu gibi yapıştırılır.

### Dalga 1

```
Whispr splash screen 1b paketi, Dalga 1'i uygula.

Önce şunları oku:
- docs/prompts/splash-1b/00-ortak-baglam.md   (kurallar + 13 bağlayıcı karar + kod gerçekleri)
- docs/prompts/splash-1b/dalga-1.md            (bu dalganın 6 şeridi)
- design_handoff/splash-1b-paketi/SPEC.md      (tek doğruluk kaynağı)
- design_handoff/splash-1b-paketi/referans.html (çalışan referans)

Branch uat. Commit yok, push yok. Codebase sorusu çıkarsa önce `graphify query "<soru>"`.
Bu dalgada hiçbir ekran/bileşen dosyası çizilmez.
13 kararın dışına çıkma; yeni bir sapma gerekirse dur ve bana sor.
Dalga sonunda 00-ortak-baglam.md §5'teki kapı komutlarını çalıştır ve
docs/prompts/splash-1b/raporlar/dalga-1.md raporunu yaz. Koşamadığın komutu yeşil sayma.
```

### Dalga 2

```
Whispr splash screen 1b paketi, Dalga 2'yi uygula.

Önce şunları oku:
- docs/prompts/splash-1b/00-ortak-baglam.md
- docs/prompts/splash-1b/raporlar/dalga-1.md   (önceki dalganın çıktısı ve kalan sapmalar)
- docs/prompts/splash-1b/dalga-2.md            (bu dalganın 5 şeridi)
- design_handoff/splash-1b-paketi/SPEC.md      (§4 masaüstü, §5 web, §7 durumlar, §10 kabul)
- design_handoff/splash-1b-paketi/referans.html (ölçü doğrulaması buradan)

Branch uat. Commit yok, push yok. Codebase sorusu çıkarsa önce `graphify query "<soru>"`.
Ölçüleri SPEC'ten oku, ekran görüntüsünden tahmin etme. Renkleri yalnız hsl(var(--token)) ile yaz.
Masaüstü 1,5× ölçekte çalışır: pencere 630×420, değerler 420×280 yazılır, kökte zoom:1.5.
Hiçbir CSS değerini elle 1,5 ile çarpma.
apps/mobile altına dokunma (Dalga 3'ün işi).
13 kararın dışına çıkma; yeni bir sapma gerekirse dur ve bana sor.
Dalga sonunda kapı komutlarını + parity spec'ini çalıştır ve
docs/prompts/splash-1b/raporlar/dalga-2.md raporunu yaz. Koşamadığın komutu yeşil sayma.
```

### Dalga 3

```
Whispr splash screen 1b paketi, Dalga 3'ü uygula.

Önce şunları oku:
- docs/prompts/splash-1b/00-ortak-baglam.md
- docs/prompts/splash-1b/raporlar/dalga-1.md
- docs/prompts/splash-1b/raporlar/dalga-2.md
- docs/prompts/splash-1b/dalga-3.md            (bu dalganın 4 şeridi)
- design_handoff/splash-1b-paketi/SPEC.md      (§6 mobil, §7 durumlar, §9 erişilebilirlik, §10 kabul)
- design_handoff/splash-1b-paketi/ekranlar/03-mobil-390x844.png

Branch uat. Commit yok, push yok. Codebase sorusu çıkarsa önce `graphify query "<soru>"`.
Mobilde yeni bağımlılık ekleme; mevcut react-native-svg / reanimated / expo-linear-gradient yeter.
Mobil tema tokenlarında successSoft "açık tint", successSoftDark "koyu ton" — web'in tersi;
tona göre doğru varyantı seç.
apps/web ve apps/desktop altına dokunma (Dalga 2'de kapandı).
13 kararın dışına çıkma; yeni bir sapma gerekirse dur ve bana sor.
Dalga sonunda kapı komutlarını çalıştır, `graphify update .` koş,
docs/prompts/splash-1b/raporlar/dalga-3.md ve docs/prompts/splash-1b/SONUC.md yaz.
SPEC §10'un altı kriterini üç yüzeyde tek tek kanıtla. Koşamadığın komutu yeşil sayma.
```

---

## Kararlaştırılmış sapmalar (tasarım dışına yalnız bunlarda çıkılır)

Hepsi ya kullanıcı kararıdır ya da platform zorunluluğudur; başkası eklenmez.

| Sapma                                     | Gerekçe                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Masaüstü pencere **630 × 420** (1,5×)     | K3 — kullanıcı kararı. SPEC üretimde 420×280 diyordu.                                |
| Masaüstü **Tauri**, Electron değil        | PROMPT.md Electron varsayıyor; uygulama Tauri v2. Yüzey aynı, API farklı.            |
| Mobil durum düğmesi **44px** (SPEC 32px)  | Dokunma hedefi alt sınırı; depo bunu ölçüyor.                                        |
| Mobil alt dolgu `max(42, güvenli alan)`   | Çentikli cihazda 42px sabit satırı home indicator altına iter.                       |
| Native açılış katmanında aurora/metin yok | K11 — statik varlık sınırı; yalnız zemin + logo eşlenir.                             |
| Logo gradyanı hex                         | SPEC §2 gradyanı sabit renk tanımlar, tokenlı değildir. Başka hiçbir renk hex değil. |
| Durum 3 web ve iOS'ta yok                 | K10 — gerçek bayt ilerlemesi yalnız Tauri updater ve Android APK indiricisinde var.  |
| Dar web (<768px) mobil düzeni çizer       | K12 — SPEC dar ekran kuralı vermiyor; üçüncü düzen icat edilmiyor.                   |

## Açık kalan tek dış bağımlılık

`NEXT_PUBLIC_WHISPR_BUILD_NUMBER` deploy ortamlarında (PROD/UAT) doldurulmalı. Doldurulmazsa
sürüm satırı **doğru ama kısa** çıkar: `Whispr 0.8.15 · Echo` (K8 — boş parantez yazılmaz).
Dalga 1 raporu bunu hatırlatır.
