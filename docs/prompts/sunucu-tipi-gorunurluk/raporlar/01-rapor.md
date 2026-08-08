# 01 — S1 kapanışı raporu

Tarih: 2026-08-07. Dal: `uat`. Commit yok, `git add` yok — iş çalışma ağacında.

---

## 0. Başlangıç durumu (promptla çelişiyor, önce bu okunmalı)

Prompt 01, A/B/C/D/E kusurlarını **açık** varsayarak yazıldı. Çalışma ağacı bu varsayımı
kısmen boşa çıkardı: dosya zaman damgaları, prompt paketinin kendisinden **önce** yapılmış
bir düzeltme turu gösteriyor.

| Dosya                                                  | mtime     |
| ------------------------------------------------------ | --------- |
| `apps/web/src/lib/workspace/workspace-events.ts`       | 18:43     |
| `apps/web/src/lib/workspace/unread-service.ts`         | 18:46     |
| `apps/web/src/lib/socket/server-online-presence.ts`    | 18:47     |
| `apps/web/src/lib/socket/server.ts`                    | 18:49     |
| `docs/prompts/sunucu-tipi-gorunurluk/01-S1-kapanis.md` | **18:53** |

Yani A, B'nin büyük kısmı, C ve D'nin **join zinciri yarısı**, ve E zaten uygulanmıştı.
Bu prompt bunları yeniden yazmadı; denetledi, kalan boşlukları kapattı.

Kapanan gerçek boşluklar: **presence zincirinde eligibility kapısı yok**, **bağlayıcı karar 2
(çoklu socket) hiç uygulanmamış**, **disconnect dayanıklılık testi yok**, **Task 9
incelenmemiş** (bir öksüz bulundu).

---

## 1. Teslim listesine karşılık

### A — kick/ayrılma çevrimiçi setten düşürür ✅ (zaten uygulanmıştı, doğrulandı)

`detachUserFromServerSocketRoom` hem `removeServerOnlineMember` çağırıyor hem
`socket.data.onlineServerIds`'i süzüyor. Kaldırma döngünün **dışında**: canlı socket
kalmasa bile bayat kayıt düşüyor.

Test: `apps/web/src/lib/workspace/workspace-events.test.ts` (2 test) — kick sonrası
`countServerOnlineMembers` düşüyor, ve odada hiç socket yokken bile bayat kayıt siliniyor.
Bu turda yalnız prettier ile biçimlendirildi (kapı `standard-format` adımında kırmızıydı).

### B — yazma yolunda hata izolasyonu ✅ (yarısı yeni)

Zaten vardı: iki yazma yardımcısı `status` kontrolü + `try/catch` taşıyor
(`server-room-cache.ts` deyimi), `getOnlineServerMemberCount` hem `status` hem `try/catch`
koruması aldı ve enjekte edilebilir.

Bu turda eklenen: **disconnect handler'ın kendisi test edilebilir hale getirildi.**
`server.ts` içindeki `disconnect` listener gövdesi `runSocketDisconnectCleanup`'a çıkarıldı
ve `clearInterval` artık **ilk, senkron, koşulsuz** ifade — hiçbir await'in arkasında değil.

Test (`server.test.ts`, "socket disconnect cleanup", 6 test — üçü aşağıdaki karar 2 için):

- Redis'in dört komutu da fırlatırken `cleanup` yine koşuyor, oturum yine kapanıyor,
  heartbeat gerçekten temizlenmiş (interval 5 ms boyunca hiç tetiklenmiyor).
- `cleanup` fırlatırsa oturum kapanışının **hâlâ atlandığı** belgelendi — koşulsuz olan
  yalnız heartbeat temizliği. Bu bilinçli sınır, test onu iddia ediyor.
- `socket.data.appSessionKey` yoksa bağlantının anahtarına düşülüyor.

### Bağlayıcı karar 2 — çoklu socket eksik sayımı ✅ (tamamen yeni)

Ağaçta bulduğum disconnect yolu, karar 2'yi **hiç uygulamamıştı**: socket başına koşulsuz
`srem`. İki sekmeli bir kullanıcı birini kapatınca, diğeri açık olsa bile sunucuda çevrimiçi
görünmeyi bırakıyordu. Karar 2 bunun çözümünü de sabitliyor: ref-counting yok, onun yerine
kaldırmadan önce Socket.IO'ya sor, disconnect başına tek `fetchSockets`.

Uygulama: `resolveReleasableServerIds` (`server.ts`, dosya-yerel). `user:<userId>` odasını
**bir kez** çekiyor, kopan socket'i kimliğinden eliyor, kalan kardeşlerin `rooms` kümesinde
`server:<serverId>` arıyor. Yalnız hiçbir kardeşin tutmadığı sunucular `srem` alıyor.
Yasaklanan şey `fetchSockets`'ın **sayım** yolunda kullanılmasıydı (okuma başına, sunucu
başına); bu yol disconnect başına bir kez koşuyor. `getActiveServerMemberUserIds` karar 3
gereği ellenmedi.

Kardeş sorgusu başarısız olursa **hepsi bırakılır** (fail-open). Yön bilinçli: fazla kaldırma
bir sonraki join/presence olayına kadar eksik sayar, atlanan kaldırma ise kimsenin toplamadığı
bir hayalettir.

Test (3): kardeş socket'in tuttuğu sunucu korunuyor + sorgunun `user:<id>` odasına tek çağrı
olduğu; son socket ise hepsi bırakılıyor (kendi kimliği elense bile); `fetchSockets` fırlarsa
hepsi bırakılıyor.

### C + D — tek tutarlı yarış düzeltmesi ✅ (presence yarısı yeni)

Ağaçta bulunan hâli yalnız **join zincirini** kapatıyordu: `joinServerRoomsForUser` içinde
eligibility kontrolü + uçuş sırasında geri alma. Presence zinciri (`handlers/presence.ts`)
hâlâ ham `addServerOnlineMember` çağırıyordu, yani C'nin aynası açıktı:

> disconnect handler koşar (kaldıracak bir şey bulamaz) → `initializePresence` sonra çözülür
> → `onlineServerIds` artık dolu → koşulsuz ekler → kalıcı hayalet.

Ayrıca `server-online-presence.ts`'in doküman yorumu var olmayan bir fonksiyona
(`presence.ts`'teki `applyServerOnlinePresenceForSocket`) atıf yapıyordu.

Düzeltme: o fonksiyon **gerçekten yazıldı**, ama tek sahibi olan `server-online-presence.ts`
içinde. Üç yazma noktasının hepsi ondan geçiyor:

| Çağıran                              | Eski                                  | Yeni                                 |
| ------------------------------------ | ------------------------------------- | ------------------------------------ |
| `server.ts` `joinServerRoomsForUser` | satır içi kontrol + geri alma         | `applyServerOnlinePresenceForSocket` |
| `presence.ts` `initializePresence`   | `status === "OFFLINE" ? remove : add` | aynı fonksiyon                       |
| `presence.ts` `presence:activity`    | `status === "OFFLINE" ? remove : add` | aynı fonksiyon                       |

Fonksiyon sunucu listesini argümandan değil **`socket.data.onlineServerIds`'ten okur** —
böylece eşzamanlı bir kick'in listeden düşürdüğü sunucu, bayat kopyayla karar vermiş bir
yazıcı tarafından geri eklenemez.

#### Sıralama argümanı (istenen)

İki zincir de `connection` geri çağrısının aynı senkron turunda başlıyor ve sıra garantisi
yok. Düzeltme **kendi alanını önce yazıp diğerininkini sonra okuma** kuralına dayanıyor:

- `joinServerRoomsForUser`: `socket.data.onlineServerIds = serverIds` **sonra** eligibility
  (yani `presenceStatus`) okur.
- `initializePresence`: `socket.data.presenceStatus = presence.status` **sonra**
  `onlineServerIds` okur.

Dört olası kesişim:

1. **Join önce tamamlanır, presence sonra.** Join, `presenceStatus`'ü hâlâ bağlanma-anı
   `"OFFLINE"` varsayılanında (`server.ts:181`) bulur → hiç eklemez. Presence sonra gerçek
   durumu yazar, dolu `onlineServerIds`'i okur → görünür durumda ekler, OFFLINE'da kaldırır.
   ✅
2. **Presence önce tamamlanır, join sonra.** Presence `onlineServerIds`'i boş bulur → hiçbir
   şey yazmaz. Join sonra listeyi yazar, gerçek `presenceStatus`'ü okur → doğru karar. ✅
3. **Disconnect ikisinden de önce çözülür.** Her iki zincir de `connected === false` görür →
   eklemek yerine kaldırır. ✅
4. **Disconnect yazma uçuştayken çözülür.** Eklemelerden sonraki ikinci eligibility kontrolü
   dönüşü yakalar ve geri alır. ✅

Değişmez tek cümlede: **son koşan yazıcı her zaman diğerinin yazdığı alanı okur**, ve
eligibility yazma anında (önceden değil) değerlendirilir. Hangi zincirin kazandığı fark
etmez.

Test: `server-online-presence.test.ts`, "applyServerOnlinePresenceForSocket" (6 test) —
ekler; OFFLINE'da kaldırır; **socket zaten kopmuşsa ONLINE bile olsa kaldırır** (C'nin
presence aynası); uçuş sırasında dönüşte geri alır; sunucu listesini yazma anında okur;
socket hiçbir odada değilse tek komut bile göndermez. Join zincirinin 4 testi
(`server.test.ts`) değişmeden yeşil kaldı — refactor davranışı korudu.

### E — `getOnlineServerMemberCount` test ediliyor ✅ (zaten uygulanmıştı, doğrulandı)

`server-room-cache.ts:79-84` deyimi uygulanmış: opsiyonel redis parametresi +
`setOnlineServerMemberCountRedisForTest`, üretim çağrı yeri değişmemiş. `unread-service.test.ts`
testi silinmemiş, `getOnlineServerMemberCount`'a yeniden hedeflenmiş (3 test: sayım, hazır
değilken komut göndermeden 0, hazırlık kontrolünden sonra fırlayan komutta 0).

Bu turda düzeltilen: `buildOnlinePresenceRedis(status: string)` `exactOptionalPropertyTypes`
altında derlenmiyordu (`Type 'string' is not assignable to type 'RedisStatus'`). Parametre
`ServerOnlinePresenceRedis["status"]` yapıldı. **Kapı bu yüzden kırmızıydı.**

### F — Task 9 incelemesi ✅

| Soru                                      | Cevap                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildServerPublicProfile` saf mı?        | **Evet.** Prisma yok (yalnız `import type`), saat yok, I/O yok. `getServerPublicProfile` prisma'yı dinamik import ediyor, saf yarıyı kirletmiyor.                                                                                                                                     |
| `resolveChannelPermissions` tek yerde mi? | **Evet.** `mobile-invite-preview-service.ts`'teki kopya gerçekten silinmiş, öksüz kalmamış.                                                                                                                                                                                           |
| Alan adları şemayla birebir mi?           | **Evet**, 16/16 (`ServerPublicProfileSchema:396-413`).                                                                                                                                                                                                                                |
| `verified` `features`'tan mı?             | Evet, `features.includes("VERIFIED")`. Testi var.                                                                                                                                                                                                                                     |
| `mutualFriends` 8 mi?                     | Evet, `take: 8`.                                                                                                                                                                                                                                                                      |
| Çevrimiçi sayısı DB'den mi?               | Evet, `serverMember.count` + `status in ["ONLINE","IDLE","DND"]`.                                                                                                                                                                                                                     |
| Gizli kanal testi var mı?                 | **Evet**, "hides channels the default role cannot view". Fixture, `@everyone` maskesi olarak `MEMBER_BASE_PERMISSIONS` kullanıyor — brief'in `1n` değeri `ADMINISTRATOR`'dır ve override'ları kısa devre yapardı, test yanlış nedenle yeşil olurdu. Sapma dosyada yorumlanmış, doğru. |

**Bulunan öksüz (düzeltildi):** `buildMobileInvitePreviewResponse` + `MobileInvitePreviewSource`

- `MobileInvitePreviewSourceChannel` — üretimde çağıranı kalmamıştı, yalnız
  `route-logic.test.ts` onları ayakta tutuyordu (dosyanın kendi yorumu bunu itiraf ediyordu:
  "Kept for route-logic.test.ts"). Kanıtladığı davranış (görünmez kanal projeksiyona girmez)
  artık `server-public-profile-service.test.ts`'te. Fonksiyon, iki tip ve o tek test silindi;
  yerine testte neyin nereye taşındığını söyleyen bir yorum bırakıldı.

**Regresyon kapısı — sonuç:**

- `pnpm --filter @wizards/web test -- --test-name-pattern="invite preview"` → desen
  **filtrelemiyor** (`skipped 0`, 1911 test koştu); pnpm `--` sonrası argümanı runner'a
  node bayrağı olarak geçiriyor. Bunun yerine dosya doğrudan koşuldu: **4/4 yeşil.**
  Prompt "5/5" diyordu; beşincisi yukarıda silinen öksüz testti. **Düşüş bilinçli**, davranış
  kaybı yok.
- `pnpm --filter @wizards/mobile test -- mobile-about-community-2g` → **böyle bir test hedefi
  repoda yok.** `scripts/` altında `about-community` / `2g` adlı dosya yok; 2g ekranının
  istemcisi (`src/about/mobile-community-invite-client.ts`) hiçbir testte adı geçmiyor.
  Prompt'un "mobil 2g 9/9" iddiası doğrulanamaz — ölçtüğü şey yok. Mobil taraf
  `MobileInvitePreviewResponseSchema.parse` ile şemaya bağlı ve yanıt şekli değişmedi;
  tam mobil süit yine de koşuldu (aşağıda), 1654 + 1141 yeşil.

**İncelemede çıkan, düzeltilmeyen iki davranış farkı** (bkz. Bilinen boşluklar): davet
önizlemesinin `memberCount`'u artık canlı `_count.members` değil, denormalize
`server.memberCount` kolonu; ve `getServerPublicProfileWithDatabase` anonim görüntüleyici
için `members` sorgusuna `where: { id: "" }` nöbetçisi koyuyor.

### G — kapı ⚠️ biri yeşil, biri **bize ait olmayan** bir hatayla bloke

Detay aşağıda.

---

## 2. Test sonuçları (gerçek çıktı)

Odaklı, dokunulan dosyalar:

```
ℹ tests 56
ℹ pass 56
ℹ fail 0
```

(`server-online-presence.test.ts`, `server.test.ts`, `workspace-events.test.ts`,
`unread-service.test.ts`, `server-public-profile-service.test.ts`)

Davet önizleme rotası (glob kaçışıyla — `[code]` kaçırılmazsa node hiçbir şey koşmaz,
`scripts/test-glob-path.mjs`):

```
✔ authenticates, rate limits, validates the slug, and preserves the joined flag
✔ returns 404 when the invite service rejects an invalid or expired code
✔ rejects a malformed code before the preview service runs
✔ stops at the rate limit before reading route params
ℹ tests 4  ℹ pass 4  ℹ fail 0
```

Tam web süiti:

```
ℹ tests 1914
ℹ pass 1914
ℹ fail 0
ℹ skipped 0
```

Mobil (node + jest):

```
ℹ tests 1654  ℹ pass 1654  ℹ fail 0
Test Suites: 124 passed, 124 total
Tests:       1141 passed, 1141 total
```

Tip kontrolü (kök): `Tasks: 5 successful, 5 total`.

## 3. Kapı sonucu

**`-Profile Mobile` → PASS.** Beş adımın beşi yeşil (validate:env, tests, component-tests,
release:check, quality:check).

**`-Profile Standard` → FAIL, ilk adımda (`standard-lint`), tek hatayla:**

```
apps/web/src/components/providers/live-voice-provider.tsx
  7:3  error  'LocalTrack' is defined but never used
```

Bu dosya `00-ortak-baglam.md` §1'in **dokunma** listesinde ve eşzamanlı ses işinin canlı
WIP'i (aynı diff son kullanımını silmiş, import'u bırakmış). Düzeltmedim. Lint bir adımda
kısa devre yaptığı için kalan üç adım hiç koşmadı; onları elle koşturdum:

| Standard adımı       | Elle sonuç                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `standard-lint`      | S1'in dokunduğu 10 dosyanın hepsinde `eslint` **temiz**; repoda kalan tek hata yukarıdaki yabancı dosya |
| `standard-typecheck` | **Yeşil**, 5/5 paket                                                                                    |
| `standard-format`    | S1 kod dosyalarının hepsi temiz (üç dosya bu turda `prettier --write` ile düzeltildi); kalanlar yabancı |
| `standard-tests`     | **1914/1914** yeşil                                                                                     |

**Görünür-değişiklik kontrolü (G.3):**
`git status --porcelain -- apps/web/src/components apps/web/src/app` **boş değil**, ama S1'e
ait tek satır şu:

```
 M apps/web/src/app/api/v1/mobile/invites/[code]/preview/route-logic.test.ts
```

— bir birim testi, ekran/bileşen/kopya metni değil. Listedeki diğer her şey (`components/voice/**`,
`components/providers/**`, `components/dm/**`, `app/api/uploadthing/**`, `app/api/v1/dm/groups/**`)
eşzamanlı ses ve grup-DM oturumlarına ait. S1 hiçbir ekran, bileşen veya metin değiştirmedi.

**G.4 (UAT `memberCount` backfill doğrulaması):** yapılmadı — dağıtım gerektiriyor, yerelden
UAT veritabanına bağlanılamıyor. Sahibine devrediliyor. Artık **davet önizlemesi de** bu
kolona bağlı olduğu için backfill koşmadıysa iki yüzey birden sıfır gösterir.

## 4. Sapmalar

1. **`applyServerOnlinePresenceForSocket` `presence.ts`'e değil `server-online-presence.ts`'e
   kondu.** Mevcut doküman yorumu onu presence.ts'te tarif ediyordu. Üç çağıranı var (biri
   `server.ts`'te); yazma yardımcılarının yanında tek sahipli durması, presence.ts'in
   server.ts'ten import etmesinden daha temiz. Yorum düzeltildi.
2. **`runSocketDisconnectCleanup` çıkarıldı** (`server.ts`'te yeni export). B'nin istediği
   test, listener kapanışının içinden erişilemiyordu. Enjeksiyon yalnız test için gerekli iki
   bağımlılıkta: `redis` ve `endSession`. Üretim çağrı yeri davranışı korunuyor, tek fark
   `clearInterval`'in en başa alınması — bu zaten kusurun kendisiydi.
3. **`unread-service.test.ts`'te bir tip düzeltmesi** (`status: string` →
   `ServerOnlinePresenceRedis["status"]`). Promptta yok ama ağaçtaki hâli derlenmiyordu, kapı
   bu yüzden kırmızıydı.
4. **Üç dosya `prettier --write` ile biçimlendirildi** (`server.test.ts`,
   `server-online-presence.ts`, `server-online-presence.test.ts` + sonradan
   `workspace-events.test.ts`, `server-public-profile-service.test.ts`). Kapının
   `standard-format` adımı bunları kırmızı sayıyordu.
5. **Bir test silindi**: `route-logic.test.ts`'teki "never projects a channel the invite viewer
   cannot see". İddia gevşetme değil — kanıtladığı üretim kodu artık yok, aynı davranışın
   testi `server-public-profile-service.test.ts`'te duruyor. Yerine taşınma notu bırakıldı.

## 5. Eklenmeyenler

- **`live-voice-provider.tsx`'teki kullanılmayan import silinmedi** → Standard kapısı kırmızı.
  Dosya dokunma listesinde ve şu anda başka bir oturum tarafından aktif düzenleniyor; bir
  satırlık import silmek onların yarım işine çarpar. Sahibi ya da o oturum kapatmalı:
  `apps/web/src/components/providers/live-voice-provider.tsx:7`.
- **Prompt paketinin markdown dosyaları prettier'a uydurulmadı** (`00`–`04`, `README.md`).
  Kapının `standard-format` adımı onları da sayıyor. Bunlar veri olarak okumam söylenen
  şartname metinleri; biçimlendirici bağlayıcı metni değiştirsin istemedim. Kapatmak
  isteyene: `npx prettier --write docs/prompts/sunucu-tipi-gorunurluk/*.md`.
- **"Devredilen küçük bulgular" listesinin altısı da kapatılmadı.** Prompt kapatmayı zorunlu
  tutmuyordu ("dokunduğun yere denk gelirse ucuzsa kapat") ve hiçbiri bu turda dokunulan
  satırlara denk gelmedi. `getAccessContext`'e `type: true` eklemesi hâlâ en yüksek
  getiri/maliyet oranına sahip olanı.
- **G.4 UAT doğrulaması** — yukarıda.

## 6. Bilinen boşluklar

1. **`cleanup` fırlatırsa `endAppSession` hâlâ atlanıyor.** B yalnız Redis yazma yolunu
   yalıtmayı istiyordu; `cleanupPresence` kendi Redis/DB çağrılarını yapıyor ve fırlatabilir.
   Sınır artık bir testle belgeli, ama kapalı değil.
2. **Kardeş socket sorgusu `rooms` kümesine güveniyor.** Socket.IO, `disconnect` tetiklendiğinde
   kopan socket'i odalarından zaten düşürmüş oluyor; kimlik süzgeci yalnız bunu yapmayan bir
   adaptöre karşı savunma. Redis adaptörü altında `fetchSockets` küme genelinde çalışır, yani
   başka bir düğümdeki sekme de sayılır — istenen bu, ama tek düğümlü yerel testte bu yol
   gerçek adaptörle hiç koşmadı.
3. **Davet önizlemesinde `memberCount` kaynağı değişti**: canlı `_count.members` → denormalize
   `server.memberCount`. S1 sözleşmesine uygun, ama backfill koşmamış bir ortamda önizleme
   sıfır üye gösterir. G.4 tam olarak bunu ölçer.
4. **`where: { id: "" }` nöbetçisi** (`server-public-profile-service.ts:149`) anonim
   görüntüleyici için `members` sorgusunu hiçbir şeye eşlemek üzere kullanılıyor. Çalışıyor
   (boş string bir cuid ile eşleşmez) ama niyeti gizliyor.
5. **`presence.ts` handler'ının kendi test dosyası yok.** Yeni paylaşılan yazıcı doğrudan
   (6 test) ve join zinciri üzerinden (4 test) kapsanıyor; presence handler'ın onu **çağırdığı**
   yalnız kodla görülüyor, testle değil. Handler'ı test etmek `HandlerContext`'in tamamını
   taklit etmeyi gerektiriyor, bu turda maliyeti getirisinden yüksekti.
6. **`verificationLevel` hâlâ hiçbir okuma yolunda kullanılmıyor** ve varsayılanı hiçbir test
   doğrulamıyor (devredilen bulgu #1). `verified` `features`'tan geliyor; kolon şu an ölü.
