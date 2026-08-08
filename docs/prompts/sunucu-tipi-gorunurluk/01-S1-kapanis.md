# 01 — S1 kapanışı: presence kusurları + okuma modeli incelemesi + kapı

Önce `00-ortak-baglam.md` oku.

S1'in on görevinden sekizi landed ve commit'lendi. Bu prompt kalan üçünü kapatır: Task 8'in beş açık kusuru, Task 9'un incelenmesi, Task 10'un kapısı.

**Bu prompt bittiğinde S1 biter.** Hâlâ kullanıcıya görünür hiçbir şey yoktur — S1 altyapıdır.

---

## Bağlayıcı kararlar

1. Redis çevrimiçi seti **türetilmiş durumdur**, kayıt değil. Kaybı tolere edilir; yazma hatası çağıranı asla kırmaz. Bu, aşağıdaki B kusurunun çözüm şeklini belirler.
2. Çoklu socket için **ref-counting yapılmaz.** Arayüz socket kimliği taşımıyor ve bunu genişletmek S3'ün toplu okuma sözleşmesini erkenden kilitler. Bunun yerine kaldırma, kullanıcının o sunucuda başka bağlı socket'i kalmadığında yapılır — bunu odadaki socket'lerden değil, `socket.data` üzerinden çözemezsin; **kaldırmadan önce Socket.IO'ya o odada o kullanıcıya ait başka socket var mı diye sor.** Tek `fetchSockets` çağrısı disconnect başına kabul edilebilir; yasak olan onu _sayım_ yolunda kullanmaktı.
3. `getActiveServerMemberUserIds` **değişmez.** Kullanıcı kimliği döndürür, sayı değil; bilerek `fetchSockets` tabanlı kalır.

---

## Bölüm A — Kick/ayrılma çevrimiçi setten düşürmüyor (Critical)

`detachUserFromServerSocketRoom` (`apps/web/src/lib/workspace/workspace-events.ts:58-76`) socket'i odadan çıkarıyor (`socket.leave(...)`, satır 71) ama `removeServerOnlineMember` çağırmıyor ve `socket.data.onlineServerIds`'i güncellemiyor.

Çağıranlar: `leaveWorkspaceServer` (`member-service.ts:244`), `kickWorkspaceMember` (`member-service.ts:574`).

Eski `fetchSockets` uygulaması canlı oda üyeliğini her çağrıda sorguluyordu, bu yüzden `.leave()` anında sayımdan düşüyordu. Redis seti düşmüyor. Sonuç: atılan/ayrılan üye, istemcisi açık kaldığı sürece "çevrimiçi" sayılıyor.

**Teslim:** `detachUserFromServerSocketRoom` hem setten düşürür hem `socket.data.onlineServerIds`'i günceller. Test: kick sonrası `countServerOnlineMembers` düşer.

## Bölüm B — Yazma yolunda hata izolasyonu yok (Critical)

`addServerOnlineMember` / `removeServerOnlineMember` (`server-online-presence.ts:24-40`) ne hazırlık kontrolü ne `try/catch` taşıyor. Okuma yolu `redis.status !== "ready"` koruması aldı, yazma yolu hiçbir şey almadı.

Disconnect handler'da (`apps/web/src/lib/socket/server.ts:504-522`) `removeServerOnlineMember` çağrısı `try` bloğunun başında. Oradan bir reddetme doğrudan `catch`'e atlıyor ve aynı bloktaki her şeyi atlıyor:

- `clearInterval(presenceHeartbeat)` (514) — eskiden koşulsuz senkron çağrıydı. Sızan interval'in TTL'i yok; ölü socket'e karşı 60 saniyede bir tetiklenir, süreç yeniden başlayana kadar.
- `handlerRegistration.cleanup?.()` (515) — `cleanupPresence` çalıştırır. Kullanıcı OFFLINE işaretlenmez, arkadaşlarına yayın gitmez.
- `endAppSession(...)` (516-518) — analitik oturumu sonsuza kadar açık kalır.

Bu tam da modülün kendi doküman yorumunun "zarifçe tolere edilir" dediği arıza modunda oluyor. **Task 8 sistemi öncesinden daha kırılgan yaptı.**

**Teslim:**

- İki yazma yardımcısı da fırlatmaz. Hazırlık kontrolü + `try/catch`. Kaynak: `apps/web/src/lib/socket/server-room-cache.ts:48-58` (`readCachedServerRoomIds`) ve `:60-77` (`writeCachedServerRoomIds`) — bu dosyayı önce oku, ikisi de hem `status` kontrolü hem hata yutma taşır.
- Okuma yolundaki koruma da yarım: `unread-service.ts:642-649` yalnız `status` kontrolü yapıyor. `status` "ready" okuduktan _sonra_ başarısız olan bir komut (uçuş sırasında zaman aşımı, bağlantı sıfırlama) hâlâ `server-service.ts:655-659`'daki `Promise.all`'a fırlatıyor — korumanın koruduğunu iddia ettiği yer burası. Tamamla.
- Test: Redis fırlatırken disconnect handler'ın `clearInterval` ve `cleanup` adımlarını yine de çalıştırdığı doğrulanır.

## Bölüm C — Join tamamlanmadan disconnect: kalıcı hayalet (Critical)

`joinServerRoomsForUser(socket, userId)` ayrık, beklenmeyen arka plan görevi (`server.ts:489-495`). `disconnect` handler'ı hemen ardından senkron kaydediliyor (504) ve önce tetiklenebiliyor.

Tetiklenirse: disconnect handler `socket.data.onlineServerIds ?? []` okur — satır 347 henüz koşmadığı için boş — ve hiçbir şey kaldırmaz. Join görevi sonra tamamlanır ve kullanıcıyı her sunucunun setine koşulsuz ekler (348-351). Kaldıracak kimse kalmaz.

Redis `EXPIRE` anahtar seviyesindedir, üye seviyesinde değil; başka herhangi bir üyenin sıradan join'i onu tazeler (`server-online-presence.ts:31`). Yani hayalet, düzenli trafiği olan herhangi bir sunucuda süresiz kalır.

`server.ts:345-346`'daki yorum — "oda üyeliği ve çevrimiçi set birlikte yazılır, ikisi asla anlaşmazlığa düşemez" — eşzamanlı disconnect'e karşı bu kodun sağlamadığı bir değişmez iddia ediyor. **Ya doğru yap ya yorumu düzelt.**

## Bölüm D — Join ile presence-init yarışı: görünmez/DND kullanıcı çevrimiçi kalıyor (Important)

`joinServerRoomsForUser`'ın eklemesi (`server.ts:348-351`) presence'e kör. `initializePresence` (`handlers/presence.ts:23-54`, OFFLINE dışlamasını uygulayan tek bağlanma-anı kodu, satır 40-41) ile sıra garantisi olmadan yarışıyor. İkisi de `connection` geri çağrısının aynı senkron turunda başlıyor (`server.ts:489-495` ve `502`).

Presence-farkında kaldırma, presence-kör eklemeden önce çözülürse görünmez/DND kullanıcı yanlışlıkla çevrimiçi kalır — ve öyle kalır, çünkü böyle istemciler düzeltici `presence:activity` göndermez (`apps/web/src/hooks/use-presence-activity.ts:38-40`) ve sunucu gönderseler de yok sayar (`presence.ts:81-83`).

`server.ts:181` `socket.data.presenceStatus = "OFFLINE"` ile başlatıyor — presence-farkında bir eklemeyi buna dayandırabilirsin.

**C ve D aynı kök nedeni paylaşıyor:** paylaşılan türetilmiş duruma sıra garantisi olmadan yazan iki koordinesiz ateşle-unut zinciri. **Tek tutarlı düzeltme yaz, iki ayrı yama değil.** Raporda sıralama argümanını ver: hangi zincir önce çözülürse çözülsün düzeltmen neden tutuyor.

## Bölüm E — `getOnlineServerMemberCount` test edilmiyor (Important)

`apps/web/src/lib/workspace/unread-service.test.ts:45-76` "counts distinct, visible-presence members in a server room" adını taşıyor ama `addServerOnlineMember` / `countServerOnlineMembers`'ı doğrudan çağırıyor — üretimin kullandığı `getOnlineServerMemberCount`'u (`server-service.ts:657`) hiç çağırmıyor. Senaryosu ayrıca `server-online-presence.test.ts`'teki bir testi neredeyse birebir tekrarlıyor.

Sonuç: `getOnlineServerMemberCount`'un gövdesi, B'de tamamlayacağın koruma dahil, hiçbir testte koşmuyor.

`server-room-cache.ts:79-84` bu repoda böyle bir fonksiyonu test edilebilir yapmanın deyimini gösteriyor: test geçersiz kılmasına, sonra `getRedisOp()`'a düşen isteğe bağlı redis parametresi. Aynı şekli uygula — üretim çağrı yeri değişmez — ve testi `getOnlineServerMemberCount`'a **yeniden hedefle** (silme; adı doğru hale gelsin).

---

## Bölüm F — Task 9 incelemesi

`apps/web/src/lib/servers/server-public-profile-service.ts` ve indirgenmiş `apps/web/src/lib/invites/mobile-invite-preview-service.ts` uygulandı ama hiç incelenmedi. İncele:

- `buildServerPublicProfile` gerçekten saf mı — Prisma yok, saat yok, I/O yok?
- `resolveChannelPermissions` artık sunucu-profil yolunda **tek** yerde mi? Eski kopyası `mobile-invite-preview-service.ts`'ten gerçekten silindi mi, yoksa öksüz mü kaldı?
- Alan adları `ServerPublicProfileSchema` ile birebir mi?
- `verified` `features`'tan mı geliyor, `mutualFriends` 8 mi, çevrimiçi sayısı DB'den mi? (Üçü de `00`'daki sözleşme.)
- Gizli kanalın `@everyone`'a görünmediğini kanıtlayan bir test var mı?

Regresyon kapısı — **düzenlenmeden yeşil kalmalı:**

```bash
pnpm --filter @wizards/mobile test -- mobile-about-community-2g
```

```bash
pnpm --filter @wizards/web test -- --test-name-pattern="invite preview"
```

Uygulayıcı raporu bunların öncesi/sonrası birebir aynı olduğunu iddia ediyor (davet önizleme 5/5, mobil 2g 9/9). **Doğrula.** Kırmızıysa refactor davranışı değiştirmiştir; test değil kod düzeltilir.

## Bölüm G — Kapı ve devir

1. `pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Standard`
2. `pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Mobile`
3. `git status --porcelain -- apps/web/src/components apps/web/src/app` → **boş olmalı.** S1 hiçbir ekran, bileşen veya kopya metni değiştirmez. Boş değilse kapsam dışına taşılmıştır.
4. UAT'a dağıtımdan sonra `memberCount`'un gerçek, sıfır olmayan değer döndüğünü kontrol et — sıfır dönüyorsa migration backfill'i koşmamıştır. Yordam: son SUCCESS deployment'ın commit'i uygulanmış migration setidir; UAT veritabanına dışarıdan bağlanılamaz.

---

## Devredilen küçük bulgular

S1 boyunca kaydedildi, bloke etmiyor. Bu promptta **kapatman gerekmez**, ama dokunduğun yere denk gelirse ucuzsa kapat:

- `verificationLevel` varsayılanı/geçersiz kılması hiçbir testte doğrulanmıyor.
- Admin DELETE'in 404 gövdesi artık `code` alanı taşıyor (eklemeli, repo geleneğiyle tutarlı).
- `describe("createAdminServer")` bloğu artık iki şema-only test içeriyor; adı yanıltıcı.
- Hiçbir test COMMUNITY sunucuyu gerçek çağrı yerlerinden geçirmiyor — kapılar yalnız doğrudan test ediliyor, yanlış değişken geçirilse yakalanmaz.
- `getAccessContext` (`access-context.ts:39-55`) sunucu satırını zaten yüklüyor; tek kelimelik `type: true` eklemesi `updateWorkspaceServer`/`deleteWorkspaceServer`'daki iki ek `findUniqueOrThrow` gidiş-dönüşünü kaldırır. `AccessContext` paylaşılan sözleşme olduğu için S1 ortasında yapılmadı.
- Toplu azaltma testi `/GREATEST/` iddia ediyor ama her iki `serverId`'nin gerçekten sorguya girdiğini doğrulamıyor.

## Teslim

- [ ] A: kick/ayrılma setten düşürür + test
- [ ] B: iki yazma yardımcısı fırlatmaz, okuma koruması tamamlanır + disconnect dayanıklılık testi
- [ ] C+D: tek tutarlı yarış düzeltmesi + sıralama argümanı + test
- [ ] E: `getOnlineServerMemberCount` enjekte edilebilir, testi ona yeniden hedeflenir, koruma kapsanır
- [ ] F: Task 9 incelendi, regresyon kapısı doğrulandı, bulgular düzeltildi
- [ ] G: iki kapı yeşil, görünür-değişiklik-yok kontrolü boş
