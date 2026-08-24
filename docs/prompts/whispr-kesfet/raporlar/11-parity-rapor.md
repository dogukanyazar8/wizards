# Dalga 4 · Ş10 — parity, e2e ve kabul raporu

**Tarih:** 2026-08-21 · **Dal:** `uat` · **HEAD:** `bc8d6bba` · **Commit yok.**

## Sonuç

Keşfet'in Ş10 kapsamı tamamlandı: 12 durum × 2 tema ve 6 çözünürlük × 2 tema gerçek uygulamada
Chromium ile yakalandı; davranış, axe, klavye/odak ve performans kapıları aynı E2E koşusunda
**19/19 PASS** verdi. Referansın koyu tema görselleri ile gerçek koyu tema aynı durum ve
1360×920 ölçüsünde yan yana incelendi. Açık tema için ayrı referans görseli bulunmadığından aynı
geometri/metin sözleşmesi ve ürünün açık tema tokenları doğrulandı.

Ş10'un sahip olduğu yüzeylerde açık ölçü veya davranış sapması kalmadı. Ancak istenen tam web
test kapısı, Keşfet dışındaki mevcut WIP'te üç test kırığı nedeniyle **FAIL**. Bu yüzden depo
geneli kabul kapısı yeşil diye raporlanmıyor.

Sol kabuğun `74 px` sunucu rayı, `228 px` gezinme paneli ve kullanıcı barına Ş10 değişikliği
yapılmadı. Çalışma ağacında bu dosyalarda önceden var olan başka şeritlere ait WIP bulunduğundan
“tüm worktree diff'i yalnız Keşfet” iddiası kurulamaz; Ş10 değişiklik kümesi bu sınıra uyuyor.

## Parity matrisi — 12 durum × 2 tema

Her hücre 1360×920 ekran kanıtı ve karşılık gelen `design_handoff/kesfet-paketi/screens/NN-durum.png`
ile yapılan ölçü-temelli incelemeyi içerir.

| #   | Durum                 | Açık | Koyu | Ölçü sonucu                                                              |
| --- | --------------------- | ---- | ---- | ------------------------------------------------------------------------ |
| 01  | Tüm dizin + öne çıkan | PASS | PASS | `directory.width=276`; öne çıkan yalnız `lane=servers, cat=all, q=empty` |
| 02  | Kategori: Oyun        | PASS | PASS | filtre şeridi var; öne çıkan yok; kart geometrisi korunuyor              |
| 03  | Çalışma + online      | PASS | PASS | kategori ve sıralama URL/başlık/kart sırasıyla eşleşiyor                 |
| 04  | Arama: dil            | PASS | PASS | 250 ms debounce; tek istek; sonuç metinleri kırpılmıyor                  |
| 05  | Kişiler şeridi        | PASS | PASS | kişi kart dili, durum ve eylemler sunucu kartından ayrık                 |
| 06  | Kanallar şeridi       | PASS | PASS | kanal satırı dili ve tile hizası korunuyor                               |
| 07  | Etkinlikler şeridi    | PASS | PASS | etkinlik kart dili, tarih/katılım alanları korunuyor                     |
| 08  | Profil paneli açık    | PASS | PASS | `profilePanel.width=326`; ızgara tek kolon; şerit/ikon grubu yok         |
| 09  | Katıl modalı açık     | PASS | PASS | `joinModal.width=496`; radio/toggle/ayırıcı ve odak tuzağı doğru         |
| 10  | Katılım onayı         | PASS | PASS | banner + `Katıldın` + ray + `Sunucularım/Yeni` atomik görünür            |
| 11  | Boş durum             | PASS | PASS | tasarım başlığı/açıklaması/eylemleri birebir                             |
| 12  | 502 hata durumu       | PASS | PASS | hata başlığı, açıklama, tekrar dene ve kod satırı birebir                |

Kanıt: `raporlar/ekranlar/01-...12-...-{acik,koyu}.png` — toplam **24** durum görüntüsü.
Fixture'daki `200` sunucu / `40` üye verisi referanstaki örnek içerik sayısından farklıdır; bu
bir ölçü sapması değil, E2E veri varyansıdır.

## Çözünürlük matrisi

Her boyutta açık+koyu ekran kanıtı alındı. Yatay kaydırma yok; başlık tek satır; featured taşmıyor;
panel açıldığında ızgara tek kolon; kök font adımı E2E içinde beklenen değere eşit.

| Çözünürlük | Kök font | Açık kolon | Koyu kolon | Panel açık | Sonuç |
| ---------- | -------: | ---------: | ---------: | ---------: | ----- |
| 1360×920   |    16 px |          2 |          2 |          1 | PASS  |
| 1600×900   |    16 px |          3 |          3 |          1 | PASS  |
| 1920×1080  |    18 px |          3 |          3 |          1 | PASS  |
| 2560×1440  |    24 px |          3 |          3 |          1 | PASS  |
| 3840×2160  |    32 px |          4 |          4 |          1 | PASS  |
| 5120×1440  |    24 px |         10 |         10 |          1 | PASS  |

Kanıt: `raporlar/ekranlar/cozunurluk-<boyut>-{acik,koyu}.png` — toplam **12** görüntü.

## Otorite ölçüleri

Şüpheli değerler `Kesfet-5B.dc.html` inline stillerinden doğrulandı; tahmin kullanılmadı.

- Dizin `276 px`; profil paneli `326 px`; katıl modalı `496 px`.
- Sunucu kartı kategori bandı `46 px`; tile `44 px`; tile üst marjı `-19 px`; halka `3 px`;
  kart yarıçapı `18 px`.
- Profil tile `54 px`; görünürlük anahtarı `44×26 px`; knob `20 px`, inset `3 px`, açık ofset
  `21 px`.
- Hover geçişi `140 ms`; arama debounce `250 ms`.

## Kapatılan sapmalar

Format: `şerit · dosya · yanlış ölçü/davranış → doğru ölçü/davranış · neden`.

- Ş6 · `discover-grid.tsx` · `panelOpen` iken 1600 px'de `2 kolon → 1 kolon` · profil paneli
  açıkken içerik sütunu sözleşmesi tek kolondur.
- Ş8 · `server-join-modal.tsx` · asenkron seçenek geldiğinde `seçim yok → ilk geçerli radio seçili`
  · modal gönderim kapısı görünür seçenekle uzlaşmıyordu.
- Ş8 · `server-join-modal.tsx` · ana CTA metin kontrastı `4.37:1 → WCAG AA ≥4.5:1` · açık temada
  normal metin eşiği kaçıyordu.
- Ş7 · `server-profile-stat.tsx` · “Kuruluş” istatistiği `1.93:1 → WCAG AA ≥4.5:1` · vurgu tonu
  açık tema kartında fazla soluktu.
- Ş5/Ş6/Ş7 · `discover-featured.tsx`, `discover-feed-header.tsx`,
  `discover-category-tile.tsx`, `discover-server-card.tsx`, `discover-section-head.tsx`,
  `server-profile-panel.tsx` · soluk sabit tonlar `axe contrast ihlali → 0 serious/critical` ·
  açık tema token karışımları okunabilir eşiğe çekildi.
- Ş10 · `ui/modal.tsx` · SSR portalı `ilk istemci çiziminde portal var → server/client ilk çizim
aynı` · doğrudan modal URL'sinde hydration mismatch ve Next issue rozeti oluşuyordu.
- Ş3 · `join-client.ts` · katılma invalidation'ı `uçuştaki refetch'i iptal edip unhandled
CancelledError → cancelRefetch=false ve yapısal cancellation tanıma` · katılım-onay ekranında
  kırmızı runtime issue rozeti oluşuyordu.
- Ş6 · `discover-server-card.tsx` · kategori gözlemi `örtük metin → data-category sözleşmesi` ·
  kategori filtresinin görünür kartlarla birebir E2E doğrulanması sağlandı.

## Kapatılmayan sapmalar

- **Ürün ölçüsü/davranışı:** yok.
- **Referans kapsamı:** açık tema için ayrı PNG yok. Açık tema, aynı HTML ölçüleri + ürün tokenları
  - axe ile doğrulandı; koyu referanstan renk pikseli uydurulmadı.
- **Depo-geneli kapı:** tam web testindeki üç Keşfet dışı kırık Ş10 sahiplik sınırında
  değiştirilmedi. Aşağıdaki doğrulama tablosunda açıkça FAIL.
- **Worktree sınırı:** sol kabukta önceden var olan WIP var. Ş10 bu dosyalara dokunmadı; mevcut
  kullanıcı WIP'i geri alınmadı.

## `TODO(api):` envanteri

- `apps/web/src/lib/discover/join-client.ts:30` — invite/public self-join için özel üyelik
  socket olayı yok; geniş `server:settings:updated` kullanılıyor.
- `apps/web/src/components/discover/server-join-modal.tsx:196` — sunucu görünürlük tercihi API
  karşılığı yok; değer yerel saklanıyor, uydurma endpoint yok.
- `apps/web/src/components/discover/server-profile-panel.tsx:280` — public profil kontratı private
  kanal taşıyabiliyor; istemci filtreliyor fakat güven sınırı sunucuda da uygulanmalı.

## E2E, erişilebilirlik ve performans

- **PASS — 19/19 Chromium E2E:** 4 axe/klavye testi + 10 davranış testi + 2 durum-matrisi testi
  - 2 çözünürlük-matrisi testi + 1 performans testi.
- **PASS — axe:** açık/koyu ana yüzey + profil paneli + katıl modalı; serious/critical `0`.
- **PASS — klavye:** dizin → ızgara → profil paneli → modal; panel/modal odak tuzakları ve açan
  kontrole odak dönüşü.
- **İlk boyama:** dizin `151.7 ms`; ilk kart `570.4 ms`. Dizin önce görünür: **PASS**.
- **200 kart kaydırma:** `120` kare; p95 `18.0 ms`; maksimum `18.4 ms`; `>32 ms` kare `0`.
  Sanallaştırma takip işi gerekmiyor.
- **Arama:** `250 ms` alt sınır ve tek arama isteği: **PASS**.
- **Online havuz kesme:** servis testi `{ pool: 200, total: 201 }` gözlemini doğruluyor. Kesme
  gözlemlenebilirlik olayına yazılıyor; sonuç global tam sıralama iddiası kurmadan, belgelenmiş
  200 aday havuzunu sıralıyor.

## Doğrulama

| Kontrol                                        | Sonuç                                                |
| ---------------------------------------------- | ---------------------------------------------------- |
| Ş10 güncel Chromium E2E                        | **PASS — 19/19, 2.4 dk**                             |
| Playwright E2E governance                      | **PASS — 22/22**                                     |
| Keşfet odak unit/contract testleri             | **PASS — 346/346**                                   |
| `pnpm --filter @wizards/web typecheck`         | **PASS**                                             |
| `pnpm --filter @wizards/web lint`              | **PASS**                                             |
| `pnpm --filter @wizards/mobile typecheck`      | **PASS**                                             |
| `graphify update .`                            | **PASS — 31824 node, 75105 edge, 1319 community**    |
| `components/discover/**` arbitrary px sınıfı   | **PASS — 0**                                         |
| `components/discover/**` hex renk / sabit font | **PASS — 0 / 0**                                     |
| Yeni `--info` token                            | **PASS — eklenmedi; mevcut global token kullanıldı** |
| `pnpm --filter @wizards/web test`              | **FAIL — 5133 test; 5129 pass, 3 fail, 1 skip**      |

Tam web suite'te kalan üç hata:

1. `src/app/api/v1/route-contract.test.ts:1594` — mevcut mobile channel `thread-follow` PUT/DELETE
   rotaları bodyless sözleşme listesinde yok.
2. `src/lib/messages/audit-budget.test.ts:34` — mevcut
   `components/dm/group-create-dialog.tsx:608:38` `hsl(` borcu `1 > 0`.
3. `src/lib/messages/audit-budget.test.ts:56` — aynı borcun kayıtlı bütçesi `0`, gerçek değer `1`.

Üçü de Ş10 sahiplik alanı dışındadır ve değiştirilmedi.

## Kabul listesi

- [x] Ş10 değişiklik kümesi sol `74 + 228` kabuğa ve kullanıcı barına dokunmuyor.
- [x] Gezinme panelindeki `Keşfet` satırı aktif.
- [x] Katılım banner + kart + ray + `Sunucularım/Yeni` birlikte güncelleniyor.
- [x] Dizin `276 px`; arama, 6 kategori, 3 sıralama ve davet kartı doğru.
- [x] Dört şerit çalışıyor ve ayrı kart dili kullanıyor.
- [x] Featured görünürlük/sarma/panel koşulları doğru.
- [x] Sunucu kartı `46/44/3/-19/18` ölçüleri ve katılma durumu doğru.
- [x] Sunucu adlarında mavi doğrulama ikonu yok.
- [x] Profil paneli `326 px`; tile/istatistik/kanal/tanıdık/CTA doğru.
- [x] Katıl modalı `496 px`; kod/radio/toggle/Esc doğru.
- [x] Başlık tek satır; panel açıkken şerit ve ikonlar yok.
- [x] Filtre, boş ve hata metinleri/koşulları doğru.
- [x] İki tema ve altı çözünürlükte kırpma/yatay kaydırma yok.
- [x] Placeholder/lorem yok; Keşfet E2E/typecheck/lint yeşil.
- [x] Arbitrary px, hex renk, sabit font ve yeni token yok.
- [x] Uydurma endpoint yok; üç `TODO(api):` raporlandı.
- [x] Web typecheck/lint ve mobile typecheck yeşil.
- [ ] Tam web test suite yeşil değil: üç kapsam dışı mevcut WIP kırığı.

## Kullanıcı kararı gereken üç konu

1. **Ş1 §6 — featured sunucu ızgarada da kalsın mı?** Mevcut davranış: featured, ayrı vurgu
   bloğunda ve normal ızgarada birlikte görünebilir. **Öneri:** kalsın; ızgara tam dizin, blok vurgu.
2. **Ş6 §1 — karttan ikinci tıkla ayrılma onaysız mı kalsın?** Mevcut davranış: `Katıldın`
   butonuna ikinci tık doğrudan ayrılır; kabuktaki onay burada yok. **Öneri:** yanlış dokunma/data
   kaybı riskine karşı aynı onay diyaloğunu kullan.
3. **Ş8 §1.3 — “Katıldığımı arkadaşlarım görsün” nasıl ürünleşsin?** Mevcut davranış:
   yalnız `localStorage`; sunucu/API karşılığı yok. **Öneri:** kalıcı ve cihazlar arası tutarlı bir
   hesap gizlilik alanı + yetkili API gelene kadar anahtarı deneysel/yerel olarak açıkça etiketle.
