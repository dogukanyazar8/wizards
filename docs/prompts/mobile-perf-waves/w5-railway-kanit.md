# W5 — Railway kapasitesi, kanıttan sonra

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku. **W0-W4 bitmiş olmalı.**

## Neden en sonda

Elimizdeki tek büyük açıklanmamış sayı: cihaz 1008ms görüyor, handler 120ms harcıyor, arada **888ms** var.

Adaylar: cihaz bağlantısı ve TLS tekrarları · spekülatif istek çakışması (W2 çözüyor) · Railway edge kuyruğu · Node event-loop kuyruğu.

İstanbul'dan sekiz taze TLS `/ready` isteği **127-198ms TTFB** verdi. Yani 888ms normal coğrafi RTT değil. Web, PostgreSQL, Redis ve outbox worker aynı bölgede (`europe-west4`, Amsterdam), sleep kapalı. Cross-region veya cold-start sorunu **yok**.

Replica eklemek şu an tahmine yatırım olur.

## Aşama 1 — Kanıt topla

### 1. Event-loop enstrümanı

Node yerleşik histogramı kullan (`perf_hooks`):

- `monitorEventLoopDelay` — p50/p95/p99 gecikme.
- Event-loop utilization (ELU).
- Süreç CPU ve RSS.

Bunlar **kuyruk** hipotezini test eder: ELU %80'in üstündeyse tek CPU doymuş demektir.

### 2. Prisma havuzu

- Havuz bekleme süresi.
- Aktif bağlantı sayısı.
- Zaman aşımı sayacı.

DB'nin kendisi hızlı olup havuzda beklemek, "DB yavaş" gibi görünür ve yanlış yere yatırım yaptırır.

### 3. Fan-out metriğine yüzdelik

`apps/web/src/lib/workspace/performance-metrics.ts:299` şu an yalnız `sum` ve `max` topluyor — `total/calls` ortalama verir, p95 vermez.

- Yüzdelik ekle.
- Çıkışı `console.info`'dan scrape edilebilir bir uca taşı.
- `WORKSPACE_PERFORMANCE_METRICS` bayrağının UAT'ta **açık olduğunu doğrula** (`performance-metrics.ts:117`). Doğrulanmadı.

### 4. `fetchSockets` maliyeti

`apps/web/src/lib/workspace/unread-service.ts:602`, `:619`, `:640` — üç çağrı. Redis adapter takılı (`redis-adapter.ts:42`), yani bunlar **cluster RPC**: tüm node'lara yayın, hepsinden yanıt, her socket'in `data` nesnesi serialize.

Fan-out artık ack'i bloklamıyor (erteleme landed), ama tek CPU'lu process'te event-loop'u hâlâ işgal ediyor.

- Ara adım: presence'ı Redis set'te tut (`channel:{id}:viewers`, join'de SADD, leave'de SREM). Okuma O(1) `SMEMBERS`, cluster RPC yok.
- Permission filtresi **yerinde kalır**. Güvenlik sözleşmesi değişmez.
- Bu, room-emit geçişinin gerektirdiği tahliye sözleşmesini gerektirmez.

## Aşama 2 — A/B (yalnız kanıt gösteriyorsa)

Sırayla, her biri aynı yük profiliyle:

1. 1 CPU / 1 replica (mevcut taban)
2. 2 CPU / 1 replica
3. 1 CPU / 2 replica

ELU yüksekse (2) kazanır. Kuyruk edge tarafındaysa (3) kazanır. İkisi de değişmiyorsa sorun cihaz-ağ tarafındadır ve Railway'e para harcamak boşunadır.

## İki replica öncesi zorunlu testler

Socket tarafı kısmen hazır: Redis adapter mevcut, mobil client WebSocket-only, outbox worker ayrı. Yine de:

- **Reconnect gap repair** — kopma anında kaçan mesajlar geri alınıyor mu.
- **Rolling drain** — SIGTERM drain landed, iki replica ile davranışı test edilmedi.
- **Permission-change room eviction** — yetkisi alınan kullanıcı odadan düşüyor mu. Bu bir güvenlik testidir, performans değil.

## Güvenlik

- Presence Redis set'e taşınırken permission filtresi kaldırılmaz. Presence "kim bağlı", yetki "kim görebilir" — ikisi ayrı sorudur.
- Çoklu replica'da oturum ve rate limit Redis otoriteli olmalı; process belleğinde tutulan hiçbir kısıt replica sayısıyla bölünmemeli.

## Kabul kriterleri

- ELU, event-loop gecikme p95, RSS, Prisma havuz bekleme panelde/uçta okunabiliyor.
- Fan-out metriği yüzdelikli ve UAT'ta açık.
- A/B üç yapılandırma için de aynı yük profiliyle kaydedildi.
- Edge GET p95 **≤150-200ms**.
- Reconnect gap, rolling drain ve room eviction testleri yeşil.

## Gerçek kazanım

Doğrudan sayı vaat etmiyorum — bu dalganın işi **kanıt üretmek**. Kazanım iki biçimde gelir:

- Kanıt "CPU doymuş" derse: 2 CPU tek satırlık değişiklik, edge p95 tail'i düşer.
- Kanıt "doymamış" derse: Railway'e hiç para harcamayız ve 888ms'i cihaz-ağ tarafında ararız.

İkincisi de kazanımdır. Yanlış yere yatırım yapmamak, doğru yere yatırım yapmak kadar değerli.
