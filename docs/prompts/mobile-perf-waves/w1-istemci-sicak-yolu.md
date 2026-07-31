# W1 — İstemci sıcak yolu

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku. **W0 bitmiş olmalı.**

## Hedef

Sohbet açılışının ölçülen kırılımı:

```
dokunuş → navigated  106 ms
dokunuş → mounted    104 ms   ← aynı an, navigasyon ucuz
dokunuş → content    461 ms
```

**Mount sonrası ~337ms** ve bu örnekte sıfır ağ isteği var. Cached açılışın %73'ü burada.

## İşler

### 1. Transcript satırlarını animasyonsuz çiz

`apps/mobile/src/app/components/dm-chat-primitives.tsx:484-490` — her satır mount olduğunda `useEffect(..., [])` içinde 180ms `withTiming` opacity + translateY animasyonu başlatıyor.

Sonuç: DM'i yeniden açınca **30 eski mesajın hepsi** "yeni mesaj geldi" animasyonu oynatıyor. Hem CPU maliyeti hem yanlış davranış.

- İlk transcript render'ında satırlar animasyonsuz, son hallerinde çizilsin.
- Yalnız **gerçekten yeni gelen** mesaj (socket/echo ile listeye eklenen) animasyonla girsin.
- Ayrım için mount anındaki ilk veri kümesi ile sonradan eklenenleri ayır; satırın kendi `useEffect`'i bunu bilemez, karar liste seviyesinde verilmeli.
- `useReducedMotion` davranışı korunur.

### 2. Geçiş animasyonu A/B

`apps/mobile/src/navigation/mobile-navigator.tsx:145` root stack `slide_from_right` kullanıyor.

- Chat rotaları için `animation: "none"` ve kısa `fade` varyantlarını ölçülebilir bir bayrak arkasına al.
- Üç varyantı aynı koşuda karşılaştır.

**Bağlayıcı karar:** 100ms bütçesi kaydırma animasyonu korunursa ulaşılamaz. A/B sonucuna göre ya animasyon değişir ya bütçe revize edilir — ikisinden biri, "her ikisi de kalsın" yok.

### 3. SQLCipher restore bariyeri

`apps/mobile/src/query/use-mobile-message-stream-persistence.ts:55` — mesaj sorgusu **önce** mount oluyor, disk hidrasyonu `useEffect` sonrası başlıyor. Disk cache ağ ile yarışıyor ve çoğu zaman kaybediyor.

- Son konuşmaları inbox/kök seviyesinde önceden hidrat et.
- Sorgu aktivasyonunu restore bariyerinin arkasına al ya da güvenli `initialData` ile besle.
- Bayat yerel sayfa **anında** gösterilsin, ağ arka planda uzlaştırsın.
- Panelde kaynak etiketi göster: `memory | sqlcipher | prefetch | network` + cache yaşı.

### 4. `drawDistance` — ölçmeden dokunma

`dm-chat-primitives.tsx:1152` `drawDistance={700}`, `scrollEventThrottle={16}`.

- Önce **blank-area** metriğini ölç.
- Ancak blank-area bütçe içindeyse kademeli düşür.
- Körlemesine düşürmek boş alan kusuru üretir. Bu iş ölçüm olmadan yapılmaz.

## Güvenlik

- Disk hidrasyonu namespace sözleşmesini bozamaz: satırlar `user_id + scope + target_id` ile ayrılır, başka hesabın satırı okunamaz.
- Bayat yerel sayfa gösterirken izin değişimi ihtimali var — ağ uzlaştırması yetkisiz içeriği **kaldırmalı**, üstüne eklememeli.

## Kabul kriterleri

- `chat-open-cached` p95 **150-220ms** bandında.
- `content` − `mounted` farkı **< 120ms**.
- `interactive` − `content-visible` farkı **< 80ms** (şu an 211ms).
- DM ve kanal ayrı ayrı raporlanıyor (W0 sayesinde).
- Blank-area regresyonu yok.
- Tüm doğrulama komutları yeşil.

## Gerçek kazanım

Cached açılış p95 **461 → 150-220ms**, yani **%52-67 azalma**. Bu, kullanıcının "sohbet açılışı yavaş" şikâyetinin doğrudan hedefi ve ağ ile sunucudan tamamen bağımsız — deploy gerektirmez, yalnız APK.

Satır animasyonu düzeltmesi ayrıca davranış hatası: eski mesajların yeni gibi görünmesi kullanıcıyı yanıltıyordu.
