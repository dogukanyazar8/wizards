# 04 — S4 raporu: Topluluk yönetimi + biriken borçlar

Dal `uat`, commit yok, `git add` yok. Sıra uygulandığı gibi: **A → B → C**, ardından bağımsız **D** ve **E**.

---

## Bölüm A — Terfi ve indirme

**Teslim edilenler**

| Madde                                    | Nerede                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/v1/admin/servers/[serverId]` | `apps/web/src/app/api/v1/admin/servers/[serverId]/route.ts` (transport, `parseJsonBody` + `requireAdminCapability("server.write")` + `enforceApiRateLimit(..., "admin:server:update")`) |
| Yeni zod şeması                          | `packages/types/src/workspace.ts` — `AdminUpdateServerSchema` (+ `AdminUpdateServerInput`)                                                                                              |
| DI'lı iş mantığı                         | `apps/web/src/app/api/v1/admin/servers/route-logic.ts` — `updateAdminServer`, saf yardımcı `resolveAdminServerUpdate`                                                                   |
| Karar 3'ün iki zorlaması                 | `resolveAdminServerUpdate` içinde, servis katmanında; UI'da değil                                                                                                                       |
| Capability kaydı                         | `apps/web/src/app/api/v1/admin/admin-route-capability.test.ts`                                                                                                                          |

**Şema, alanlar ve "dördüncü tekrar"**

`AdminUpdateServerSchema` alanları: `type`, `isPublic`, `discoverable`, `verificationLevel`, `verified`, `featured`.

"En az bir alan" yüklemi **elle sayılmıyor**:

```ts
const ADMIN_UPDATE_SERVER_FIELD_KEYS = Object.keys(AdminUpdateServerFieldsSchema.shape) as ...;

export const AdminUpdateServerSchema = AdminUpdateServerFieldsSchema.refine(
  (value) => ADMIN_UPDATE_SERVER_FIELD_KEYS.some((key) => value[key] !== undefined),
  { message: "validation.form.atLeastOne" },
);
```

Testi de listeye değil şemanın anahtarlarına bağladım (`packages/types/src/workspace.test.ts`): fixture kümesi `AdminUpdateServerSchema.shape` anahtarlarıyla `deepEqual` karşılaştırılıyor, sonra her alan tek başına parse ediliyor. Sözleşmeye alan eklenip test güncellenmezse **test kırmızıya döner**; yüklem sessizce bayatlayamaz. (Zod 4'te `.refine()` sonrası `.shape` korunuyor — doğruladım.)

**İki zorlama (Karar 3)**

- `type` hedefi `COMMUNITY` ise `isPublic` her zaman `true` yazılır. Sadece terfi anında değil: çağıran açıkça `isPublic:false` gönderse bile toplulukta `true`'ya zorlanır (create sözleşmesindeki `.refine()` ile aynı değişmez).
- `COMMUNITY → PERSONAL` geçişinde `discoverable` `false` yazılır. Tür değişmiyorsa kişisel sunucunun `discoverable` bayrağına dokunulmaz (kişisel sunucu keşifte olabilir; S3 kuralı).

Testler: `route-logic.test.ts` içinde `describe("resolveAdminServerUpdate")` (6 test) + `describe("updateAdminServer")` (2 test).

**Güncellemek zorunda kaldığım kapalı listeler**

| Liste                         | Dosya                                                          | Ne eklendi                                                                                                |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Rate-limit eylem union'ı      | `apps/web/src/lib/api-rate-limit.ts`                           | `admin:server:update`, `admin:server:recount`                                                             |
| Admin rota↔capability pinleri | `apps/web/src/app/api/v1/admin/admin-route-capability.test.ts` | `servers/route.ts` (`server.write`), `servers/[serverId]/route.ts`, `servers/[serverId]/recount/route.ts` |
| Gövdesiz mutasyon rotaları    | `apps/web/src/app/api/v1/route-contract.test.ts`               | `POST admin/servers/[serverId]/recount`                                                                   |
| Şema davranış kapsamı         | `packages/types/src/workspace.test.ts`                         | `AdminUpdateServerSchema` fixture'ı                                                                       |

`M1_MOBILE_RATE_LIMITS` ve route-contract'taki **sabit M1 rota sayacı güncellenmedi** — yeni mobil uç eklemedim (Karar 1: mobil uygulamaya topluluk yönetimi girmiyor). `PATCH` merkezî `parseJsonBody`'yi kullandığı için `:1327`/`:1347` kuralları kendiliğinden karşılandı.

---

## Bölüm B — Doğrulama rozeti, öne çıkarma ve sıralama

**Teslim edilenler**

- `VERIFIED` / `FEATURED` yönetimi aynı `PATCH` ucundan, `verified` / `featured` boolean'larıyla.
- Keşif sıralaması: `FEATURED` taşıyanlar üstte (`apps/web/src/lib/servers/server-discovery-service.ts`).
- Profil kartındaki rozet zaten `features.includes("VERIFIED")` okuyor — dokunulmadı.

**Sapma: `features` dizisi olduğu gibi kabul edilmiyor**

Prompt "`features` alanını yönetir" diyor. Uç, diziyi **toptan** almıyor; iki boolean alıyor ve diziye üyelik düzenlemesi yapıyor. Nedeni ölçülmüş bir gerçek: aynı kolon medya ayarlarını da taşıyor (`apps/web/src/lib/workspace/server-features.ts` — `TEXT_GIFS_DISABLED`, `TEXT_FILE_UPLOADS_DISABLED`, `MEMBER_ADDS_DISABLED`). Diziyi toptan yazmak, bir "öne çıkar" isteğinin sunucunun GIF/dosya/üye-ekleme ayarlarını sessizce silmesi demekti. Test: "adds and removes the feature flags without touching the media-settings flags".

### `EXPLAIN` ölçümü

Gerçek `Server` tablosunda tek satır var, planlayıcı orada her zaman seq scan seçer. Bu yüzden ölçüm, aynı kolonlara ve **S3'ün gönderdiği index tanımına** sahip 200.000 satırlık bir prob tablosunda yapıldı (`server_probe`, `probe_disc_pub_member_idx = (discoverable, "isPublic", "memberCount")`), `ANALYZE` sonrası, `EXPLAIN (ANALYZE, BUFFERS)` ile. Prob tablosu ölçüm sonunda düşürüldü. Dağılım: %90 `discoverable`, %95 `isPublic`, %1 `FEATURED`.

**V1 — S3'ün bugünkü sorgusu (taban çizgisi)**

```
Limit (actual time=0.442..0.444 rows=21 loops=1)
  ->  Incremental Sort  Sort Key: "memberCount" DESC, id DESC  Presorted Key: "memberCount"
        ->  Index Scan Backward using probe_disc_pub_member_idx on server_probe
              Index Cond: ((discoverable = true) AND ("isPublic" = true))
              Buffers: shared hit=22 read=3
Execution Time: 0.477 ms
```

**V2 — promptun önerdiği "iki anahtarlı `orderBy`", dizi üzerinde**

```sql
ORDER BY (features @> ARRAY['FEATURED']) DESC, "memberCount" DESC, id DESC
```

```
Limit (actual time=18.898..20.563 rows=21 loops=1)
  ->  Gather Merge  Workers Launched: 1
        ->  Sort  Sort Key: ((features @> '{FEATURED}'::text[])) DESC, "memberCount" DESC, id DESC
              Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on server_probe  (rows=90000 loops=2)
                    Buffers: shared hit=2303
Execution Time: 20.687 ms
```

**Index kayboldu: Parallel Seq Scan.** ~44× yavaş, 2376 buffer. Postgres dizi üyelik testi üzerinde sıralayamıyor — promptun tahmini doğruydu, tek `orderBy` bu haliyle olmuyor.

**V3 — seçilen tasarım: iki fazlı sorgu (önce `FEATURED`, sonra kalanlar)**

```
--- faz 1: WHERE ... AND features @> ARRAY['FEATURED'] ---
Index Scan Backward using probe_disc_pub_member_idx   Filter: (features @> '{FEATURED}')
Execution Time: 0.482 ms

--- faz 2: WHERE ... AND NOT (features @> ARRAY['FEATURED']) ---
Limit (actual time=0.034..0.035 rows=21 loops=1)
  ->  Incremental Sort  Sort Key: "memberCount" DESC, id DESC
        ->  Index Scan Backward using probe_disc_pub_member_idx
              Index Cond: ((discoverable = true) AND ("isPublic" = true))
              Filter: (NOT (features @> '{FEATURED}'::text[]))
              Buffers: shared hit=27
Execution Time: 0.054 ms
```

**İki fazın ikisi de index scan. Sequential scan yok.** S1'in eski `[type, discoverable, memberCount]` index'i hâlâ kullanılmıyor; S3'ün `[discoverable, isPublic, memberCount]` index'i her iki fazı da sürüyor.

**Neden yeni index yazmadım (ölçülen alternatif dahil)**

Kısmi index denendi:

```sql
CREATE INDEX ... ON server_probe ("memberCount" DESC, id DESC)
  WHERE discoverable AND "isPublic" AND features @> ARRAY['FEATURED'];
```

```
Limit -> Index Scan using probe_featured_ship_idx   Buffers: shared hit=21 read=1
Execution Time: 0.053 ms     (kalan faz etkilenmiyor: hâlâ Index Scan Backward)
```

Kazanç, `FEATURED` seyrekleştikçe büyüyor. Aynı ölçüm `FEATURED` oranı %1 → %0,1'e düşürüldüğünde:

| Faz 1 sorgusu                    | Buffers | Süre    |
| -------------------------------- | ------- | ------- |
| yalnız S3 index'i, %1 featured   | 1587    | 0,48 ms |
| yalnız S3 index'i, %0,1 featured | 23403   | 4,23 ms |
| kısmi index, %1 featured         | 21      | 0,05 ms |

Yine de **kısmi index gönderilmedi**, üç nedenle: (1) promptun kırmızı çizgisi sequential scan; seçilen tasarımda hiçbir fazda seq scan yok. (2) Kısmi + ifadeli index `schema.prisma`'da ifade edilemez, yalnız ham SQL migration olarak yaşar; sonraki bir `db push`/`migrate` onu sessizce düşürebilir — kalıcı bir drift riski. (3) Karar 4 zaten "öne çıkarma için yeni migration yazma" diyor. Gerçek `Server` tablosu bugün 1 satır; yukarıdaki DDL, tablo on binlere çıktığında tek satırlık ek olarak burada duruyor.

Ölçülüp **seçilmeyen** üçüncü yol: `((features @> ARRAY['FEATURED']) DESC, "memberCount" DESC, id DESC) WHERE discoverable AND "isPublic"` ifadeli kısmi index — tek sorguyla 0,05 ms / 24 buffer veriyor, ama Prisma `orderBy` bir ifadeyi üretemiyor; keşif listesini `$queryRaw`'a çevirmeyi gerektirirdi. Tip güvenliğini kaybetmeye değmedi.

**Sayfalama sözleşmesi değişti (sapma)**

İki faz, imleçte faz bilgisi gerektiriyor. Cursor `memberCount|id` yerine artık `<f|r>|memberCount|id`. Eski iki parçalı imleç **kabul edilmiyor** (null dönüyor) — 00 §2 "geriye dönük uyumluluk kabuğu yazılmaz". Sayfa tam olarak son `FEATURED` satırında bitiyorsa imleç featured fazında kalır; sonraki istek featured sorgusunu boş bulur ve kalan faza baştan geçer. Bu sınır durumu testle sabitlendi.

Not (ölçülen, bize ait olmayan): derin imleçte keyset `OR` yüklemi Postgres tarafından index cond'a değil filter'a düşüyor (V1 derin imleç: 90.098 satır filtreyle eleniyor, 21 ms). Bu S3'ün mevcut davranışı; B'nin değişikliği onu ne düzeltiyor ne kötüleştiriyor.

---

## Bölüm C — Admin konsolu ekranı

`apps/web/src/components/admin/sections/admin-servers.tsx` artık `"use client"`; `admin-flags.tsx` desenini izliyor (fetch + `useTransition` + hata satırı + reload). Yeni tasarım sistemi kurulmadı, mevcut `admin-primitives` kullanıldı.

- **Oluşturma formu:** ad, tür, açıklama, iki görünürlük anahtarı → `POST /api/v1/admin/servers`. Tür `COMMUNITY` seçiliyken "herkese açık" kilitli ve `true` gönderiliyor (sözleşme aksini reddediyor).
- **Satır eylemleri:** terfi/indir (`type`), doğrula/kaldır (`verified`), öne çıkar/kaldır (`featured`), sayacı yeniden hesapla (Bölüm D), sil.
- **Silme onayı:** satır içi input, tam sunucu adı yazılmadan buton kapalı — `deleteWorkspaceServer`'daki `confirmationName` deseniyle aynı şekil.
- **Denetim izi:** kartın altında "Son sunucu işlemleri" — kim, ne zaman, hangi eylem. Kaynak `listAdminServerAuditTrail` (`AdminAuditLog`, `targetType: "Server"`), yeni tablo yok.
- **Sayaç sapması görünür:** satırda canlı üye sayısı ile denormalize `memberCount` yan yana; farklıysa ikincisi kırmızı.
- Tüm yazma kontrolleri `canWrite` (= `server.write`) arkasında; `server.read` yetkisi olan bir okuyucu eski salt-okunur tabloyu görüyor. Test bunu iki yönlü sabitliyor.

`listAdminServers` select'i `type`, `features`, `memberCount` ile genişletildi; `featured`, `verified`, `storedMemberCount`, `type` alanları döndürülüyor.

**Sapma:** `admin-management-pages.test.tsx` içindeki `assert.doesNotMatch(markup, /Doğrulanmış/u)` iddiası ve "şemada doğrulama bayrağı yok" yorumu kaldırıldı. S1 `features`/`VERIFIED`'ı getirdiğinden bu iddia artık yanlış bir gerçeği koruyordu. Yerine üç yeni test geldi (okuyucu/yazar ayrımı, rozet + sapma gösterimi, denetim izi). Testin geri kalanı gevşetilmedi.

---

## Bölüm D — `memberCount` sapma onarımı

- Script: `apps/web/scripts/repair-server-member-counts.ts`, `pnpm --filter @wizards/web maintenance:server-member-counts` (`--dry-run` destekli). Mevcut `maintenance:*` deseni.
- Saf yarı: `collectServerMemberCountDrift` (`apps/web/src/lib/workspace/server-member-counter.ts`) — gruplanmış sonuçta olmayan sunucu "atla" değil "sıfır üye" sayılıyor; iki test.
- Tekil düğme: admin konsolunda "Sayacı yeniden hesapla" → `POST /api/v1/admin/servers/[serverId]/recount` → `recountAdminServerMembers` (404 kontrolü + `recomputeServerMemberCount` + denetim kaydı, önce/sonra değerleriyle).
- **Zamanlanmış iş kurulmadı** (prompt bunu istiyor).

Gerçek koşum (yerel geliştirme veritabanı; sapma bilinçli olarak enjekte edildi, sonra onarıldı):

```
$ tsx scripts/repair-server-member-counts.ts "--dry-run"
[maintenance] Whispr HQ (a78a5fb9-ad74-464a-9fd4-a6c352c39bc8): stored 99 -> actual 2 (dry run, not written)
[maintenance] Scanned 1 server(s), 1 drifted, nothing written (dry run).

$ tsx scripts/repair-server-member-counts.ts
[maintenance] Whispr HQ (a78a5fb9-ad74-464a-9fd4-a6c352c39bc8): stored 99 -> actual 2
[maintenance] Scanned 1 server(s), 1 drifted, all repaired.
```

Sonrası doğrulandı: `SELECT name, "memberCount" FROM "Server";` → `Whispr HQ | 2`.

---

## Bölüm E — Yedi borç

| #   | Borç                                                                                   | Durum                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `verificationLevel` varsayılanı/geçersiz kılması test edilmiyor                        | **Kapandı** — `workspace.test.ts`: varsayılan `NONE`, `HIGH` ile geçersiz kılma, bilinmeyen değer reddi                                                                                                                   |
| 2   | Gerçek çağrı yerlerinden geçen uçtan uca kapı testi yok                                | **Kapandı** — `assertServerUpdateAllowed` / `assertServerDeleteAllowed` çıkarıldı; `updateWorkspaceServer` ve `deleteWorkspaceServer` artık bu preludeleri çağırıyor, testler onları `AccessContext` ile sürüyor (5 test) |
| 3   | `getAccessContext` `type`'ı seçmiyor                                                   | **Kapandı** — `type` **ve** `isPublic` eklendi (`isPublic` olmadan `updateWorkspaceServer`'ın gidiş-dönüşü kalırdı); iki `findUniqueOrThrow` silindi                                                                      |
| 4   | Toplu azaltma testi her iki `serverId`'yi doğrulamıyor                                 | **Kapandı** — `Prisma.join` tek `Sql` parçasına indiriyor; test artık o parçanın `values`'ını `["s1","s2"]` ile karşılaştırıyor                                                                                           |
| 5   | `describe("createAdminServer")` yanıltıcı                                              | **Kapandı** — iki şema-only test kendi bloğuna taşındı                                                                                                                                                                    |
| 6   | `getActiveServerMemberUserIds` ↔ `getOnlineServerMemberCount` aynı kaynağa çekilsin mi | **Ölçüldü, çekilmedi** — aşağıya bak                                                                                                                                                                                      |
| 7   | `graphify update .`                                                                    | **Koşuldu** — sonuç aşağıda                                                                                                                                                                                               |

### E/6 — neden aynı kaynağa çekilmedi

İki fonksiyon aynı şeyi ölçmüyor:

- `getActiveServerMemberUserIds` (`unread-service.ts:618`) `server:{id}` odasındaki **bağlı** socket'lerin kullanıcı kimliklerini döndürüyor; görünürlükten bağımsız.
- Redis seti (`server:{id}:online`) yalnız **görünür** kullanıcıları taşıyor: yazıcı `socket.data.presenceStatus !== "OFFLINE"` kapısından geçiyor (`server-online-presence.ts:168`), yani Görünmez kullanıcı sette yok.

Maliyet farkı gerçek — `fetchSockets` odadaki tüm socket'leri adapter üzerinden serileştiriyor, `SCARD`/`SMEMBERS` tek komut. Ama çağıran taraf (`channel-message-send-service.ts:121-135`) bu listeyi **okunmamış güncellemesi gönderilecek üyeleri** türetmek için kullanıyor. Redis setine geçmek, Görünmez kullanıcıların canlı okunmamış güncellemelerini kaybetmesi demek: sessiz bir davranış regresyonu, performans kazancı değil. Doğru birleştirme, görünürlükten bağımsız ikinci bir Redis seti yazmayı gerektirirdi — yeni yazıcı, yeni yarış değişmezi, 00 §2'ye aykırı. Fark burada belgelendi, kod değiştirilmedi.

---

## Doğrulama komutları ve çıktıları

### Odaklı testler (düzenleme sırasında)

```
$ node --import tsx --test src/app/api/v1/admin/servers/route-logic.test.ts
ℹ tests 17   ℹ pass 17   ℹ fail 0

$ node --import tsx --test src/lib/servers/server-discovery-service.test.ts
ℹ tests 18   ℹ pass 18   ℹ fail 0

$ node --import tsx --test src/lib/workspace/server-service.test.ts src/lib/workspace/server-member-counter.test.ts
ℹ tests 26   ℹ pass 26   ℹ fail 0

$ node --import tsx --test src/components/admin/sections/admin-management-pages.test.tsx
ℹ tests 6   ℹ pass 6   ℹ fail 0
```

### Kapı

```
$ powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard

Local Quality Gate: Standard [PASS]
[PASS] prerequisite: Repository root is available.
[PASS] prerequisite: node_modules is available.
[PASS] prerequisite: Required executable pnpm is available.
[PASS] standard-lint (14006 ms, exit 0): pnpm.cmd lint
[PASS] standard-typecheck (2964 ms, exit 0): pnpm.cmd typecheck
[PASS] standard-format (2401 ms, exit 0): pnpm.cmd format
[PASS] standard-tests (26095 ms, exit 0): pnpm.cmd test
```

Süit bazında:

| Süit              | Sonuç         | Taban çizgisi |
| ----------------- | ------------- | ------------- |
| `@wizards/web`    | 2057/2057 ✓   | 2032          |
| `@wizards/mobile` | 1667/1667 ✓   | 1667          |
| `@wizards/types`  | 197/197 ✓     | 193           |
| `@wizards/db`     | 25/25 + 9/9 ✓ | aynı          |

Mobil kod değişmediği için `pnpm --filter @wizards/mobile test:components` (jest) **koşulmadı** — S4'te mobil dosyaya dokunulmadı (Karar 1 + E/6'nın mobile götürmemesi). Mobilin node süiti kök `turbo test` içinde koştu.

Kapı ilk çalıştırmada `format` adımında kırmızıydı; iki dosya (benim yazdığım kaynaklar) ve promptun kendi markdown'ı prettier'dan geçirilince yeşile döndü.

### `graphify update .` (E/7)

```
$ graphify update .
[graphify] backed up curated graph (5 files) -> 2026-08-08/
[graphify watch] Rebuilt: 22999 nodes, 54567 edges, 1015 communities
[graphify watch] graph.json and GRAPH_REPORT.md updated in graphify-out
```

`graph.html` üretilmedi (22999 düğüm, viz sınırı 5000) — araç bunu kendisi atladı.

---

## Sapmalar

1. **`features` dizisi yerine iki boolean** (`verified`, `featured`) — aynı kolon medya ayarlarını taşıyor, toptan yazım onları silerdi. (Bölüm B)
2. **Keşif imleci biçimi değişti** — iki fazlı sorgu faz bilgisi gerektiriyor; eski `memberCount|id` imleci reddediliyor. (Bölüm B)
3. **Kısmi index gönderilmedi** — ölçüldü, kazancı belgelendi, Prisma şemasında ifade edilemediği ve seçilen tasarımda seq scan olmadığı için ertelendi. (Bölüm B)
4. **Ayrı `recount` rotası** — Bölüm D'nin düğmesi için `PATCH`'e bir "işlem" alanı eklemek yerine gövdesiz `POST .../recount` ucu açıldı; gövdesiz mutasyon listesine kaydedildi.
5. **`AccessContext`'e `isPublic` de eklendi** — borç 3 yalnız `type` diyordu, ama `isPublic` olmadan `updateWorkspaceServer`'ın ikinci gidiş-dönüşü kalıyordu.
6. **Eski bir iddia kaldırıldı** — `admin-management-pages.test.tsx`'teki "şemada doğrulama bayrağı yok" iddiası S1'den beri yanlıştı; yerine üç yeni test.
7. **`docs/prompts/sunucu-tipi-gorunurluk/04-S4-topluluk-yonetimi.md` prettier ile biçimlendirildi** — kapının `format` adımı bu dosyada takılıyordu (benim dokunmadığım, önceden var olan bir sapma). Değişiklik yalnız markdown tablo hizalaması; içerik aynı.

## Eklenmeyenler

- **Zamanlanmış sapma-onarım işi (cron)** — prompt açıkça istemiyor.
- **Mobil topluluk yönetim ekranı** — Karar 1.
- **`features` için yeni kolon/migration** — Karar 4.
- **Kısmi/ifadeli keşif index'i** — yukarıda gerekçelendirildi.
- **`M1_MOBILE_RATE_LIMITS` ve M1 rota sayacı güncellemesi** — yeni mobil uç yok.
- **Rol/izin sistemi, kategori/etiket, moderasyon akışı, analitik panosu, öneri algoritması** — "Yapılmayacaklar".

## Bilinen boşluklar

1. **Görsel parite hâlâ ölçülmedi** (kapanış kontrolü 7). Bu dalgada da yapılmadı; S4 admin konsolunda 2g tasarımı yok, ama S2 kartı/S3 keşif ekranı için emülatör/tarayıcı kontrolü açık kalmaya devam ediyor.
2. **`NULL features` satırı keşiften düşer.** Kalan-faz yüklemi `NOT (features @> ARRAY['FEATURED'])`; Postgres'te `NULL @> ...` → `NULL`, satır elenir. Prisma `String[]`'i her zaman dizi yazdığı ve üretimde `features IS NULL` satırı bulunmadığı için (`SELECT count(*) FILTER (WHERE features IS NULL)` → 0) sorun bugün yok; elle `NULL` yazılırsa sunucu keşiften sessizce kaybolur.
3. **Derin imleçte keyset `OR` yüklemi index cond'a inmiyor** (S3'ten devralındı, ölçüldü, bu dalgada değiştirilmedi).
4. **`EXPLAIN` kanıtı prob tablosundan.** Gerçek `Server` tablosunda tek satır olduğu için planlayıcıyı gerçek veriyle zorlamak mümkün değildi; prob tablosu aynı kolonları ve S3'ün index tanımını taşıyor.
5. **Admin konsolu eylemleri sayfayı yeniden yüklüyor** (`window.location.reload()`), `admin-flags.tsx` ile aynı desen; kısmi güncelleme yok.
6. **Sapma onarım scriptinin gerçek koşumu tek sunucu üzerinde.** Yerel geliştirme veritabanında bir `Server` satırı var; sapma enjekte edilerek her iki dal (kuru koşum + onarım) doğrulandı, ama çok sunuculu bir veri kümesinde ölçülmedi.
7. **Silme onayı yalnız istemcide.** Admin `DELETE` ucu gövdesiz (S1'de öyle gönderildi); yazılan ad butonu açıyor, sunucuya gönderilmiyor. Tüketici yolundaki `confirmationName` sunucu tarafında doğrulanmaya devam ediyor.
