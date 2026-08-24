# Keşfet Dalga 3 · Ş9 raporu

Tarih: 2026-08-21
Dal: `uat`
Commit: `NOT RUN` (istenmedi)

## Sonuç

Ş9 tamamlandı. Boş ve hata durumları gerçek sayfa akışına bağlandı; ölçüler
`Kesfet-5B.dc.html` inline stilleriyle aynı `DISCOVER_METRICS.emptyState/errorState`
değerlerinden rem olarak çiziliyor. Sol 74 px ray, 228 px nav ve kullanıcı barı değiştirilmedi.

- Boş durum `q` dolu/boş ayrımını ve dört şeride özel i18n gövdesini kullanıyor.
- `Filtreleri temizle` tam `/discover`; davet eylemi mevcut rotaya `modal=join` ekliyor.
- Hata kodu sabit değil: HTTP `DIR-{status}`, ağ `DIR-NET`, zaman aşımı `DIR-TMO`.
- Son başarısız deneme kullanıcı saat diliminde `HH:mm`; refetch sırasında eylem pasif ve
  `Yeniden deneniyor…` yazıyor.
- Mevcut kök rem motoru yeniden yazılmadı. İlk sayfa boyutu ×1/×1.15/×1.5/×2 için
  `24/24/36/48`; sunucu, kanal ve etkinlik sorgu anahtarları ile API limitine taşınıyor.
- `<1100`: 326 px panel sağ overlay, backdrop, ilk öğe odağı, Tab/Shift+Tab tuzağı ve mevcut
  Esc/odak-iade akışı.
- `<960`: kabuğun mevcut drawer davranışına ek olarak başlık altında aynı altı kategori,
  aynı `DISCOVER_CATEGORIES` ve aynı href kurucusunu kullanan yatay şerit.
- `<720`: tek kolon ızgara/skeleton, dikey featured, tam geniş CTA, yatay kayan şerit sekmeleri;
  ikon grubu korunuyor.
- `prefers-reduced-motion` kart yükselmesini ve panel giriş animasyonunu kapatıyor.
- `components/discover/**` üretim kaynakları özyinelemeli tarandı: arbitrary px sınıfı `0`;
  `zoom` kullanımı `0`.

## Erişilebilirlik kapısı

- Kategori listeleri `listbox/option/aria-selected`; şeritler `tablist/tab/aria-controls`.
- Izgara `role=list` taşımıyor; aktif şerit adı `aria-label`, kartlar `article`.
- Sayı pilleri dekoratif; metin karşılığı ebeveyn `aria-label` içinde.
- Presence renk yanında küçük harfli durum `aria-label` ve görünmez metin taşıyor.
- İkon-only kontroller token odak halkası ve ×1'de en az 44 fiziksel px hit area taşıyor.
- Modal/panel Esc, odak tuzağı, açılış odağı ve tetikleyiciye dönüş sözleşmesi korunuyor.
- Onay şeridi `status/polite`; skeleton `aria-busy` ve tek canlı duyuru taşıyor.
- `outline` bastırılan her Ş9 temas noktasında `--ring` focus-visible halkası var.

## Kontrast ölçümü

WCAG bağıl parlaklık formülüyle `H(text-muted)` ve 10.5 px etiketlerin kullandığı dört Keşfet
yüzeyi ölçüldü. Açık Keşfet yüzeyinde mevcut token aynı ton/doygunlukta `46% → 42%` olarak
yalnız `[data-discover-surface]` altında sıkılaştırıldı; sol kabuk etkilenmedi.

| Tema/yüzey  |    Oran | AA   |
| ----------- | ------: | ---- |
| dark/base   | 5.826:1 | PASS |
| dark/card   | 5.225:1 | PASS |
| dark/panel  | 5.622:1 | PASS |
| dark/soft   | 4.505:1 | PASS |
| light/base  | 5.408:1 | PASS |
| light/card  | 5.671:1 | PASS |
| light/panel | 5.142:1 | PASS |
| light/soft  | 4.543:1 | PASS |

En düşük oran `4.505:1`; sekiz ölçüm de normal metin AA eşiği `4.5:1` üstünde.

## Doğrulama

- `PASS` — Ş9 + bağlı Discover/API odak kapısı: 17 suite, 75 test, 75 geçti, 0 başarısız.
- `PASS` — tüm `components/discover` + `lib/discover`: 59 suite, 224 test, 224 geçti.
- `PASS` — Discover/i18n sözlük kapısı: 5 suite, 21 test, 21 geçti.
- `PASS` — `pnpm --filter @wizards/web typecheck`.
- `PASS` — `pnpm --filter @wizards/web lint`: yapılandırma 10/10 + tam ESLint.
- `ENV BLOCKED` — `pnpm --filter @wizards/web test`: ilk test grupları geçti; çalışma alanında
  aynı anda dokuz `run-node-tests.mjs` süreci varken koşum 6+ dakika yeni çıktı üretmedi. Yalnız
  bu görevin terminal oturumu durduruldu; sonuç özeti oluşmadığı için tam test başarısı iddia
  edilmiyor.
- `ENV BLOCKED` — `graphify update .`: iki denemede de AST `3217/3217` tamamlandı; atomik değişimde
  `[WinError 5] Erişim engellendi: 'graphify-out\\.graph.tmp.json' -> 'graphify-out\\graph.json'`.
  Bu koşumun bıraktığı 47 MB geçici dosya silindi; mevcut kirli graph WIP korunuyor.

## Değişen Ş9 yüzeyi

- `discover-empty-state.tsx`, `discover-error-state.tsx`, `discover-responsive.tsx`
- `discover-category-strip.tsx`, `lib/discover/scale.ts` ve testleri
- Discover sayfa/rail bağlantısı, grid/presence/hit-area/reduced-motion a11y temasları
- Sunucu/kanal/etkinlik sayfa boyutu istemci ve API/service aktarımı
- TR/EN durum metinleri

## Sınırlar

- Commit/push yapılmadı.
- Browser/device görsel kabul koşulmadı; sonuç kaynak + statik render + Node test kanıtıdır.
- Tam typecheck/test kapıları yukarıdaki kapsam dışı WIP ve eşzamanlı süreçler çözülmeden yeşil
  sayılamaz.
