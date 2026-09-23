# F-01–F-05: doğrulama ve çözüm analizi

Tarih: 2026-09-21. Branch: `main`. HEAD: `95493d2815b6f2439d79ccf3071380f673860c45`.

Mevcut çalışma alanı, WIP dahil incelendi. Beş bulgunun kök dosyalarında HEAD ile fark yok: socket modülleri, `socket-provider.tsx`, `use-messages.ts`, `chat-area.tsx`, admin sayfaları ve `proxy.ts`. Bağımlı alanlarda mevcut kullanıcı değişiklikleri var; bunlar korunmuştur. Kaynak koduna düzeltme uygulanmadı. Alt ajan kullanılmadı. Graphify sorguları gezinme için kullanıldı; sonuçlar güncel kaynak ve yerel deneylerle doğrulandı. Graph dosyası 2026-09-20 tarihli; bağımsız güncellik kanıtı sayılmadı.

## Sonuç

| Bulgu | Karar                                                                                                            | Çözüm önerisindeki düzeltme                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01  | Gerçek; “her deploy/tüm kullanıcılar” ifadesi fazla kesin. HIGH korunabilir.                                     | Deploy drain için önce namespace disconnect döngüsünü kaldırıp mevcut `io.close()` davranışını kullan. Oturum iptalini otomatik yeniden bağlama ile karıştırma. |
| F-02  | Gerçek; reconnect sonrası mesaj cache’i yenilenmiyor. HIGH korunabilir.                                          | Sadece invalidation yeterli değil: bekleyen mesajları koru, abonelik ve HTTP/event yarışını kapsa.                                                              |
| F-03  | Gerçek; kanal ve DM etkileniyor. MEDIUM.                                                                         | Mevcut ack sözleşmesini kullan; global hatadan son balonu seçmeyi kaldır. Nonce tekilleştirmesi zaten mevcut.                                                   |
| F-04  | Gözlenen davranış gerçek; bağımsız bir güvenlik hatası değil, bilinçli fail-closed tercihi ve toparlanma sorunu. | “Üç DB hatasına kadar açık tut” önerisini uygulama. Güvenli kapanma korunarak geçici altyapı hatası ile iptal ayrılmalı.                                        |
| F-05  | 15 sayfada yetki kararı beklenmeden yükleyici çağrısı doğrulandı. MEDIUM.                                        | Önce sayfa yetkisi, sonra yükleyiciler. Proxy koruması ikinci katman; modül yetkisinin yerine geçmez.                                                           |

## F-01 — Sunucu koparmasından sonra toparlanma

### Kanıt

- `apps/web/src/lib/socket/client.ts:31`: `reconnectionAttempts: 5`; aralık 1–5 saniye.
- `apps/web/src/components/providers/socket-provider.tsx:16`: bağlantı yalnız effect başlangıcında kuruluyor; cleanup açıkça disconnect ediyor.
- `apps/web/src/lib/socket/drain.ts:42`: soketler `disconnect(true)` ile kapatılıp ardından `server.close()` çağrılıyor.
- `apps/web/src/lib/socket/runtime.ts:39`: oturum iptali de `disconnectSockets(true)` kullanıyor. Aynı istemci nedeni hem deploy hem iptal için üretilebiliyor.
- [Socket.IO sözleşmesi](https://socket.io/docs/v4/client-socket-instance/): `io server disconnect` otomatik yeniden bağlanmaz; transport kaybı bağlanmayı deneyebilir. Middleware reddi de otomatik retry başlatmaz.

Kurulu Socket.IO 4.8.3 ile gerçek localhost sunucu/istemci deneyi; mevcut drain fonksiyonu kaynak kodundan doğrudan çalıştırıldı. Kapanan sunucunun yerine aynı portta yenisi açıldı:

| Senaryo                     | Transport | İstemci nedeni         | Otomatik bağlantı aktif | Yeni sunucuya bağlandı                   |
| --------------------------- | --------- | ---------------------- | ----------------------- | ---------------------------------------- |
| Doğrudan `disconnect(true)` | polling   | `io server disconnect` | Hayır                   | Hayır; eski sunucu açıkken de bağlanmadı |
| Doğrudan `disconnect(true)` | websocket | `io server disconnect` | Hayır                   | Hayır; eski sunucu açıkken de bağlanmadı |
| Mevcut uygulama drain’i     | polling   | `transport error`      | Evet                    | Evet                                     |
| Mevcut uygulama drain’i     | websocket | `io server disconnect` | Hayır                   | Hayır                                    |
| Yalnız Socket.IO `close()`  | polling   | `transport error`      | Evet                    | Evet                                     |
| Yalnız Socket.IO `close()`  | websocket | `transport close`      | Evet                    | Evet                                     |

İlk varsayımlı probe, polling'de `io server disconnect` beklediği için başarısız oldu; gerçek sonuç `transport close` idi. Sonraki kontrollü matriste `transport error` gözlendi. Bu farklılık raporun mutlak ifadesine karşı kanıttır; transport kapanış yarışını normalleştirip gizlemek yerine kapsam daraltıldı.

“Ağ kesintisi yaklaşık 20 saniyeyi aşınca kesin kopar” da sabit eşik değildir: beş deneme, jitter, handshake süresi ve tarayıcı zamanlaması etkiler. Beş denemelik sınır gerçek; kesin süre ölçülmedi. Mobilin bütün kopma türlerinden etkilenmediği bu incelemede doğrulanmadı.

### Önerilen en küçük çözüm

1. Deploy drain’de soket başına `disconnect(true)` döngüsünü kaldır. Sayaç gerekiyorsa kapanış öncesi map boyutunu al; mevcut `server.close()` ve grace süresini koru. İlgili yorum ve test beklentisini değiştir. [Socket.IO `close()`](https://socket.io/docs/v4/server-api/#serverclosecallback) HTTP sunucusunu da kapatır; bu davranışı ayrıca tekrar tasarlamak gerekmiyor.
2. Normal transport kayıplarında beş denemelik kalıcı durmayı kaldır. Kütüphanenin artan ve üst sınırı olan gecikmesini, jitter’ını kullan; ikinci bir bağımsız retry döngüsü kurma.
3. `online`/görünürlük olayları yalnız hâlâ geçerli oturumun toparlanmasını uyandırsın. Logout, unmount veya doğrulanmış iptal sonrasında yeniden bağlamasın; aktif Manager denemelerini sürekli başa döndürmesin.
4. Revalidation altyapı hatalarını F-04 ile birlikte ele al. Her `io server disconnect` için sınırsız `connect()` eklemek gerekli değildir; iptal ve geçici kopma sözleşmesini korumak daha küçük ve güvenli çözüm.

**Kabul:** gerçek Socket.IO ile polling + WebSocket kapanış/yeni sunucu testi; uzun kesinti sonrası toparlanma; logout/iptal sonrasında retry olmaması; unmount sırasında timer/listener temizliği. Ardından tarayıcı ve Tauri’de gerçek deploy kabulü. Yerel deney, Railway rollout kabulü değildir.

## F-02 — Reconnect sonrasında eksik mesajlar

### Kanıt ve sınır

- `apps/web/src/hooks/use-messages.ts:430`: infinite query; `:445` `staleTime: Infinity`.
- `:583`: mount ve `connect` yalnız `channel:join`/`dm:join` gönderiyor.
- `apps/web/src/lib/query-client.ts:9`: focus refetch kapalı. TanStack ağ reconnect’i de Infinity nedeniyle bu veriyi stale saymıyor.
- `apps/web/src/components/shell/wizards-shell.tsx:886`: `channel:messages:stale` geldiğinde invalidation var. Ancak kopuklukta kaçırılmış olayı geri getirmez; yeni bir olay bazen cache’i sonradan düzeltebilir. “Hiçbir telafi yolu yok” yerine “reconnect için güvenilir telafi yok” denmeli.

Gerçek `useMessages` kodu + kurulu TanStack `InfiniteQueryObserver` ile izole deney: React effect çağrıları test düzeneğince çalıştırıldı, HTTP stub kullanıldı. İlk fetch sonrası sunucu verisine ikinci mesaj eklendi. Socket `connect` ve online false/true sonrasında fetch sayısı **1** kaldı; yeni mesaj yoktu. Açık invalidation sonrası **2** oldu; mesaj geldi.

Aynı deneyde cache’e `deliveryStatus: sending` taşıyan yerel balon eklenip düz invalidation yapıldığında balon silindi. Bu, rapordaki tek satırlık önerinin korunması gereken kullanıcı durumunu atladığını gösterir. Tam React UI/E2E deneyi değildir.

### Önerilen çözüm

1. Mevcut `useMessages` akışında bağlantı geri geldiğinde ilgili mesaj query’sini stale işaretle ve aktif konuşmayı yenile. İnaktif konuşma cache’leri de stale olmalı; sonradan açılan konuşma Infinity nedeniyle eski kalmamalı. İnaktif cache’leri hemen topluca indirme.
2. “İlk connect’i daima atla” kuralı kullanma: HTTP geçmişi socket kurulmadan önce yüklenmişse arada da mesaj kaçabilir. Abonelik hazır olduğunda eldeki cache’i güvenilir snapshot ile eşitle; aynı query için üst üste istekleri birleştir.
3. Kanal aboneliği asenkron yetki ve presence işi içeriyor (`handlers/channel.ts:59`). HTTP yenilemesini subscribe tamamlanmasına bağlayan isteğe bağlı join ack küçük bir çözümdür. Mevcut eski istemciler ack göndermek zorunda bırakılmamalı. DM’de mesaj fan-out’u kullanıcı odasına yapıldığından aynı oda bağımlılığını körlemesine varsayma.
4. Refetch sonucu uygulanırken gönderiliyor/başarısız yerel mesajları koru. F-03’teki pending payload ve nonce’ları yeniden kullan; ayrı kalıcı offline kuyruk kurma. Echo/ack ile doğrulananı tekrar üretme. HTTP sürerken gelen socket mesajının daha eski HTTP sonucu tarafından silinmesini de test et; uzlaştırmayı mevcut mesaj-cache yardımcılarına yerleştir.
5. Shell düzeyinde `dmQueryKeys.list`, `workspaceQueryKeys.servers`, aktif server detail ve `homeQueryKeys.summary` gibi kaybolan olaylara bağımlı sorguları hedefli yenile. Mesaj ve shell yenilemesini aynı yerde iki kez başlatma. Query cache’in tamamını temizleme.
6. Mevcut GET uçlarını kullan. Delta endpoint, event replay, yeni aracı servis veya event store bu düzeltme için gerekli değil. [TanStack infinite-query refetch](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) yüklenmiş sayfaları sırayla yeniler; uzun geçmişte maliyeti ölç, kullanıcı geçmişini sessizce kırpan optimizasyon ekleme.

**Kabul:** kopuklukta üç yeni mesaj; bir edit/delete; yeniden bağlanınca hepsi doğru. Kanal + DM, ilk bağlantı aralığı, inaktif cache’e dönüş, oda yetki reddi, HTTP/event yarışı, bekleyen/başarısız balonun korunması, uzun geçmiş ve duplicate olmaması. “Üç saniye” gibi hedef kontrollü veri/ağ koşuluyla tanımlanmalı; genel garanti değildir.

## F-03 — Ack eksikliği ve yanlış hata eşleştirme

### Kanıt

- `apps/web/src/components/chat/chat-area.tsx:873`: kanal ve DM ilk gönderimi ack’siz; `:907` retry de ack’siz.
- `:721`: hata, `pendingOrderRef` içinde sondan bulunan balona uygulanıyor. Kanal kodları whitelist; DM’de tüm `dm:error` olayları aynı davranışa giriyor.
- `apps/web/src/lib/socket/handlers/message.ts:163`: hata ack’i mevcut; `:334` commit sonrası başarı ack’i mevcut.
- `apps/web/src/lib/socket/handlers/dm.ts:534`: DM de ack destekliyor.
- `apps/web/src/lib/socket/events.ts:130`: ortak `MessageSendAck` tipi mevcut.
- `packages/db/prisma/schema.prisma:1776` ve `:2195`: kanal ve DM için `@@unique([userId, clientNonce])`. `apps/web/src/lib/messages/client-nonce.ts:73` yarışta unique conflict’i de uzlaştırıyor. Bu mekanizma yeniden yazılmamalı; canlı DB’de migration uygulanma durumu burada doğrulanmadı.

Gerçek hata effect’i AST üzerinden çıkarılıp iki pending nonce ile çalıştırıldı. İlk gönderime ait hata hem kanal hem DM’de **ikinci nonce’u** failed yaptı. Ayrıca kanal `SLOW_MODE` reddi whitelist dışında kaldığı için **hiçbir balon işaretlenmedi**. Bu yeni ayrı kapsam değil, aynı eksik hata eşleştirmesinin ek örneğidir. Join, typing veya başka DM işlemlerinin global hatası da pending mesaja yanlış bağlanabilir.

### Önerilen çözüm

1. İlk gönderim ve retry için aynı küçük ack’li gönderim yolunu kullan. `socket.timeout(10_000).emit(...)` başlangıç bütçesi olabilir; gerçek uçtan uca gecikmeye göre ayarlanır. Closure nonce’u ve konuşma query key’ini sabit yakalasın.
2. `ok:false` sadece ilgili pending balonu etkilesin. Global `error`/`dm:error` içinden “son balon” seçimi kaldırılsın. Hata bildirimi başka UI tarafından kullanılabilir; bu event’leri sunucudan topluca kaldırma.
3. Başarı ack’i DB kabulünü ifade eder; alıcının teslim/okuma onayı değildir. `messageId` ile doğru balonu uzlaştır, ardından normal echo/canonical veriyle tamamla. Mevcut tipte olmayan `sent` durumunu rastgele ekleme; `deliveryStatus` şu anda yalnız `sending | failed` veya yok.
4. Timeout “sunucu kaydetmedi” kanıtı değildir. İçeriği/ekleri/reply bilgisini koru; kullanıcıya gönderimin doğrulanamadığını bildir. Retry aynı `clientNonce` kullanmalı. Geç echo doğrulayabilsin; eski denemenin geç callback’i yeni denemeyi veya doğrulanmış mesajı failed yapmasın.
5. Sunucudan gelen global hata payload’una nonce eklemek, ack closure kullanıldığında şart değil. En küçük düzeltme mevcut sözleşmeyi kullanır; nonce’lu hata olayı ancak başka tüketici ihtiyacı varsa ayrıca eklenir.

**Kabul:** iki eşzamanlı gönderim ve ters sırada yanıt; slow-mode/permission/rate-limit reddi; unrelated DM error; offline timeout; echo önce/ack sonra; timeout sonrası echo; retry sonrası eski callback; aynı nonce ile tek kayıt; konuşma değişiminde hatanın yeni konuşmayı etkilememesi. Birim testte gerçek DB tekilleştirmesi kanıtlanmış sayılmaz; bu son durum izole integration testi ister.

## F-04 — DB hatasında session revalidation

### Karar: davranış doğru aktarılmış, önerilen çözüm güvenlik bakımından eksik

- `apps/web/src/lib/socket/session-revalidation.ts:91`: batch loader hatasında snapshot’taki web soketleri kapatılıyor. Mobil soketler `:75` filtresiyle bu kontrolden çıkarılıyor.
- `apps/web/src/lib/socket/session-revalidation.test.ts:147`: bu davranışı açıkça isteyen “fails closed” testi var; bu çalışmada geçti.
- `apps/web/src/lib/auth/auth-session-service.ts:293`: revoke bildirimi best-effort; hata yakalanıp loglanıyor. Bu bildirim mekanizmasının varlığı, iptalin her instance’a kesin ulaşmasının kanıtı değildir.
- `apps/web/src/lib/auth/session-revocation.ts:49`: `active | revoked | unavailable` ayrımı zaten var.
- `apps/web/src/lib/socket/authentication.ts:61`: aktif olmayan sonuçlar null’a indirgeniyor. `apps/web/src/lib/socket/server.ts:582` ve catch bloğu aynı `Unauthorized` yanıtını veriyor. Böylece geçici doğrulama hatası ile gerçekten geçersiz oturum istemciden ayırt edilemiyor.

Bir DB kesintisinde bağlantıların kapanması erişilebilirliği düşürür. Ancak oturum geçerliliği doğrulanamıyorsa korunan olayları almaya devam etmemesi güvenli tercihtir. Salt üç hata saymak; kayıp revoke bildirimi, ban/delete, son kullanma tarihi ve yavaş/asılı sorgu altında yeterli güvenlik sınırı değildir. Üç periyot da sorgu süresi nedeniyle kesin 90 saniye anlamına gelmez. Reconnect fırtınasının büyüklüğü ölçülmedi.

### Önerilen çözüm

1. Varsayılan fail-closed kalsın; mevcut güvenlik testini tersine çevirmeyelim.
2. Geçici altyapı erişilememe durumu ile geçersiz/iptal/süresi dolmuş oturum ayrımını socket sınırına kadar taşı. İç DB hatası veya stack istemciye verilmeden sabit hata kodu ve retry edilebilirlik bilgisi yeterlidir.
3. Altyapı hatasında soketi yetkili odalarda açık bırakma. Yeniden bağlanabilir transport kapanışı veya açık geçici kapanış sözleşmesi kullan. Her denemede middleware tekrar doğrulasın; başarısız kontrolde hiçbir oda/event yetkisi verilmesin.
4. Middleware reddi Socket.IO’nun normal reconnect döngüsünü durdurduğundan, yalnız açıkça geçici sınıfa ait red için jitter’lı, üst gecikmesi sınırlı retry gerekir. Gerçek iptal/ban/eksik oturum, logout ve unmount terminaldir. Tüm `Unauthorized` hatalarını tekrar denemek çözüm değildir.
5. Var olan log’a ek olarak ardışık altyapı hatası, son başarılı kontrol yaşı ve yeniden bağlanma oranını mevcut telemetry ile ölç. Yeni devre kesici/cache altyapısı kurma.

Fail-open/grace ancak ayrıca kararlaştırılmış risk politikasıyla değerlendirilebilir. Böyle bir tercih istenirse son başarılı doğrulamadan itibaren mutlak zaman sınırı, bilinen expiry, anlık iptal, dağıtık hata ve hassas eylem kontrolleri gerekir. Bu analizde önerilmiyor.

**Kabul:** tek DB hatasında korunan event akışı kesilir; DB düzelince geçerli oturum geri bağlanır. Aynı kesintide iptal edilen/banlanan/süresi dolan oturum dönemez. Middleware geçici red ile kalıcı red ayrı test edilir. Timer sızıntısı ve yoğun reconnect dalgası kontrollü ortamda ölçülür.

## F-05 — Yetkiden önce admin veri yükleme

### Doğrulama

Kaynak/denetim/işlem zinciri: anonim `GET /admin/voice`; `proxy.ts:197` admin’i korumuyor; page fonksiyonundaki `Promise.all` guard ve yükleyiciyi birlikte başlatıyor; `snapshots/voice.ts:45` dört DB işlemini başlatıyor. Sayfanın kendi guard reddi render’ı durduruyor; burada veri sızıntısı gösterilmedi.

Gerçek `proxy()` fonksiyonu sentetik `NextRequest`, cookiesiz istek ve test secret ile çalıştırıldı:

| Yol            | Sonuç                        |
| -------------- | ---------------------------- |
| `/admin`       | 200 + `x-middleware-next: 1` |
| `/admin/voice` | 200 + `x-middleware-next: 1` |
| `/channels`    | 307, `/login`                |

Bu 200, admin sayfasının HTTP cevabının başarılı olduğu anlamına gelmez; yalnız proxy’nin isteği ileri geçirdiğini kanıtlar.

Gerçek 17 admin page fonksiyonu, reddeden guard ve loader spy’ları ile çalıştırıldı. **15’i guard reddine rağmen yükleyici çağırdı**:

`/admin`, `/admin/analytics`, `/admin/audit`, `/admin/feedback`, `/admin/flags`, `/admin/health`, `/admin/help`, `/admin/moderation`, `/admin/notifications`, `/admin/releases`, `/admin/releases/[releaseId]`, `/admin/servers`, `/admin/support`, `/admin/users`, `/admin/voice`.

Negatif kontroller: `/admin/moderation/[caseId]` ve `/admin/notifications/[campaignId]` önce guard’ı bekliyor; yükleyici çağrısı **0**. Mevcut doğru proje kalıbı doğrudan yeniden kullanılabilir.

Gerçek `loadAdminVoiceSnapshot` ayrıca DB spy ile çalıştırıldı: `voiceState.count`, `voiceState.groupBy`, `mediaUsageSession.findMany`, `mediaUsageSession.groupBy`. Bu fonksiyonda ek authentication yok. Diğer sayfalarda yükleyici çağrıları doğrulandı; her yükleyicinin tüm sorgu sayısı/maliyeti ölçülmedi.

`admin/layout.tsx` içindeki yetki kontrolü page içindeki paralel çağrıyı iptal eden bariyer değildir. [Next.js authentication rehberi](https://nextjs.org/docs/app/guides/authentication#layouts-and-auth-checks) kontrolleri veri kaynağına/korunan bileşene yakın tutmayı önerir. Build log’u tek başına anonim üretim DoS kanıtı değildir. Tam Next HTTP render, gerçek DB maliyeti ve CDN/WAF etkisi bu çalışmada ölçülmedi; bulgu kaynak + izole fonksiyon çalıştırmasıyla doğrulanmıştır.

### En küçük çözüm

```ts
const admin = await requireAdminModule("dashboard.read");
const [activity, overview, servers] = await Promise.all([
  getAdminActivitySnapshot(days),
  getAdminOverviewSnapshot(days),
  getAdminServersSnapshot(days),
]);
```

- 15 sayfada önce `await requireAdminModule(...)`; ardından bağımsız veri yükleyicileri paralel kalabilir. Yeni admin framework/wrapper gerekli değil.
- `/admin` ve `/admin/` alt yollarını proxy’de koru. `/administrator` gibi ilgisiz prefix’leri kapsama. Proxy yalnız ucuz oturum ön kontrolü; aktif DB oturumu ve modül yetkisi sayfada korunur.
- Anonim, giriş yapmış admin olmayan, yanlış admin rolü ve doğru rol testleri ayrı olmalı. Guard beklemedeyken ve reddedildiğinde yükleyici çağrısı sıfır; başarılı karardan sonra beklenen yükleyiciler çağrılmalı.
- Sayfa authentication sorgularını “hiç DB çağrısı olmamalı” şartıyla karıştırma. Sıfır olması gereken, yetki verilmeden yapılan admin iş verisi/aggregate sorgularıdır.
- Build’in logunda hata görünmemesi destekleyici kontroldür; asıl regresyon testi guard/loader sıralamasıdır. Ek rate limiter bu sıralama hatasının yerine geçmez.

## Uygulama sırası ve sınırlar

1. **F-05:** bağımsız, düşük karmaşıklık; 15 sayfa + proxy + davranış testleri.
2. **F-01 deploy kısmı:** mevcut drain testini gerçek Socket.IO transport testiyle tamamla; close-only yaklaşımı ve normal ağ retry sınırını düzelt.
3. **F-03 ve F-02 birlikte:** önce gönderim nonce/ack sahipliğini netleştir; sonra reconnect snapshot uzlaştırması. Aynı cache’i yönettikleri için ayrı tasarımlar kurma.
4. **F-04 toparlanma sözleşmesi:** güvenliği gevşetmeden geçici doğrulama hataları ve terminal iptali ayır. F-01 lifecycle yönetimiyle aynı retry sahibini kullan.

Yeni bağımlılık, migration, mikroservis, event store veya geniş refactor bu beş maddeyi çözmek için gerekli görünmüyor. Test ve native kabul yapılmadan saat/gün tahmini veya gerçek kullanıcı performans kazanımı kesinleştirilmedi.

## Çalıştırılan doğrulama

**PASS:** sekiz test dosyası, **43 test**, sıfır fail/skip:

```powershell
# apps/web altında; process-local DATABASE_URL yalnız localhost port 1 test adresi.
node --import tsx --test --test-force-exit --test-reporter=spec `
  src/lib/socket/drain.test.ts `
  src/lib/socket/session-revalidation.test.ts `
  src/lib/socket/authentication.test.ts `
  src/hooks/use-messages.test.ts `
  src/lib/messages/client-nonce.test.ts `
  src/lib/socket/handlers/message.test.ts `
  src/lib/socket/handlers/dm.test.ts `
  src/lib/admin/module-access.test.ts
```

Bu testlerin geçmesi bulguların olmadığı anlamına gelmez: mevcut drain testi istemcinin geri bağlandığını sınamıyor; cache testleri reconnect’i, guard testleri sayfaların loader sırasını sınamıyor. Revalidation fail-closed davranışını ise özellikle doğruluyorlar.

**PASS:** altı gerçek localhost Socket.IO senaryosu; gerçek hook/TanStack cache deneyi; iki modda gerçek hata callback’i; 17 gerçek admin page fonksiyonu; gerçek voice loader + DB spy; üç rota için gerçek proxy fonksiyonu.

**NOT RUN:** tam uygulama HTTP/E2E, gerçek DB/Redis integration, canlı yük testi, Railway rollout, Tauri/mobile runtime, CI ve tam suite. Next uygulaması başlatılmadı; yerel gerçek servis anahtarları/işçileri kullanılmadı.

Probe ve JSON kanıtları: `C:\Users\doguk\AppData\Local\Temp\codex-security-scans\Wizards\95493d28_20260921_f01-f05-validation\`. Bunlar geçici dizinde; kalıcı karar ve kritik gözlemler bu rapora aktarılmıştır.

İnceleme ana raporu değiştirmez. F-01’in mutlak kapsamı, F-02’nin yalın invalidation önerisi ve F-04’ün fail-open önerisi yukarıdaki düzeltmelerle okunmalıdır.
