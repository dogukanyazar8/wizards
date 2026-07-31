# W2 — Birikmeyi durdur

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku. **W0 ve W1 bitmiş olmalı.**

## Hedef

İki ayrı birikme: bellek ve istek kuyruğu. İkisi de "uygulama zamanla yavaşlıyor" hissinin adayı.

## İşler

### 1. gcTime ayrımı

`apps/mobile/src/query/mobile-query-client.ts:13` — **bütün** sorgular 24 saat tutuluyor, çünkü gcTime kalıcı cache max-age'ine eşitlenmiş.

`apps/mobile/src/query/mobile-query-cache-policy.ts:30` — `MOBILE_MEMORY_QUERY_GC_TIME_MS = 30 * 60_000` zaten tanımlı ve **hiç kullanılmıyor**.

- Kalıcı kökler (bootstrap, workspace) 24 saatte kalır.
- Mesaj sorguları (kanal + DM) `MOBILE_MEMORY_QUERY_GC_TIME_MS` kullanır.
- Ayrım `shouldPersistMobileQuery` ile aynı sınıflandırmayı takip etsin, ikinci bir doğruluk kaynağı üretme.

### 2. `maxPages` sınırı

Infinite mesaj sorgularında `maxPages` yok. Açılan her sohbetin yüklenen her eski sayfası bellekte kalıyor. TanStack bunu bellek ve ağ maliyeti için öneriyor.

- `maxPages: 3` ile başla.
- Yukarı kaydırma davranışının bozulmadığını test et — `maxPages` eski sayfaları düşürünce geri kaydırma yeniden fetch tetikler, bu kabul edilebilir ama **kayıp konum** kabul edilemez.

### 3. LRU budama

- Son 3-5 sohbet dışındaki mesaj sorgularını aktif olarak kaldır.
- Hesap değişimi ve çıkışta **deterministik** temizlik: mevcut wipe state machine'e bağla, ikinci bir yol açma.

### 4. İptal edilebilir prefetch

Şu an: TanStack'in `signal`'ı query function'a taşınmıyor, API client kendi `AbortController`'ını kuruyor. Kullanıcı başka sohbet açınca eski speculative istek **durmuyor** ve gerçek tıkla aynı bağlantı ve tek CPU'lu web process için yarışıyor.

- Query `signal`'ını API client'a geçir.
- Timeout sinyali ile dış iptal sinyalini birleştir (`AbortSignal.any` ya da eşdeğeri).
- Tık geldiğinde ilgisiz speculative prefetch'leri iptal et.
- Arka plan prefetch eşzamanlılığı **1**; seçili hedef her zaman en yüksek öncelik.

### 5. Prefetch değeri ölçülsün

Panelde: `denendi / tamamlandı / tık öncesi tamamlandı / cache yaşı / boşa giden bayt`.

**Bağlayıcı karar:** "tık öncesi tamamlandı" oranı düşük kalırsa prefetch ayarlanmaz, **silinir**. Boşa giden bayt ve CPU, hiç yapılmayan spekülasyondan pahalıdır.

## Güvenlik

- LRU budama ve gcTime kısaltma, oturum kapanışında satır silmenin **yerine geçmez**. Wipe sözleşmesi aynen kalır.
- İptal edilen isteğin kısmi yanıtı cache'e yazılmamalı.

## Kabul kriterleri

- Uzun oturum sonunda retained mesaj belleği **−%20-50** (Hermes heap + `adb dumpsys meminfo` ile ölç, tahmin etme).
- Art arda 8 farklı sohbet açılışında `chat-open-network` p95 tek açılış p95'inden **%20'den fazla sapmıyor** — yarış bitti demek.
- `maxPages` sonrası yukarı kaydırma konum kaybı yok.
- Tüm doğrulama komutları yeşil.

## Gerçek kazanım

Bellek **−%20-50** (ölçülecek). Asıl kazanım ölçülen p95'te değil, **tail'de**: spekülatif istek gerçek tıkla yarışmayı bıraktığında art arda açılışların en kötü örnekleri düşer.

Bu dalga aynı zamanda "prefetch işe yarıyor mu" sorusuna ilk kez gerçek cevap verir — cevap hayırsa özelliği silmek de bir kazanımdır.
