# 03ab — S3 Bölüm A + B: kapanış raporu

Tarih: 2026-08-08
Dal: `uat`, uncommitted
Kapsam: **yalnız Bölüm A (keşif okuma yolu) ve Bölüm B (davetsiz katılma yazma yolu).** Bölüm C/D/E bu turda hiç açılmadı.

---

## Teslim edilenler

### Bölüm A — Keşif okuma yolu

- `apps/web/src/lib/servers/server-discovery-service.ts` — saf yarı (`buildServerDiscoveryCard`, cursor encode/decode) + enjekte edilen `PrismaClient`+Redis yarısı (`listDiscoverableServersWithDatabase`) + gerçek wrapper (`listDiscoverableServers`), `server-public-profile-service.ts` ile aynı desen.
- `apps/web/src/lib/socket/server-online-presence.ts` — `countServerOnlineMembersBatch(redis, serverIds)` eklendi: tek Redis pipeline ile N `SCARD`. Tekil `countServerOnlineMembers` aynı `server:<id>:online` anahtarını okuyor (`buildServerOnlineKey` ortak).
- `apps/web/src/lib/servers/server-public-profile-service.ts` — **çevrimiçi sayısı artık Redis'ten** (`getOnlineServerMemberCount`, `unread-service.ts`'te zaten var ve test edilmişti — mobil sunucu detayında zaten kullanılıyordu). Eski DB tabanlı `countOnlineMembers` (`serverMember.count` by `user.status`) silindi. Bkz. "Bağlayıcı karar 5" bölümü aşağıda.
- Uçlar: `GET /api/v1/servers/discover` (oturum isteğe bağlı, S2 profil kartıyla aynı duruş), `GET /api/v1/mobile/servers/discover` (Bearer zorunlu).
- Rate limit eylemleri: `server:discover`, `mobile:server:discover` kaydedildi.
- `packages/types/src/workspace.ts`: `ServerDiscoveryCardSchema`, `ServerDiscoveryPageSchema`, `ServerDiscoveryQuerySchema` (+ üç tip export). Web ve mobil **aynı şemayı** paylaşıyor — `ServerPublicProfileSchema`'nın zaten kurduğu emsal.
- **EXPLAIN kanıtı ve index düzeltmesi** — aşağıda ayrı bölümde, bu turun en önemli bulgusu.

### Bölüm B — Katılma yazma yolu

- `apps/web/src/lib/workspace/invite-service.ts`:
  - `createServerMembership(tx, input)` — üye satırı, `memberCount` artırımı, varsayılan rol, sistem mesajı. Çağıranın açtığı transaction'ı alır, kendi transaction'ını açmaz (davet kullanım hakkı düşümüyle aynı atomiklikte kalması için — bkz. "Bağlayıcı karar 1" altında gerekçe).
  - `finishServerMembershipCreation(serverId, userId, message)` — cache invalidation, okundu işaretleme + mesaj yayını, socket odası bağlama + `server:settings:updated`. Transaction'dan sonra, her iki giriş noktasından da çağrılıyor.
  - `joinWorkspaceServerByInvite` bu iki fonksiyonu çağıracak şekilde indirgendi; **davranışı değişmedi** (aşağıdaki kapı kanıtı).
  - `joinPublicWorkspaceServer(userId, serverId)` — yeni export, karar 2'deki dört kontrolü uygular, aynı iki paylaşılan fonksiyonu çağırır.
- Uçlar: `POST /api/v1/servers/[serverId]/join`, `POST /api/v1/mobile/servers/[serverId]/join`. İkisi de gövdesiz.
- Rate limit eylemleri: `server:join-public`, `mobile:server:join-public` (10/saat, gerekçe aşağıda).
- `apps/web/src/lib/workspace/invite-service.test.ts` (yeni dosya) — 6 test, dört zorunlu senaryo + mutlu yol.

---

## Devir sözleşmesi — UI turlarının tüketeceği tam yüzey

### Bölüm A çıktısı

```ts
// apps/web/src/lib/servers/server-discovery-service.ts
export function buildServerDiscoveryCard(
  server: ServerDiscoveryCardSource,
  onlineCount: number,
): ServerDiscoveryCard;
export function encodeServerDiscoveryCursor(row: { id: string; memberCount: number }): string;
export function decodeServerDiscoveryCursor(
  cursor: string,
): { id: string; memberCount: number } | null;
export async function listDiscoverableServersWithDatabase(
  database: PrismaClient,
  redis: ServerOnlinePresenceBatchRedis,
  input: ListDiscoverableServersInput,
): Promise<ServerDiscoveryPage>;
export async function listDiscoverableServers(
  input: ListDiscoverableServersInput,
): Promise<ServerDiscoveryPage>;
// input: { cursor?: string; limit?: number; query?: string }
```

```ts
// packages/types/src/workspace.ts
ServerDiscoveryCardSchema: {
  bannerUrl: string | null; description: string; iconUrl: string | null; id: string;
  memberCount: number; name: string; onlineCount: number; shortName: string | null;
  type: "PERSONAL" | "COMMUNITY"; verified: boolean;
}
ServerDiscoveryPageSchema: { nextCursor: string | null; servers: ServerDiscoveryCard[] }
ServerDiscoveryQuerySchema (query string, .strict()): { cursor?: string; limit?: number (1-50); query?: string }
```

**Kart, profil yükünün kesin alt kümesi** — `channels`, `mutualFriends`, `joined`, `isPublic`, `discoverable` **yok**. `memberCount`/`onlineCount` ham sayı olarak döner; **format uygulanmadı** — `formatServerProfileCount(value, locale)` UI turunda kart render edilirken çağrılmalı (backend tek locale'e kilitlenmemeli). `resolveServerProfileChannelBadge`/`resolveServerProfileFriendStack`/`resolveServerProfileJoinAction` kartta hiç kullanılmadı çünkü kartta kanal/arkadaş/joined alanı yok — bu üçü D turunda profil kartına tıklandığında (S2 yüzeyinde) zaten kullanılıyor.

Uçlar:

| Yöntem | Yol                               | Auth                            | Rate limit                        |
| ------ | --------------------------------- | ------------------------------- | --------------------------------- |
| GET    | `/api/v1/servers/discover`        | isteğe bağlı (S2 profille aynı) | `server:discover` (240/dk)        |
| GET    | `/api/v1/mobile/servers/discover` | Bearer zorunlu                  | `mobile:server:discover` (120/dk) |

Query string: `?cursor=<memberCount>|<id>&limit=<1-50>&query=<ad>`. Yanıt gövdesi ikisinde de `ServerDiscoveryPageSchema`.

### Bölüm B çıktısı

```ts
// apps/web/src/lib/workspace/invite-service.ts
export async function joinPublicWorkspaceServer(
  userId: string,
  serverId: string,
): Promise<{ alreadyMember: boolean; serverId: string }>;
```

Uçlar:

| Yöntem | Yol                                      | Gövde | Auth               | Rate limit                            | Başarı yanıtı                                               |
| ------ | ---------------------------------------- | ----- | ------------------ | ------------------------------------- | ----------------------------------------------------------- |
| POST   | `/api/v1/servers/[serverId]/join`        | yok   | `requireApiUserId` | `server:join-public` (10/saat)        | `{ success: true }`                                         |
| POST   | `/api/v1/mobile/servers/[serverId]/join` | yok   | Bearer             | `mobile:server:join-public` (10/saat) | `MobileMutationSuccessResponseSchema` → `{ success: true }` |

**`mobile:server:join` ile karıştırılmasın:** o, mevcut `POST /api/v1/mobile/servers/join` (davet kodu gövdede) ucunun eylemi — farklı yol, farklı anlam. Benim yeni ucum `[serverId]/join`, gövdesiz, kodsuz.

Hata sözleşmesi (her iki platform, aynı `ApiError` şekli):

| Senaryo                           | Status                                             | code               |
| --------------------------------- | -------------------------------------------------- | ------------------ |
| Banlı (`ServerBan`)               | 403                                                | `SERVER_BANNED`    |
| Zaten üye                         | **200**, `{success:true}` (idempotent, hata değil) | —                  |
| `maxMembers` dolu                 | 403                                                | `SERVER_FULL`      |
| `isPublic: false` veya sunucu yok | 404                                                | `SERVER_NOT_FOUND` |

---

## Bağlayıcı karar 1 — paylaşılan fonksiyonun şekli

Prompt "tek transaction" diyor; bunu **tek `prisma.$transaction` çağrısı davet tarafında zaten vardı, ona dokunmadım** olarak okudum. `createServerMembership` kendi transaction'ını açmıyor, çağıranın açtığı `tx`'i alıyor — çünkü davet yolunda üyelik satırı ile davet kullanım hakkı düşümü **aynı atomiklikte** kalmalı (ikisi ayrı transaction olsaydı, kullanım hakkı düşer ama üyelik satırı hiç oluşmayabilirdi — sessiz kayıp). `finishServerMembershipCreation` transaction dışı (socket/cache transactional kaynak değil), ama yine paylaşılan, iki çağıran için tek kopya.

`service.test.ts`'teki "fails invite join on optimistic max-use race before creating membership" testi bunu zaten doğruluyor: sahte `tx` nesnesi `serverBan`/`serverInvite.updateMany`/`serverMember.create` dışında hiçbir şey tanımlamıyor ve test hâlâ yeşil — yani `createServerMembership` davet-özel adımlardan (hedef kontrolü, süre, kullanım hakkı) SONRA, aynı `tx` içinde çağrılıyor, öncesinde değil.

## Bağlayıcı karar 2 — kontrol sırası (aynen uygulandı)

`joinPublicWorkspaceServer`: ban → zaten üye mi → `maxMembers` → `isPublic`, tam bu sırada. Davet yolundaki gibi yalnız ban transaction içinde tekrar kontrol ediliyor (defense-in-depth); zaten-üye/maxMembers/isPublic tekrar kontrol edilmiyor — davet yolu da kendi analog ön-koşullarını (hedef kullanıcı, süre) transaction içinde tekrar kontrol etmiyor, aynı emsali koruyorum.

**Not edilmesi gereken sonuç:** sıra `maxMembers`'ı `isPublic`'ten önce kontrol ettiği için, **dolu ve özel** bir sunucuya doğrudan id ile katılma denemesi 404 değil 403 (`SERVER_FULL`) döner — yani bu dar kesişimde "var ve dolu" bilgisi sızar ("yok" ile ayırt edilebilir). Bu, promptun kelimesi kelimesine verdiği sırayı olduğu gibi uyguladığım için ortaya çıkan bir durum; kendi kararımla değiştirmedim. Aşağıdaki "Kaygılar" bölümünde tekrar geçiyor.

## Bağlayıcı karar 5 — çevrimiçi sayısı Redis'e taşındı, S2 dahil

Seçim: **S2'nin tekil okuması da aynı anda Redis'e geçirildi** (DB yolunda bırakma seçeneği kullanılmadı). Gerekçe: DB tabanlı sayım `user.status` alanına dayanıyordu, Redis seti canlı soket-oda üyeliğine — bunlar temelde farklı sinyaller ve aynı anda farklı sayı üretebilirlerdi. Aynı kaynağa (Redis, `server:<id>:online`) taşımak eşitliği **kanıtla değil kurgusal olarak** garanti ediyor.

Kanıt (kaynakta eşitlik): `apps/web/src/lib/socket/server-online-presence.test.ts`, `"agrees with the single-server primitive reading the exact same set"` — aynı sahte redis+set üzerinde `countServerOnlineMembers` ile `countServerOnlineMembersBatch` aynı sayıyı döndürüyor.

`server-public-profile-service.ts`'teki değişiklik `getOnlineServerMemberCount`'u (zaten var, zaten test edilmiş, mobil sunucu detayında zaten kullanılıyor — `unread-service.ts`) çağırıyor; yeni bir okuma yolu icat etmedim. Mevcut 12 test **hiç değişmeden** yeşil kaldı çünkü hiçbiri `onlineCount`'u WithDatabase yolundan assert etmiyordu (yalnız saf `buildServerPublicProfile` testleri assert ediyordu, onlar zaten önceden hesaplanmış değer alıyor). 3 yeni test ekledim (Redis'ten okuma, hazır-değilse-sıfıra-düşme).

---

## EXPLAIN kanıtı — ve bir gerçek düzeltmesi

**Promptun binding decision 3'ü yanlış çıktı; düzeltip rapora yazıyorum (00 §3'ün izin verdiği gibi).** `@@index([type, discoverable, memberCount])` (S1) keşif sorgusunu **kullanamıyor**: `type` filtrelenmiyor (hem PERSONAL hem COMMUNITY keşfedilebilir olabilir, C turu bunu açacak), `isPublic` o index'te hiç yok. Yerel DB'de 8000 satır seed edip `EXPLAIN (ANALYZE, BUFFERS)` çalıştırdım:

**Eski index ile — Seq Scan:**

```
Limit  (cost=374.86..374.91 rows=21 width=169) (actual time=0.875..0.877 rows=21 loops=1)
  ->  Sort  (cost=374.86..384.86 rows=4000 width=169) (actual time=0.874..0.875 rows=21 loops=1)
        Sort Key: "memberCount" DESC, id DESC
        ->  Seq Scan on "Server"  (cost=0.00..267.01 rows=4000 width=169) (actual time=0.004..0.579 rows=4000 loops=1)
              Filter: (discoverable AND "isPublic")
              Rows Removed by Filter: 4001
```

**Düzeltme:** yeni index `@@index([discoverable, isPublic, memberCount])`, migration `packages/db/prisma/rebaseline-migrations/20260808120000_server_discovery_index/migration.sql`. Aynı 8000 satırla, aynı sorgu:

**Yeni index ile — Index Scan Backward:**

```
Limit  (cost=0.49..5.52 rows=21 width=169) (actual time=0.026..0.028 rows=21 loops=1)
  ->  Incremental Sort  (cost=0.49..958.88 rows=4000 width=169) (actual time=0.026..0.026 rows=21 loops=1)
        Sort Key: "memberCount" DESC, id DESC
        Presorted Key: "memberCount"
        ->  Index Scan Backward using "Server_discoverable_isPublic_memberCount_idx" on "Server"  (cost=0.28..779.16 rows=4000 width=169) (actual time=0.007..0.017 rows=22 loops=1)
              Index Cond: ((discoverable = true) AND ("isPublic" = true))
Execution Time: 0.045 ms
```

Cursor'lu (keyset) ve `query` aramalı varyantlar da aynı index'i kullanıyor (Index Cond aynı, `Filter` yalnız keyset/isim koşulunu ekliyor) — üçü de kanıtlandı, tam çıktı aşağıda özetlendi:

- Cursor'lu: `Index Scan Backward using "Server_discoverable_isPublic_memberCount_idx"`, `Execution Time: 0.581 ms`.
- `name ILIKE` aramalı: `Index Scan Backward using "Server_discoverable_isPublic_memberCount_idx"`, `Filter: (name ~~* '%SEED_1%')`, `Execution Time: 0.097 ms`.

Eski `[type, discoverable, memberCount]` index'ini **silmedim** — başka bir okuma yolunun ona bağlı olup olmadığını doğrulamadım, bu promptun kapsamı dışında; ekibin gözden geçirmesi gerekir (bkz. Kaygılar).

**Yerel DB durumu notu:** EXPLAIN'i koşabilmek için önce yerel DB'nin S1 migration'ını (`type`/`memberCount` kolonları + eski index) hiç almadığını keşfettim — `prisma migrate status` migration geçmişini görmüyordu (bu DB `db push` ile yönetiliyor, migration tablosu yok), ve `prisma db push --accept-data-loss` **Prisma'nın kendi AI-agent güvenlik kapısı tarafından reddedildi** (ClientHealth*/DMMessage/Message tablolarında başka eşzamanlı işlerden bekleyen unique constraint'ler var — bunlara dokunmak için kullanıcı onayı gerekiyor, ben onayı alamadım, o yüzden denemedim). Bunun yerine **yalnız** zaten var olan, zaten yazılmış S1 migration dosyasının SQL'ini (aynen) ve kendi yeni index'imi doğrudan uyguladım — DMMessage/ClientHealth'e dokunmadım. Seed ettiğim 8000 satırı işim bitince sildim (`deleteMany` ile, doğrulandı: 0 kalıntı).

---

## Test gate — davet yolu (bozulmadı kanıtı)

**ÖNCE** (herhangi bir değişiklik yapmadan, `apps/web` içinde):

```
node --import tsx --test --test-force-exit src/lib/workspace/service.test.ts
ℹ tests 34 / pass 34 / fail 0
```

**SONRA** (tüm Bölüm A+B değişiklikleri, migration dahil, tamamlandıktan sonra):

```
node --import tsx --test --test-force-exit src/lib/workspace/service.test.ts
ℹ tests 34 / pass 34 / fail 0
```

`git status`/`git diff` doğrulaması: `service.test.ts` bu oturumda **hiç dokunulmadı** (`git diff --stat` boş çıktı verdi).

---

## Idempotency kararı

**Zaten üye → 200 `{success:true}`, hata değil.** `joinWorkspaceServerByInvite` zaten bunu yapıyor (`alreadyMember: true` ile normal 200 dönüyor — `mobileServerJoinRoute` `alreadyMember`'a göre dallanmıyor). Yeni ucu **davranışça tutarlı** tutmak için aynı deseni seçtim: aynı kullanıcı aynı sunucuya iki kez katılmayı denerse ikisi de aynı başarı şeklini görür. 409 seçmedim çünkü bu üründe "zaten üyesin" bir hata değil, istenen son durumun zaten gerçekleşmiş olması.

## Rate limit sayısı

**10/saat**, hem `server:join-public` hem `mobile:server:join-public`. Gerekçe: `server:create`/`admin:server:create`'in zaten kullandığı tavan (10/saat) — katılma da, oluşturma gibi, kalıcı bir satır yazıyor (`ServerMember`), paylaşılan bir sayacı artırıyor (`memberCount`), ve socket+mesaj fan-out'u tetikliyor: aynı patlama yarıçapı sınıfı. Davet kodu tüketen `mobile:server:join`'den (20/10dk ≈ 120/saat eşdeğeri) **kasıtlı olarak daha sıkı**: davet kodu bir sır gerektirir, ama açık katılma yalnız `serverId` gerektirir — ve `serverId`'ler doğrudan keşif listesinden (Bölüm A) numaralandırılabilir. Bir bot keşif listesini tarayıp yüzlerce sunucuya art arda katılmayı deneyebilir; bu tavan onu sınırlıyor, gerçek bir kullanıcının bir oturumda birkaç topluluğa katılmasını engellemeden.

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
ℹ tests 2018
ℹ suites 453
ℹ pass 2018
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

(S2 kapanışında ölçülen taban 1957/1957'ydi; bu turun +48 testinin üstüne, ağaçtaki diğer eşzamanlı işlerin de kendi testleri var — 2018, 1957'nin altına düşmedi, madde bu.)

Odaklı koşumlar (hepsi 0 fail):

- `src/lib/workspace/invite-service.test.ts` — 6/6
- `src/lib/socket/server-online-presence.test.ts` — 27/27 (22 mevcut + 5 yeni)
- `src/lib/servers/server-public-profile-service.test.ts` — 15/15 (12 mevcut + 3 yeni)
- `src/lib/servers/server-discovery-service.test.ts` — 14/14 (yeni)
- `src/app/api/v1/servers/[serverId]/join/route-logic.test.ts` — 5/5 (yeni)
- `src/app/api/v1/mobile/servers/[serverId]/join/route-logic.test.ts` — 5/5 (yeni)
- `src/app/api/v1/servers/discover/route-logic.test.ts` — 6/6 (yeni)
- `src/app/api/v1/mobile/servers/discover/route-logic.test.ts` — 4/4 (yeni)
- `src/app/api/v1/route-contract.test.ts` — 25/25 (auth-guard allowlist, bodyless mutating kaydı, M1 haritası/sayacı dahil)
- `src/lib/api-rate-limit.test.ts` — 7/7
- `packages/types/src/workspace.test.ts` — 17/17 (schema coverage dahil)

---

## Sapmalar

1. **Yeni index + migration eklendi** (`20260808120000_server_discovery_index`), promptun binding decision 3'ünün "mevcut index kullanılır" iddiası EXPLAIN ile yanlışlandığı için. Kapı bölümü bunu açıkça bekliyordu ("Sequential scan çıkarsa düzelt"); over-engineering yasağına rağmen bu satırlar promptun kendi "Teslim" listesinin bir parçası (index kanıtı).
2. **S2'nin tekil okuması da Redis'e taşındı** — karar 5'in izin verdiği iki seçenekten "aynı anda geçir" seçildi, "DB'de bırak" değil. `server-public-profile-service.ts` bu yüzden değişti (S2'nin dosyası, ama S3'ün kendi binding decision'ı bunu açıkça sanıyor).
3. **Rate limit eylem adları** (`server:discover`, `mobile:server:discover`, `server:join-public`, `mobile:server:join-public`) promptta verilmemişti, kendim seçtim — `mobile:server:join` (davet kodu ucu) ile çakışmaması için `-public` son eki bilinçli.
4. **Mobil katılma yanıtı** yeni bir şema yazmak yerine mevcut `MobileMutationSuccessResponseSchema`yı (`{success:true}`, zaten 6+ çağıranı var) tekrar kullandı — `alreadyMember` gövdeye taşınmadı, çağıran zaten `serverId`'yi path'ten biliyor.
5. Yerel dev DB'nin S1 migration'ını hiç almadığı ortaya çıktı; onu (aynen, DMMessage/ClientHealth'e dokunmadan) uyguladım — aksi halde EXPLAIN hiç koşamazdı.

## Eklenmeyenler

- **Bölüm C, D, E** — hiç açılmadı, promptun kendi sınırı ("Section C, D and E are UI passes that run after you").
- Trigram/full-text arama — yasaklıydı, `contains` kullanıldı, ölçüm: 8000 satır + `discoverable+isPublic` index'i üzerinden `name ILIKE` 0.097ms'de (index scan içinde `Filter` olarak) — bu veri hacminde ayrı bir arama servisi gerekmiyor.
- Eski `[type, discoverable, memberCount]` index'inin silinmesi — kimin ona bağlı olduğunu doğrulamadım, kapsamım değil.
- `graphify update .` — `graphify-out/**` yasağıyla kök `CLAUDE.md` talimatı çelişiyor (02-rapor.md'nin de bildirdiği aynı çelişki); yasağa uydum, koşmadım.

## Kaygılar

1. **Karar 2'nin literal sırası bir sızıntı üretiyor:** dolu + özel bir sunucuya doğrudan `serverId` ile katılma denemesi 404 değil 403 döner (maxMembers kontrolü isPublic'ten önce). Dar bir kesişim (özel VE dolu VE id tahmin edilmiş) ama var olma bilgisi sızıyor. Promptun verdiği sırayı olduğu gibi uyguladım; sıra tersine çevrilseydi (isPublic önce) bu sızıntı kapanırdı ama binding decision'ın literal metnine aykırı olurdu — ekibin bilinçli bir seçim yapması gerekiyor.
2. **Eski `[type, discoverable, memberCount]` index'i artık hangi sorguyu servis ediyor, bilmiyorum.** S1 raporunda "keşif sorgusu için" diye tanıtılmıştı ama hiçbir çalışan kod ondan yararlanamıyordu (keşif kodu S3'ten önce yoktu). Ya başka bir gelecek kullanım için tasarlandı ya da S1'in bir hatası. Silinmeli mi, kalmalı mı — ben karar vermedim.
3. **Yerel dev DB'de bekleyen, bana ait olmayan şema değişiklikleri var** (ClientHealthDailySummary/ClientHealthEvent/DMMessage/Message'a yeni unique constraint'ler) — `prisma db push` bunları uygulamadan önce veri kaybı uyarısı verdi ve Prisma'nın AI-agent güvenlik kapısı beni durdurdu. Bunlara dokunmadım. Birisi bu DB'yi `schema.prisma`'yla senkronlamak isterse, `pnpm --filter @wizards/db exec prisma db push --accept-data-loss` çalıştırıp uyarıları elle gözden geçirmesi gerekecek — ben bunu otonom yapamam/yapmamalıyım.
4. **`joinPublicWorkspaceServer`'ın maxMembers/existingMember/isPublic kontrolleri transaction içinde tekrarlanmıyor** (yalnız ban tekrarlanıyor) — davet yolunun kendi emsalini birebir yansıtıyorum, ama bu, iki eşzamanlı `joinPublicWorkspaceServer` çağrısının (aynı kullanıcı, çifte tıklama gibi) ikisinin de dış kontrolü geçip birinin `tx.serverMember.create`'te unique constraint hatasıyla patlamasına yol açabilir (500, temiz bir idempotent yanıt değil). Bu, davet yolunda zaten var olan, benim icat etmediğim bir boşluk — ama yeni bir yüzeyde (id tahmin edilebilir, çifte tıklama daha olası) daha görünür olabilir.

---

## Bilinen boşluklar (S3'ün geri kalanı için)

1. Görünürlük anahtarları (Bölüm C) henüz yok — sahipler `isPublic`/`discoverable`'ı UI'dan değiştiremiyor, yalnız API/DB seviyesinde var.
2. Keşif ekranları (Bölüm D) henüz yok — web `app/(main)/discover/` rotası, mobil `Discover` ekranı hiç başlamadı.
3. TR/EN kopya metinleri (Bölüm E) henüz yok.
4. Görsel parite (S2'den devralınan boşluk) hâlâ doğrulanmadı.
