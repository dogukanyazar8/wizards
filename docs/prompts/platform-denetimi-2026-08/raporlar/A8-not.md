# A8 — HTML rapor notu

Çıktı: [`docs/reports/whispr-platform-denetimi-2026-08.html`](../../../reports/whispr-platform-denetimi-2026-08.html)
Veri paketi: `raporlar/_bundle.json` (A1–A6 findings + A7 roadmap + A6 parityMatrix)

## Kapı sonuçları

**1. Dış istek yok, JSON geçerli, sayım tutuyor**

```
boyut KB 166   dis istek 0   bulgu 23   kalem 22   parite 15
fetch/XHR/WebSocket/CDN eslesme: 0
```

Boyut tavanı 1 MB; 166 KB ile altında. `quote` kırpması gerekmedi (200 karakter üstü alan yoktu).

**2. Kaynak bütünlüğü**

```
kayip kaynak 0
eksen toplami 23  sayfadaki 23  ESIT
```

**3. Tarayıcı doğrulaması** (Browser pane, `file://`)

| Kontrol         | Sonuç                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| Konsol hatası   | **yok**                                                                                      |
| Sekmeler        | 7/7 render ediyor (Özet, Bulgular, Ölçümler, Parite, Yol haritası, Geliştirme planı, Kapsam) |
| Skor kartları   | 23 bulgu · 0 kritik · 7 yüksek · 22 kalem · 3 W0 efor birimi                                 |
| Filtre          | `high` çipi → `7 / 23 bulgu`, `aria-pressed="true"`                                          |
| Arama           | "migration" → `3 / 23 bulgu`, 1 vurgulama                                                    |
| Tümünü temizle  | `23 / 23 bulgu`'ya döner                                                                     |
| Sıralama        | severity → ilk satır "yüksek"; score → ilk satır 69p                                         |
| Derin bağlantı  | `#/bulgular?id=A6-001` → satır açık, detay dolu, 2 kanıt bloğu                               |
| Tema düğmesi    | iki yönde çalışıyor, `data-theme` yazılıyor, geri dönüyor                                    |
| Yol haritası    | 22 kalem, detay paneli doluyor, `R-002` seçilince ön koşulu `R-003` vurgulanıyor             |
| İlerleme sayacı | `0 / 22 tamam`, `localStorage` tabanlı                                                       |
| 360px genişlik  | **7 sekmenin 7'sinde de yatay taşma yok** (`scrollWidth === 360`)                            |

## Tasarım kısıtlarına uyum

- Tek dosya, inline CSS + JS, çerçeve yok, derleme adımı yok.
- Sıfır dış istek: CDN, web font, uzak görsel, `fetch`, WebSocket yok.
- Veri koddan ayrı: tüm içerik `<script type="application/json" id="denetim-verisi">` içinde; DOM ondan üretiliyor.
- İkon, emoji, gradyan yok. Sistem font yığını, 5 boyut kademesi.
- Şiddet **yalnız renkle değil metinle de** taşınıyor (`kritik/yüksek/orta/düşük`).
- `prefers-color-scheme` + elle geçiş (`:root[data-theme]` üstün), seçim `localStorage`'da.
- Filtreler gerçek `<button aria-pressed>`; sekmeler `role="tablist"`; genişleyen satırlar `aria-expanded` + `aria-controls`; sonuç sayacı `aria-live="polite"`.
- `/` aramaya odaklanır, `Esc` açık paneli kapatır, odak halkası her zaman görünür.
- Tablolar kendi `overflow-x: auto` kabında kayar; sayfa gövdesi yatay kaymaz.
- `@media print`: filtreler ve sekmeler gizli, tüm paneller açık.
- Detay gövdesi **açılınca** üretiliyor (kapalı satırlar hafif).

## Yayımlama

Rapor A3 güvenlik bulgularını içeriyor. **Yerel dosya olarak bırakıldı; hiçbir dış servise yüklenmedi.** Yayımlanması istenirse kalıcı bir bağlantı üretir ve içerik `high` şiddetli bağımlılık zafiyeti ayrıntısı taşır — sahibin açık onayı gerekir.

## Bilinen sınır

Sayfa `A7.roadmap.json` içindeki `edges` dizisini görsel bir grafiğe çevirmiyor; bunun yerine seçili kalemin ön koşullarını ve onu bekleyenleri vurguluyor. Prompt bunu açıkça serbest bırakmıştı (§5: "grafik çizmek zorunlu değil; vurgulama yeterli ve daha okunur").
