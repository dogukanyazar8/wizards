# 06 — Keşif imleci ve audit atomikliği raporu

Dal `uat`, commit yok, `git add` yok. İki bağımsız bulgu: **Finding 6** (keşif sayfalama), **Finding 8** (admin mutasyon/audit atomikliği). `apps/web/src/lib/workspace/invite-service.ts` ve `apps/web/src/lib/workspace/unread-service.ts`'e dokunulmadı (eşzamanlı başka iş bu iki dosyayı sahipleniyor).

---

## Finding 6 — keyset imleci artık row-value karşılaştırması

**Seçilen şekil: (a) — ham id sayfası, sonra tipli hydrate.**

Gerekçe: keşif kartı sözleşmesi bilinçli olarak dar bir alt küme (`SERVER_DISCOVERY_SELECT`) ve bunun tek kaynak olması gerekiyor (00 §2, promptun kendi "strict subset" şartı). (b) tüm sütunları ham SQL'e elle yazmayı gerektirirdi — `SERVER_DISCOVERY_SELECT`'e alan eklenip ham sorguya eklenmezse derleyici yakalamaz, sessiz bir sızıntı olur. (a)'nın ikinci sorgusu (`id IN (...)`, primary key üzerinden) ölçüldü: **21 satırlık bir sayfa için 0,088 ms / 84 buffer** — anahtar sorgudan kazanılan ~15 ms'nin yanında ihmal edilebilir. İki sorgu, ikincisi ucuz bir PK lookup: type safety'den vazgeçmeye değecek bir kazanç yok.

Prisma'nın `findMany` düzeyi hâlâ kullanılıyor — sadece **imleç varken** (`cursor !== null`) ham SQL'e düşülüyor. İlk sayfa (imleçsiz) zaten index-served olduğu için (aşağıdaki "plain" ölçümü) dokunulmadı; bu hem değişikliğin yüzeyini küçültüyor hem de mevcut testlerin çoğunu (imleçsiz olanlar) olduğu gibi bırakıyor.

Uygulama: `apps/web/src/lib/servers/server-discovery-service.ts`

- `buildDiscoveryKeysetWhere` (eski OR-tabanlı Prisma `where` üreticisi) silindi — kullanılmıyor, dead code olurdu.
- `queryDeepCursorDiscoveryIds` — `database.$queryRaw<{id:string}[]>(Prisma.sql\`...\`)`, satır-değer karşılaştırması `("memberCount", "id") < ($cursor.memberCount, $cursor.id)`. Tagged-template `Prisma.sql`kullanıldı (parametreli),`$queryRawUnsafe` yok.
- `hydrateDiscoveryCards` — `id IN (...)` ile `SERVER_DISCOVERY_SELECT` üzerinden tipli hydrate, ham sorgunun id sırasına göre yeniden sıralıyor (`IN` sırayı korumaz).
- `fetchDiscoveryPhaseRows` — imleç yoksa eski tipli `findMany`, imleç varsa yukarıdaki ikili.
- `listDiscoverableServersWithDatabase` gövdesi: iki `findMany` çağrısı yerine iki `fetchDiscoveryPhaseRows` çağrısı; dış davranış (faz sırası, "featured tükendiyse rest baştan başlar" mantığı, `hasMore` hesaplaması) **değişmedi**.

### `EXPLAIN` kanıtı

Gerçek `Server` tablosunda tek satır var (planlayıcı orada her zaman seq scan seçer), bu yüzden 04-rapor.md'nin prob tablosu yöntemi tekrarlandı: `server_probe` (aynı kolonlar: `id text`, `discoverable bool`, `isPublic bool`, `memberCount int`, `features text[]`, `name text`), aynı index tanımı `(discoverable, "isPublic", "memberCount")`, 200.000 satır, dağılım %90 discoverable / %95 isPublic / %1 FEATURED (04-rapor ile aynı), `ANALYZE` sonrası `EXPLAIN (ANALYZE, BUFFERS)`. Ölçüm sonunda prob tablosu düşürüldü. Postgres 16.14 (`wizards-postgres` konteyneri, yerel).

**1) Rest fazı, derin imleç — ÖNCE (mevcut `buildDiscoveryKeysetWhere` OR yüklemi)**

```
Limit  (actual time=15.431..15.433 rows=21 loops=1)
  Buffers: shared hit=77144 read=1
  ->  Incremental Sort  Sort Key: "memberCount" DESC, id DESC  Presorted Key: "memberCount"
        ->  Index Scan Backward using probe_disc_pub_member_idx on server_probe
              Index Cond: ((discoverable = true) AND ("isPublic" = true))
              Filter: ((NOT (features @> '{FEATURED}'::text[])) AND (("memberCount" < 275567)
                       OR ((id < 'srv_00163982'::text) AND ("memberCount" = 275567))))
              Rows Removed by Filter: 76753
              Buffers: shared hit=77144 read=1
Execution Time: 15.462 ms
```

**2) Rest fazı, aynı derin imleç — SONRA (row-value karşılaştırması)**

```
Limit  (actual time=0.028..0.029 rows=21 loops=1)
  Buffers: shared hit=30
  ->  Incremental Sort  Sort Key: "memberCount" DESC, id DESC  Presorted Key: "memberCount"
        ->  Index Scan Backward using probe_disc_pub_member_idx on server_probe
              Index Cond: ((discoverable = true) AND ("isPublic" = true) AND ("memberCount" <= 275567))
              Filter: ((NOT (features @> '{FEATURED}'::text[])) AND
                       (ROW("memberCount", id) < ROW(275567, 'srv_00163982'::text)))
              Rows Removed by Filter: 2
              Buffers: shared hit=30
Execution Time: 0.053 ms
```

`memberCount <= 275567` artık **Index Cond**'un içinde — Postgres bunu satır-değer karşılaştırmasının ilk üyesinden türetiyor, `id` index'te olmadığı hâlde. Kalan `Filter` yalnızca `memberCount` eşitlik sınırındaki (tipik olarak 0-2 satır) satırları eliyor. **77.145 → 30 buffer (~2571×), 15,46 ms → 0,053 ms (~292×), 76.753 → 2 satır filtreyle elenen.**

**3) Featured fazı, derin imleç — SONRA (row-value)**

```
Limit  (actual time=0.555..0.557 rows=21 loops=1)
  Buffers: shared hit=2137 read=6
  ->  Incremental Sort ...
        ->  Index Scan Backward using probe_disc_pub_member_idx on server_probe
              Index Cond: ((discoverable = true) AND ("isPublic" = true) AND ("memberCount" <= 260547))
              Filter: ((features @> '{FEATURED}'::text[]) AND
                       (ROW("memberCount", id) < ROW(260547, 'srv_00085680'::text)))
              Rows Removed by Filter: 2108
              Buffers: shared hit=2137 read=6
Execution Time: 0.585 ms
```

`memberCount` sınırı yine Index Cond'da. Kalan 2108 satırlık filtre, `features @> ARRAY['FEATURED']` testinden geliyor — bu B4 raporunda zaten ölçülüp bilinçli olarak kısmi index'e bağlanmayan, bu bulgunun kapsamı **dışındaki** bir maliyet (FEATURED nüfusun %1 gibi seyrek olması). Keyset kısmı index-served; seq scan yok.

**4) Plain, imleçsiz — dokunulmadı, referans**

```
Limit  (actual time=0.034..0.036 rows=21 loops=1)
  Buffers: shared hit=26
  ->  Index Scan Backward using probe_disc_pub_member_idx on server_probe
        Index Cond: ((discoverable = true) AND ("isPublic" = true))
Execution Time: 0.059 ms
```

Keyset yüklemi hiç yok — zaten index-served, `fetchDiscoveryPhaseRows` bu durumda hâlâ eski tipli `findMany`'i çağırıyor.

**5) Aranan + derin imleç — ÖNCE vs SONRA**

```
ÖNCE:  Buffers: shared hit=77308   Rows Removed by Filter: 76917   Execution Time: 27.135 ms
SONRA: Buffers: shared hit=193     Rows Removed by Filter: 166     Execution Time: 0.229 ms
```

İkisinde de `Index Cond` yalnız `discoverable`/`isPublic`; SONRA'da ayrıca `memberCount <= 275567`. `name ILIKE` (S3 §A kararınca sargable değil, indexlenmemiş) hâlâ `Filter`'da — bu bulgunun düzelttiği şey değil — ama keyset artık `memberCount`'u önceden sınırladığı için `ILIKE` yalnızca o daralmış aralıktaki satırları kontrol ediyor: **77.308 → 193 buffer, 27,1 ms → 0,229 ms.**

**Option (a)'nın ikinci sorgusu — ölçüm**

```
Index Scan using server_probe_pkey on server_probe
  Index Cond: (id = ANY ('{...21 id...}'::text[]))
  Buffers: shared hit=84
Execution Time: 0.088 ms
```

**Dört varyantın hepsi index-served:** plain (dokunulmadı, zaten öyleydi), cursored/rest (Index Cond'a `memberCount` girdi), searched (aynı), featured fazı (aynı, kalan filtre maliyeti FEATURED seyrekliğinden — kapsam dışı). Hiçbirinde seq scan yok.

### Testler

`apps/web/src/lib/servers/server-discovery-service.test.ts`: 18 → 21 test. `fakeDatabase` `$queryRaw` + hydrate-`findMany`'i (id sırasını **tersine çeviren** bir stub ile) destekleyecek şekilde genişletildi; imleçsiz testler dokunulmadan geçiyor (yeni dallar onlar için hiç tetiklenmiyor). İki test yeniden yazıldı (artık OR değil row-value şeklini doğruluyorlar), üç yeni test eklendi: hydrate + id-sırasına-göre-yeniden-sıralama, boş id listesinde hydrate sorgusu atlanması, arama+imleç kombinasyonunun tek ham sorguda birleşmesi.

---

## Finding 8 — admin mutasyon + audit atomikliği

**Atomik hale gelen üç yol: `updateAdminServer`, `recountAdminServerMembers`, `deleteAdminServer`.**

Mekanizma: her üçünün dependency sözleşmesi `updateServer`/`deleteServer`/`recomputeMemberCount` + `writeAuditLog` iki ayrı alan yerine **tek** `withTransaction(run)` alanı taşıyor; `run` bir `tx` alıyor ve mutasyon + audit'i **aynı callback içinde** çalıştırıyor. Transport (`route.ts`, `[serverId]/route.ts`, `[serverId]/recount/route.ts`) bunu gerçek `prisma.$transaction((tx) => run({...tx'ye bağlı...}))` ile sarıyor. `findServer` (404 kontrolü) transaction'ın **dışında** kalıyor — yan etkisiz bir okuma, mutasyon+audit'in paylaştığı atomiklik garantisine ihtiyacı yok.

`writeAdminAuditLog` (`apps/web/src/lib/admin/audit-log.ts`) ikinci, opsiyonel bir `client` parametresi aldı (`Pick<PrismaClient, "adminAuditLog"> = prisma`); üç yol da kendi `tx`'ini geçiriyor. Bu parametre opsiyonel olduğu için servers dışındaki ~15 çağıran (`feedback`, `help/articles`, `releases/*`, `moderation/case-actions`, `feature-flags`, ...) hiç dokunulmadan 1-argümanlı çağrılarına devam ediyor — tam süit (2069 test) bunu doğruladı.

**`createAdminServer` atomik hale getirilmedi — bilinçli, gerekçeli.**

`dependencies.createServer` (→ `createWorkspaceServerForAdmin` → `createWorkspaceServer`, `apps/web/src/lib/workspace/server-service.ts`) kendi `prisma.$transaction(async (tx) => {...})`'ini açıyor. Prisma iç içe interactive transaction'ı desteklemiyor: `tx`'in kendi `$transaction` metodu yok. Audit'i bu mevcut transaction'a dikebilmek için `createWorkspaceServer`'ın **kendi transaction'ını açmak yerine dışarıdan bir transaction client kabul edebilmesi** gerekirdi — imzasını ve iç akışını değiştiren bir müdahale. `createWorkspaceServer` aynı zamanda tüketici rotasının (`POST /api/v1/servers`, iki argümanlı, her zaman `PERSONAL` üretir, hiç audit'lenmez) tek çağırdığı fonksiyon. Bu değişiklik admin'e özgü bir boşluğu kapatmak için paylaşılan tüketici yolunu yeniden şekillendirmeyi gerektirirdi — prompt bunu açıkça yasaklıyor ("do not reshape the consumer path to make the admin path prettier"). Gerekçe hem `route-logic.ts`'teki `createAdminServer`'ın doc-comment'ine hem buraya yazıldı; kod aynı kaldı. **Bilinen, kabul edilmiş boşluk:** iki çağrı arasında bir DB kesintisi, audit satırı olmayan bir sunucu bırakabilir.

### Testler

`apps/web/src/app/api/v1/admin/servers/route-logic.test.ts`: 19 → 22 test. Mevcut `buildUpdateDependencies`/`buildDeleteDependencies`/recount'un yerel yardımcı fonksiyonu `withTransaction`'ı sarıp `run`'ı hemen çalıştıracak şekilde güncellendi — `tx`'in iki metodu eskisiyle birebir aynı davrandığı için **mevcut hiçbir assertion değişmedi** (çağrı sırası, update/delete/recount içeriği, audit içeriği).

Üç yeni test (her yol için biri) — **audit yazımı başarısız olunca mutasyonun geri alındığını** kanıtlıyor:

```ts
withTransaction: async (run) => {
  const staged: AdminServerUpdateData[] = [];
  await run({
    updateServer: async (_id, data) => {
      staged.push(data);
    },
    writeAuditLog: async () => {
      throw new Error("audit log write failed");
    },
  });
  committed.push(...staged); // buraya asla ulaşılmıyor
};
```

`writeAuditLog` fırlatınca `run(tx)` reddediyor, `committed.push(...)` satırına hiç ulaşılmıyor (staged veri asla "commit" edilmiş sayılmıyor), hata `updateAdminServer`/`deleteAdminServer`/`recountAdminServerMembers`'ın kendisinden dışarı sızıyor. Gerçek bir `prisma.$transaction` altında `tx` üzerinden yapılan yazımlar callback fırlatınca gerçekten rollback olur — bu double, o garantiyi veritabanısız kanıtlıyor: mutasyon + audit **aynı `withTransaction` çağrısı içinde**, ayrı değil.

---

## Doğrulama komutları ve çıktıları

### Odaklı testler

```
$ DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" \
  node --import tsx --test src/lib/servers/server-discovery-service.test.ts
ℹ tests 21   ℹ pass 21   ℹ fail 0

$ DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" \
  node --import tsx --test src/app/api/v1/admin/servers/route-logic.test.ts
ℹ tests 22   ℹ pass 22   ℹ fail 0
```

(`DATABASE_URL` burada yalnız Prisma'nın modül-yükleme sırasındaki bağlantı-dizesi doğrulamasını geçmek için — `apps/web/scripts/run-node-tests.mjs`'in kendi testEnvironment'ında yaptığı gibi; testler gerçek bir veritabanına dokunmuyor, hepsi enjekte edilmiş sahte bağımlılıklarla çalışıyor.)

### `pnpm --filter @wizards/web typecheck`

```
$ pnpm --filter @wizards/web typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
(exit 0)
```

### `pnpm --filter @wizards/web test`

```
$ pnpm --filter @wizards/web test
...
ℹ tests 2069
ℹ suites 461
ℹ pass 2069
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
(exit 0)
```

Taban çizgisi (promptta verilen): 2060 passing / 0 failing / 461 suites. Gerçek: 2069/0/461. Fark +9: bu görevin kendi katkısı **+6** (discovery +3, admin route-logic +3); kalan **+3**, ağaçta eşzamanlı çalışan başka bir geçişin (`invite-service.ts`/`unread-service.ts` + yeni `invite-service.test.ts`, `git status` ile doğrulandı — bu dosyalar zaten değiştirilmiş/yeni durumdaydı, bu oturumda dokunulmadı) kendi test eklemelerinden geliyor. Süit 0 fail ile yeşil; iki bağımsız iş çakışmadan bir arada duruyor.

### Kapı (`Invoke-LocalGate.ps1 -Profile Standard`)

```
$ powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
[PASS] standard-lint (14804 ms, exit 0): pnpm.cmd lint
[PASS] standard-typecheck (5759 ms, exit 0): pnpm.cmd typecheck
[FAIL] standard-format (3825 ms, exit 1): pnpm.cmd format
[SKIP] standard-tests (0 ms, exit ): pnpm test
Local Quality Gate: Standard [FAIL]
```

`format` adımı şu iki dosya yüzünden kırmızı:

```
Format check failed: 2 changed file(s) need Prettier (1f71c35514d1 baseline):
  docs/prompts/sunucu-tipi-gorunurluk/raporlar/07-katilim-yarisi-ve-fetchsockets.md
  packages/types/src/workspace.ts
```

**Bu iki dosyaya bu oturumda hiç dokunulmadı** — `07-...md` başka bir promptun (07) raporu, `workspace.ts` eşzamanlı invite/unread geçişine ait (`git status` bunu değiştirilmiş/uncommitted olarak gösteriyor, ben editlemedim). İlk kapı çalıştırmasında bu listede benim yazdığım iki dosya da vardı (`route-logic.ts`, `route-logic.test.ts`); `pnpm exec prettier --write` yalnız o ikisine uygulandı (kozmetik: uzun tip imzalarının satır sarımı, davranış değişikliği yok — testler prettier sonrası tekrar koşuldu, aynı 22/22), ikinci çalıştırmada onlar listeden düştü. Kalan iki dosya benim kapsamımın dışında olduğu için düzeltilmedi (00 §1: "Bu ağaçta eşzamanlı başka işler var" + bu promptun "yalnız bu iki bulguyu düzelt" sınırı). `standard-tests` adımı bu yüzden hiç koşmadı (kapı script'i format hatasında durur) — ama `pnpm --filter @wizards/web test` doğrudan koşuldu ve yukarıdaki gibi 2069/2069 yeşil.

`graphify update .` **koşulmadı** — bu promptun "Binding constraints" bölümü `graphify-out/**`'i açıkça "dokunma" listesine koyuyor; kökteki `CLAUDE.md`'nin genel "kod değiştirince graphify update çalıştır" kuralıyla çelişiyor, bu promptun daha özgül talimatı tercih edildi. `git status` zaten `graphify-out/**`'in eşzamanlı başka bir iş tarafından değiştirilmiş olduğunu gösteriyor.

---

## Sapmalar

1. **Finding 6, sadece imleçli dal ham SQL'e taşındı.** İmleçsiz (ilk sayfa) dal, zaten index-served olduğu için (madde 4 EXPLAIN'i) eski tipli `findMany`'de bırakıldı. Bu, promptun "Prisma'nın query builder'ı row-value karşılaştırması ifade edemez" gözlemiyle tutarlı bir minimal-diff kararı; alternatif (her zaman ham SQL) mevcut testlerin çoğunu gereksiz yere kırardı ve zaten hızlı olan bir yolu yeniden yazardı.
2. **Kısmi index yazılmadı** (Finding 6 zaten istemiyor) — B4 raporunun kapattığı bir tartışma, tekrar açılmadı.
3. **`createAdminServer` atomik değil** — yukarıda gerekçelendirildi, kabul edilen bilinen boşluk.
4. **Kapının `format` adımı kapsam dışı iki dosya yüzünden kırmızı bırakıldı** — düzeltmek benim dokunmadığım dosyaları değiştirmek anlamına gelirdi.
5. **`graphify update .` koşulmadı** — bu promptun `graphify-out/**` dokunma yasağı, kökteki genel kuralı geçersiz kılıyor.

## Eklenmeyenler

- **Finding 6 için yeni index/migration** — ölçüldü ki gerek yok, satır-değer karşılaştırması mevcut `[discoverable, isPublic, memberCount]` index'ini yeterince kullanıyor (`memberCount <= X` Index Cond'a giriyor).
- **Featured fazının `features @> ARRAY[...]` filtre maliyeti** — bu bulgunun kapsamı dışı (B4'te ölçülüp kısmi index kasıtlı olarak ertelenmişti); bu geçiş onu ne düzeltti ne kötüleştirdi.
- **`name ILIKE` araması için index/trigram** — S3 §A kararı, bu bulgu tarafından yeniden açılmadı.
- **`createAdminServer`'ın atomik hale getirilmesi** — yukarıda gerekçelendirilen bilinçli atlama.
- **`writeAdminAuditLog` için yeni birim test dosyası** — fonksiyon iki satırlık bir pass-through (`client.adminAuditLog.create(...)`); asıl entegrasyon garantisi route-logic'in üç rollback testiyle ve tam test süitinin (diğer ~15 çağıranı da kapsayan) yeşil kalmasıyla kanıtlanıyor. Yeni bir test dosyası promptun "Teslim" listesinde yok, 00 §2'ye göre eklenmedi.

## Bilinen boşluklar

1. **`hydrateDiscoveryCards`'daki iki sorgu arasında küçük bir yarış var.** Bir sunucu, id sorgusu ile hydrate sorgusu arasındaki anlık pencerede silinirse (ya da `discoverable`/`isPublic` değişirse) sayfadan sessizce düşer — hata fırlatmaz, boşluk da bırakmaz. Kod yorumunda belgelenmiş; yeni bir yazıcı yok, önceki tek-sorgulu koddaki eşdeğerinden (Prisma'nın kendi okumalarının da bir snapshot transaction'ı olmaması) daha geniş değil.
2. **Finding 8'in "known gap"i:** `createAdminServer`'da mutasyon ile audit hâlâ iki ayrı adım.
3. **`EXPLAIN` kanıtı prob tablosundan** — gerçek `Server` tablosunda tek satır var, planlayıcıyı gerçek veriyle zorlamak mümkün değildi (04-rapor'daki aynı bilinen sınırlama).
