# Dalga 2 · Ş6 — Anket — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

| Katman           | Dosya                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Kart             | `components/messages/message-poll.tsx` (+12 test)                        |
| Oy durumu        | `hooks/use-poll.ts` (+7 sözleşme testi)                                  |
| Oluşturma        | `components/messages/poll-composer.tsx` (+14 test)                       |
| Oy verenler      | `components/messages/poll-voters-sheet.tsx`                              |
| Ortak denetimler | `components/ui/toggle-switch.tsx`, `components/ui/segmented-control.tsx` |

### Bulunan sözleşme boşluğu: anket satıra hiç ulaşmıyordu

Ş2 `poll` alanını `DMMessagePayload`'a eklemişti ama **`ChatMessage`'a eklememişti**, ve web
mesaj listesi `ChatMessage` okuyor. Yani sunucu anketi gönderiyordu, `mapDMMessageToChatMessage`
onu düşürüyordu ve kart hiçbir zaman çizilmeyecekti.

İki yerde kapandı: `ChatMessageSchema.poll` ve `mapDMMessageToChatMessage`'ta taşıma. Anket
mesajın kendisiyle **aynı** yükte geliyor — ayrı bir uçtan çekilseydi otuz mesajlık bir sayfa
otuz istek daha doğururdu.

### Kart saf, durum kancada

Kart yalnız çiziyor ve haber veriyor; oy isteğini, iyimser durumu ve iptali `usePoll` taşıyor.
Ayrım bilinçli: kart sanallaştırılmış listenin içinde, kaydırmayla monte olup çözülüyor.

- **Son istek kazanır.** `AbortController` önceki isteği kesiyor, sıra numarası kesilmemiş ama
  geç dönen yanıtı eliyor. Sinyal gerçekten `fetch`e geçiyor — `screen-client` üç uca
  `signal?: AbortSignal` aldı; geçmeseydi iptal ölü kod olurdu.
- **Sunucu yükü her zaman iyimser durumu bırakır.** Sıfırlama **render sırasında** yapılıyor,
  efektte değil: efektten `setState` fazladan bir render turu doğurur ve kart bir kare boyunca
  bayat durumu çizerdi.
- **Boş küme ayrı uca gider** (`clearPollVote`). Boş bir `PUT` gövdesi sunucuda "hiçbir şey
  seçme" ile "seçimi sil" arasında ayrım bırakmazdı.

### Erişilebilirlik

Tek seçimlide `radiogroup` + `radio`, çoktan seçmelide `group` + `checkbox`. Her seçeneğin
`aria-label`'ı etiket + yüzde + oy sayısı taşıyor (`16:00 · %60 · 3 oy`) — yüzdeyi yalnız renkle
anlatan bir yüzey kalmadı. Dolgu mutlak konumlu ve içeriğin arkasında: genişlerken etiketin
sarmasını değiştirmiyor, yoksa oy geldikçe satır yüksekliği zıplardı.

### karar #11 iki katmanda

`Oy verenleri gör` bağlantısı `canSeeVoters` ile çiziliyor, `!anonymous` diye **türetilmiyor**;
uç zaten anonim ankette 403 veriyor. Bağlantıyı gizlemek tek başına bir koruma sayılmaz.

### Oluşturma modalı

Taslak kuralları `@wizards/types/poll` içinde ve saf; bileşen onları **uyguluyor**, yeniden
yazmıyor. İkiye inince kaldırma butonu **çizilmiyor** (pasif değil): pasif bir çöp kutusu "bir
şey yanlış" der, oysa doğru olan taban sayıdır. Pasif gönder düğmesi nedenini
`aria-describedby` ile taşıyor.

---

## Plandan sapmalar

1. **`lib/polls/client.ts` yazılmadı.** Plan onu Ş2'nin dosyası diye işaretleyip Ş6'ya geçici
   sarmalayıcı öneriyordu. Ş2 istemci yüzeyini `lib/messages/screen-client.ts` olarak
   yazdı ve anket uçlarının hepsi orada; ikinci bir dosya aynı uçların ikinci bir tanımı olurdu.
2. **`use-poll.test.ts` sözleşme testi.** Kanca `fetch`, `AbortController` ve bir React ağacı
   birden istiyor; üçünü düğüm ortamında canlandırmak sınananı kurulum hâline getirirdi. Saf oy
   matematiği `message-poll.test.tsx` içinde gerçek fonksiyonlarla test ediliyor.
3. **Oy verenler sorgusu tembel.** Sheet açılana kadar `fetchPollVoters` çağrılmıyor. Her
   anket kartı için bir istek, hiç tıklanmayacak bir listeyi otuz kez indirmek olurdu.
4. **`toggle-switch` / `segmented-control` yeni yazıldı.** `graphify` bu turda çalışmıyor
   (`WinError 5`); `components/ui` elle tarandı ve karşılığı yoktu (`avatar`, `badge`,
   `context-menu`, `input`, `modal`, `skeleton`, `textarea`).

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3583 / 3583
pnpm --filter @wizards/types test ✔ 435 / 435
```

---

## Açık kalanlar

- Anket oy yarışı (iki eşzamanlı istek) hâlâ gerçek DB istiyor — `e2e:api`, Dalga 3.
- Kartın gerçek tarayıcı davranışı (dolgu geçişi, `prefers-reduced-motion`, hızlı ardışık
  tıklama) Dalga 3'ün `messages-poll.spec.ts`'inde.

---

## Rapor yazarken kapatılan iki eksik

1. **`Oy verenleri gör` hiçbir şey açmıyordu.** Sheet ve uç hazırdı ama kart bir açıcıya
   bağlanmamıştı. `MessagePollSlot` artık sheet durumunu ve tembel sorguyu taşıyor.
2. **Kapanma etiketi boştu** — ayak `" sonra kapanıyor"` yazıyordu. `selectPollCountdown`
   eklendi (`packages/types/src/poll.ts`, +6 test): dakika/saat/gün, **yukarı** yuvarlar.
   Saniye vermiyor, çünkü ayak her saniye yeniden çizilmiyor ve "43 saniye sonra kapanıyor"
   bir kare sonra yalan olurdu. Aşağı yuvarlasaydı 61 dakika kalan bir anket "1 saat" der,
   bir dakika sonra hâlâ "1 saat" derdi ve sayaç ilerlemez görünürdü.
