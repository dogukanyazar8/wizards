# W3 — DM GET diyeti

> `/caveman ultra` ile koş. Branch: `uat`. Önce `_ortak-baglam.md`'yi oku. **W0 bitmiş olmalı.**

## Hedef

Bir DM açılışında sunucu şunları yapıyor: auth → rate limit → tam conversation yetkilendirmesi → participant + son mesaj + locale + Redis presence projeksiyonu → `listDMMessages` içinde **ikinci kez** üyelik kontrolü → mesaj sorgusu → reaction ve thread summary → read-state.

Edge p95: DM GET **337ms**.

## İşler

### 1. Çift üyelik kontrolünü kaldır

`apps/web/src/app/api/v1/mobile/dm/[conversationId]/messages/get-route-logic.ts` route'u zaten yetkilendiriyor, sonra `apps/web/src/lib/dm/service.ts:941` `listDMMessages` içinde `requireDMParticipant` **tekrar** koşuyor.

- Yetkilendirilmiş bir liste varyantı üret: çağıran üyeliği kanıtladığını iletsin.
- Yetkisiz çağrı yolunu **kaldırma** — public/dahili başka çağıran varsa varsayılan hâlâ kontrol etmeli.
- İkinci sorgu gitmeli, kontrol değil.

### 2. Auth ile hafif üyelik kontrolünü paralelleştir

Kanal GET'te bu deseni zaten kullanıyoruz (`readMobileApiClaimedUserId` + `Promise.allSettled`). DM'de yok.

- Claimed user id'den hafif üyelik sorgusunu auth ile paralel başlat.
- **Her ikisi de** sonuçlanmadan yanıt dönme.
- Hata önceliği: 401 → 403 → 429. Auth reddi üyelik reddini bastırır.

### 3. Başlık projeksiyonunu incelt

Her açılışta tam conversation + son mesaj + locale + Redis presence çekiliyor. Sohbet başlığı için gereken bu değil.

- Başlık için minimum alan kümesi belirle.
- Presence socket/cache otoriteli olsun — açılış sorgusunun içinde Redis'e gitme.

### 4. DM GET'e Server-Timing

Kanal GET'te var, DM'de **yok**. Kör nokta.

Bucket'lar: `auth`, `membership`, `messages`, `relations`, `serialize`, `total`. `createServerTiming` (`apps/web/src/lib/server-timing.ts`) hazır.

**Not:** route contract testi `authorizeMobileApiRequest(request, action)` çağrısını statik izliyor ve callback içinden göremiyor — auth'u `measure` ile sarma, `start`/stop kullan.

### 5. `relationJoins` etkisini ölç

`packages/db/prisma/schema.prisma` generator'ında `previewFeatures = ["relationJoins"]` açıldı. Mesaj sayfası include grafiği artık tek LATERAL join olmalı.

- `db` bucket'ının önce/sonra değerini kaydet.
- Kazanç yoksa raw SQL tartışması **o zaman** açılır. Ölçmeden raw SQL yazma.

## Güvenlik

- **Zorunlu regresyon testleri:** yetkisiz kullanıcı 401, üye olmayan 403, limit aşan 429 — ve bu sıra bozulmadan. Paralelleştirme en sık burada hata yapar.
- Yetkilendirilmiş liste varyantı yanlış çağrıldığında **fail-closed** olmalı: bayrak yoksa kontrol koşar.
- İnceltilen projeksiyon, engellenmiş kullanıcının bilgisini sızdırmamalı.

## Kabul kriterleri

- DM GET `Server-Timing` bucket'ları panelde görünüyor.
- DM GET edge p95 **337 → 250ms altı**.
- `messages` bucket'ı toplam sunucu süresinin çoğunluğu — yani ek işler temizlendi.
- 401/403/429 regresyon testleri yeşil.
- Tüm doğrulama komutları yeşil.

## Gerçek kazanım

Tipik **20-80ms**, tail'de daha fazla. Dürüst beklenti: bu tek başına 888ms'lik dış farkı çözmez.

Asıl değeri, W5'in kanıt tabanını hazırlaması: DM GET bucket'ları olmadan "sunucu mu, kuyruk mu, ağ mı" sorusu cevaplanamaz. Ve çift sorgu, tek CPU'lu web process'te doğrudan event-loop işgalidir — W5'in A/B'sini kirletir.
