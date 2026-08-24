# Dalga 3 · Ş9 — Parity kapısı, a11y, kırılımlar, performans, kabul

**Ön koşul:** Dalga 2'nin dört şeridi de yeşil. **Paralel:** yok — bu tek şerittir.

Amaç: paketi kapatmak. Yeni özellik yok; ölçüm, düzeltme ve kanıt var.

---

## Sahiplenilen dosyalar

```
apps/web/e2e/specs/design/messages-parity.spec.ts        (yeni)
apps/web/e2e/specs/design/messages-responsive.spec.ts    (yeni)
apps/web/e2e/specs/a11y/messages-a11y.spec.ts            (yeni)
apps/web/e2e/specs/visual/**                             (yenilenen anlık görüntüler)
apps/web/src/lib/home/token-audit.ts                     (skip kaldırılır)
apps/web/src/lib/home/copy-audit.ts                      (skip kaldırılır)
apps/web/eslint.config.mjs                               (chat/dm kapsama alınır)
docs/prompts/whispr-mesajlar/raporlar/10-rapor.md
```

---

## 1. Parity matrisi — 6 çözünürlük × 2 tema × 11 durum

`messages-parity.spec.ts`, `home-parity.spec.ts`'in yapısını izler (aynı yardımcılar,
`e2e/helpers/design-parity.ts`).

| Görünüm alanı           | Beklenen ölçek | Beklenen kök font |
| ----------------------- | -------------- | ----------------- |
| 1360×920                | ×1             | 16px              |
| 1600×900                | ×1             | 16px              |
| 1920×1080               | ×1.15          | 18px              |
| 2560×1440               | ×1.5           | 24px              |
| 3840×2160               | ×2             | 32px              |
| 5120×1440 (ultra geniş) | ×1.5           | 24px              |

Her kombinasyonda, 11 durumun her biri için:

- `expectNoOverflow` — yatay **ve** dikey kaydırma yok.
- `expectNoClippedText` — metin kırpılmıyor.
- Kolon genişlikleri: `74 / 228 / 276` sabit, sağ panel açıkken `340`, kalanı ana alan.
  Asgari durumda ana alan **782**, sağ panel açıkken **442** (SPEC §1.2).
- `collectUndersizedTapTargets` — 44px altı hedefler `test-results/parity-tap/messages-*.json`
  dosyalarına yazılır. **Kapalı istisna listesi**: listede olmayan yeni küçük hedef testi kırar.
  Tasarımın kendi ölçüsü 44'ün altındaysa (34×34 ikon butonları, 30×30 hover şeridi butonları)
  istisna listesine **gerekçesiyle** yazılır ve `pointer: coarse` altında büyütülür.

> **Tema tuzağı (00-ortak-baglam §6.1):** `applyParityTheme` yanında `User.theme` de ayarlanmalı
> ve uygulanan tema ekranda doğrulanmalı. Doğrulamasız tema ekseni sessizce yalan söyler.

## 2. Denetim borçlarının kapatılması

Ş0.1 `components/chat`, `components/dm`, `components/friends`, `components/messages`, `lib/messages`
kapsamını ekledi ama testi `skip` bıraktı. Burada:

1. `skip` kaldırılır.
2. Kalan her sapma düzeltilir:
   - **Token:** hex/rgb/oklch/Tailwind palet rengi/gömülü font adı → `hsl(var(--token))` ve
     `var(--font-*)`. İzin verilenler yalnız allowlist'teki dört değer.
   - **Metin:** kapsamdaki kaynaklarda yorum dışında Türkçe karakter kalmaz — hepsi
     `messages.*` / mevcut sözlüklere taşınır.
   - **Arbitrary px:** `[NNpx]` kalıpları rem'e; kenarlar `hairline()`; ikonlar `pxToEm`.
3. `eslint.config.mjs` arbitrary-px `files` dizisine `src/components/chat/**` ve
   `src/components/dm/**` eklenir.
4. `node scripts/quality/count-arbitrary-px.mjs` çıktısı **öncesi/sonrası** rapora yazılır.

## 3. Kırılımlar

`messages-responsive.spec.ts`:

| Genişlik | Beklenen                                                                    |
| -------- | --------------------------------------------------------------------------- |
| ≥1100    | sağ panel docked (340), sohbet rayı görünür                                 |
| 960–1099 | sağ panel overlay + backdrop, `role="dialog"`, focus tuzağı **var**         |
| <960     | sohbet rayı drawer'da, `MobileDrawerTrigger` görünür, ana alan tam genişlik |

Her eşikte `expectNoOverflow` + klavyeyle panelin açılıp kapanması.

## 4. Erişilebilirlik

`messages-a11y.spec.ts` (mevcut `e2e:a11y` altyapısı):

- 11 durumun her birinde axe taraması — kritik/ciddi ihlal **sıfır**.
- Klavye turu: sohbet rayı → ana alan → sağ panel → bestekar, `Tab` sırası görsel sırayla aynı.
- Menü ve modal: `Esc` kapatır, focus tuzağı, açılışta ilk öğe, kapanışta tetikleyiciye dönüş.
- Ekran okuyucu isimleri: okunmamış badge (`{n} okunmamış mesaj`), presence noktası, anket
  seçeneği (etiket + yüzde + oy), renk swatch'ı (renk adı), sesli mesaj oynatıcı (`slider`).
- `prefers-reduced-motion`: anket çubuğu, yazıyor noktaları, mesaj vurgusu, panel geçişi durur.
- Kontrast: açık tema + koyu tema, açık zeminli grup renklerinde tik/metin kontrastı ≥ 4.5:1.

## 5. Performans bütçesi

Ölçülür ve rapora **sayıyla** yazılır (iddia değil, çıktı):

| Ölçüm                                                                | Bütçe                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/channels/@me` ilk anlamlı boya (üretim derlemesi, soğuk önbellek)  | ≤ 1200ms                                                   |
| Sohbet açma → ilk mesaj görünür                                      | ≤ 350ms                                                    |
| 250 üyeli grupta mesaj gönderme → kendi ekranında görünme            | ≤ 120ms                                                    |
| 250 üyeli grupta fan-out (sunucu tarafı, `unreadCount` yazımı dâhil) | ≤ 250ms                                                    |
| Anket oyu → yüzde güncellemesi (iyimser)                             | ≤ 16ms (tek kare)                                          |
| Global arama, 10k mesaj fikstürü, 3 sonuç                            | ≤ 300ms, ≤ 2 sorgu                                         |
| Mesaj listesi 1000 mesajda kaydırma                                  | düşen kare yok (mevcut `message-list-performance.test.ts`) |
| Sohbet rayı 200 sohbet                                               | ilk boya ≤ 200ms                                           |

Bütçeyi aşan her ölçüm için ya düzeltme ya da gerekçeli bir istisna kaydı. Sessiz geçiş yok.

## 6. Güvenlik doğrulaması

Her madde bir test çıktısıyla kanıtlanır:

1. Katılımcı olmayan kullanıcı anketi **okuyamaz** ve oy **veremez** (403).
2. Anonim ankette oy veren kimlikleri hiçbir uçtan dönmez — yanıt gövdesi denetlenir.
3. Global arama başka kullanıcının konuşmasını döndürmez; `historyFromAt` öncesi mesaj dönmez.
4. Sabitleme yetkisi `permPinMessage` ile zorlanır; yetkisiz `POST /pins` → 403.
5. Öneri ucu engellenen/engelleyen kişiyi döndürmez.
6. Sesli mesaj `waveform`/`durationMs` sunucuda doğrulanır; 65 elemanlı dizi → 400.
7. Tavanlar (250 üye, 50 sabit, 6 seçenek) sunucuda zorlanır, istemci kapatma yeterli sayılmaz.
8. Yeni yazma uçlarının hepsi rate-limit kaydında (`route-contract.test.ts` doğrular).

## 7. Görsel karşılaştırma

Koyu ve açık temada, 1360×920 ile 3840×2160 arasında her durumun ekran görüntüsü alınır ve
`design_handoff/mesajlar-paketi/screens/*.png` ile **yan yana** karşılaştırılır. Sapmalar
raporda tablo hâlinde: `<durum> · <bölge> · <tasarım> · <ürün> · <karar>`.

Ana Sayfa'nın parity anlık görüntüleri (panel 272→228) yenilendiği için o matris de **yeşil**
olmalı — Mesajlar paketinin Ana Sayfa'yı bozmadığının kanıtı budur.

## 8. Ölü kod temizliği

Dalga 2 sonunda kullanılmayanlar (`graphify query` ile doğrula, körlemesine silme):

- `components/dm/dm-sidebar.tsx` ve `components/friends/friends-sidebar.tsx` — Mesajlar rotası
  artık `MessagesRail` kullanıyor. Başka referans yoksa silinir; varsa **silinmez**, rapora yazılır.
- `DMConversation.pinnedMessageId` / `pinnedById` / `pinnedAt` okuma yeri kalmadıysa kolon düşürme
  migration'ı **bir sonraki pakete** bırakılır (aynı sürümde yazma+düşürme yapılmaz).
- `chat.input.pollTemplate` / `pollQuestion` i18n anahtarları.

## 9. Paket kabul kriterleri

PROMPT.md'nin listesi, birebir:

- [ ] Sohbet rayı 276 + ana alan + sağ panel 340; modallar 560 / 520 ve kabuk içinde konumlanıyor.
- [ ] Sol sunucu rayı ve kullanıcı barı değiştirilmedi; gezinme panelindeki `Mesajlar` sayısı
      rayın başlığındaki sayıyla aynı kaynaktan geliyor.
- [ ] 11 durumun hepsi çalışıyor ve birbirini doğru kapatıyor (iki panel ya da iki menü aynı anda
      açık kalmıyor).
- [ ] Sohbet rayı: yeni mesaj + yeni grup butonları, arama, Sabitlenenler ve Sohbetler grupları,
      okunmamış badge'leri, presence noktaları, aktif satır zemini.
- [ ] Arkadaşlar: 4 sekme, satır `...` menüsü, çevrimiçi/çevrimdışı bölümleri, öneri listesi,
      boş/bilgi şeritleri.
- [ ] Sohbet: başlık aksiyonları, sabitlenen mesaj şeridi, tarih ayracı, hover şeridi, tepki
      çipleri, yanıt önizlemesi, dosya kartı, mesaj `...` menüsü, thread çipi.
- [ ] Bestekar: `Aa` şeridi 9 aracıyla açılıp kapanıyor ve köşe yarıçapı düzleşiyor;
      `Enter` / `Shift+Enter` / `Ctrl+B,I,U` çalışıyor; emoji, GIF, ses, anket girişleri bağlı.
- [ ] Canlı anket: oy verince yüzdeler ve çubuklar animasyonla güncelleniyor, kendi oyu işaretli,
      oy taşınıyor.
- [ ] Grup oluşturma iki adımı: adım 1'de en az 2 kişi seçilmeden `İleri` pasif; adım 2'de ad,
      renk seçici (açık renklerde koyu metin kontrastı), davet/geçmiş ayarları çalışıyor.
- [ ] Thread ve arama panelleri: başlık, kapatma, panele özel bestekar, eşleşme vurgusu.
- [ ] Boş durum: ortalanmış çağrı + 3 hızlı erişim; tıklama ilgili sohbeti açıyor.
- [ ] Açık ve koyu temada, 1360×920 · 1920×1080 · 2560×1440 · 3840×2160'ta kaydırma yok, metin
      kırpılmıyor; 4K'da gövde metni temel çözünürlükteki kadar okunur.
- [ ] Tüm metinler birebir; placeholder/lorem yok. Tip kontrolü, lint ve testler geçiyor; yeni
      bileşenler için render testleri eklendi.

Paketin **kendi** ek kriterleri:

- [ ] Sesli mesaj uçtan uca (kayıt → dalga formu → yükleme → oynatma), mikrofon kaynağı sızmıyor.
- [ ] Anonim ankette oy veren kimlikleri hiçbir yanıt gövdesinde yok.
- [ ] 250 üyeli grup ölçümleri bütçe içinde.
- [ ] Ana Sayfa parity matrisi panel daralmasından sonra yeşil.
- [ ] Token / metin / arbitrary-px denetimleri `skip`siz yeşil.

## 10. Paket kapısı

```bash
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/web e2e:a11y
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/visual
pnpm --filter @wizards/web e2e:api
graphify update .
```

Rapor: `raporlar/10-rapor.md` — kabul kriterleri tablosu, ölçüm sayıları, sapma tablosu, açık
kalanlar. Sonra **commit izni istenir**; kendiliğinden commit yok.
