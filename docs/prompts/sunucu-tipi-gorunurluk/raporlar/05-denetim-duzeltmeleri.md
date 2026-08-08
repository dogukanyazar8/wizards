# 05 — Denetim düzeltmeleri raporu

Dal `uat`, her şey çalışma ağacında, commit yok, `git add` yok. Beş bulgu, beşi de kapatıldı. `00-ortak-baglam.md` §2/§4/§5 veri olarak kabul edildi, yeniden keşfedilmedi.

---

## Bulgu 1 (güvenlik) — davetsiz katılımda hesap-ban atlaması

**Dosya:** `apps/web/src/lib/workspace/invite-service.ts`, `joinPublicWorkspaceServer` (~satır 1017).

**Değişiklik:** `select`'e `isBanned: true` eklendi, kardeş yol (`joinWorkspaceServerByInvite`, ~satır 827) ile birebir aynı kontrol eklendi.

```diff
   const joiningUser = await prisma.user.findUnique({
     where: { id: userId },
-    select: { displayName: true, username: true },
+    select: { displayName: true, isBanned: true, username: true },
   });

   if (!joiningUser) {
     throw new ApiError("User not found", 404);
   }

+  if (joiningUser.isBanned) {
+    throw new ApiError("Your account has been suspended", 403);
+  }
+
   const defaultRole = server.roles.find((role) => role.isDefault);
```

Mesaj, status kodu ve `select` alan sırası kardeş kontrolle birebir aynı. Konum bilinçli seçildi: `joiningUser` zaten sadece bu noktada okunuyordu (transaction'a taşınmadan hemen önce), akışı yeniden sıralamadım — bulgu sadece eksik kontrolü istiyordu, sırayı değil.

**Test:** `apps/web/src/lib/workspace/invite-service.test.ts`, `describe("joinPublicWorkspaceServer")` içine yeni `it`, kardeş testlerin `patchMethod`/`withPatchedEnvironment` deseniyle: `prisma.user.findUnique` `isBanned: true` döndürüyor, `$transaction` çağrılırsa hata fırlatıyor (guard).

**RED** (`node --import tsx --test --test-force-exit src/lib/workspace/invite-service.test.ts`, düzeltmeden önce):

```
✖ rejects an account-banned user with 403 and never opens a transaction, mirroring the invite path's account-ban check (1.1738ms)
  AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false

  Caught error:

  Error: should not open a transaction for an account-banned user
      at Proxy.<anonymous> (...\invite-service.test.ts:314:17)
      at joinPublicWorkspaceServer (...\invite-service.ts:1028:42)
      at async waitForActual (node:assert:646:5)
      at async strict.rejects (node:assert:769:25)

ℹ tests 10
ℹ suites 1
ℹ pass 9
ℹ fail 1
```

Bu RED tam olarak açığı gösteriyor: ban kontrolü olmadan kod transaction açmaya devam ediyor (guard'ın attığı hatayı yakalıyoruz).

**GREEN** (düzeltmeden sonra):

```
✔ rejects an account-banned user with 403 and never opens a transaction, mirroring the invite path's account-ban check (0.4979ms)
ℹ tests 10
ℹ suites 1
ℹ pass 10
ℹ fail 0
```

---

## Bulgu 2 (güvenlik) — admin PATCH `discoverable:true` + `isPublic:false` bırakabiliyordu

**Dosya:** `apps/web/src/app/api/v1/admin/servers/route-logic.ts`, `resolveAdminServerUpdate` (~satır 90-98).

```diff
-  const discoverable = demoted ? false : (input.discoverable ?? current.discoverable);
+  const discoverable = demoted || !isPublic ? false : (input.discoverable ?? current.discoverable);
```

`isPublic` bu satırdan önce zaten tam çözülmüş durumda (COMMUNITY zorlaması dahil), bu yüzden `!isPublic` COMMUNITY⇒isPublic:true kuralıyla çakışmıyor — sırayı bozmadan tüketici tarafının `resolveVisibilityUpdateData`'sıyla (`server-service.ts:1151-1154`) aynı sonucu üretiyor.

Fonksiyonun üstündeki JSDoc da güncellendi ("iki zorlama" → "üç zorlama"), üçüncüsünün nereden geldiğini (bu denetim) ve neyi kapattığını (`{discoverable:true}` tek başına özel sunucuda görünür hale geliyordu) belgeliyor. Bu, değiştirdiğim satırların kendi sözleşme açıklaması olduğu için kapsam içi sayıldı.

**Testler:** `route-logic.test.ts`, `describe("resolveAdminServerUpdate")` içine 2 yeni `it`:

```ts
it("never lets discoverable turn on while isPublic stays off", () => {
  const data = resolveAdminServerUpdate(
    buildServerSource({ discoverable: false, isPublic: false }),
    AdminUpdateServerSchema.parse({ discoverable: true }),
  );
  assert.equal(data.isPublic, false);
  assert.equal(data.discoverable, false);
});

it("clears discoverable when a public personal server is turned private", () => {
  const data = resolveAdminServerUpdate(
    buildServerSource({ discoverable: true, isPublic: true }),
    AdminUpdateServerSchema.parse({ isPublic: false }),
  );
  assert.equal(data.isPublic, false);
  assert.equal(data.discoverable, false);
});
```

**RED** (düzeltmeden önce):

```
✖ never lets discoverable turn on while isPublic stays off (1.3085ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  true !== false
      at ...\route-logic.test.ts:213:12

✖ clears discoverable when a public personal server is turned private (0.2131ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  true !== false
      at ...\route-logic.test.ts:223:12

ℹ tests 19
ℹ suites 6
ℹ pass 17
ℹ fail 2
```

Bulgunun elle tekrar ürettiği durumla birebir aynı: `discoverable` `true` kalıyor.

**GREEN** (düzeltmeden sonra, dosyanın tamamı — `resolveAdminServerUpdate`'in 8 testi de dahil, hiçbiri zayıflatılmadı):

```
▶ resolveAdminServerUpdate
  ✔ forces isPublic when a personal server is promoted to community (0.3475ms)
  ✔ refuses to unpublish a community server even when the caller asks (0.0786ms)
  ✔ clears discoverable when a community server is demoted to personal (0.0669ms)
  ✔ leaves a personal server's discoverable flag alone when the type does not change (0.0859ms)
  ✔ never lets discoverable turn on while isPublic stays off (0.0807ms)
  ✔ clears discoverable when a public personal server is turned private (0.0804ms)
  ✔ adds and removes the feature flags without touching the media-settings flags (0.1161ms)
  ✔ never duplicates a flag the server already carries (0.0562ms)
✔ resolveAdminServerUpdate (1.0658ms)
...
ℹ tests 19
ℹ suites 6
ℹ pass 19
ℹ fail 0
```

---

## Bulgu 3 (drift) — `UpdateServerSchema`'nın elle sayılan yüklemi

**Dosya:** `packages/types/src/workspace.ts` (~satır 301-317).

```diff
-export const UpdateServerSchema = UpdateServerFieldsSchema.refine(
-  (value) =>
-    value.name !== undefined ||
-    value.shortName !== undefined ||
-    value.description !== undefined ||
-    value.iconUrl !== undefined ||
-    value.messageCharacterLimit !== undefined ||
-    value.deletedMessageNoticeMinutes !== undefined ||
-    value.allowGifs !== undefined ||
-    value.allowFileUploads !== undefined ||
-    value.allowMemberAdds !== undefined ||
-    value.isPublic !== undefined ||
-    value.discoverable !== undefined,
-  {
-    message: "validation.form.atLeastOne",
-  },
-);
+const UPDATE_SERVER_FIELD_KEYS = Object.keys(
+  UpdateServerFieldsSchema.shape,
+) as ReadonlyArray<keyof z.infer<typeof UpdateServerFieldsSchema>>;
+
+export const UpdateServerSchema = UpdateServerFieldsSchema.refine(
+  (value) => UPDATE_SERVER_FIELD_KEYS.some((key) => value[key] !== undefined),
+  {
+    message: "validation.form.atLeastOne",
+  },
+);
```

`ADMIN_UPDATE_SERVER_FIELD_KEYS` (aynı dosya, ~satır 270-279) ve `MOBILE_SERVER_UPDATE_FIELDS` (`mobile-workspace-management.ts:219-226`) ile birebir aynı desen. Mesaj ve boş-reddetme davranışı değişmedi.

**RED hakkında dürüst not:** Düzeltmeden önce elle sayılan 11 koşulu (`name`, `shortName`, `description`, `iconUrl`, `messageCharacterLimit`, `deletedMessageNoticeMinutes`, `allowGifs`, `allowFileUploads`, `allowMemberAdds`, `isPublic`, `discoverable`) `UpdateServerFieldsSchema.shape`'in 11 alanıyla tek tek karşılaştırdım — **bugün tam örtüşüyorlar**, hiçbiri eksik değil. Bulgu kendisi de bunu "drift" (gelecekte tekrar bayatlayacak kalıp) olarak sınıflandırıyor, "correctness" değil — üçüncü kez elle yamanmış ama dördüncü kez otomatik hale getirilmemiş bir yüklem. Bu yüzden yeni testi önce **refactor'dan önce** çalıştırdım ve zaten yeşildi:

```
▶ server type contract
  ✔ accepts every server update field on its own, so the predicate cannot go stale (2.1122ms)
✔ server type contract (2.628ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

Sahte bir RED üretmek için şemaya geçici bir 12. alan eklemedim (davranışı olduğu gibi korumak isteniyordu). Testin gerçek işlevi artık **yapısal**: yüklem artık `Object.keys(shape)`'ten türediği için bir daha asla bayatlayamaz; test bunu kilitliyor.

**GREEN** (refactor sonrası, tüm dosya):

```
ℹ tests 21
ℹ suites 2
ℹ pass 21
ℹ fail 0
```

(9 mevcut `workspace schemas` testi + 12 `server type contract` testi, ikisi yeni: admin'in kardeş testi zaten vardı, server'ınki bu turda eklendi.)

---

## Bulgu 4 (performans) — ölü index kaldırıldı

**Ölü olduğunu doğrulayan grep** (kaldırmadan önce, istenen son kontrol):

```
$ grep -rn "where:\s*\{[^}]*\btype\b" apps/web/src --include=*.ts
apps\web\src\lib\admin\snapshots\campaigns.ts:68:   where: { status: "PENDING", type: "CAMPAIGN_SEND" },      # Outbox.type
apps\web\src\lib\servers\server-public-profile-service.ts:34:  where: { parentId: null, type: { in: [...] } }  # Channel.type
apps\web\src\lib\notifications\service.ts:182: where: { read: false, type: { in: visibleTypes }, userId }   # Notification.type
apps\web\src\lib\workspace\workspace-events.ts:74: where: { serverId, type: ChannelType.VOICE }             # Channel.type
```

Dördü de **başka modellerin** `type` kolonu (Outbox/Channel/Notification), `Server.type` değil. `.server.findMany|findFirst|count|updateMany|deleteMany(` çağıran her yeri de taradım (`server-discovery-service.ts`, `admin/management.ts` — `getServerWhere`, `admin/snapshots/servers.ts`, `account/privacy-service.ts`, `notifications/service.ts`, `mobile-media-upload-service.ts`, `badge-sweep.ts`): hiçbirinin `where` bloğunda `type` yok. `Server.type` yalnızca `select`'lerde okunuyor (`admin/servers/[serverId]/route.ts:34,72` — denetim kaydı için) ve `resolveAdminServerUpdate`'in bellek-içi karşılaştırmalarında (`type === "COMMUNITY"`) geçiyor — ikisi de sorgu filtresi değil. Repo genelinde `Server\.type|\.type ===.*COMMUNITY|PERSONAL` taraması da (docs/UI dışında) sadece `route-logic.ts` ve iki React bileşenini (client-side render dalı, DB sorgusu değil) buldu. **Sorgulanan bir `Server.type` yok — index kaldırıldı.**

**Kaldırılan index adı**, S1 migration'ından teyit edildi (`rebaseline-migrations/20260807071604_server_type_and_counters/migration.sql:16-17`):

```sql
CREATE INDEX "Server_type_discoverable_memberCount_idx"
  ON "Server"("type", "discoverable", "memberCount");
```

**`packages/db/prisma/schema.prisma`** (~satır 972) — index satırı silindi, S3 yorumu güncellendi (index kaldırılınca "yukarıdaki" referansı asılı kalıyordu, geçmiş zamana çevrildi + yeni migration'a atıf eklendi):

```diff
   @@index([discoverable])
-  @@index([type, discoverable, memberCount])
   /// S3: the discovery query filters on `discoverable`/`isPublic` (not
   /// `type` -- both PERSONAL and COMMUNITY servers can be discoverable) and
-  /// orders by `memberCount desc`. `[type, discoverable, memberCount]` above
-  /// cannot serve that query: `type` unfiltered means the leading column
-  /// buys nothing, and `isPublic` is not a member of that index at all.
-  /// `EXPLAIN` against a seeded local DB confirmed a sequential scan on the
-  /// old index alone; this one is what the discovery query actually uses.
+  /// orders by `memberCount desc`. The S1 index `[type, discoverable,
+  /// memberCount]` could not serve that query: `type` unfiltered meant the
+  /// leading column bought nothing, and `isPublic` was not a member of that
+  /// index at all. `EXPLAIN` against a seeded local DB confirmed a
+  /// sequential scan on the old index alone; this one is what the discovery
+  /// query actually uses. The dead S1 index was dropped
+  /// (20260808130000_drop_server_type_discoverable_index) once a repo-wide
+  /// grep confirmed no query anywhere filters on `Server.type`.
   @@index([discoverable, isPublic, memberCount])
```

**Migration dizini:** `packages/db/prisma/rebaseline-migrations/20260808130000_drop_server_type_discoverable_index/migration.sql` (son mevcut girdi `20260808120000_server_discovery_index`'ten sonra sıralanıyor).

```sql
-- The S1 index `[type, discoverable, memberCount]` (Server_type_discoverable_memberCount_idx)
-- is dead: no query anywhere filters on `Server.type` (discovery filters
-- `discoverable`/`isPublic`; the admin server list searches name/description/
-- inviteCode only). S3 already shipped its replacement,
-- `[discoverable, isPublic, memberCount]` (20260808120000_server_discovery_index),
-- which is what the discovery query actually uses.
--
-- The dead index was not free: it shared `memberCount` with the live index,
-- so every join, leave and kick maintained a second B-tree that nothing ever
-- read.
DROP INDEX "Server_type_discoverable_memberCount_idx";
```

**Sapma — mevcut testi güncellemek zorunda kaldım:** `packages/db/prisma/schema-server-type.test.mjs:26` tam olarak bu index'in varlığını kilitliyordu (`assert.match(model[1], /@@index\(\[type, discoverable, memberCount\]\)/)`). Index'i silince bu satır **RED** verdi:

```
AssertionError [ERR_ASSERTION]
  expected: /@@index\(\[type, discoverable, memberCount\]\)/
  operator: 'match'
      at ...\schema-server-type.test.mjs:26:12
```

(Dosyadaki 5 testten 1'i kırmızı — enum/migration-dizini/bayat-dizin testleri etkilenmedi.) `00 §1` "test kırmızıya dönerse değişiklik yanlıştır" kuralı normal geliştirme için; burada Bulgu 4'ün kendisi bu index'in silinmesini istiyor, yani kilitlenen gerçek kasıtlı olarak değişti. Testi **zayıflatmak** yerine (satırı silmek) index'in **yokluğunu** doğrulayan bir negatif assertion'a çevirdim + yenisinin varlığını ekledim:

```diff
-    assert.match(model[1], /@@index\(\[type, discoverable, memberCount\]\)/);
   });
+
+  it("no longer carries the dead S1 index that duplicated memberCount writes", () => {
+    ...
+    assert.doesNotMatch(model[1], /@@index\(\[type, discoverable, memberCount\]\)/);
+    assert.match(model[1], /@@index\(\[discoverable, isPublic, memberCount\]\)/);
+  });
```

**GREEN** (`node --import tsx --test prisma/schema-server-type.test.mjs`, cwd `packages/db`):

```
▶ server type and counter schema
  ✔ declares the ServerType enum with exactly two members (0.8481ms)
  ✔ adds type and memberCount to Server with safe defaults (0.2112ms)
  ✔ no longer carries the dead S1 index that duplicated memberCount writes (0.0915ms)
  ✔ ships the migration in the directory Prisma actually reads (0.267ms)
  ✔ never places the migration in the stale directory (0.1558ms)
✔ server type and counter schema (2.5407ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

`pnpm db:generate` bu turda çalıştırıldı (aşağıda). Migration hiçbir canlı veritabanına uygulanmadı — bu ortamdan UAT DB'ye dışarıdan bağlanılamıyor (bkz. `reference_railway_uat_migration_check`), ve görev zaten sadece dosyayı `rebaseline-migrations/` altına koymayı istiyordu.

---

## Bulgu 5 (docs) — bayat yorum düzeltildi

**Dosya:** `apps/web/src/lib/servers/server-discovery-service.ts` (~satır 113-114). Tek yorum, kod değişikliği yok.

```diff
 /**
- * S3 binding decision 3: ordering comes from the `[type, discoverable,
- * memberCount]` index, not application code -- `orderBy` here is exactly
+ * S3 binding decision 3: ordering comes from the `[discoverable, isPublic,
+ * memberCount]` index, not application code -- `orderBy` here is exactly
  * `memberCount desc` with `id desc` as the keyset tiebreaker, nothing is
  * sorted after the query returns.
```

Artık schema.prisma'daki yorumla çelişmiyor — ikisi de aynı index'i (`[discoverable, isPublic, memberCount]`) "gerçekten kullanılan" olarak adlandırıyor.

---

## Doğrulama — gerçek komut çıktıları

**`pnpm --filter @wizards/types test`**

```
ℹ tests 198
ℹ suites 34
ℹ pass 198
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**`pnpm --filter @wizards/web typecheck`**

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
```

Çıktı boş, exit code `0` — `tsc` standart davranışı (hata yoksa sessiz). Ayrıca log dosyası tek satır (komut echo'su), sıfır satır hata.

**`pnpm --filter @wizards/web test`**

```
ℹ tests 2060
ℹ suites 461
ℹ pass 2060
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26242.9288
```

Taban çizgi 2057/0/461 idi. Fark: **+3 test** (Bulgu 1'den 1, Bulgu 2'den 2), suite sayısı sabit (yeni dosya açmadım, mevcut `describe` bloklarına `it` ekledim). `apps/web/src/lib/dm/group-service.test.ts` (bize ait olmayan, eşzamanlılığa duyarlı bilinen kırmızı) bu turda yeşildi — dokunmadım, saymadım, sonucu etkilemedi.

**`pnpm db:generate`**

```
@wizards/db:db:generate: ✔ Generated Prisma Client (7.9.1) to .\src\generated\prisma in 336ms
 Tasks:    1 successful, 1 total
```

**Ek doğrulama (istenmedi, sağlamlık için çalıştırıldı): `pnpm --filter @wizards/db test`**

```
ℹ tests 25 / pass 25 / fail 0   (src/prisma.test.ts + seed-*.test.ts)
ℹ tests 9  / pass 9  / fail 0   (scripts/*.test.mjs)
```

Not: bu toplu script `prisma/schema-server-type.test.mjs`'i içermiyor (paketin kendi `package.json`'ındaki `test` betiği dosyayı adıyla saymıyor — benden önceki bir durum, bu görevin kapsamında değil). O dosyayı `00 §5`'in önerdiği gibi doğrudan `node --import tsx --test prisma/schema-server-type.test.mjs` ile ayrıca çalıştırdım (yukarıda RED/GREEN).

---

## Sapmalar

1. **Bulgu 2:** Tek satırlık mantık değişikliğinin yanına, değiştirdiğim fonksiyonun kendi JSDoc'unu güncelledim ("iki zorlama" → "üç zorlama", üçüncüsünün gerekçesi). Talep edilmemişti ama tam değiştirdiğim satırların sözleşme açıklamasıydı; güncellemezsem yorum kendisi yeni bir "bayat yorum" bulgusu olurdu.
2. **Bulgu 3:** RED kanıtı üretilemedi çünkü elle sayılan liste bugün gerçekten eksiksiz (yukarıda açıklandı). Sahte bir alan eklemedim; testi refactor öncesi (yeşil, kanıt niyetiyle) ve sonrası (yeşil, regresyon yok) iki kez çalıştırdım.
3. **Bulgu 4:** `packages/db/prisma/schema-server-type.test.mjs`'i güncellemek zorunda kaldım — tam olarak sildiğim index'i kilitliyordu. Assertion'ı silmek yerine (zayıflatma) tersine çevirdim: index'in yokluğunu + yenisinin varlığını doğruluyor artık. Ayrıca schema.prisma'daki S3 yorumunu da düzelttim (kendi kaldırdığım satıra "yukarıda" diye atıf yapıyordu).

## Eklenmeyenler

Yok — beş bulgunun beşi de istenen şekliyle kapatıldı. Bulgu 1'de kardeş yoldaki kontrol sırasını (invite path'te ban kontrolü kapasiteden önce, burada `joiningUser` zaten kapasiteden sonra okunduğu için ondan sonra) değiştirmedim — bulgu sadece eksik kontrolü istiyordu, yeniden sıralama istemedi.

## Bilinen boşluklar

- Migration hiçbir canlı veritabanına uygulanmadı (bu ortamdan UAT DB'ye erişilemiyor); `db:generate` yalnız codegen, `migrate deploy` çalıştırılmadı.
- `pnpm --filter @wizards/db test`, `prisma/*.test.mjs` içindeki `schema-server-type.test.mjs`'i kapsamıyor (paketin `test` betiği dosyaları adıyla listeliyor, bu dosya listede yok) — bu görevden önce de böyleydi, kapsam dışı bırakıldı.
