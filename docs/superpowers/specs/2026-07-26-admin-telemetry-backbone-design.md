# Admin Telemetri Omurgası (Alt Proje A)

**Tarih:** 2026-07-26
**Dal:** uat
**Durum:** Tasarım onaylandı, uygulama planı bekliyor

## Bağlam

Admin panelinin baştan tasarımı altı bağımsız alt projeye ayrıldı. Bu doküman
yalnızca **A — Telemetri Omurgası**'nı kapsar. Diğerleri (B panel kabuğu,
C platform sağlık + analitik, D moderasyon, E kampanya + ürün sesi,
F desktop + mobil) kendi spec'lerini alır.

A önce geliyor çünkü tek geri dönüşsüz iş bu: bugün toplanmayan platform
verisi yarın geriye dönük üretilemez.

İlk sürümün hedef kullanıcısı **platform operasyon ekibi** (küçük, tam yetkili).
Kiracı izolasyonu ve PII maskeleme bu sürümün kapsamı dışında.

## Problem

Panelin en çok istenen yeteneği "her platformu ayrı ayrı gözlemleyebilmek".
Bugün bu yapılamıyor, ve daha kötüsü: yapılıyor sanılıyor.

### Doğrulanmış mevcut durum

**1. Günlük metriklerde platform boyutu yok.**

`packages/db/prisma/schema.prisma:438` — `UserDailyMetric` alanları:
`appSeconds`, `messageCount`, `dmMessageCount`, `fileUploadCount`,
`uploadedBytes`, `voiceSeconds`, `cameraSeconds`, `screenShareSeconds`,
`sessionCount`. Unique key `(date, userId)`. İstemci/platform kolonu yok.

Sonuç: "mobilde mesaj hacmi düştü mü", "desktop'ta voice kullanımı ne kadar",
"web'de upload yükü ne" sorularının hiçbiri cevaplanamıyor.

**2. Platform sadece oturum düzeyinde var, ve yanlış dolduruluyor.**

`packages/db/prisma/schema.prisma:410` — `AppSession.clientType`
(`WEB` / `DESKTOP` / `MOBILE` / `UNKNOWN`) tutuluyor.

`apps/web/src/lib/analytics/client-info.ts:137` — `detectClientType` öncelik
sırası: `x-whispr-client` başlığı → UA'da `WhisprDesktop|Tauri|Wry` → UA'dan
türetilen `deviceType` → varsayılan `WEB`.

`apps/mobile/src/api/mobile-api-client.ts:138` — mobil istemci yalnızca
`Accept`, `Authorization`, `Content-Type` gönderiyor. `x-whispr-client` **yok**.
Tüm repoda bu başlığı gönderen tek yer `client-info.test.ts:34`.

React Native'in varsayılan User-Agent'ı (`okhttp/*` Android, `CFNetwork/Darwin`
iOS) `detectDeviceType`'ın aradığı `/Mobi|Android|iPhone|iPod/` desenine
uymuyor. Desktop tarafında da Tauri WebView2'nin UA'sı Edge UA'sı olduğu için
`Wry` içermiyor.

Beklenen sonuç: mobil ve desktop oturumları `clientType: WEB` olarak
kaydediliyor. Panelin platform kırılımı eksik değil, hatalı.

> **Bu bir çıkarım, ölçüm değil.** Kodla kesin doğrulanan: `x-whispr-client`
> başlığı hiçbir istemci tarafından gönderilmiyor, ve başlık yokken
> `detectClientType` UA'ya düşüyor. Gerçek UA dizesi cihazda ölçülmedi.
>
> **Uygulamanın ilk adımı ölçüm olmalı** (bkz. Uygulama sırası, adım 0): canlı
> `AppSession` tablosunda `groupBy clientType` ve gerçek cihazdan gelen bir
> isteğin `userAgentHash`'i. Ölçüm çıkarımı doğrularsa tasarım aynen uygulanır;
> yanlışlarsa yalnızca `detectClientType`'ın hangi dalının çalıştığı değişir —
> platform boyutunun eksikliği (problem 1) ölçümden bağımsız olarak geçerli.

**3. `appVersion` hiçbir tabloda yok.** Sürüm kırılımı sıfırdan.
Başlık deseni yarım hazır: `apps/web/src/components/app/app-update-notifier.tsx:21`
zaten `x-whispr-client-build: WHISPR_BUILD_ID` gönderiyor, sunucu okumuyor.

### Yazım yolları

Tüm günlük metrik yazımı tek fonksiyondan geçiyor:
`apps/web/src/lib/analytics/service.ts:80` `incrementUserDailyMetric`
(`:89` tek upsert). Boyut eklemek tek noktadan mümkün. Ancak çağıranların
hiçbiri istemci bağlamı taşımıyor:

| Metrik grubu                                                         | Çağrı yolu                                                                                                                                              | Attribution zorluğu |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `sessionCount`, `appSeconds`                                         | `startAppSession` / `endAppSession` (`service.ts:135`, `:204`) — `AppSession` satırı `clientType`'ı zaten tutuyor, sadece okunmuyor                     | Kolay               |
| `voiceSeconds`, `cameraSeconds`, `screenShareSeconds`                | `startMediaUsageSession` (`apps/web/src/lib/voice/service.ts:900`) — geçen `sessionId`, `VoiceState.sessionId`; `AppSession.sessionKey` değil, join yok | Orta                |
| `messageCount`, `dmMessageCount`, `fileUploadCount`, `uploadedBytes` | Outbox job (`apps/web/src/lib/outbox/service.ts:376`) — HTTP bağlamı kaybolmuş                                                                          | Zor                 |

Ek gerçek: `startAppSession` Socket.IO bağlantı handler'ından çağrılıyor
(`apps/web/src/lib/socket/server.ts:422`), REST'ten değil. Mobilde iki taşıma
yolu var: REST başlıkları **ve** socket handshake. İkisi de gerekli.

`socket.data.appSessionKey` bağlantı boyunca tutuluyor
(`apps/web/src/lib/socket/server.ts:457`) — medya attribution bu kancayı
kullanacak.

## Hedefler

1. `UserDailyMetric` platform boyutu kazanır; her metrik doğru platforma yazılır.
2. Üç istemci de kendini açıkça tanıtır — UA tahminine düşülmez.
3. Uygulama sürümü oturum düzeyinde kaydedilir.
4. Geçmiş veri dürüstçe `UNKNOWN` olarak işaretlenir, sahte platform ataması yapılmaz.

## Kapsam dışı

- Panel ekranı, UI değişikliği yok. Görsel sonuç C'de gelir.
- Sunucu / kanal / ülke boyutu yok.
- Crash rate, latency, push teslim oranı toplama yok — C'nin işi.
- Ham olay tablosu (`AnalyticsEvent`) ve rollup job yok. Bu tasarım o yolu
  kapatmıyor: ileride olay tablosu eklenirse `UserDailyMetric` rollup hedefi olur.
- PII maskeleme, scope tabanlı yetki — hedef kullanıcı tam yetkili operasyon ekibi.

## Tasarım

### 1. Şema

```prisma
model UserDailyMetric {
  // mevcut alanlar korunur
  clientType AnalyticsClientType @default(UNKNOWN)   // yeni
  appVersion String?             @db.VarChar(32)     // yeni

  @@unique([date, userId, clientType])   // önceki: @@unique([date, userId])
  @@index([date])                        // korunur
  @@index([userId, date])                // korunur
  @@index([date, clientType])            // yeni — panel sorgusu
}

model AppSession {
  appVersion String? @db.VarChar(32)     // yeni

  @@index([clientType, startedAt])       // yeni — platform/sürüm zaman serisi
}

model MediaUsageSession {
  clientType AnalyticsClientType @default(UNKNOWN)   // yeni
}
```

**Karar: `appVersion` unique key'e girmez.**
Kullanıcı gün içinde güncelleme alırsa satır bölünür ve günlük toplamlar
dağılır. `appVersion` "o gün son görülen sürüm" semantiğiyle upsert'in
`update` dalında üzerine yazılır.

"Kaç kullanıcı hangi sürümde" sorusu `AppSession` üzerinden cevaplanır —
orada her oturum kendi sürümünü taşır ve bölünme sorunu yoktur.

**Karar: `MediaUsageSession.clientType` A'ya dahil.**
Medya attribution'ın zaten çözülmesi gerekiyor; kolonu aynı migration'da
eklemek C'ye "hangi platformda ne kadar ekran paylaşımı" sorusunu bedavaya
verir.

### 2. Migration

`(date, userId)` unique kısıtı düşürülür, `(date, userId, clientType)` konur.

Her mevcut satır `clientType = UNKNOWN` alır. Mevcut `(date, userId)` çiftleri
zaten tekil olduğu için genişletilmiş anahtarda da tekil kalırlar — çakışma yok,
veri kaybı yok, geri alınabilir.

Migration `packages/db/prisma/rebaseline-migrations` altına yazılır.
`packages/db/prisma.config.ts:7` migrations yolunu bu dizine sabitliyor;
`packages/db/prisma/migrations` altına yazılan bir migration sessizce hiç
çalışmaz. (`packages/db/scripts/prisma7-contract.test.mjs:36` bu yolu
sözleşme olarak doğruluyor.)

**Doğruluk kuralı:** eski satırlar `UNKNOWN`, yeni satırlar gerçek platform.
Panel `UNKNOWN`'ı ayrı seri olarak göstermeli, `WEB`'e katlamamalı — aksi halde
geçiş gününde sahte bir platform kayması görünür. Bu kural C'nin spec'ine
taşınacak not olarak kaydedilir.

### 3. İstemci sözleşmesi

| Başlık                    | Değer                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| `x-whispr-client`         | `web` \| `desktop` \| `mobile`                                                   |
| `x-whispr-client-version` | mobil: `apps/mobile/package.json` sürümü (bugün `0.8.15`); web/desktop: build id |

Değişecek yerler:

- `apps/mobile/src/api/mobile-api-client.ts:138` — REST başlıkları.
- Mobil socket bağlantısı — handshake `extraHeaders`. (REST tek başına yetmez:
  `startAppSession` socket'ten çağrılıyor.)
- Web: başlık `WHISPR_CLIENT` build sabitinden üretilir. Tauri build'inde
  `desktop`, normal build'de `web`. Desktop ayrı bir frontend olmadığı
  (`apps/desktop/src-tauri/tauri.conf.json:7` — Tauri kabuğu web'i yüklüyor)
  için ayrı istemci kodu gerekmiyor.
- `apps/web/src/lib/analytics/client-info.ts` — `x-whispr-client-version`
  okunur, `AnalyticsClientInfo`'ya `appVersion` alanı eklenir.

**Karar: UA sniffing silinmez, geri düşürülür.**
`x-whispr-client` geldiğinde UA hiç okunmaz. Başlık yoksa mevcut UA zinciri
aynen çalışır. Sebep: güncellemeyen eski istemci sürümleri sessizce
`UNKNOWN`'a düşmemeli.

Sürüm dizesi sunucuda `VarChar(32)`'ye kırpılır ve beyaz liste desenine
(`^[0-9A-Za-z.\-+]{1,32}$`) uymayan değerler `null` sayılır — istemciden gelen
serbest metin doğrudan saklanmaz.

### 4. `ClientAttribution` — tek taşıyıcı tip

Attribution üç ayrı akıştan geçiyor (REST, socket, outbox). Her akışa ayrı ayrı
`clientType` + `appVersion` parametresi eklemek üç yerde ayrı ayrı unutulabilir
bir sözleşme üretir. Bunun yerine tek tip tanımlanır ve üç akış da onu taşır:

```ts
// apps/web/src/lib/analytics/client-attribution.ts
export type ClientAttribution = {
  appVersion: string | null;
  clientType: AnalyticsClientType;
};

export function toClientAttribution(info: AnalyticsClientInfo): ClientAttribution;
export const UNKNOWN_ATTRIBUTION: ClientAttribution;
```

`incrementUserDailyMetric`, `startMediaUsageSession` ve outbox payload'ı bu tek
tipi alır. Yeni bir metrik yazım yolu eklendiğinde tip zorunlu parametre olduğu
için derleyici attribution'ı unutmaya izin vermez.

**Karar: parametre opsiyonel değil, zorunlu.** Varsayılan değer verilirse yeni
çağrı yerleri sessizce `UNKNOWN` yazar ve hata fark edilmez. `UNKNOWN` yazmak
gerekiyorsa çağıran `UNKNOWN_ATTRIBUTION` sabitini açıkça geçirir — niyet
kodda görünür olur.

### 5. Geçmiş veri kesim politikası

`AppSession.clientType` **geçmişe dönük de güvenilmez.** Bugünkü hatalı
tespitin ürünü olan satırlar veritabanında `WEB` yazıyor ve bunlar
`UNKNOWN`'dan ayırt edilemez durumda.

`UserDailyMetric` için çözüm basit (yeni kolon, eski satırlar `UNKNOWN`).
`AppSession` için değil — kolon zaten dolu ve değeri yanlış.

Çözüm: migration anı kesim noktası olarak sabitlenir.

```prisma
model AppSession {
  appVersion String? @db.VarChar(32)
  /// İstemci başlık sözleşmesinden gelen platform mu, yoksa eski UA tahmini mi.
  /// Kesimden önceki satırlarda false; platform raporlarında UNKNOWN sayılır.
  attributionVerified Boolean @default(false)
}
```

Yeni oturumlar başlıktan platform aldığında `attributionVerified = true` yazar.
Tüm platform raporları `attributionVerified = false` satırlarını **`UNKNOWN`
kovasına** koyar; saklı `clientType` değerine bakmaz.

**Karar: eski satırlar silinmez, güncellenmez.** Doğru değeri bilmiyoruz;
tahmin etmek veriyi ikinci kez bozar. `UNKNOWN` dürüst cevap.

Bu bayrak `MediaUsageSession` ve `UserDailyMetric` için gerekmiyor — oradaki
yeni kolonlar zaten kesimden sonra doluyor ve eski satırlar varsayılan
`UNKNOWN`.

### 6. Attribution yolları

**a) Oturum metrikleri — `sessionCount`, `appSeconds`**

- `startAppSession` (`service.ts:135`) `clientInfo`'yu zaten alıyor ama
  `incrementUserDailyMetric` çağrısına geçirmiyor (`service.ts:179`).
  `clientType` + `appVersion` argüman olarak eklenir.
- `endAppSession` (`service.ts:204`) `AppSession` satırını zaten okuyor
  (`service.ts:211`); `select`'e `clientType` ve `appVersion` eklenir ve
  `incrementMetricAcrossInterval`'a geçirilir.
- `incrementMetricAcrossInterval` (`service.ts:123`) gece yarısını bölen
  oturumun her iki gün satırına da **aynı** `clientType`'ı yazar.

**b) Medya metrikleri — `voiceSeconds`, `cameraSeconds`, `screenShareSeconds`**

Voice'un `sessionId`'si `VoiceState.sessionId`; `AppSession.sessionKey` ile
eşleşmiyor, join yolu yok.

Çözüm: socket bağlantısında `socket.data.clientType` ve
`socket.data.appVersion` tutulur (`appSessionKey`'in yanına,
`apps/web/src/lib/socket/server.ts`). Voice handler'ları bunu
`startMediaUsageSession`'a geçirir; `MediaUsageSession` satırına yazılır ve
`endMediaUsageSession`'ın günlük metrik yazımında kullanılır.

**c) Mesaj metrikleri — `messageCount`, `dmMessageCount`, `fileUploadCount`, `uploadedBytes`**

Outbox job üzerinden geliyor. `MessageCreatedAnalyticsPayloadSchema`
(`apps/web/src/lib/outbox/service.ts:76`) genişletilir:

```ts
clientType: z.enum(["WEB", "DESKTOP", "MOBILE", "UNKNOWN"]).default("UNKNOWN"),
appVersion: z.string().max(32).optional(),
```

`.default("UNKNOWN")` zorunlu: deploy anında kuyrukta bekleyen eski payload'lar
doğrulamadan geçmeye devam etmeli. Geriye dönük uyumluluk bu varsayılandan gelir.

Enqueue tarafı mesaj gönderme rotasında; orada `getAnalyticsClientInfo(request.headers)`
erişilebilir ve `clientType` payload'a konur.

### 7. Gizlilik

- `appVersion` PII değil; hash'lenmez, maskelenmez.
- `apps/web/src/lib/account/privacy-service.ts:274` — kullanıcı veri dışa
  aktarımı `userDailyMetric` satırlarını olduğu gibi döküyor. İki yeni kolon
  otomatik dahil olur; dışa aktarım şeması testi güncellenir.
- `apps/web/src/lib/account/privacy-service.ts:472` — silme
  `deleteMany({ userId })`. Boyut eklenince de doğru çalışır, değişiklik yok.

## Uygulama sırası

**Adım 0 — ölçüm (kod değişikliği yok).** Tasarımın dayandığı çıkarım
doğrulanır:

```sql
SELECT "clientType", "deviceType", COUNT(*) FROM "AppSession"
WHERE "startedAt" >= NOW() - INTERVAL '7 days'
GROUP BY "clientType", "deviceType";
```

Gerçek bir mobil cihazdan istek atılır ve sunucuda gelen `user-agent` başlığı
kaydedilir. Sonuç spec'e yazılır. Bu adım atlanırsa geri kalan her şey
doğrulanmamış bir varsayımın üstüne kurulur.

**Adım 1** şema + migration + `attributionVerified` bayrağı.
**Adım 2** `ClientAttribution` tipi ve üç akışa threading.
**Adım 3** istemci başlıkları (mobil REST, mobil socket, web build sabiti).
**Adım 4** raporlama tarafında kesim politikasının uygulanması.

## Test planı

TDD: her madde önce başarısız test olarak yazılır.

1. **Gün bölme + platform:** gece yarısını aşan oturumun iki gün satırı da aynı
   `clientType` almalı (`splitIntervalByUtcDay` + `incrementMetricAcrossInterval`).
2. **Migration:** mevcut `(date, userId)` satırı `UNKNOWN` olarak hayatta kalmalı;
   aynı güne aynı kullanıcı için `MOBILE` satırı çakışmadan eklenebilmeli.
3. **Outbox geriye dönük uyumluluk:** `clientType` alanı olmayan eski payload
   parse edilmeli ve `UNKNOWN` yazmalı.
4. **`client-info` önceliği:** `x-whispr-client` varken UA yok sayılmalı;
   başlık yokken mevcut UA davranışı bit-bit korunmalı (mevcut testler geçmeli).
5. **Sürüm doğrulama:** desene uymayan veya 32 karakteri aşan sürüm dizesi
   `null` olmalı.
6. **İstemci sözleşmesi:** mobil REST client **ve** socket handshake başlığı
   gerçekten gönderiyor mu — mevcut `apps/mobile/scripts/mobile-*-contract.test.ts`
   desenine uyan iki test.
7. **Medya attribution:** socket bağlamından gelen `clientType`
   `MediaUsageSession` satırına ve günlük metriğe yazılmalı.
8. **Zorunlu attribution:** `incrementUserDailyMetric` çağrısı
   `ClientAttribution` olmadan derlenmemeli (tip testi).
9. **Kesim politikası:** `attributionVerified = false` olan `AppSession`
   satırı, saklı `clientType` değeri `WEB` olsa bile platform raporunda
   `UNKNOWN` kovasına düşmeli.

## Bitti kanıtı

Migration ve üç istemci deploy'undan sonra:

```sql
SELECT "clientType", COUNT(*) FROM "UserDailyMetric"
WHERE date >= NOW() - INTERVAL '7 days' GROUP BY "clientType";
```

Beklenen: `MOBILE > 0`. Adım 0'daki ölçüm bugünkü değeri kayda geçirir.

`AppSession` tarafında aynı sorgu `attributionVerified = true` filtresiyle
koşulur — bayraksız satırların dahil edilmesi kesim politikasının
uygulanmadığı anlamına gelir.

## Riskler

| Risk                         | Etki                           | Karşılık                                                                     |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Mobil deploy gecikir         | Mobil trafik `UNKNOWN` birikir | Yanlış `WEB` yazmaktan iyi; dürüst işaret. Panelde ayrı seri.                |
| Satır sayısı artışı          | `UserDailyMetric` büyür        | Kullanıcı çoğu gün tek platform kullanır → ~1.2-1.5x. Endeks maliyeti düşük. |
| Uçuştaki outbox job'ları     | Deploy anında şema hatası      | `.default("UNKNOWN")` ile kapatıldı; test 3 bunu koruyor.                    |
| Eski istemciler güncellenmez | Kalıcı `UNKNOWN` payı          | UA fallback korunuyor; en kötü durumda bugünkü doğrulukta kalır.             |

## Sonraki adım

Bu spec onaylandıktan sonra `writing-plans` ile uygulama planı yazılır.
Kod değişikliği plan onayından önce başlamaz.
