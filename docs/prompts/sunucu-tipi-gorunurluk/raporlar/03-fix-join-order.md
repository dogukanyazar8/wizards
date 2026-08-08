# 03 — joinPublicWorkspaceServer existence-leak düzeltmesi — kapanış raporu

Tarih: 2026-08-08
Dal: `uat`, uncommitted
Kapsam: yalnızca `apps/web/src/lib/workspace/invite-service.ts` içindeki `joinPublicWorkspaceServer`'ın koruma sırası ve `apps/web/src/lib/workspace/invite-service.test.ts`. `joinWorkspaceServerByInvite`, `createServerMembership`, `finishServerMembershipCreation` dokunulmadı.

Bu, `03ab-rapor.md`'nin kendi "Kaygılar #1" maddesinde zaten işaretlediği sızıntının düzeltmesi: "Karar 2'nin literal sırası bir sızıntı üretiyor: dolu + özel bir sunucuya doğrudan `serverId` ile katılma denemesi 404 değil 403 döner." Kusur, `03-S3-kesif-ve-katilim.md`'nin (satır 50) verdiği sıranın harfiyen uygulanmasından geliyordu — plan kusuru, uygulama hatası değil.

---

## Eski sıra vs yeni sıra

**Eski** (wave prompt'un verdiği, `03ab`'de aynen uygulanan): `ban → zaten üye mi → maxMembers → isPublic`. `isPublic` en sonda kontrol edildiği için, hem dolu hem özel bir sunucu 404 yerine 403 `SERVER_FULL` döndürüyordu (varlığını sızdırıyordu). Aynı sınıftan bir sızıntı ban kontrolünde de vardı: ban kontrolü _her şeyden önce_, sunucu hiç yüklenmeden çalıştığı için, özel bir sunucunun id'sini deneyen banlı bir kullanıcı 403 `SERVER_BANNED` alıyordu — bu da varlığı doğruluyordu.

**Yeni**: `sunucuyu yükle (yoksa 404) → üyeliği bir kez oku → (özel VE üye değil) ise 404 [1. adımla ayırt edilemez, aynı mesaj/kod] → ban kontrolü (403) → zaten üyeyse idempotent başarı dönüşü → maxMembers (403) → devam (kullanıcı kontrolü, transaction, üyelik oluşturma)`.

```ts
const server = await prisma.server.findUnique({ select: JOIN_PUBLIC_SERVER_SELECT, where: { id: serverId } });
if (!server) throw 404 SERVER_NOT_FOUND;

const existingMember = await prisma.serverMember.findUnique({ where: { userId_serverId: { serverId, userId } }, select: { id: true } });

if (!server.isPublic && !existingMember) throw 404 SERVER_NOT_FOUND;   // aynı hata, 1. adımla ayırt edilemez

await ensureUserNotServerBanned(prisma, serverId, userId);              // 403 SERVER_BANNED

if (existingMember) return { alreadyMember: true, serverId };           // idempotent, değişmedi

if (server.memberCount >= server.maxMembers) throw 403 SERVER_FULL;

// ... joiningUser lookup, $transaction (ban tekrar kontrol), createServerMembership, finishServerMembershipCreation — hiç değişmedi
```

Sonuç: 403, yalnızca sunucuyu zaten görebilen (herkese açık VEYA zaten üye) bir çağırana görünür. 404 iki farklı gerçeği ("sunucu yok" ve "özel + üye değilsin") aynı statü/mesaj/kod ile örtüyor.

### Promptun numaralı listesiyle bir gerilim ve nasıl çözüldü

Promptun "Fix" bölümü adımları `1. sunucu yükle, 2. isPublic/üye→404, 3. zaten üye→başarı, 4. banlı→403, 5. maxMembers→403` sırasıyla numaralandırıyor — yani "zaten üye" (3) "banlı" (4)'ten önce. Bunu harfiyen (üyeyse ban kontrolünden önce koşulsuz başarı dön) uygularsam, promptun kendi Testler bölümünde açıkça istediği "aynı özel sunucunun banlı bir üyesi yine de 403 alır (üyelik onu görünür kılıyor)" senaryosu **imkânsız** hale gelirdi — üye olan biri her zaman 3. adımda döner, 4. adıma hiç ulaşamaz.

Bunu, ban kontrolünü zaten-üye dönüşünden **önce** çalıştırarak çözdüm — bu, eski/mevcut koddaki ban→üye göreli sırasının **birebir korunması** demek (eski kodda da ban kontrolü üyelik kontrolünden önceydi). Değişen tek şey, visibility'nin (sunucu var mı + `isPublic`) en başa çekilmesi; ban/üye/kapasite kendi aralarındaki göreli sırayı korudu. Bu okuma, "bu bir yeniden sıralama, yeniden yazım değil" ilkesine en sadık olanı ve promptun somut test örneğini çelişkisiz sağlayan tek tutarlı yorum.

Üyelik satırı (`existingMember`) tek sorgu ile okunup hem visibility kapısında hem idempotent dönüşte tekrar kullanılıyor — iki kez sorgulanmıyor.

---

## RED (fix öncesi) — motive eden test

Önce yalnızca yeni testi ekledim (`404s a server that is both full and non-public, instead of leaking SERVER_FULL`), implementasyona dokunmadan çalıştırdım:

```
$ cd apps/web
$ DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests \
  node --import tsx --test --test-force-exit src/lib/workspace/invite-service.test.ts

▶ joinPublicWorkspaceServer
  ✔ rejects a banned user before checking membership, capacity, or opening a transaction (0.9892ms)
  ✔ is idempotent for an existing member and never opens a transaction (0.465ms)
  ✔ rejects with 403 when the server is at its member cap, before creating a membership (0.1896ms)
  ✔ 404s a non-public server instead of leaking that it exists (0.1472ms)
  ✖ 404s a server that is both full and non-public, instead of leaking SERVER_FULL (0.7213ms)
  ✔ 404s a server that does not exist at all with the exact same status and code (0.1764ms)
  ✔ creates a new membership, bumps the counter once, and attaches the socket room (0.7932ms)
✖ joinPublicWorkspaceServer (4.0591ms)
ℹ tests 7
ℹ pass 6
ℹ fail 1

✖ failing tests:
AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
Caught error:
ApiError: This server is full
    at joinPublicWorkspaceServer (...\invite-service.ts:1001:11)
```

Beklenen 404 `SERVER_NOT_FOUND` yerine 403 `SERVER_FULL` fırlatıldığı doğrulandı — tam olarak tarif edilen sızıntı.

---

## GREEN (fix sonrası) — tüm dosya

Implementasyon düzeltildi, iki mevcut testin mock'ları (aşağıda "Sapmalar") güncellendi, iki ek senaryo testi eklendi:

```
$ DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests \
  node --import tsx --test --test-force-exit src/lib/workspace/invite-service.test.ts

▶ joinPublicWorkspaceServer
  ✔ rejects a banned user on a public server with 403, before opening a transaction (1.0872ms)
  ✔ is idempotent for an existing member and never opens a transaction (0.5889ms)
  ✔ rejects with 403 when the server is at its member cap, before creating a membership (0.2023ms)
  ✔ 404s a non-public server instead of leaking that it exists (0.1525ms)
  ✔ 404s a server that is both full and non-public, instead of leaking SERVER_FULL (0.1466ms)
  ✔ 404s a banned non-member probing a non-public server, instead of leaking SERVER_BANNED (0.1496ms)
  ✔ still rejects a banned member of that same non-public server with 403, because membership makes it visible (0.1534ms)
  ✔ 404s a server that does not exist at all with the exact same status and code (0.115ms)
  ✔ creates a new membership, bumps the counter once, and attaches the socket room (0.8636ms)
✔ joinPublicWorkspaceServer (4.0636ms)
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

9/9 (eski 6 test + 3 yeni). Sıfır atlanan, sıfır iptal.

---

## Davet yolu regresyon kapısı — dokunulmadı, yeşil kaldı

`joinWorkspaceServerByInvite`, `createServerMembership` ve `finishServerMembershipCreation`'ı `joinPublicWorkspaceServer` ile paylaşıyor; bu ikisine hiç dokunmadım.

```
$ DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests \
  node --import tsx --test --test-force-exit src/lib/workspace/service.test.ts
...
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

`git diff --stat apps/web/src/lib/workspace/service.test.ts` boş çıktı verdi — dosya bu oturumda hiç değişmedi.

---

## Diğer katman kontrolü

Rota mantığı katmanı araştırıldı: `apps/web/src/app/api/v1/servers/[serverId]/join/route-logic.ts` ve `apps/web/src/app/api/v1/mobile/servers/[serverId]/join/route-logic.ts`. İkisi de ince pass-through: `dependencies.joinServer(userId, serverId)` çağırıyor (DI ile `joinPublicWorkspaceServer`'a bağlı) ve fırlatılan `ApiError`'ı `jsonError(error)` ile HTTP yanıtına eşliyor. Kontrol sırasını kendi başlarına **tekrar uygulamıyorlar**.

Bu iki dosyanın `route-logic.test.ts`'leri de `joinServer` bağımlılığını tamamen mock'luyor (`dependencies({ joinServer: async () => ... })`) — gerçek `joinPublicWorkspaceServer`'ı hiç çağırmıyorlar, yalnızca statü/kod eşlemesini test ediyorlar. Yani sıradan etkilenmiyorlar ve değişikliğe ihtiyaçları yok.

`git diff --stat` bu iki `route-logic.ts` dosyası için boş çıktı verdi — dokunulmadı. **Sonuç: kontrol sırasını kodlayan başka bir katman yok.**

---

## Doğrulama — gerçek komut çıktısı

```
$ pnpm --filter @wizards/web typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
EXIT_CODE=0
```

```
$ pnpm --filter @wizards/web test
...
ℹ tests 2021
ℹ suites 453
ℹ pass 2021
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Taban 2018/2018'di; bu turun +3 yeni testinin (full+non-public, banned+non-public+non-member, banned+non-public+member) üstüne 2021/2021 — taban düşmedi.

Odaklı koşumlar (hepsi 0 fail):

- `src/lib/workspace/invite-service.test.ts` — 9/9 (6 eski + 3 yeni)
- `src/lib/workspace/service.test.ts` — 34/34 (davet yolu, dokunulmadı)

---

## Sapmalar

1. **İki mevcut testin mock kurulumu değişti** — kaçınılmazdı, çünkü bu testler eski sırayı (ban her şeyden önce / üye ise sunucu hiç yüklenmez) implementasyon detayı olarak assert ediyordu:
   - `"rejects a banned user before checking membership, capacity, or opening a transaction"` → `"rejects a banned user on a public server with 403, before opening a transaction"`. `prisma.serverMember.findUnique` ve `prisma.server.findUnique` artık banlı-kullanıcı senaryosunda gerçekten çağrılıyor (visibility, ban kontrolünden önce çözülüyor) — bu iki mock'u "çağrılırsa fırlat" yerine gerçek değer döndürecek şekilde güncelledim. **Korunan** assertion: 403 `SERVER_BANNED`, transaction hiç açılmıyor.
   - `"is idempotent for an existing member and never opens a transaction"` — başlığı aynı kaldı. `prisma.server.findUnique`'in "çağrılırsa fırlat" mock'unu gerçek bir sunucu satırı döndürecek şekilde değiştirdim, çünkü yeni sırada sunucu **koşulsuz olarak en başta** yükleniyor (üye olsun olmasın — visibility kapısı `isPublic`'i bilmek zorunda, ve bunu üyelik bilgisiyle birleştirmek için önce sunucunun var olduğunu bilmek gerekiyor). **Korunan** assertion: `{alreadyMember: true, serverId}`, transaction hiç açılmıyor.

   Bunlar "assertion zayıflatma" değil — asıl garanti edilen davranış (banlı→403/açılmayan transaction; üye→idempotent başarı/açılmayan transaction) her iki testte de birebir korundu. Değişen yalnızca, artık yanlış olan bir _yan_ iddia (belirli bir tablo hiç sorgulanmaz) — ki bu iddia zaten düzeltmenin doğrudan hedefiydi.

2. **Docstring güncellendi.** Eski docstring "ban, membership, capacity, then visibility -- in that exact order" diyordu ve bunu S3 binding decision 2'ye atfediyordu; artık yanlıştı. Yeni sırayı ve "neden bir özel sunucunun banlı üyesi 404 değil 403 alır" mantığını (visibility gate'i geçtiği için) açıklayacak şekilde yeniden yazdım. Kapsam notu: görev yalnızca iki dosyaya izin veriyordu ama docstring, değiştirdiğim fonksiyonun kendi belgeси — güncellenmemesi kodla çelişen yanlış dokümantasyon bırakırdı.

## Eklenmeyenler

- Wave prompt'un (`03-S3-kesif-ve-katilim.md`) kendisi düzeltilmedi — görev bunu ayrı bir iş olarak tanımladı ("the prompt is being corrected separately").
- `graphify update .` çalıştırılmadı — `graphify-out/**`'e dokunmama yasağıyla çelişiyor (önceki raporların da bildirdiği aynı çelişki).

## Bilinen boşluklar

- Eşzamanlı çift-tıklama yarışı (03ab'nin kendi Kaygı #4'ü: dış kontroller iki eşzamanlı çağrıyı da geçip `tx.serverMember.create`'te unique constraint hatasına düşebilir) bu turun kapsamı dışında bırakıldı — düzeltme yalnızca sıralamayı hedefliyordu, eşzamanlılık davranışını değiştirmedim.
- `apps/web/src/lib/dm/group-service.test.ts` (bize ait olmayan, bilinen kırmızı olarak işaretlenmişti) bu run'da **yeşil** çıktı — muhtemelen eşzamanlı bir oturum düzeltti; doğrulamadım, kapsamım değil.
