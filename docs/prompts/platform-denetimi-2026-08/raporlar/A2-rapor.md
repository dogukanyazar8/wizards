# A2 — Performans denetimi

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A2.findings.json`](A2.findings.json)

## Kapsam ve yöntem

Statik analiz temel ağaçta, dinamik ölçüm ana çalışma ağacında. 210 `findMany` çağrı yerinin tamamı parantez-dengeli bir tarayıcıyla (`scan-findmany2.mjs`) sınıflandırıldı; kaba `grep` sayımı yanıltıcıydı ve atıldı (`findMany(queryArgs)` gibi değişken argümanlı çağrıları sınırsız sayıyordu).

**Kapsam dürüstlüğü:** bu eksenin en büyük boşluğu istemci tarafı. En ağır 15 web bileşeninin 4'ü, en ağır 12 mobil ekranın 2'si açıldı. Render tetikleyici analizi (inline prop, context değeri, memo eksikleri) yapılmadı. Bundle boyutu ve mobil soğuk açılış ölçülmedi — ikisi de ayrı bir tur gerektiriyor.

## Bulgu özeti

critical 0 · high 2 · medium 3 · low 0 — toplam **5**

| id     | Başlık                                                   | Sev    | Efor | Dalga |
| ------ | -------------------------------------------------------- | ------ | ---- | ----- |
| A2-001 | Sıcak yayın yollarında oda genişliğinde `fetchSockets()` | high   | M    | W1    |
| A2-002 | Veri dışa aktarma tüm mesaj geçmişini belleğe alıyor     | high   | M    | W1    |
| A2-003 | Web mesaj listesi sanallaştırılmıyor                     | medium | L    | W2    |
| A2-004 | Medya oturumu kapanışında seri N+1                       | medium | S    | W1    |
| A2-005 | Outbox yoklayıcısı her web örneğinde ayrıca çalışıyor    | medium | S    | W1    |

## En ağır bulgular

**A2-001 — `fetchSockets()` sıcak yolda.** `unread-service.ts:604` her okundu hesabında `io.in(channelId).fetchSockets()` çağırıyor; amaç yalnızca `socket.data.userId` kümesini çıkarmak. Redis adapter bağlı (A1'de doğrulandı), yani bu çağrı her Node örneğine gidiyor ve eşleşen **her soketi** serileştirip geri getiriyor. 400 bağlı izleyicide 400 nesne serileştirilir, bir string alanı okunur. Repo bu maliyeti kendi yorumunda kabul etmiş — `server-online-presence.ts:2` — ve orada çözmüş; okundu yolunda çözmemiş. Aynı desen 6 yerde: `unread-service` (2), `workspace-events.ts:69`, `member-service.ts:481`, `invite-service.ts:829`, `voice/service.ts:636`.

**A2-002 — Sınırsız dışa aktarma.** `privacy-service.ts:185` kullanıcının **tüm** `Message` satırlarını `take` olmadan çekiyor; 199'da `dMMessage`, 246'da `notification` için aynısı. Günde 200 mesaj yazan bir kullanıcı bir yılda ~73.000 satır demek. Web sunucusu ve Socket.IO aynı event loop'ta (`server.ts:91-92`), yani bu istek o örnekteki tüm gerçek zaman trafiğini etkiler. Aynı sınırsız desen admin kampanya yolunda dört kez daha var (`notification-campaigns.ts:167, 182, 196, 210`).

**A2-003 — Sanallaştırma yok.** `message-list.tsx:414` `groupedMessages.map` ile sonsuz sorgunun **tüm sayfalarını** render ediyor. `apps/web/src/components` altında hiçbir sanallaştırma kütüphanesi yok (0 eşleşme). Mobilde aynı sorun 23 dosyada FlashList/FlatList ile çözülmüş — web'de çözülmemiş.

## `148 take'siz findMany` sayısı neden bulgu değil

Ham sayı yanıltıcı. 148 çağrının çoğu doğal kardinaliteyle sınırlı: kullanıcının kendi arkadaş istekleri (22 çağrı `friendRequest`), kendi sunucu üyelikleri, bir konuşmanın katılımcıları. Bunlar `take` istemez.

Bulgu yalnız **kullanım ile sınırsızlaşan** çağrılar için yazıldı: `Message`, `DMMessage`, `Notification`, `AppSession`. Örnek olarak incelenip **düşürülenler**:

| Aday                                 | Sonuç                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `message-service.ts:407, 465`        | `queryArgs` değişkeni içinde `take` var — tarayıcı yanlış işaretledi          |
| `message-notification-service.ts:71` | `username: { in: usernames }` ile sınırlı; mention sayısı küçük               |
| `social-enrichment.ts:140, 164`      | görüntüleyenin kendi üyelikleri + `userId in` çarpımı — sınırlı               |
| `socket/handlers/typing.ts:94`       | TTL'li bellek içi önbellek var (`dmParticipantCache`), tuş başına sorgu değil |

## Arandı, temiz

| Hipotez                                  | Sonuç                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Döngü içinde `await prisma` (N+1)        | Tek yer: `analytics/service.ts:452` (A2-004). Başka N+1 bulunamadı.                                               |
| Typing olayı tuş başına DB sorgusu       | **Hayır.** TTL'li önbellek var.                                                                                   |
| Outbox çift işleme                       | **Hayır.** `claimOutboxJobs` `FOR UPDATE SKIP LOCKED` kullanıyor (`service.ts:375`). Sorun yalnız yoklama israfı. |
| Soğuk `typecheck` yavaş                  | **Hayır.** 5 paket, `--force` ile 8,6 s.                                                                          |
| Test süiti geliştirici döngüsünü bozuyor | **Hayır.** Web 32,8 s / 2072 test; mobil 20,2 s / 1669 test.                                                      |

## Sıcak yol tablosu

| Akış                       | Yüzey   | Bilinen maliyet kalemleri                                 | En ağır kalem                   |
| -------------------------- | ------- | --------------------------------------------------------- | ------------------------------- |
| Kanal mesajı gönder        | backend | mesaj yazma, mention sorgusu, okundu fan-out, socket emit | **`fetchSockets()`** (A2-001)   |
| Sohbet aç / geçmişe kaydır | web     | cursor sayfalama (sağlıklı), DOM birikimi                 | **sanallaştırma yok** (A2-003)  |
| Ses odasından çık          | backend | oturum kapatma döngüsü, metrik artırma                    | **seri N+1** (A2-004)           |
| Hesap verisini dışa aktar  | backend | 3 sınırsız `findMany`                                     | **bellek/zaman aşımı** (A2-002) |
| Uygulama açılışı (mobil)   | mobil   | provider zinciri, bootstrap                               | **ölçülmedi**                   |
| Boşta duran sistem         | infra   | N+1 outbox yoklayıcı × 5 s                                | **gereksiz sorgu** (A2-005)     |

## Bütçe önerisi

Bugünkü değerler ölçülmediği için eşikler **hedef**, karşılaştırma değil. A2'nin devamı bunları doldurmalı.

| Sıcak yol                        | Hedef p50 | Hedef p95 | Bugün       |
| -------------------------------- | --------- | --------- | ----------- |
| Mesaj gönder → sunucu onayı      | 80 ms     | 250 ms    | ölçüm eksik |
| Sohbet aç → ilk mesaj görünür    | 150 ms    | 400 ms    | ölçüm eksik |
| Ses odasına gir → bağlandı       | 800 ms    | 2 s       | ölçüm eksik |
| Mobil soğuk açılış → ilk ekran   | 1,2 s     | 2,5 s     | ölçüm eksik |
| `fetchSockets` (500 soketli oda) | —         | 20 ms     | ölçüm eksik |

## Ölçümler

| Metrik                                 | Değer                                      | Ağaç     |
| -------------------------------------- | ------------------------------------------ | -------- |
| `findMany` çağrı yeri                  | 210 (58 `take` var / 148 yok / 4 değişken) | baseline |
| `fetchSockets` çağrı yeri              | 6                                          | baseline |
| cursor / skip sayfalama                | 40 / 7                                     | baseline |
| `$transaction` / ham SQL               | 56 / 27                                    | baseline |
| Web sanallaştırma kütüphanesi          | **0**                                      | baseline |
| Mobil FlashList/FlatList dosyası       | 23                                         | baseline |
| Outbox aralık / batch                  | 5.000 ms / 25                              | baseline |
| Soğuk typecheck (5 paket)              | **8,6 s**                                  | working  |
| Önbellekli typecheck                   | 2,9 s                                      | working  |
| Web testi                              | **2072 pass / 0 fail, 32,8 s**             | working  |
| Mobil testi                            | **1669 pass / 0 fail, 20,2 s**             | working  |
| Web / mobil çalışma zamanı bağımlılığı | 54 / 63                                    | working  |
| Tauri IPC komutu                       | 26 (24 sync, 2 async)                      | baseline |

## Kapı sonucu

```
findings 5 sema disi 0
kanit hatasi 0
metrik 22 method/treeState eksik 0 dinamik olcum 8
```

Üç kontrol de geçti; en az bir gerçek dinamik ölçüm şartı sekiz ölçümle karşılandı.

## Açık sorular

1. **`fetchSockets` gerçek gecikmesi.** Yerel Redis adapter + 100/500/1000 sahte soket ile `io.in(room).fetchSockets()` süresi. A2-001'in severity'si buna bağlı.
2. **Web bundle boyutu.** `ANALYZE=1 pnpm --filter @wizards/web build` — `turbo.json` `ANALYZE` değişkenini zaten taşıyor.
3. **Mobil soğuk açılış.** `MobileStartupPerformanceMarker` ve `apps/mobile/src/performance/**` hazır; gerçek cihaz turu gerekiyor.
4. **Tauri sync komut iş parçacığı.** 24 sync komuttan bazıları `std::fs` çağırıyor (`lib.rs:2699, 2717, 2875, 2974`). Ana iş parçacığındaysa pencere donuyor demektir. `pnpm --filter @wizards/desktop measure:windows`.
5. **Web render tetikleyicileri.** 15 ağır bileşenin 11'i incelenmedi — bu eksenin en büyük kapsam boşluğu.
6. **Mobil FlashList yapılandırması.** 13 yerde `getItemType`/`drawDistance`/`estimatedItemSize` geçiyor; doğru kullanım ekran ekran doğrulanmadı.
7. **Redis round-trip sayısı ve pipeline kullanımı.** A6 kapasite modeli bunu açacak.
