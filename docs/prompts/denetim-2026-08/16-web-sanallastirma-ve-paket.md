# 16 — Web: mesaj dökümü sanallaştırma ve paket bölme

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 15 landed. Sanallaştırmayı ölü memo'ların üstüne kurmak, kazancı ölçülemez hâle getirir.

## Sorun

İki büyük madde. İkisi de **L** efor ve ayrı ayrı koşulabilir. Bir oturumda ikisini birden yapma.

---

## Madde A — Mesaj dökümü sanallaştırılmıyor

`apps/web/src/components/chat/message-list.tsx:454` · `hooks/use-messages.ts:377` · `app/api/v1/channels/[channelId]/messages/route.ts:29`

Sonsuz sorgu sayfa sayfa ekliyor, hiçbir şey çıkarmıyor. Yirmi sayfa = DOM'da 1000 `MessageItem`; her biri `ReactMarkdown` ağacı, `LinkPreviewCard`, hover/aksiyon alt ağaçları. DOM düğüm sayısı ve bellek geri alınmıyor. Web uygulamasında hiçbir sanallaştırma kütüphanesi yok.

İki yol var, **kullanıcıya sor**:

**A1 — Sanallaştır.** Dinamik satır ölçümlü pencereleme. Doğru çözüm; mobil tarafın FlashList ile yaptığı şeyin web karşılığı.

- Kütüphane seçimi kullanıcının kararı. Yeni bağımlılık ekliyorsun — gerekçesini yaz.
- Dikkat: değişken yükseklikli satır + dipte tutma + "eskiye kaydır" + arama sonucuna atlama. Bu dördü birlikte sanallaştırmanın zor kısmı. Mevcut scroll davranışını **bozma**; 15 no'lu promptta sadeleştirilen scroll planlayıcısıyla birlikte çalışsın.
- Ölçüm: değişiklikten önce ve sonra 500 mesajlık dökümde DOM düğüm sayısı ve bellek. Rakamı raporla.

**A2 — Tutulan sayfa sayısını sınırla.** Yeni sayfa gelince en eskisini cache'ten düş.

- Çok daha ucuz, sanallaştırmanın kazancının belki yarısını verir.
- Kullanıcı yukarı kaydırınca düşen sayfa yeniden çekilir — davranış değişikliği, kullanıcıya söylenmeli.

Önerim: **A2 önce**, ölç, hâlâ yetmiyorsa A1. A1'i "doğru olan bu" diye seçip yarım bırakmak en kötü sonuç.

### Yan madde: link önizleme sorgu patlaması

`apps/web/src/components/chat/link-preview-card.tsx:45` · `message-item.tsx:1086`

URL taşıyan her satır kendi TanStack sorgusunu mount ediyor. Sanallaştırma olmadığından geriye kaydırma tüm sorguları aynı anda mount ediyor; farklı URL'ler dedupe olmuyor. 50 linkli sayfa = `/api/v1/link-preview`'a 50 eşzamanlı istek, her biri sunucuyu üçüncü taraf bir origin'e gönderiyor.

A1 seçilirse bu kendiliğinden çözülür. A2 seçilirse: önizlemeyi yalnız görünür alana yakın satırlar için çek.

---

## Madde B — LiveKit her sayfanın paketinde

`apps/web/src/components/providers/voice-provider.tsx:5`, `:4`, `:148` · `live-voice-provider.tsx:11` · `authenticated-app-providers.tsx:23` · `app/(main)/layout.tsx:40`

`livekit-client` + 3074 satırlık canlı provider + 838 satırlık E2E mock, `(main)` altındaki **her** sayfanın ilk istemci paketinde. Ayarlar, arkadaşlar, DM listesi — ses kanalına hiç girmeyen kullanıcı da indiriyor. Seçim çalışma zamanında bir fonksiyon çağrısıyla yapıldığı için hiçbir bundler eleyemiyor.

Yap:

- Her iki provider'ı `next/dynamic` ile `ssr: false` yükle.
- Layout'tan `voiceFeatures="active"` geçir; LiveKit yalnız bir ses kanalına gerçekten katılınca çekilsin.
- Ölçüm: değişiklikten önce ve sonra `(main)` ilk yük paketi boyutu. Rakamı raporla.

Dikkat: `voiceFeatures="always"` bir yerde bilerek gerekiyor olabilir (gelen çağrı bildirimi?). Provider'ı tembel yapmadan önce hangi yüzeyin ses runtime'ına hazırda ihtiyaç duyduğunu **doğrula**. Gelen çağrı sinyali sokete bağlıysa LiveKit tembel olabilir; değilse kullanıcıya söyle.

---

## Yapılmayacak

- Sohbet ekranının bileşen hiyerarşisini yeniden tasarlama.
- Markdown render'ını değiştirme.
- Mesaj API'sinin sayfa boyutunu değiştirme.
- İki maddeyi tek oturumda yapma.

## Kabul kriterleri

**A:** 500 mesajlık dökümde DOM düğüm sayısı sabit kalıyor (A1) veya tutulan sayfa sayısı sınırlı (A2); dipte tutma, eskiye kaydırma ve arama sonucuna atlama davranışları bozulmadı.

**B:** `(main)` ilk yük paketinde `livekit-client` yok; ses kanalına katılınca yükleniyor ve çağrı çalışıyor.

## Testler

- A2 için: sayfa düşürme mantığı saf fonksiyon olarak test edilir (hangi sayfalar tutulur).
- B için: dinamik import'un varlığını iddia eden bir test zayıf; bunun yerine paket analizi çıktısını rapora ekle.
- İkisi de manuel doğrulama gerektiriyor — 15'in aksine burada ölçüm raporun kendisidir.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

Paket ölçümü için projenin mevcut build/analiz komutunu kullan; yeni analiz aracı **kurma**.
