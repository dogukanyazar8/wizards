# Dalga 3 öncesi kapanış turu — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

A, B ve C gruplarındaki **her madde** kapandı. Ayrıca Mesajlar ekranı kendi rotasına taşındı.

---

## 0. Mesajlar kendi sayfası oldu — `/messages`

Mesajlar bugüne kadar `/channels/@me` altında yaşıyordu: bir **sunucu** rotasının içine
yerleştirilmiş, `@me` diye rezerve edilmiş bir kimlikle. Üç bedeli vardı:

1. **`@me` App Router'da paralel rota slotu demek.** `channels/@me/page.tsx` diye bir dosya
   vardı ve `null` döndürüyordu; gerçek sayfa `[serverId]/page.tsx` içindeki
   `decodeURIComponent(serverId) === "@me"` dalıyla çözülüyordu. Rota ağacı bir şey diyor,
   kod başka bir şey yapıyordu.
2. **`usePathname` segmenti `%40me` diye kodlu verebiliyordu** ve her okuyanın bunu ayrıca
   çözmesi gerekiyordu.
3. **Mesajlar `/home` · `/mentions` · `/events` · `/discover` ile aynı seviyede bir ekran**;
   rota ağacında öyle görünmüyordu.

### Yeni ağaç

| Rota                         | Ne çizer                          |
| ---------------------------- | --------------------------------- |
| `/messages`                  | Boş durum (SPEC §9 `view: empty`) |
| `/messages/friends`          | Arkadaşlar paneli (SPEC §4)       |
| `/messages/[conversationId]` | Sohbet gövdesi                    |

`friends` **statik** bir segment: App Router statik segmenti dinamik olandan önce eşleştirir,
o yüzden `friends` adında bir konuşma kimliği bile o sayfayı gölgeleyemez. `selectActiveConversationId`
onu ayrılmış sayıyor, yani ray da onu bir sohbet sanmıyor.

### Eski yollar kırılmadı

`/channels`, `/channels/@me` ve `/channels/@me/{id}` sunucu tarafında **308** ile yönleniyor ve
**sorgu dizesi korunuyor**: `?message=`, `?dmCall=`, `?profile=`, `?dmTab=` bağlantıları bugün
dolaşımda (bildirimler, e-postalar, paylaşılmış bağlantılar) ve düşerlerse kullanıcı hedefe
değil hedefin listesine inerdi. `?dmTab=` kimlik yokken doğrudan `/messages/friends`'e gidiyor.

`permanentRedirect` (308), geçici değil: yol kalıcı olarak taşındı ve tarayıcı da arama motoru
da bunu önbelleğe alabilir.

### Güvenlik sınırı güncellendi

`getSafeAuthRedirectPath` bir açık yönlendirme kapısı: liste dışındaki her hedef sessizce
varsayılana düşüyor. Varsayılan `/messages` oldu (`/channels` bırakılsaydı her giriş bir
yönlendirme turu daha öderdi) ve `/channels` **listede kaldı**, çünkü dolaşımdaki eski
bağlantılar hâlâ oraya işaret ediyor.

### Dokunulan yer sayısı

51 kaynak dosyası + 8 test/e2e dosyası. Tek doğruluk kaynağı `lib/messages/routes.ts`
(+13 test): `MESSAGES_ROUTE`, `MESSAGES_FRIENDS_ROUTE`, `messagesConversationHref`,
`selectActiveConversationId`, `isMessagesRoute`, `toMessagesRedirect`.

`useDMConversations`, `messages-rail-container` ve `friends-sidebar` artık aktif sohbeti
`useParams` yerine **yoldan** okuyor — ray `/messages/[conversationId]` ağacının içinde değil,
kabuğun üçüncü sütununda, ve orada `params` boş gelir.

---

## A — Eksik özellikler

### A1. `Mesajı ilet` çalışıyor

`POST /v1/dm/messages/forward` + `lib/dm/forward-service.ts` + hedef seçici
(`forward-message-sheet.tsx`).

**İki ayrı yetki kapısı var ve ikisi de şart:** kaynak konuşmanın üyeliği (**404**, 403 değil —
403 "var ama senin değil" demek olurdu ve bir kimliğin gerçek olduğunu doğrulardı) ve hedefin
kapısı, ki onu `sendDirectMessage` zaten yapıyor; ikinci bir kapı yazılmadı. Geçmiş penceresi
ve kaybolan mesaj süresi **kaynağa da** uygulanıyor: pencere dışındaki bir mesajı iletmek
2c §7'nin etrafından dolaşmak olurdu.

Hız sınırı normal mesajla **aynı kovada** (`dm:messages:send`): iletme de bir mesaj yazıyor ve
ayrı bir kova, sınırın etrafından dolaşmanın ikinci yolu olurdu.

**Ekler taşınmıyor.** Bir eki ikinci bir mesaja bağlamak depolama sahipliğini çoğaltmak demek
(aynı blob iki mesaja ait olur, biri silinince diğeri kırık kalır); doğrusu sayaçlı bir
depolama katmanı ve bu akışın işi değil. Metni olmayan mesaj `FORWARD_REQUIRES_TEXT` ile
reddediliyor ve arayüz **nedenini söylüyor**.

Hedefler sohbetler, arkadaşlar değil: bir grup da geçerli bir hedef.

### A2. `Sunucuya davet et` çalışıyor

`GET /v1/servers/invitable` + `lib/workspace/invitable-servers-service.ts` (+6 test).

Yetki kararı **sunucuda**: `MANAGE_INVITES` ya da `ADMINISTRATOR` ya da sahiplik. İstemcide
"üyeyse davet edebilir" diye tahmin etmek kullanıcıya yapamayacağı bir işi göstermek ve 403
yedirmek olurdu — test bunu açıkça kilitliyor (`yalnız üye olan sunucu listede yok`).

Sorgu dar: sunucu başına kimlik, ad, ikon, sahip ve görüntüleyenin rolleri. `listWorkspaceServers`
aynı cevabı verirdi ama kanalları, kategori ağacını ve üye sayımlarını da getirirdi.

Davet, sunucuya **üye ekleme** ucunu kullanıyor (`addServerMemberRequest`): bağlantı üretip
göndermek iki adım daha demek ve arkadaş zaten elimizde. Sorgu yalnız menü açıkken kuruluyor.

### A3. `Ana sohbete de gönder` DM'de de var

`DMMessage.alsoSentToChannel` kolonu + migration + indeks + socket şeması + servis + DTO.

Ana sohbet sorgusu artık `threadParentId: null` **veya** `alsoSentToChannel: true`. Bayrak yalnız
gerçek bir thread yanıtında yazılıyor: kökte `true` olsaydı liste aynı satırı iki kez döndürürdü.

**`AND` içine sarıldı**: `toUnexpiredFilter` de bir `OR` üretiyor ve iki `OR` aynı nesnede yan
yana durursa ikincisi birincisini **sessizce** ezer. TypeScript bunu `TS2783` ile yakaladı.

Yeni indeks `(conversationId, alsoSentToChannel, createdAt)`: yüklem tam olarak bu üçlü ve
indeks olmadan sorgu her sayfada tam tarama yapardı.

### A4. Tarih filtresi

`lib/messages/date-filter.ts` (+10 test) + arama panelinde iki `type="date"` alanı.

**Gün sınırları genişletiliyor**: kullanıcı `10 Ağustos – 10 Ağustos` seçtiğinde o günün
tamamını kastediyor; iki tarafı gece yarısına sabitlemek sıfır uzunlukta bir aralık verir ve
arama hiçbir şey bulmaz. Bitiş **ertesi günün** başına çekiliyor.

Zaman dilimi bilinçli olarak **UTC**: uç `createdAt`'i UTC saklıyor ve istemcinin yerel
dilimine göre kaydırmak, aynı bağlantının iki cihazda farklı sonuç vermesi demek olurdu.

`2026-02-31` deseni geçiyor ama gerçek bir gün değil (JS onu 3 Mart'a taşır) — doğrulama bunu
eliyor.

Aralık **doğrulanmış** hâliyle sorguya giriyor: yarım bir seçim sorguyu hiç değiştirmiyor,
yoksa kullanıcı tarihi yazarken liste her tuşta daralırdı.

### A5. Arama sonsuz kaydırma + C2 sayfa boyu

`IntersectionObserver` ile bir sentinel; gözlemci yalnız sonraki sayfa **varken** kuruluyor.
Kaydırma olayından ucuz: tarayıcı kesişmeyi kendi düzen turunda hesaplıyor.

Sayfa boyu yoğunluktan: `max(20, searchResults * 3)`. Sözlük kaç satırın **kaydırmasız**
görüneceğini söylüyor; bire bir alınsaydı (ölçek 1'de 3) her kaydırma hareketi yeni bir istek
doğururdu.

### A6. `Son etkileşim` sıralaması çalışıyor

`hooks/use-friend-last-interaction.ts`. Veri arkadaş listesinde yok, sohbet listesinden
türüyor — ayrı bir uç aynı bilgiyi ikinci kez göndermek olurdu.

**Yalnız 1:1 sohbetler sayılıyor.** Bir grup sohbetindeki mesaj "bu kişiyle konuştum" demek
değil; grubu sayan bir sıralama, hiç özel mesaj atmadığın birini listenin başına taşırdı.

`FriendsView` `currentUserId` prop'unu **geri aldı**: 1:1 sohbetin karşı tarafı "benden
başkası" diye bulunuyor ve o karşılaştırma kimlik olmadan yapılamaz. Ş3'te kaldırılmıştı çünkü
o zaman görünüm kimliği okumuyordu; artık okuyor.

---

## B — Ölçek

### B1. Liste artık roster'ın tamamını çekmiyor

`dmConversationRowInclude`: aynı şekil, katılımcı okuması `take: 8` ile sınırlı. Satır iki tile
ve iki sayaç çiziyor, tile'lar görüntüleyeni dışlayarak seçiliyor — ilk sekiz kayıt her durumda
yeter. Sınır olmadan 250 üyeli bir grup, hiç çizilmeyecek 250 katılımcı satırını (her biri
kullanıcı kaydıyla) **her liste sayfasında** getiriyordu.

`memberCount` artık `_count.participants`'tan: dizinin uzunluğunu okumak, liste sınırlandığı
anda **yalan** söylerdi.

`onlineCount` satır kipinde **verilmiyor**. Yüklenmiş birkaç kişiyi saymak "3 çevrimiçi" yerine
"2 çevrimiçi" yazmak olurdu; eksik bir sayaç yanlış bir sayaçtan iyi. Karşılığı: **açık sohbet
her zaman tek konuşma ucundan çekiliyor** (`dm-conversation-page`), yani başlığın sayacı, üye
listesi ve rol çipleri tam kayıttan geliyor. Liste kaydı yine ilk çizimde kullanılıyor, böylece
sohbet anında açılıyor ve tam kayıt gelince yerini alıyor.

### B2. 250 tavanı yüzeyde

Satır kilitleme **zaten vardı** (`capped = isFull && !selected`) ve neden de yazılıydı; eksik
olan sanallaştırmaydı. Aday listesi 50 satırın (`candidatesVirtualizeAbove`) üstünde
`useVirtualizer` ile pencereleniyor. Eşiğin **altında** sanallaştırma yok: bir avuç satır için
ölçüm kurmak, ölçümün kendisini işin çoğu yapar ve sunucu render'ında liste boş görünürdü.

---

## C — Görsel / hijyen

### C1. Grup modalı SPEC'e yaklaştı

560px kabuk (`max-w-lg` 512'ydi ve çip şeridi her satırda kırılıyordu), SPEC adım etiketi
(`Adım 1 / 2 · Kimler olacak?`), **iki parçalı ilerleme çubuğu** ve SPEC ayak sayacı
(`{n} kişi seçildi · sen dahil`).

Çubuk ve etiket iki ayrı işaret: metin nerede olduğunu söylüyor, çubuk ne kadar kaldığını.
Yalnız metin olsaydı "1 / 2" bir sayı olarak okunur, ilerleme olarak değil.

### C2. Ölçek arttıkça daha çok sonuç

A5'in içinde kapandı.

### C3. Ölü i18n anahtarları silindi

`chat.input.pollTemplate` ve `chat.input.pollQuestion` — ikisi de hiçbir yerden okunmuyordu.

### C4. Denetim aracını bozan ters tırnak ölçüldü ve borç indi

`components/chat` copy borcunun kaynağı ölçüldü: beş sapmanın **ikisi** gerçek sabit Türkçe
metindi (`Kopyalandı`, `Kodu kopyala`), üçü ise süre ayrıştırıcısının kabul ettiği birim
adları (`dk`, `saat`, `gün`) — onlar çıktı değil **girdi** ve sözlüğe taşınamaz.

İki metin sözlüğe taşındı, bütçe **5 → 3** indirildi. Bütçe iki yönlü olduğu için indirmemek
testi kırardı.

### C5. Biçimlendirme şeridi ayrı dosyada

`components/chat/composer-formatting-bar.tsx`. Dokuz araç + anket girişi + Markdown ipucu
140 satır tutuyordu ve bestekârın kendi işiyle (yükleme, bahsetme, yazıyor sinyali, ses kaydı)
hiçbir durumu paylaşmıyor. Şerit yalnız **metin ekler**; nereye ekleyeceğini bilen taraf hâlâ
bestekâr ve buraya geri çağrı olarak geliyor. Düğme sınıfı **taşındı**, kopyalanmadı.

`composer-contract.test.ts` artık **iki dosyayı birden** okuyor: tek dosyaya bakan bir test,
çıkarma sırasında sessizce yeşil kalırdı.

---

## Yol boyunca bulunan üç şey

1. **`getSafeAuthRedirectPath` bir güvenlik sınırı** ve rota taşınırken sessizce
   `/messages`'ı reddedecekti — her giriş varsayılana düşerdi. Açık liste genişletildi ve
   nedeni kaynakta yazılı.
2. **`TS2783: 'OR' is specified more than once.'`** DM liste yükleminde iki `OR` yan yana
   gelseydi ikincisi birincisini sessizce ezerdi; derleyici yakaladı.
3. **Satır sonuna duyarlı bir sözleşme testi.** `command-palette.test.tsx` tek satırlık bir
   atama bekliyordu; prettier onu iki satıra bölünce kaynak doğruyken test kırılıyordu. Desen
   boşluğa toleranslı hâle getirildi.

---

## Kapı çıktısı

```
pnpm typecheck                     ✔ 5/5
pnpm lint                          ✔ 5/5
pnpm --filter @wizards/web test    ✔ 3616 / 3616
pnpm --filter @wizards/types test  ✔ 435 / 435
pnpm --filter @wizards/db test     ✔ 25 + 53 / 78
pnpm --filter @wizards/mobile test ✔ 1950 / 1950
```

---

## Açık kalanlar

- **Migration koşulmadı.** `20260820180000_dm_thread_also_send` yazıldı ama uygulanmadı; UAT
  veritabanına dışarıdan bağlanılamıyor. Kolon `false` varsayılanıyla geliyor, yani yazılmış
  her mesaj bugünkü davranışını koruyor.
- **Hiçbiri gerçek tarayıcıda koşulmadı.** Yönlendirmeler, tarih seçici, sonsuz kaydırma,
  iletme akışı ve sanallaştırılmış aday listesi Dalga 3'ün işi. E2E spec'leri yeni rotaya
  taşındı ama çalıştırılmadı.
- **`onlineCount` liste kipinde yok.** Bugün onu okuyan tek yüzey sohbet başlığı ve o artık
  tam kaydı çekiyor; ileride bir satır bu sayacı isterse ayrı bir sayım gerekir.
- **İletmede ek taşınmıyor** (yukarıda). Sayaçlı depolama katmanı ayrı bir iş.
