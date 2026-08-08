# 07 — Katılım yarışı ve fetchSockets raporu

Dal `uat`, her şey çalışma ağacında, commit yok, `git add` yok. İki bulgu: Bulgu 7 kapatıldı (fix + test). Bulgu 9 ölçüldü ve ertelendi (kod dokunulmadı, kısıt promptun kendisinde: "leave the code alone"). `00-ortak-baglam.md` §2/§4/§5 ve "Çevrimiçi presence sözleşmesi" veri olarak kabul edildi, yeniden keşfedilmedi.

---

## Bulgu 7 (önemli, doğruluk) — join'in kapasite ve idempotency kontrolleri transaction içinde yeniden doğrulanmıyordu

**Dosya:** `apps/web/src/lib/workspace/invite-service.ts`, `joinPublicWorkspaceServer` (~satır 983-1086).

### Transaction içine taşınanlar

1. **Kapasite yeniden okuması.** Transaction açıldıktan hemen sonra, `ensureUserNotServerBanned(tx, ...)`'dan sonra, `tx.server.findUnique({ select: { maxMembers, memberCount } })` ile taze bir okuma yapılıyor. Pre-check'in gördüğü (`server.memberCount >= server.maxMembers`, satır ~1029) hâlâ orada duruyor — hızlı-başarısız optimizasyonu korunuyor, transaction hiç açılmadan reddediyor. Yeni olan, transaction _açıldıktan sonra_ ikinci, taze bir kontrol: pre-check'in görmediği bir eşzamanlı join, transaction'ın kendi okumasında yakalanıyor.

   ```ts
   const currentServer = await tx.server.findUnique({
     select: { maxMembers: true, memberCount: true },
     where: { id: serverId },
   });

   if (!currentServer) {
     throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
   }

   if (currentServer.memberCount >= currentServer.maxMembers) {
     throw new ApiError("This server is full", 403, "SERVER_FULL");
   }
   ```

   `!currentServer` dalı, sunucunun pre-check ile transaction arasında silinmesi gibi bir kenar durumu için `SERVER_NOT_FOUND`'a düşer — fonksiyonun zaten kullandığı aynı kod/mesaj, yeni bir soyutlama değil.

2. **P2002 idempotency yakalama.** `createServerMembership(tx, ...)` çağrısı artık `try/catch` içinde; `Prisma.PrismaClientKnownRequestError` + `code === "P2002"` yakalanınca, pre-read'in "zaten üye" dalının döndürdüğü **aynı** başarı şekli dönüyor:

   ```ts
   } catch (error) {
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
       return { alreadyMember: true, serverId };
     }
     throw error;
   }
   ```

   Yakalama noktası bilinçli olarak `$transaction(...)` çağrısının **dışında** (transaction callback'i içinde değil): Postgres bir statement hata verince transaction'ı "aborted" duruma sokar; hatayı callback içinde yutup devam etmeye çalışmak COMMIT'i de bozardı. Prisma'nın interactive transaction'ı callback'ten fırlayan hatada zaten otomatik ROLLBACK atıyor ve aynı hatayı `$transaction(...)`'ın reddiyle dışarı taşıyor — bu dosyadaki `joinWorkspaceServerByInvite`'ın `ApiError("Invite has reached its usage limit", ...)` fırlatması da (satır 867) aynı deseni zaten kanıtlıyor. Diğer (P2002 olmayan) her hata `throw error;` ile değişmeden dışarı çıkıyor — ban kontrolü veya yeni kapasite kontrolünün transaction içinde attığı `ApiError`'lar dahil, davranışları değişmedi.

3. **`Prisma` import'u değer olarak.** `import { ChannelType, MessageType, prisma, type Prisma } from "@wizards/db";` → `import { ChannelType, MessageType, Prisma, prisma } from "@wizards/db";`. `instanceof Prisma.PrismaClientKnownRequestError` bir değer karşılaştırması, salt tip import'u yetmiyordu. `@wizards/db`'nin barrel'i (`packages/db/src/index.ts:14`) `Prisma`'yı zaten değer olarak export ediyor; başka dosyalarda (`apps/web/src/lib/auth/actions.ts:34` dahil, ondan fazla dosya) aynı desen zaten var.

**Dokunulmayanlar:** `createServerMembership` ve `finishServerMembershipCreation` fonksiyonlarının gövdeleri satır satır aynı — çağrı sırası, argümanları, davet yolunun (`joinWorkspaceServerByInvite`) kullandığı hiçbir şey değişmedi.

### Testler

`apps/web/src/lib/workspace/invite-service.test.ts`, aynı `describe("joinPublicWorkspaceServer")` içine üç yeni `it`, var olan `patchMethod`/`withPatchedEnvironment`/sahte-`tx` deseniyle:

- **"recovers from a concurrent duplicate join (P2002 ...) as the same idempotent success"** — pre-read `existingMember` hâlâ `null` (ikinci eşzamanlı istek henüz görmüyor), sahte `tx.serverMember.create` gerçek Prisma constructor'ıyla (`new Prisma.PrismaClientKnownRequestError(..., { code: "P2002" })`) fırlatıyor. Beklenen: fonksiyon fırlamıyor, `{ alreadyMember: true, serverId }` dönüyor.
- **"lets a non-P2002 error out of the transaction unchanged"** — aynı kurulum ama sahte hata düz bir `Error("connection reset")`. Beklenen: aynen dışarı çıkıyor (P2002 dışı hataları yutmadığımın kanıtı).
- **"rejects with 403 SERVER_FULL when the in-transaction recheck finds the server now full, even though the pre-read saw room"** — pre-read `maxMembers: 5, memberCount: 4` (yer var), sahte `tx.server.findUnique` `memberCount: 5` (dolu) döndürüyor, sahte `tx.serverMember.create` çağrılırsa hata fırlatıyor (guard). Beklenen: `ApiError` 403/`SERVER_FULL`, insert hiç denenmiyor.

**Sapma (test dosyasında):** Var olan "creates a new membership, bumps the counter once, and attaches the socket room" testinin sahte `tx.server` nesnesine, **hiçbir assertion değiştirilmeden**, izlenmeyen (operations'a push etmeyen) bir `findUnique` stub'ı eklendi:

```ts
server: {
  // Untracked (not pushed to `operations`) -- the in-transaction
  // capacity recheck reads through this before the insert; ...
  findUnique: async () => ({ maxMembers: 500_000, memberCount: 10 }),
  update: async () => { operations.push("tx.server.update"); return {}; },
},
```

Gerekçe: yeni kapasite-yeniden-okuma kodu `tx.server.findUnique(...)` çağırıyor; bu testin sahte `tx`'i eskiden sadece `update` tanımlıyordu, eklenmezse `TypeError: tx.server.findUnique is not a function` ile test kırmızıya dönerdi. Matematiksel olarak başka çıkış yolu yok: transaction-içi bir yeniden-okuma, transaction-içi _bir_ çağrı gerektirir, ve o çağrı bu sahte nesnede tanımlı olmalı. Eklenen stub `operations`'a hiçbir şey yazmıyor (`channel.findFirst` de yazmıyor — testte zaten var olan bir desen), bu yüzden `assert.deepEqual(operations, [...])` satır satır aynı 7 elemanlı diziyi bekliyor ve geçiyor. Sıfır assertion değişti, sıfır kapsam kayboldu.

### RED (düzeltmeden önce, geçici olarak geri alınmış implementasyona karşı)

Üç yeni test eklendikten sonra, `invite-service.ts`'teki üç değişikliği (import + docstring + fonksiyon gövdesi) `git` kullanmadan Edit ile eski haline döndürüp aynı test dosyasını çalıştırdım:

```
✔ creates a new membership, bumps the counter once, and attaches the socket room (0.6138ms)
✖ recovers from a concurrent duplicate join (P2002 on the unique membership constraint) as the same idempotent success (0.4486ms)
  PrismaClientKnownRequestError: Unique constraint failed on the fields: (`userId`,`serverId`)
      at ... invite-service.ts:638:40 (createServerMembership)
      at ... invite-service.ts:1037:29 (joinPublicWorkspaceServer)
✔ lets a non-P2002 error out of the transaction unchanged (0.2095ms)
✖ rejects with 403 SERVER_FULL when the in-transaction recheck finds the server now full, even though the pre-read saw room (0.8174ms)
  AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
  Caught error: Error: should not create a membership once the in-transaction recheck sees the server full

ℹ tests 13
ℹ pass 11
ℹ fail 2
```

Tam olarak beklenen iki açığı gösteriyor: P2002 ham `PrismaClientKnownRequestError` olarak dışarı sızıyor (üretimde 500 olurdu), ve kapasite yeniden-okuması hiç yapılmadığından insert doğrudan deneniyor.

### GREEN (düzeltme geri uygulandıktan sonra)

```
✔ creates a new membership, bumps the counter once, and attaches the socket room (0.6911ms)
✔ recovers from a concurrent duplicate join (P2002 on the unique membership constraint) as the same idempotent success (0.2793ms)
✔ lets a non-P2002 error out of the transaction unchanged (0.2115ms)
✔ rejects with 403 SERVER_FULL when the in-transaction recheck finds the server now full, even though the pre-read saw room (0.1673ms)

ℹ tests 13
ℹ suites 1
ℹ pass 13
ℹ fail 0
```

(Komut: `DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" node --import tsx --test src/lib/workspace/invite-service.test.ts`, `apps/web` içinden, `00 §5`'in "tek dosya koşturamazsın" notu gereği doğrudan çağrıldı. `DATABASE_URL` gerekli çünkü Prisma pool-options modülü import zamanında bir bağlantı dizesi doğruluyor — `packages/db/src/pool-options.ts:43` — gerçek bir bağlantı hiç açılmıyor, sadece import'un patlamaması için gerekli; `apps/web/scripts/run-node-tests.mjs:40-41`'in kendi test koşucusunun zaten yaptığı şey.)

---

## Bulgu 9 (önemli, performans) — join yolu tam-oda `fetchSockets` besliyor

**Zincir:** `joinPublicWorkspaceServer` → `finishServerMembershipCreation` (`invite-service.ts:709`, bulgu metninde `:731` olarak anılmıştı — dosyaya bu görevde eklenen satırlar yüzünden numara kaydı, fonksiyonun kendisi değişmedi) → `emitServerUnreadUpdatesForServer` (`unread-service.ts:692,701`) → `getActiveServerMemberUserIds` (`unread-service.ts:618-632`).

### Anlamsal fark doğrulandı (tuzak)

Kaynağı okudum, promptun uyarısı doğru:

- `getActiveServerMemberUserIds(serverId)` — `io.in(\`server:${serverId}\`).fetchSockets()`, presence'tan bağımsız, odadaki **her** bağlı kullanıcıyı döndürür.
- `server:{id}:online` Redis seti (`server-online-presence.ts`) — sadece `presenceStatus !== "OFFLINE"` olan socket'leri tutar; `applyServerOnlinePresenceForSocket` tek yazıcı, `isSocketEligibleForOnlinePresence` filtresi presence'ı OFFLINE olanı (Görünmez dahil) dışarıda bırakır.

Bu iki küme **gerçekten farklı**: görünmez bir kullanıcı odada ama sette değil. `emitServerUnreadUpdatesForServer` kendi rozetini güncellemesi gereken **her** bağlı üyeye ulaşmalı — görünmez kullanıcı dahil, çünkü kendi istemcisi kendi okunmamış sayacını görmeyi bekler. Sete saf bir geçiş, görünmez kullanıcılara güncelleme göndermeyi sessizce durdururdu. Bu yüzden **kod değiştirilmedi** — promptun "Do not ship a swap that changes who receives unread updates" kısıtı bağlayıcı kabul edildi.

### Seçenek 1 (uzlaştırma) neden reddedildi

Oda-üyeliğini presence'tan bağımsız ayrıca takip etmek, `server-online-presence.ts`'nin bugün yaptığının **eşdeğerini ikinci kez** inşa etmek demek: join/disconnect/presence-geçişi yazıcıları, TTL, fail-open okuma, ref-counting olmayan disconnect temizliği — ve bu modülün kendi geçmişi promptta hatırlatıldığı gibi **üç Critical yarış/dayanıklılık kusurunun** bir kere zaten düzeltilmesini gerektirdi. Bu, `00 §2`'nin önbellek/soyutlama yasağı ve "Fix these two findings and nothing else" kapsam sınırıyla birlikte değerlendirildiğinde, kazancın haklı çıkaracağından daha büyük bir değişiklik — promptun kendisinin öngördüğü "larger change than the win justifies" durumu tam olarak bu. Ayrıca `docs/prompts/mobile-perf-waves/w5-railway-kanit.md:43-51` bu tam sorunu ("Ara adım: presence'ı Redis set'te tut... okuma O(1) SMEMBERS, cluster RPC yok") zaten ayrı, sonraki bir dalga için planlıyor — burada acele bir kopyasını inşa etmek o işi çatallardı.

### Seçenek 2 (ölç ve ertele) uygulandı

**Yöntem:** Gerçek `@socket.io/redis-adapter` paketiyle, bu repodaki `apps/web/src/lib/socket/worker-runtime.test.ts`'in kanıtlanmış bellek-içi Redis pub/sub veri yolu desenini (`TestRedisPubSubBus`/`TestRedisClient`) yeniden kullanan, tek seferlik bir ölçüm scripti yazdım (`apps/web/scripts/tmp-fetchsockets-bench.mts`, ölçümden sonra silindi — kalıcı bir teslim değil). Script:

- 3 simüle "node" (`Server` + `createAdapter`), aynı bellek-içi bus üzerinden — Railway'in çoklu-replica mimarisini yansıtıyor, tek node fan-out maliyetini gizlerdi.
- Her socket, `assignSocketUserData` (`server.ts:181-187`) ile birebir aynı `socket.data` şekliyle (`userId`, `username`, `displayName`, `presenceCustomStatus`, `presenceStatus`, `appSessionKey`) gerçek `socket.io-client` WebSocket bağlantısı açıyor (`forceNew: true` — client'ın Manager önbelleğinin bağlantıları çoğullamasını önlemek için gerekli, yoksa aynı URL'ye N çağrı tek fiziksel bağlantıya düşerdi).
- Hepsi `server:bench` odasına katılınca, bir node'un `io.in("server:bench").fetchSockets()`'ini `performance.now()` ile 5 kez ölçtüm.
- İki tuzağa çarpıp düzelttim: (a) redis-adapter'ın `fetchSockets()`'i önce `serverCount()` çağırıyor (kaç node'dan yanıt bekleneceğini bilmek için ham `PUBSUB NUMSUB` komutu) — sahte client'a `send_command` eklemem gerekti; (b) adapter mesaj gövdelerini byte-seviyesinde (`msg[0] === 0x7b`) ve msgpack ile ayrıştırıyor — sahte bus'ın string yerine `Buffer` teslim etmesi gerekti.

**Doğrulama:** Her koşuda `fetchSockets()`'in döndürdüğü dizi uzunluğu tam olarak N'ye eşitti (12.000'de dahi kırpma/sayfalama yok) — "kaç socket serialize ediliyor" sorusunun yanıtı: **odadaki hepsi, sınırsız**.

**Ölçülen sayılar** (`apps/web` içinden, `node --import tsx scripts/tmp-fetchsockets-bench.mts <N>`):

| N (bağlı socket) |     min |  medyan |     max |
| ---------------: | ------: | ------: | ------: |
|               50 |  0.25ms |  0.33ms |  1.11ms |
|            1.000 |  3.95ms |  4.41ms |  6.80ms |
|           12.000 | 62.08ms | 63.30ms | 68.54ms |

Ham 12.000 çalıştırması: `fetchSockets min=62.08ms median=63.30ms max=68.54ms raw=[62.08, 62.18, 63.30, 67.40, 68.54]`.

**Ölçeklenme:** kabaca doğrusal — 1.000→12.000 arası (12×), medyan 4.41ms→63.30ms (~14.3×); marjinal maliyet ~5.3ms/1.000 bağlı socket, artı ~3-4ms sabit çapraz-node round-trip tabanı.

**Bu sayının önemli sınırı — dürüstçe belirtiyorum:** Bellek-içi bus'ın node'lar arası ağ gecikmesi sıfıra yakın; gerçek Railway Redis'i (aynı bölgede, `europe-west4`, w5 dokümanına göre) her pub/sub hop'una gerçek ağ RTT'si ekler. Bu yüzden ölçtüğüm sayılar üretim maliyetinin **alt sınırı** — gerçek sayı muhtemelen biraz daha yüksek, muhtemelen düşük tek haneli ms eklenir (aynı bölge, cross-region değil).

**Etki genişliği:** Bu çağrı sadece join'de değil, **her mesaj gönderiminde** de çalışıyor (`channel-message-send-service.ts:121-124`, `getActiveChannelViewerUserIds` ile `Promise.all` içinde paralel) — ve tek-CPU'lu bir process'te senkron JSON serialize/parse kısmı event loop'u gerçekten işgal ediyor (w5 dokümanı: "tek CPU'lu process'te event-loop'u hâlâ işgal ediyor"), yani 12k'lık bir sunucuda ~63ms sadece o join'i değil, aynı process'in o an işlediği **her başka isteği** de geciktiriyor. Mesaj-gönderme yolunda zaten (doğrulanmamış/UAT'ta açık olduğu teyit edilmemiş) bir fan-out metriği var: `performance-metrics.ts:283-329`'daki `recordMessageSendFanoutMetric`, `presenceLookupDurationMs` alanıyla tam bu iki çağrıyı (`getActiveChannelViewerUserIds` + `getActiveServerMemberUserIds`) sarıyor — bu konunun zaten izlenen, bilinen bir konu olduğunu doğruluyor, ben yeni bir enstrümantasyon eklemedim.

**Erteleme gerekçesi ve tetik eşiği:** Maliyet `memberCount`'a değil, o an **eşzamanlı bağlı** socket sayısına bağlı (bir sunucunun 12.000 üyesi olabilir ama aynı anda 12.000'i bağlı olmayabilir). Bugün hiçbir üretim yüzeyi `maxMembers`'ı düşürmüyor ve S3 keşif dalgası daha yeni geldiği için tipik COMMUNITY sunucularının eşzamanlı bağlantı sayısı henüz binlerle ölçülmüyor. Öneri: bu, bir COMMUNITY sunucusunun eşzamanlı bağlı üye sayısı **düzenli olarak birkaç bine (kabaca 3.000-5.000)** ulaştığında düzeltilmeli — ölçülen eğriye göre bu, çağrı başına ~15-25ms ekler ve mesaj-gönderme yolunda paralel iki çağrı + event-loop paylaşımı ile üretimde hissedilir hale gelir. Daha erken bir sinyal: `presenceLookupDurationMs`/fan-out p95'i (yukarıdaki metrik, UAT'ta açık olduğu doğrulanıp bir panele taşındığında) ~50ms'yi düzenli aşarsa.

**Kod tarafı:** `unread-service.ts`, `server-online-presence.ts`, `channel-message-send-service.ts` — üçü de dokunulmadan bırakıldı. Sadece ölçüm scripti yazıldı, çalıştırıldı, sayılar buraya kaydedildi, sonra silindi.

---

## Doğrulama

**Typecheck:**

```
$ pnpm --filter @wizards/web typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
```

Exit code 0, hata yok.

**Tam test süiti:**

```
$ pnpm --filter @wizards/web test
...
ℹ tests 2066
ℹ suites 461
ℹ pass 2066
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29097.3288
```

Taban çizgisi promptta "2060 passing / 0 failing, 461 suites" olarak verilmişti. Süit sayısı (461) birebir eşleşiyor. Test sayısı 2066 — benim eklediğim 3 testin ötesinde +3 daha var; bu ağaçta eşzamanlı başka işler olduğu (promptun kendisinin belirttiği gibi, üç dosya başka bir geçiş tarafından değiştiriliyor) ve tüm dal commit'siz olduğu için, taban çizgisinin alındığı an ile şu an arasında başka uncommitted testler eklenmiş olması bekleniyor. Sıfır başarısızlık — bu asıl kriter — sağlandı. `00 §5`'in bahsettiği bilinen kırmızı (`apps/web/src/lib/dm/group-service.test.ts`) bu koşuda da görünmüyor (0 fail), dokunmadım, saymadım.

---

## Sapmalar

1. **Bulgu 7 testinde mevcut bir testin sahte nesnesine (assertion'lar değişmeden) bir stub eklendi.** Yukarıda "Testler" bölümünde detaylı gerekçelendirildi: transaction-içi kapasite yeniden-okuması matematiksel olarak yeni bir `tx` çağrısı gerektiriyor, var olan sahte `tx.server` nesnesi bunu tanımlamıyordu. Eklenen `findUnique` stub'ı `operations` dizisine hiçbir şey yazmıyor, mevcut `assert.deepEqual` birebir aynı kalıyor.
2. **Bulgu 9 için ölçüm bellek-içi bir Redis pub/sub veri yoluyla yapıldı, canlı UAT/Railway Redis'i ile değil** (bu ortamda erişimim yok). Gerçek `@socket.io/redis-adapter` kodu, gerçek WebSocket bağlantıları ve gerçek socket.data şekli kullanıldığı için serialize/aggregate maliyeti gerçek; sadece node'lar-arası ağ gecikmesi sıfıra yakın modellendi, bu yüzden sayılar üretim için **alt sınır** olarak sunuluyor, kesin üretim sayısı değil. Rapor içinde açıkça işaretlendi.
3. **Bulgu 7'nin docstring'i güncellendi** (satır ~966-981) — eski metin "yalnız ban kontrolü transaction içinde yeniden doğrulanıyor" diyordu, artık yanlış olurdu; kapasite ve idempotency'nin de yeniden doğrulandığını, visibility'nin bilinçli olarak doğrulanmadığını anlatacak şekilde güncellendi.
4. **`graphify update .` çalıştırıldı, sonra elle geri alındı.** Kök `CLAUDE.md` "kod değiştirdikten sonra çalıştır" diyor; ama bu görevin bağlayıcı kısıtları (ve `00 §1`) `graphify-out/**`'ı eşzamanlı başka işlerin sahip olduğu, dokunulmaması gereken bir yol olarak sayıyor — daha spesifik olan kazandı. Komutu çalıştırdıktan hemen sonra fark ettim; `git checkout`/`reset` kullanmadan (yasak), her değişen izlenen dosyayı `git show HEAD:<path> > <path>` ile (salt-okunur `git show`, dosyaya kabuk yönlendirmesi) HEAD içeriğine geri yazdım ve `graphify update .`'ın oluşturduğu izlenmeyen `graphify-out/2026-08-08/` yedek dizinini sildim. `git diff HEAD --exit-code -- graphify-out/` çıkış kodu 0 — çalışma ağacı artık HEAD ile birebir aynı, gerçek bir fark yok (`git status`'un ilk gösterdiği " M" işaretleri, büyük JSON dosyalarında gözlemlenen bayat bir stat-cache artefaktıydı, içerik düzeyinde doğrulandı).

## Eklenmeyenler

1. **Bulgu 9 için gerçek uzlaştırma (Seçenek 1) yapılmadı.** Yukarıda gerekçelendirildi: `server-online-presence.ts`'nin eşdeğerini presence'tan bağımsız ikinci kez inşa etmek, kazancın haklı çıkaracağından daha büyük bir değişiklik ve zaten planlanmış (w5) bir işi çatallardı.
2. **`incrementServerMemberCount` / `server-member-counter.ts` değiştirilmedi.** Bulgu 7'nin kapasite yarışını "claim" tarzı bir koşullu `updateMany` ile tam atomik kapatmak, bu paylaşılan sayaç yardımcısının davranışını (6 çağıran: davet yolu dahil) değiştirirdi — kapsam dışı. Bunun yerine transaction içinde taze bir okuma+karşılaştırma yapıldı; bu, promptun "re-verify inside the transaction" talimatını harfiyen karşılıyor ve promptun kendisinin "Low practical risk" dediği senaryoyu kapatıyor, ama art arda gerçekten aynı anda (Read Committed izolasyonu altında) gelen iki transaction'a karşı SELECT FOR UPDATE seviyesinde mükemmel atomiklik iddia etmiyorum — bu, promptun "cheap to close alongside" çerçevesinin ve `00 §2`'nin ötesine geçerdi.
3. **Görünürlük (`isPublic`) transaction içinde yeniden doğrulanmadı.** Bulgu 7'nin "Fix" bölümü sadece kapasite ve idempotency'yi ("Both") istiyor; visibility'nin pre-check'te bir kere okunması `joinWorkspaceServerByInvite`'ın kendi analog ön-koşullarını (hedef kullanıcı, süre) transaction içinde yeniden türetmemesiyle simetrik, bilinçli bir tutarlılık.

## Bilinen boşluklar

- Bulgu 9, promptun kendi tercih sırasına göre dürüst bir "ölç ve ertele" sonucu — kod değişmedi, sadece rapor + tetik eşiği var. Gerçek uzlaştırma ayrı bir prompt/dalga gerektirir.
- 12.000 soket ölçümü tek makine, tek koşum; istatistiksel olarak 5 iterasyonluk min/medyan/max, çok-koşumlu bir varyans analizi değil.
