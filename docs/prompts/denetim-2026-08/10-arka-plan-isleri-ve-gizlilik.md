# 10 — Arka plan işleri ve gizlilik sözleri

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 08 landed (saatlik bakım bloğu orada try/catch'e bölündü; bu prompt o bloğa görev ekliyor).

## Sorun

Saatlik işler ya yanlış veri üretiyor, ya veriyi özetlemeden siliyor, ya hiç koşmuyor. İki gizlilik sözü tutulmuyor.

## Kapsam

### 1. Telemetri günlük özeti sayacı eziyor

`apps/web/src/lib/telemetry/client-health-rollup.ts:132` · `apps/web/src/lib/outbox/worker.ts:86`

Upsert `count: summary.count` yazıyor, artırmıyor. Rollup saatlik koştuğu ve `cutoff` saatte bir ilerlediği için bir UTC gün ~24 ayrı geçişte aynı anahtara upsert ediliyor: tabloda gerçek olayın ~1/24'ü, p50/p95/p99 son bir saatin. Bu tablodan türeyen tüm çökme oranı ve gecikme rakamları ~24× yanlış.

Yap:

- `count: { increment: summary.count }`.
- Yüzdelikler artırılamaz. İki seçenek: (a) bir UTC günü atomik olarak işle (cutoff'u gün sınırına hizala), (b) yüzdelikleri korunan bir örneklemden yeniden hesapla. **(a) daha basit** — over-engineering'den kaçın, onu seç.
- Var olan yanlış satırlar için düzeltme yazma; kullanıcıya "geçmiş veri güvenilmez" notu ver.

### 2. Telemetri temizliği özetlenmemiş satırları siliyor

`apps/web/src/lib/telemetry/client-health-rollup.ts:110`, `:150`

Okuma `take: 5_000`, silme sınırsız — aynı predicate. Birikme olan her turda 5.001+ satır hiç sayılmadan siliniyor. Fonksiyonun kendi yorumu tersini iddia ediyor.

Yap: yalnız özetlenen id'leri sil (`where: { id: { in: ids } }`); parti kısa dönene kadar döngüye al. Yorumu gerçeğe getir.

### 3. Hesap silme medyayı işlemden önce yok ediyor

`apps/web/src/lib/account/privacy-service.ts:450`, `:496`, `:506`

`deleteUploadThingFiles(userId)` 35+ ifadelik interaktif işlemden **önce** çalışıyor. İşlem zaman aşımına düşerse veya deadlock olursa DB temiz geri alınıyor ama depolama silmesi kalıcı: kullanıcı hesabıyla devam ediyor, tüm medyası 404.

Yap: dosya silmeyi **işlem commit'inden sonraya** al. Alternatif olarak dosya anahtarlarını işlem içinde kaydedip mevcut `mobileMediaUpload` temizlik lease'ine bırak; basit olan birincisi.

### 4. `mobilePushToken` silinen hesaptan sağ çıkıyor

`apps/web/src/lib/account/privacy-service.ts:470`

Anonimleştirme işlemi ~35 modeli siliyor, `mobilePushToken` hiçbirinde değil. Push token'ı kişiye bağlı kararlı bir cihaz kimliği.

Yap: işleme `tx.mobilePushToken.deleteMany({ where: { userId } })` ekle. Aynı zamanda: silinen her tablo listesi tek yerde mi? Değilse en azından bu listeye bir test yaz — modelin eklenip listeye eklenmemesi bir daha sessiz kalmasın.

### 5. 90 günlük hata raporu temizliği hiç zamanlanmamış

`apps/web/src/lib/support/bug-report-service.ts:158` · `packages/db/prisma/schema.prisma:2196` · `apps/web/src/lib/outbox/worker.ts:83`

`purgeExpiredBugReports`'un üretimde sıfır çağıranı var — yalnız tanımı ve testleri. `deviceInfo`, 500 satıra kadar log, ekran görüntüsü ve `userId` süresiz duruyor; şemanın yorumu ve admin arayüzünün gösterdiği silme tarihi yalan.

Yap: saatlik bloğa ekle (08'in try/catch bölmesinden sonra, kendi bloğunda).

### 6. Rozet sweep'leri gereksiz tarama yapıyor

`apps/web/src/lib/badges/badge-sweep.ts:82`, `:164`, `:201`

- Founder sweep'i tüm `Server`'ı satır başına üye sayımıyla tarıyor — bakımı yapılan `Server.memberCount` kolonu var (`server-member-counter.ts`).
- Moderasyon sweep'i **tüm zamanların** ACTIONED vakalarını okuyup her saat idempotent olmayan yazma yapıyor; yazma hacmi ve `revoked` metriği süresiz büyüyor. Modül başlığı "son geçişten beri değişen vakalar" diyor; öyle bir filtre yok.
- Süresi dolan rozetler `count()` yerine `findMany().length`.

Yap:

- `memberCount` kolonunu seç ve `where: { memberCount: { gte: … } }` ekle.
- Moderasyon vakalarını `updatedAt >= lastSweepAt` ile filtrele; `verified` iptali zaten aynı sebeple yazılmışsa atla.
- Süresi dolan sayımı `count()` yap.

### 7. Kampanya `SENDING`'de kilitleniyor + istek içinde seri gönderim

`apps/web/src/lib/admin/notification-campaigns.ts:50`, `:490`, `:575`, `:269`

`SENDING` gönderilebilir durumlar arasında değil ve hiçbir şey sıfırlamıyor: yarıda kalan kampanya kalıcı 409. Gönderim alıcı başına iki sıralı yazma, istek içinde (10k alıcı = 20k sorgu). Alıcı sayımı tüm id'leri çekip `.length` okuyor.

Yap:

- Alıcı sayımı `prisma.user.count()`.
- Gönderimi mevcut outbox işine taşı; her partide `createMany` + `updateMany`, P2002 dedupe için tekil fallback kalsın.
- `SENDING`'i gönderilebilir kabul et (dedupe anahtarı devamı güvenli kılıyor) veya outbox drenajına bayat-`SENDING` geri alma ekle. Outbox'a taşındıysa ikincisi doğal düşer.

## Yapılmayacak

- Yeni zamanlayıcı altyapısı (cron servisi, kuyruk sistemi).
- Telemetri şemasını yeniden tasarlama.
- Geçmiş yanlış telemetri verisini düzeltme.
- Rozet katalog kurallarını değiştirme.
- Kampanya arayüzünü değiştirme.

## Kabul kriterleri

1. Aynı UTC güne iki rollup geçişi çalışırsa `count` toplanıyor, ezilmiyor.
2. 5.000'den fazla eski olay varsa hiçbiri özetlenmeden silinmiyor.
3. İşlem başarısız olursa kullanıcının medyası hâlâ duruyor.
4. Anonimleştirme sonrası kullanıcının push token satırı yok.
5. Saatlik blok süresi geçmiş hata raporlarını siliyor.
6. Founder sweep'i `Server` tablosunu tam taramıyor; moderasyon sweep'i idempotent.
7. Yarıda kalan kampanya tekrar gönderilebiliyor.

## Testler

- Rollup: aynı anahtara iki geçiş → toplam.
- Rollup: 5.000+ satırda silinen küme = özetlenen küme.
- Privacy: işlem fırlattığında dosya silmenin çağrılmadığı.
- Anonimleştirme: push token silme çağrısının yapıldığı.
- Founder sweep: sorgunun `memberCount` filtresi taşıdığı.
- Moderasyon sweep: aynı girdiyle ikinci koşunun sıfır yazma yaptığı.
- Kampanya: `SENDING` durumundan devam edilebildiği.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
