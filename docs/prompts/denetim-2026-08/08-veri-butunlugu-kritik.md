# 08 — Sessizce ölü sistemler

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok.

## Sorun

Dört sistem başarı raporlayıp hiçbir şey yapmıyor veya yanlış şey yapıyor. Hiçbiri log üretmiyor, hiçbiri alarm vermiyor.

## Kapsam

### 1. Kaybolan mesajlar kalıcı olarak çalışmıyor

`packages/db/prisma/schema.prisma:1513` · `apps/web/src/lib/dm/disappearing-service.ts:43` · `apps/web/src/lib/dm/disappearing-worker.ts:156` · karşılaştır: `apps/web/src/lib/workspace/channel-service.ts:370`

`DMMessage.reply` FK'si `onDelete: Restrict`. Purge doğrudan `deleteMany` yapıyor ve `channel-service.ts`'in aynı FK için yaptığı "önce `replyToId`'yi NULL'la" adımını atlıyor. Yanıtlanmış tek bir mesaj 500'lük partiyi P2003 ile zehirliyor; worker hatayı yutuyor ve sıralama `expiresAt asc` olduğu için zehirli satırlar **kuyruğun başında sonsuza kadar** kalıyor.

Yap:

- `deleteMany` öncesi, partiyi işaret eden `replyToId` (ve gerekiyorsa `threadParentId`) alanlarını NULL'la — `channel-service.ts:370`'teki desenin aynısı.
- Worker'ın `catch`'i hatayı **yutmasın**: hata sayacı/log'u olsun ki bir daha sessizce ölmesin.
- Şema tarafında FK'yi `SetNull` yapmak da bir seçenek; ama migration gerektirir ve 12 no'lu promptun işidir. Bu prompt kod tarafını kapatır, 12'ye not bırakır.

### 2. Zararlı ek karantinaya alınmadan "INFECTED" işaretleniyor

`apps/web/src/lib/attachments/scanner.ts:296`, `:298`, `:279`, `:230`

`scanStatus: "INFECTED"` yazımı dosyayı silen çağrıdan **önce**; giriş kapısı da `INFECTED`'i "zaten bitti" sayıyor. Silme adımındaki tek bir hata doğrulanmış zararlıyı halka açık CDN URL'inde kalıcı bırakıyor ve her retry hiçbir şey yapmadan dönüyor.

Yap: sıralamayı çevir — önce sil, sonra bildir, `scanStatus: "INFECTED"` **en son** yazılsın. Giriş kapısı böylece yarım kalmış işi tekrar alır.

### 3. Link önizleme %100 kırık

`apps/web/src/lib/messages/link-preview.ts:416`, `:427`, `:469` · test: `link-preview.test.ts:68`

Özel `lookup`, Node'un `autoSelectFamily` altında geçirdiği `all: true` seçeneğini yok sayıp tek adresle geri çağırıyor. Sabitlenmiş runtime'da (`engines: >=24.18.0 <25`) bu `ERR_INVALID_IP_ADDRESS` demek — web ve mobil link önizleme uçları her istekte 502 dönüyor, negatif cache olmadığı için her retry iki DNS araması ödüyor. Mevcut test `{}` ile çağırdığından bu şekli hiç sınamıyor.

Yap:

- `createPublicLookup` `options.all` set ise doğrulanmış `{address, family}` **dizisiyle** geri çağırsın; değilse üç argümanlı biçimi korusun.
- Testi `{ all: true }` ile de koştur — kırmızıya düştüğünü gör, sonra düzelt.
- Başarısız önizlemeye kısa süreli negatif cache ekle (yalnız düzeltmeden sonra hâlâ gerekiyorsa; gereksizse ekleme).

### 4. Saatlik bakım bloğu ilk hatada altı görevi iptal ediyor

`apps/web/src/lib/outbox/worker.ts:81`, `:83`, `:96`

`lastCleanupAt = now` yedi sıralı görevden **önce** yazılıyor ve hepsi tek `catch` altında. `cleanupJobs` (sınırsız `deleteMany`, tablo büyüdükçe zaman aşımına gidecek) patlarsa geri kalan altı görev bir daha hiç koşmuyor. Dosyanın kendi yorumu "uygulamanın sahip olduğu tek zamanlayıcı" diyor.

Yap:

- Her bakım görevini kendi try/catch'ine al, adıyla logla.
- `lastCleanupAt = now`'ı bloktan **sonra** yaz.
- `cleanupJobs`'un sınırsız `deleteMany`'sine `take`/parti sınırı ekle.

### 5. Outbox lease'i çitlenmemiş — çift teslimat

`apps/web/src/lib/outbox/service.ts:391`, `:406`, `:419`, `:572`

Talep `lockedBy` yazıyor ama tamamlama ve hata güncellemeleri yalnız `id` ile anahtarlanıyor. 25'lik parti tek `lockedAt` alıp seri drene ettiğinden kuyruk sonu bayat penceresini uçarken aşıyor; ikinci replika işi alıyor, birinci worker onun talebini ezerek COMPLETED yazıyor. Ayrıca `markOutboxJobFailed` `catch` içinde korumasız `await` — oradaki bir hata partinin kalanını terk ediyor.

Yap:

- İki mark fonksiyonunun `where`'ine `lockedBy: workerId` ekle.
- Döngü ilerledikçe `lockedAt`'i yeniden damgala.
- `markOutboxJobFailed` çağrısını kendi try/catch'ine al.

### 6. DM keyset cursor'ı bileşik değil — mesajlar kalıcı kayboluyor

`apps/web/src/lib/dm/service.ts:801`, `:1292`, `:1406` · `mobile-shared-media-service.ts:49`

Cursor yalnız `createdAt` filtreliyor, sıralama `[{createdAt desc}, {id desc}]`. Kolon milisaniye hassasiyetinde; sayfa sınırındaki milisaniyeyi paylaşan satırlar atlanıyor ve hiçbir kaydırmayla erişilemiyor.

Yap: cursor'ı bileşik yap — `OR: [{createdAt: {lt: T}}, {createdAt: T, id: {lt: cursorId}}]`. Üç okuma yolu aynı yardımcıyı paylaştığı için tek düzeltme yeter; paylaşmıyorsa **önce** paylaştır (SRP).

## Yapılmayacak

- Kaybolan mesaj özelliğini yeniden tasarlama.
- Virüs tarayıcı sağlayıcısını değiştirme.
- Link önizleme için yeni servis/cache katmanı.
- Outbox'ı kuyruk sistemine taşıma.
- Sayfalama API'sini değiştirme — yalnız cursor predicate'i.

## Kabul kriterleri

1. Yanıtlanmış mesaj içeren bir parti başarıyla siliniyor; worker hatayı yutmuyor.
2. Karantina silme hatası `INFECTED` yazmıyor; iş yeniden alınabiliyor.
3. `lookup` `{ all: true }` ile çağrıldığında dizi dönüyor; link önizleme gerçek bir URL için başarılı.
4. Bakım görevlerinden biri patlarsa diğerleri koşuyor ve `lastCleanupAt` ilerlemiyor.
5. Lease'i düşmüş worker başka worker'ın talebini ezemiyor.
6. Aynı milisaniyeyi paylaşan sayfa sınırı mesajları erişilebilir.

## Testler

- Purge: yanıtı olan mesaj içeren parti (sahte tx ile NULL'lama adımının çağrıldığı).
- Scanner: silme hatası durumunda `scanStatus` yazılmadığı.
- `createPublicLookup`: `{ all: true }` ve `{}` iki şekli.
- Worker: ilk görev fırlattığında kalanların koştuğu.
- Outbox: yabancı `lockedBy` ile tamamlamanın satır güncellemediği.
- Cursor: aynı `createdAt`'li üç satırın iki sayfada eksiksiz döndüğü.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
