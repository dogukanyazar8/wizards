# W0 — Ölçüm onarımı

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku.

## Neden bu dalga önce

Bugüne kadar DM açılışlarının **hiçbiri** ölçülmedi. Elimizdeki `chat-open-cached 461ms` ve `chat-open-network 1347ms` yalnız kanal açılışları. Kullanıcının şikâyeti ağırlıklı DM'lerdeydi.

Bu dalga hiçbir şeyi hızlandırmaz. Diğer beş dalgayı mümkün kılar. Atlanamaz.

## İşler

### 1. DM listesine gerçek span kapatıcı

`apps/mobile/src/app/components/dm-chat-primitives.tsx:1144` — canlı DM `FlashList`'inde `onLoad` prop'u **yok**. Kapatıcı eski bileşende kalmış: `apps/mobile/src/app/components/message-primitives.tsx:937`.

FlashList sözleşmesi: `onLoad` öğeler gerçekten çizildiğinde çalışır, **boş listede hiç çalışmaz**.

- Canlı DM listesine `onLoad={mobileListLoadHandlers.dmMessages}` bağla.
- Boş ve hata durumları için **ayrı** first-paint kapatıcı ekle — boş sohbet açılışı da bir açılıştır ve şu an sonsuza kadar açık span bırakıyor.
- Ölü kapatıcıyı eski bileşenden kaldır ya da o bileşen hâlâ kullanılıyorsa çift sayımı engelle.

### 2. `buildId` gerçek olsun

`apps/mobile/src/performance/mobile-telemetry-dimensions.ts:54` `extra.whispr.buildId` okuyor. `apps/mobile/app.config.js:260` bunu **hiç yazmıyor** — sonsuza kadar `unknown`.

- Build script'in ürettiği commit SHA'yı `publicConfig`'e, oradan `extra.whispr.buildId`'ye taşı.
- Cihaz örneğini Railway edge kaydıyla eşleştirmenin tek yolu bu.

### 3. Request metriği method-aware ve yüzdelikli

`apps/mobile/src/performance/mobile-request-metrics.ts:114` rota başına **yalnız son örneği** tutuyor, ve GET ile POST aynı `/messages` anahtarında birleşiyor.

- Anahtara HTTP metodunu ekle.
- Son örnek yerine rota+metot başına yüzdelik tut (p50/p95, sınırlı örnek halkası).
- Paneldeki "Sunucu zamanlaması" bölümü bunları göstersin.

### 4. İstemci ölçümünü ikiye ayır

`apps/mobile/src/api/mobile-api-client.ts:161` ölçümü **response header geldiğinde** bitiriyor. Gövde indirme, JSON parse, cache commit ve render dışarıda.

- İki sayı üret: `headersMs` (mevcut) ve `settledMs` (gövde + parse dahil).
- İkisinin farkı JS thread ve gövde maliyetini ayırır. Sunucunun `Server-Timing: total` değeriyle üçlü karşılaştırma yapılabilir hale gelir.

### 5. Prefetch gerçek isabet sayılsın

`apps/mobile/src/query/mobile-recent-dm-prefetch.ts:52` — `recordMobileRecentDMPrefetch` istek zincirinden **önce** çağrılıyor. "warmed" niyeti sayıyor, tamamlanmayı değil. Panel %100 gösteriyor, sahte.

- `recordMobileRecentDMPrefetchSettled` (zaten var, çağrılmıyor) her isteğin çözülmesinde tetiklensin.
- Panel `denendi / tamamlandı / tık öncesi tamamlandı` üçlüsünü göstersin.

### 6. Request-ID korelasyonu

- Her isteğe `X-Request-Id` (UUID) ekle.
- Sunucu tarafında aynı id'yi log satırına ve `Server-Timing` yanıtına yansıt.
- Cihazdaki tek bir yavaş örnek edge kaydında bulunabilsin.

## Güvenlik

- Request-ID rastgele olmalı, kullanıcı/oturum türevi **olmamalı**.
- Telemetri alanlarına yeni bir şey eklerken içerik sızmadığını doğrula: rota şablonu evet, ham path/query hayır.

## Kabul kriterleri

- `chat-open-cached` + `chat-open-network` toplam `n` ≈ yapılan açılış sayısı.
- `Açık / kaybolan ölçüm` ikinci sayı **< 3**.
- `Yapı` satırı gerçek SHA gösteriyor.
- Prefetch oranı gerçek tamamlanmaya dayanıyor.
- Panelde GET ve POST `/messages` **ayrı satır**.
- Tüm doğrulama komutları yeşil.

## Gerçek kazanım

Doğrudan hız kazancı **yok**. Kazanım: ilk kez DM ölçümü, ilk kez GET/POST ayrımı, ilk kez ağ ile JS thread ayrımı, ilk kez cihaz-edge korelasyonu. W1-W4'ün hedefleri bu dalga olmadan doğrulanamaz.
