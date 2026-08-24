# Dalga 2 · Ş5 raporu — akış başlığı, gruplama, sekmeler, URL durumu, boş durum

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Şerit tamamlandı. Kapı yeşil. Yeni test: **95**.

Şerit landed ettikten sonra **çok ajanlı bir denetim** koşuldu (6 boyut, her bulgu ayrı bir
ajanla çürütülmeye çalışıldı). Onaylanan 9 bulgunun tamamı düzeltildi; ayrıntı §12'de.

---

## Ön koşul denetimi

Dalga 1 kapısı iş başlamadan koşuldu:

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✔ 3909 test · 3908 pass · 0 fail · 1 skip · 893 suite
```

Dört şeridin dosyaları da yerinde (`mention-parser.ts` ve `role-mention-service.ts` dahil, yani
Ş2 landed). **Tek eksik dosya bir rapor:** `raporlar/03-s2-rapor.md` yok. Ş3 ve Ş4 raporları
Ş2'nin o sırada landing hâlinde olduğunu ve iki testinin kırmızı olduğunu yazmıştı; her ikisi de
artık yeşil. Kapı yeşil olduğu için başlandı, eksik rapor kayda geçiyor.

---

## Ne landed

| Dosya                                                       | Durum                                                     | Satır |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `apps/web/src/lib/mentions/grouping.ts`                     | yeni — zaman/kaynak grupları, düzleştirme, canlı eşleşme  | 338   |
| `apps/web/src/lib/mentions/grouping.test.ts`                | yeni — 25 test                                            | —     |
| `apps/web/src/lib/mentions/keyboard.ts`                     | yeni — kısayol çözümü, yazma yüzeyi, imleç                | 108   |
| `apps/web/src/lib/mentions/keyboard.test.ts`                | yeni — 14 test                                            | —     |
| `apps/web/src/components/mentions/mentions-page.tsx`        | yeni — durum sahibi                                       | 699   |
| `apps/web/src/components/mentions/mentions-page.test.tsx`   | yeni — 13 test (**sapma**, aşağıda)                       | —     |
| `apps/web/src/components/mentions/mentions-feed.tsx`        | yeni — akış, sanallaştırma, klavye, telafi                | 584   |
| `apps/web/src/components/mentions/mentions-feed.test.tsx`   | yeni — 32 test                                            | —     |
| `apps/web/src/components/mentions/mentions-feed-header.tsx` | yeni — SPEC §4                                            | 283   |
| `apps/web/src/components/mentions/mentions-empty-state.tsx` | yeni — SPEC §8                                            | 128   |
| `apps/web/src/components/mentions/mentions-new-strip.tsx`   | yeni — `{count} yeni bahsetme`                            | 70    |
| `apps/web/src/app/(main)/mentions/page.tsx`                 | yeniden yazıldı                                           | 17    |
| `apps/web/src/components/screens/mentions-screen.tsx`       | **silindi**                                               | −277  |
| `apps/web/src/components/screens/side-screens.test.tsx`     | bahsedilmeler iddiaları güncellendi                       | —     |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`          | 9 eski anahtar silindi, 4 yeni eklendi                    | —     |
| `apps/web/src/lib/locale/mentions-screen-copy.test.ts`      | eski anahtar iddiası tersine döndü                        | —     |
| `apps/web/e2e/specs/a11y/a11y.spec.ts`                      | hazır işareti `mentions-screen` → `mentions-feed-header`  | —     |
| `apps/web/e2e/specs/design/home-side-screens.spec.ts`       | çip testi sekme testine döndü, `/mentions` için ayrı test | —     |

---

## 1. Durum ekseni ve URL

Tek doğruluk kaynağı adres. `parseMentionsRouteState` (Ş0.3) okuyor, `buildMentionsHref` yazıyor;
bu şerit ikisinin arasına **tek bir ek** koydu: `?panel=` değeri `parseMentionId` ile
doğrulanıyor. Elle yazılmış `?panel=` ya da `?panel=abc` adresi arkasında hiçbir bahsetme
olmayan bir panel açar ve başlıktaki iki ikon butonunu boşuna kaldırırdı; çözülmeyen kimlik
"panel yok" demek.

**Geri tuşu tek adım.** Eksen değiştiren her kontrol bir `<Link>` (sekmeler, gruplama, boş
durumun iki butonu, rayın satırları) ya da `router.push` (bağlam paneli, modal kapatma). Tek
`replace` arama kutusunda ve o Ş1'in kararı — her tuş vuruşu bir geçmiş kaydı olsaydı geri tuşu
harf harf geri sarardı.

**Geçici katmanlar tek indirgeyicide.** `mentionsUiReducer` (Dalga 0) menü, yanıt, panel, modal
ve klavye imlecini tek bir durum nesnesinde tutuyor; üç ayrı `useState` yazılmadı. Panel ile
modal aynı indirgeyicide duruyor **ama yazımları adresten geçiyor**: adres değişince indirgeyici
eşitleniyor, indirgeyici tek başına adresin arkasından gitmiyor. Eşitleme mevcut eylemlerle
yapıldı (`togglePanel` / `openSettings` / `closeSettings`), `@wizards/types` içine yeni bir
eylem eklenmedi — o dosya bu şeridin kümesinde değil.

**`Esc` merdiveni tek yerde.** `handleClose` indirgeyicinin `closeTransient` sonucunu **saf
olarak hesaplıyor**, farkı görüyor ve panel/modal değiştiyse adrese yazıyor, değişmediyse
dispatch ediyor. Sıra (modal → menü → yanıt → panel) ikinci kez yazılmadı.

---

## 2. Gruplama (`grouping.ts`)

- **Eşikler izleyicinin takvim gününde.** `Intl.DateTimeFormat("en-CA", { timeZone })` ile gün
  numarası çıkarılıyor ve **gece sayısı** karşılaştırılıyor. Saat farkı çıkarmak yaz saati
  geçişinde bir günü 23 ya da 25 saat yapar ve eşik kayar. Test iki saat dilimiyle koşuyor:
  aynı damga Istanbul'da `Dün`, Los Angeles'ta `Bugün`.
- **`Bu hafta` takvim haftası değil, son yedi gün.** SPEC eşiği vermiyor. Takvim haftası
  pazartesi sabahı bir önceki günü `Daha eski` grubuna atardı; kullanıcı için dün hâlâ bu
  haftadır. **Sapma olarak kayda geçiyor.**
- **`Sonra oku` en üstte ve tek grupta** (K5). Kart zaman ya da kaynak grubunda **ikinci kez**
  çizilmiyor; aynı bahsetmenin iki kez görünmesi, iki bahsetme geldiği anlamına gelirdi.
- **Boş grup üretilmiyor** — render katmanında filtrelenmiyor, hiç kurulmuyor.
- Kaynak sırası akıştaki en yeni bahsetmeye göre azalan, `Direkt mesajlar` her zaman en sonda;
  eşitlikte ad kırıyor.
- İleri tarihli damga `Bugün` sayılıyor. Sunucu ile istemci saati arasındaki kayma bir kartı
  geleceğe atabilir ve `Daha eski` grubunun dibine gömmek onu kaybettirirdi.

---

## 3. Akış ve performans

**Grup başlıkları düz listeye çevriliyor** (`flattenMentionGroups`). İç içe listelerde sanal
pencere ölçemez, grup başlığı yapışkan olamaz ve kaydırma çubuğu her ölçümde zıplar.

Düzleştirme boşlukları satırlara gömüyor; aritmetik orijinal dizilimle **birebir** aynı:

| Orijinal                               | Düz liste                                           |
| -------------------------------------- | --------------------------------------------------- |
| başlık `padding 6 2 8` + kap `gap 6`   | başlık `padding-top 6`, `padding-bottom 8 + 6 = 14` |
| kartlar arası `gap 8`                  | kart `padding-bottom 8`                             |
| gövde `padding-bottom 8` + kap `gap 6` | grubun son kartı `padding-bottom 8 + 6 = 14`        |
| altlık `padding-top 4`                 | değişmedi                                           |

**Sanallaştırma 60 karttan sonra.** `useVirtualizer` her render'da çağrılıyor ama eşik altında
`count: 0` ile; koşullu kanca, listenin 60. kartında kanca sırasını değiştirmek olurdu. Sanal
kabın yüksekliği **px** (ölçülmüş bir değer, tasarım ölçüsü değil) — rem'e çevrilirse kök font
boyutu değiştiğinde kaydırma çubuğu içerikten kopar.

**Yeni bahsetme kaydırılmış akışta konumu bozmuyor.** `mention:new` kartı ilk sayfanın başına
yazıyor; akış bir layout efektinde `scrollHeight` farkını ölçüp `scrollTop`a ekliyor.
`scrollIntoView` kullanılmadı — o, kullanıcının baktığı kartı ekrandan kaydırır ve hangi kartın
nereye gideceğini kimse öngöremez. Kullanıcı en üstteyken telafi uygulanmıyor, şerit de
çıkmıyor: kart zaten görünür.

**Bekleyen sayı listeyle birlikte anahtarlanıyor.** `{ count, key }` çifti; süzgeç değişince
sayı render sırasında sıfıra düşüyor. Efektle sıfırlamak her filtre değişiminde fazladan bir
render turu demekti (React Compiler `set-state-in-effect` kuralı da bunu yakalıyor). Tepe
bandındaki kaydırma olayları da sayıyı **koşulsuz** yazmıyor: değer zaten sıfırsa aynı nesne
geri döndürülüyor, yoksa her kaydırma olayı bir render turu açardı.

**Sonsuz sayfa gözlemcisinin bağımlılıkları ilkel.** `useInfiniteQuery` her render'da yeni bir
izlenen sonuç nesnesi döndürüyor; `handleLoadMore` ona bağlansaydı akıştaki
`IntersectionObserver` her render'da sökülüp yeniden kurulur ve yeni gözlemci sentinel görüş
alanındayken ilk kesişimi **tekrar** bildirirdi — yani her render bir sayfa daha çekerdi.

---

## 4. Klavye

`resolveMentionShortcut` ve `isTypingTarget` ayrı iki soru cevaplıyor: "hangi kısayol" ve "burada
kısayol çalışır mı". `Shift` kabul ediliyor (büyük `J` zaten Shift ile gelir);
`Ctrl`/`Meta`/`Alt` eleniyor — `Ctrl+R` sayfayı yeniler, `Cmd+E` tarayıcının kendi kısayoludur.

Yazma yüzeyi ayrımı **eleman türünden** yapılıyor (`INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`),
bileşen adından değil: yanıt kutusunu Ş7 yazıyor ve akış onun iç yapısını bilmiyor.

İmleç **başa sarmıyor**. Kırkıncı karttayken tek tuşla listenin başına fırlamak, kullanıcının
bulduğu yeri kaybetmesi demek. Listeden düşmüş imleç (kart `Listeden kaldır` ile gitmiş olabilir)
ilk karta toparlanıyor.

---

## 5. Boş durum

Boş durum ve hata bloğu kaydırma kabının **kardeşi**, çocuğu değil. Referansta da öyle:
`isEmpty` bloğu `padding:16 24 20` taşıyan akış kabının dışında ve tek dolgusu SPEC §8'in
`padding:40`'ı. Kabın içine konsaydı iki dolgu toplanır, 456px'lik dar akışta metne kalan
genişlik 376 yerine 328px'e düşer ve dikeyde 56/60'lık bir asimetri doğardı.

İki boş durum, aynı başlık: gerçekten bekleyen bahsetme olmaması ve süzgeçte sonuç olmaması.
İkincisi `mentions.empty.filtered` metnini yazıyor (Ş0.4'ün anahtarı) — "hepsini okudun" demek,
filtreyi unutmuş bir kullanıcıya yanlış bilgi vermek olurdu. Daraltma sayılan eksenler: filtre,
kaynak, arama **ve pencere**. `window=all` iken tam metnin "Son 30 günün…" cümlesi yanlış olurdu.

`Arşive dön` yalnız `?window=all` yazıyor (K7) — hiçbir satır silinmiyor, taşınmıyor.

---

## 6. Sapmalar (kayda geçen 9 madde)

| #   | Konu                   | Referans/SPEC                                  | Uygulanan                                                             | Gerekçe                                                                                                                                                                                                                                   |
| --- | ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Bu hafta` eşiği       | SPEC vermiyor                                  | son 7 gün (bugün ve dün hariç 5 gün)                                  | Takvim haftası pazartesi günü dünü `Daha eski`ye atardı                                                                                                                                                                                   |
| 2   | Sayfanın testi         | "Sahiplenilen dosyalar"da yok                  | `mentions-page.test.tsx` **eklendi**                                  | Listede sayfanın testi hiç yok; kalite çıtasının "test önce" maddesi ile listedeki eksik arasında testten yana karar verildi. Dosya başka hiçbir şeridin kümesine değmiyor                                                                |
| 3   | Geçici kart            | —                                              | `renderMentionCardFallback` (`TODO(Ş6)`)                              | Ş6'nın `mention-card.tsx` dosyası henüz yok ve ona yazmak yasak. Yedek **bilerek eylemsiz**: eylem satırı, tür pili ve `⋯` menüsü Ş6'nın sözleşmesinde. Ş6 inince `renderCard` varsayılanı silinir                                        |
| 4   | Yeni bahsetme şeridi   | referansta karşılığı yok                       | ölçüler başlığın segment sözlüğünden, gölge rayın birincil butonundan | Yeni sayı uydurmak ekranda ikinci bir ölçü dili açardı                                                                                                                                                                                    |
| 5   | `Arşive dön`           | SPEC her zaman iki buton                       | `window=all` iken buton **çizilmiyor**                                | Pencere zaten açıkken sonucu olmayan bir tık olurdu (Ş1'in 7. sapmasıyla aynı duruş)                                                                                                                                                      |
| 6   | Akış hata durumu       | SPEC sessiz                                    | `mentions.feed.error` + `mentions.feed.retry` **yeni anahtar**        | Uç düşünce ekranı boş durumla göstermek yalan olurdu; metin `mentions.*` dışına çıkmadı                                                                                                                                                   |
| 7   | Sekme yer imi adı      | SPEC sessiz                                    | `mentions.a11y.tabsLabel` **yeni anahtar**                            | Ray da `Bahsedilmeler` adını taşıyor; iki yer imine aynı adı vermek ekran okuyucuda iki özdeş girdi demek                                                                                                                                 |
| 8   | Başlık metni anahtarı  | eski `mentions.title` silindi                  | akış başlığı `mentions.sidebar.title` okuyor                          | Ekranın adı iki anahtarda yazılıp bir gün ayrışamaz; kopya testi bunu doğruluyor                                                                                                                                                          |
| 9   | Akış asgari genişliği  | SPEC §1: 782 / panel açıkken 456               | `min-width` **yazılmadı**, `min-w-0` bırakıldı                        | 782 sabit bir asgari genişlik dar ekranda taşma üretirdi; SPEC'in sayısı 1360'lık kabuğun aritmetiğini anlatıyor, bir kısıt değil                                                                                                         |
| 10  | Başlık sayı pili       | SPEC §4 her zaman pil gösteriyor               | filtre × kaynak kesişiminde ve arama açıkken **pil çizilmiyor**       | `MentionCounts` iki ekseni ayrı sayıyor, kesişimi ve arama sonucunu saymıyor. `?filter=unread&source=s1` adresinde `bySource` o sunucunun tümünü verir ve pil iki kartın üstünde "12 bahsetme" yazardı. Yanlış sayı, olmayan sayıdan kötü |
| 11  | Boş/hata bloğunun yeri | —                                              | kaydırma kabının **kardeşi**                                          | Kabın içinde iki dolgu toplanıyordu (16/24/20 + 40); 456px'lik akışta metin 376 yerine 328px'e sıkışıyordu                                                                                                                                |
| 12  | E2E test id'leri       | prompt yalnız `side-screens.test.tsx`i sayıyor | iki e2e spec'i de yeni yüzeye taşındı                                 | Silinen ekranın test id'lerini bekleyen üç e2e iddiası zaman aşımına düşerdi; "hiçbir import kalmadı" maddesi `e2e/` için de geçerli                                                                                                      |

---

## 7. Bırakılan `TODO(api):` ve `TODO(Ş…):`

1. **`TODO(Ş6)`** — `renderMentionCardFallback` (`mentions-page.tsx`). Kart inince varsayılan ve
   yedek birlikte silinir.
2. **`TODO(Ş7)`** — `renderContextPanel` ve `renderReply` slotları. Panel 326'lık kolonu
   **kendisi** çiziyor (ray gibi); sayfa yalnız yerini ayırıyor. Yanıt kutusu `MentionCardProps`
   içindeki `replySlot` üzerinden karta giriyor, akış onu doğrudan çizmiyor.
3. **`TODO(Ş8)`** — `renderSettingsModal` slotu. `?modal=settings` adresi bugün çalışıyor
   (rayın zili ve başlığın dişlisi yazıyor), modal gelene kadar bir şey açılmıyor.
4. **`TODO(api)`** — kaynak seçiliyken **hiç kart yoksa** başlık genel ada düşüyor. Sunucu
   adlarını veren bir uç yok; ad yüklenmiş kartlardan okunuyor (`bySource` yalnız sayı taşıyor).
5. **`TODO(api)`: başlık pili filtre × kaynak kesişimini ve arama sonucunu sayamıyor.**
   `readMentionHeaderCount` bu iki durumda `null` döner ve pil **hiç çizilmez**. `counts` ucu
   kesişimi ya da arama toplamını döndürürse pil o durumlarda da sayı gösterebilir.

---

## 8. Eski ekranın kaldırılması

`components/screens/mentions-screen.tsx` silindi. `side-screens.test.tsx` içindeki üç iddia
güncellendi: dosyayı okuyan iki iddia kaldırıldı, yerine dosyanın **yokluğunu** ve rotanın yeni
bileşeni içeri aldığını doğrulayan bir test kondu. `Bahsedilmeler satırı` describe bloğu
`Ana Sayfa liste satırı` oldu — satır (`HomeListRow`) değişmedi, yalnız sahibi değişti.

Sözlükten silinen dokuz anahtar: `mentions.empty` · `mentions.emptyHint` ·
`mentions.filter.{all,dms,servers,unread}` · `mentions.markAllRead` · `mentions.title` ·
`mentions.unreadCount`. `mentions-screen-copy.test.ts` içindeki "henüz kaldırılmadı" testi
"kaldırıldı" testine döndü ve iki sözlüğü birden denetliyor.

**Silinmeyen ölü kod (bilerek):** `lib/home/side-screens.ts: parseMentionsFilter`,
`lib/home/client.ts: fetchHomeMentions`, `homeQueryKeys.mentions` ve `lib/home/mentions-service.ts`
artık üretimde çağrılmıyor ama kendi testleri duruyor. Ş3 raporunun 7. sapması bunları Dalga 3'e
bırakmıştı; bu şeridin sahiplenilen kümesinde değiller.

---

## 9. Kabul ölçütleri

- [x] Filtre + kaynak + gruplama + pencere + arama URL'e yansıyor; geri tuşu her birini tek adım
      geri alıyor; adres paylaşıldığında aynı görünüm açılıyor
- [x] Sekmeler ile ray satırları aynı state'i gösteriyor (ikisi de `routeState.filter`)
- [x] Sayı pilleri tek sorgudan (`mentionsQueryKeys.counts(window)`; ray ile sayfa aynı anahtarı
      paylaşıyor, React Query tek istek açıyor)
- [x] Bağlam paneli açıkken başlıktaki iki ikon butonu **DOM'dan kalkıyor** (test `display:none`
      bulunmadığını da doğruluyor)
- [x] Boş grup render edilmiyor; `Sonra oku` grubu en üstte
- [x] Kaydırılmış akışa yeni bahsetme geldiğinde konum bozulmuyor ve şerit çıkıyor
- [x] `J/K/R/E/Esc` çalışıyor; input odaktayken tetiklenmiyor
- [x] Eski `mentions-screen.tsx` silindi ve hiçbir referans kalmadı — `src/` **ve** `e2e/`
- [ ] **200 kartlık listede 60 fps ölçümü yapılamadı** — aşağıda

### Ölçülemeyen madde

Kaydırma fps'i tarayıcıda ölçülmedi. `/mentions` oturum arkasında; `apps/web/.env` içinde
`E2E_TEST_MODE=false` ve `/api/e2e/auth/session` bu bayrağa bakıyor. Bayrağı çevirmek bir güvenlik
kapısını değiştirmek olurdu ve bu şeridin kapsamında değil — Ş1 raporu aynı engeli kaydetmişti.

Yerine ölçülebilen doğrulandı: 200 kartlık listede sanal yol devrede ve akış bütün kartları DOM'a
yazmıyor (`mentions-feed.test.tsx`, "200 kartlık listede akış bütün kartları DOM'a yazmaz").
Gerçek fps ölçümü Dalga 3 / parity-QA şeridine devrediliyor.

---

## 10. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✔ 4004 test · 4003 pass · 0 fail · 1 skip · 915 suite
```

Dalga 1 tabanı 3909 testti; Ş5 **+95** getirdi (gruplama 25 · klavye 14 · akış 34 · sayfa 18 ·
kopya sözleşmesi ve side-screens düzeltmeleri; eski ekranın iki iddiası kaldırıldı).

E2E koşulmadı — `/mentions` oturum arkasında ve `E2E_TEST_MODE=false` (§9). İki spec dosyasında
yapılan değişiklik test id'lerini gerçeğe hizalıyor; koşulduğunda doğrulanacak.

---

## 11. Ş6 / Ş7 / Ş8'e devir notları

1. **`renderCard` bir `MentionCardProps` alır ve `ReactNode` döner.** Akış kartın **dış
   sarmalayıcısını** kendisi çiziyor (kaydırma hedefi, `data-mention-id`, alt boşluk); kart
   yalnız kendi içeriğini çizmeli, ikinci bir dış boşluk eklememeli.
2. **`menuDirection` akıştan geliyor** — kart kendi indeksini bilmiyor. İlk iki kart `down`,
   sonrakiler `up` (SPEC §5.1).
3. **`replySlot` yalnız `replyOpen` iken doluyor.** Kart onu eylem satırının altına koymalı
   (SPEC §5.2); akış onu doğrudan çizmiyor.
4. **Menü eylemleri sayfada bağlı.** `copy-link` panoya yazıyor, `read-later` / `dismiss`
   `PATCH .../state` çağırıyor, `mute-source` kanalda
   `updateChannelNotificationSettings(channelId, "muted")` (K12: süresiz), DM'de
   `setDMConversationMutedRequest(conversationId, true)`. **Toast'lar Ş8'in** —
   `mentions.toast.*` anahtarları hazır, hiçbiri henüz çağrılmıyor.
5. **Bağlam paneli 326'lık kolonu kendisi çizmeli** (`flex:none`, sol kenar `--border/0.45`).
   Sayfa onu akışın kardeşi olarak yerleştiriyor, sarmalayıcı vermiyor.
6. **Panel açıkken başlığın iki ikon butonu yok.** Ayarlar modalına o durumda **yalnız rayın
   zilinden** gidilebiliyor; Ş8 modalı kapatınca odağın raya dönmesini hesaba katmalı.
7. **`mention:new` yerel eklemesi arama açıkken çalışmıyor** (`matchesMentionRoute`). Eşleşme
   sunucudaki `ILIKE` ile kuruluyor ve istemcide taklit edilemez; sayaçlar yine güncelleniyor.
8. **Ölçü sözlüğünde akış için yeni bölüm yok.** Şerit yalnız `feedHeader`, `feed`, `emptyState`
   ve `card.radius` alanlarını okudu; `metrics.ts` değiştirilmedi.

---

## 12. Landing sonrası denetim ve düzeltilen bulgular

Şerit yeşile döndükten sonra altı boyutta paralel bir denetim koşuldu (SPEC §4 ölçüleri · SPEC §5
akış aritmetiği · SPEC §8 boş durum · bağlayıcı noktalar · kural/erişilebilirlik · şerit sınırı).
Her bulgu, onu bulan ajandan **bağımsız** bir ajanla çürütülmeye çalışıldı; varsayılan "çürütüldü"
idi. İki bulgu çürütüldü, dokuzu onaylandı ve **hepsi düzeltildi**.

### Onaylanan ve düzeltilen

| #   | Ağırlık    | Bulgu                                                                                                                                                                                                                                                   | Düzeltme                                                                                                                                                                                                          |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **yüksek** | `a11y.spec.ts` ve `home-side-screens.spec.ts` silinen ekranın `mentions-screen` / `mentions-card` / `mentions-filter-unread` test id'lerini bekliyordu; üç e2e iddiası zaman aşımına düşerdi                                                            | Hazır işareti `mentions-feed-header` oldu; çip testi sekme testine döndü (`aria-pressed` → `aria-current`), üç ekranlık döngüden `/mentions` çıkarılıp yerine ray + akış başlığını doğrulayan ayrı bir test kondu |
| 2   | orta       | `empty` bayrağı "istek bitti ve sonuç boş" demek; ilk yüklemede ve **hata** hâlinde `false` kalıyor, `newestAt` ise `null` — alt satır `… · en yenisi ` diye sarkan bir ayraçla bitiyordu ve hata hâlinde kalıcıydı                                     | `empty \|\| !newestAt` → 30 günlük cümle. Regresyon testi: "damga yokken `en yenisi` ayracı sarkmaz"                                                                                                              |
| 3   | orta       | Başlık pili kaynak seçiliyken filtreyi, arama açıkken aramayı düşürüyordu; `?filter=unread&source=s1` adresinde iki kartın üstünde "12 bahsetme" yazıyordu                                                                                              | `readMentionHeaderCount`: sayacın cevaplayamadığı iki durumda `null` → pil çizilmiyor. 4 yeni test                                                                                                                |
| 4   | orta       | Boş durum ve hata bloğu akışın `16 24 20` dolgusunu taşıyan kaydırma kabının **içinde**ydi; SPEC §8'in `padding:40` değeriyle toplanıyordu (456px'lik akışta metin 376 yerine 328px)                                                                    | İkisi de erken `return` ile kabın **kardeşi** oldu. Regresyon testi: "boş durum ve hata bloğu kaydırma kabının dışında çizilir"                                                                                   |
| 5   | orta       | `contextPanelOpen` yalnız `ui.panel !== null` bakıyordu; Ş7 inmeden `?panel=channel:x` adresi başlığın iki butonunu DOM'dan siliyor ama panel çizilmiyordu — kullanıcı ayarlara giden butonu kaybediyordu                                               | Koşula `renderContextPanel !== undefined` eklendi; panel gerçekten çizilmiyorsa butonlar kalıyor                                                                                                                  |
| 6   | düşük      | `handleAtTopChange` tepe bandındaki **her** kaydırma olayında yeni bir nesne yazıyordu; `Object.is` eşitliği tutmadığı için her olay bir render turu açıyordu                                                                                           | Fonksiyonel güncelleme, değer aynıysa aynı nesne döndürülüyor                                                                                                                                                     |
| 7   | düşük      | `handleLoadMore` bağımlılığı `[listQuery]`ydi; `useInfiniteQuery` her render'da yeni bir sonuç nesnesi döndürdüğü için `IntersectionObserver` her render'da sökülüp kuruluyor ve ilk kesişimi tekrar bildiriyordu — her render bir sayfa daha çekiyordu | Bağımlılıklar ilkel: `fetchNextPage` · `hasNextPage` · `isFetchingNextPage`                                                                                                                                       |
| 8   | düşük      | `emptyState.iconSurfaceAlpha` / `iconBorderAlpha` sözlükte tanımlıydı ama hiçbir yerden okunmuyordu; `0.14` / `0.3` bileşene gömülüydü                                                                                                                  | İkisi de sözlükten okunuyor                                                                                                                                                                                       |
| 9   | düşük      | İki boş durum butonu ve yeni bahsetme şeridi geçiş süresini Tailwind varsayılanından (150ms) alıyordu; referans `.16s` ve sözlükte `sidebar.transitionMs = 160` var                                                                                     | Üçü de `transitionDuration` ile sözlükten                                                                                                                                                                         |
| 10  | düşük      | `MENU_DOWN_CARD_LIMIT = 2` sözlükteki `cardMenu.downwardCardCount` değerini tekrar ediyordu                                                                                                                                                             | Sabit sözlükten türüyor                                                                                                                                                                                           |

Denetimden bağımsız olarak, kapı koşarken bir hata daha bulundu ve düzeltildi: **`en yenisi`
damgası listenin ilk kartından okunuyordu.** Ş3'ün sıralaması üç anahtarlı
(`readLaterFirst, occurredAt, mentionId`) ve `Sonra oku` işaretli eski bir kart listenin başında
durabiliyor; başlık o kartın saatini yazsaydı "en yenisi" cümlesi yalan olurdu. Damga artık
yüklenmiş kartların **en büyük** `createdAt` değerinden geliyor.

### Çürütülen iki bulgu

1. **"Sol bloğun `flex:1 1 12.5rem` değeri sözlükte yok."** Olgusal kısmı doğru ama kusur değil:
   değer referansın `flex:1 1 200px` ölçüsünün birebir rem karşılığı, arbitrary px sınıfı değil ve
   kök font boyutuyla ölçekleniyor. Somut bir yanlış çıktı üretmiyor.
2. **"`?panel=` ham taşınıyor, dayanağı olmayan panel açıyor."** `routeState` memo'su değeri
   `parseMentionId` ile süzüyor; `?panel=` ve `?panel=m1` gibi çözülmeyen değerler `null`'a
   düşüyor. Geriye kalan tek vaka (geçerli biçimli kimlik + Ş7 inmemiş) 5. bulguyla kapandı.
