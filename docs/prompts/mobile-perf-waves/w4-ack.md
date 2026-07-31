# W4 — Gönderim ack

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku. **W0 ve W3 bitmiş olmalı.**

## Hedef

```
send-echo  p95    42.9 ms   bütçe 50   ✅  buraya yatırım yok
send-ack   p95  1237   ms   bütçe 300  ❌  4.1x
```

Optimistik balon anında. Sorun tikin dönmesi.

Edge: Channel POST p50 103 / p95 394ms. Yani ack'in büyük kısmı handler dışında.

## Aşama 1 — Ölç (bu dalga önce bunu yapar)

### 1. POST'a bucket'lı Server-Timing

Kanal POST'ta `auth` / `ratelimit` / `db` var. Yetmez.

Yeni bucket'lar: `auth`, `ratelimit`, `permission`, `transaction`, `serialize`, `total`. DM POST'a da aynısı.

`sendChannelMessage` / `sendDirectMessage` içine timing recorder'ı geçir; servis kendi aşamalarını ölçsün.

### 2. GET/POST ayrımı panelde görünsün

W0'da yapıldı; burada POST satırının gerçekten ayrı okunduğunu doğrula.

### 3. Request-ID korelasyonu

Cihazdaki en kötü ack örneğini edge kaydında bul. Fark handler'da mı, kuyruğunda mı, telde mi — tahmin etme, eşleştir.

**Ara hedef:** Channel POST edge p95 **394 → 150-200ms**.

## Aşama 2 — Socket callback ack

Ön koşul **zaten hazır**: `(userId, clientNonce)` unique index ve idempotent send servisi landed (`apps/web/src/lib/messages/client-nonce.ts`, migration `20260729140000_message_client_nonce`).

- Mobil gönderimi mevcut **kalıcı Socket.IO bağlantısı** üzerinden callback ack ile yap. Yeni TLS turu, yeni bağlantı kurulumu yok.
- Ack **yalnız DB commit sonrası** dönsün. Optimistik ack yok — tik yalan söylememeli.
- Aynı `clientNonce` ile idempotency korunur; sunucu tekrarı ikinci satır yazmadan mevcut mesajla cevaplar.
- Socket timeout'unda **aynı nonce ile** REST fallback. Kullanıcı iki mesaj görmez.
- Socket ve REST **aynı send servisini** kullanır. İkinci bir iş mantığı üretme.

## Güvenlik

- Socket yolunda rate limit ve permission kontrolü REST ile **aynı**. Socket kısayol değil.
- Ack'in DB commit'ten önce dönmesi yasak: yazılmamış mesaj için tik göstermek veri kaybını gizler.
- Fallback yolunda nonce yeniden üretilmemeli — `markMobileSendRetry` deseni (`use-mobile-message-mutations.ts`) korunur.
- Bildirim outbox'ı transaction içinde kalır; fan-out ertelemesi ack'i beklemez.

## Kabul kriterleri

- `send-ack` p95 **250-450ms**.
- `send-echo` p95 ≤ 40ms (regresyon yok).
- Uçak modu testi: gönder → başarısız → mod kapat → yeniden gönder → **tek mesaj**.
- Socket timeout'unda REST fallback tetikleniyor ve yine tek mesaj.
- POST bucket'ları toplamı, ölçülen sunucu süresini açıklıyor.
- Tüm doğrulama komutları yeşil.

## Gerçek kazanım

Ack p95 **1237 → 250-450ms**, yani **%64-80 azalma**. Temiz ağda 180-350ms mümkün.

Kazancın kaynağı iki katmanlı: aşama 1 handler içindeki gereksiz işi kesiyor, aşama 2 her gönderim için yeni HTTP/TLS turunu tamamen ortadan kaldırıyor — kalıcı socket zaten açık.

Bu, kullanıcının bir mesaj gönderirken hissettiği tek gecikme.
