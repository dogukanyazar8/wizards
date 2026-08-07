# S1 — Sunucu Tipi ve Görünürlük: Veri + Sözleşme Katmanı

Tarih: 2026-08-07
Dal: `uat`
Durum: tasarım onaylandı, uygulama başlamadı

## 1. Bağlam

Whispr'da bugün tek tip sunucu var: bir kullanıcının açtığı, yalnız davet koduyla katılınan sunucu. Hedef iki sınıf:

- **Kişisel sunucu** — herhangi bir kullanıcı açar. Sahibi bunu davetle sınırlı (özel) veya davetsiz katılıma açık (herkese açık) yapabilir.
- **Topluluk sunucusu** — yalnız kurucu üye (platform admini) açar. Herkese açıktır, keşif listesinde görünür. Örnek: "Whispr Topluluğu", "PUBG", "League of Legends".

Ayrıca her sunucunun bir profil kartı olacak — tasarım `design_handoff/design_handoff_whispr_hakkinda/Whispr Hakkında Ekranı.dc.html` içindeki **2g** ekranı.

Bu iş tek spec'e sığmaz. Dört alt projeye bölündü:

| #      | Alt proje                                                | Kapsam       |
| ------ | -------------------------------------------------------- | ------------ |
| **S1** | **Veri + sözleşme katmanı**                              | **bu belge** |
| S2     | Sunucu profil kartı (2g) — web + mobil                   | S1'den sonra |
| S3     | Keşif yüzeyi + davetsiz katılım                          | S2'den sonra |
| S4     | Topluluk yönetimi (terfi, öne çıkarma, doğrulama rozeti) | S3'ten sonra |

Sıra zorunludur: S1 sözleşmeyi tanımlar, diğer üçü ona bağlanır.

**S1 hiçbir kullanıcıya görünür değişiklik üretmez.** Yalnız altyapı, sözleşme ve kapılar.

## 2. Mevcut kod gerçekleri (doğrulandı 2026-08-07)

| Gerçek                                                                                                                                                                                        | Konum                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Server` modelinde `isPublic`, `discoverable`, `vanityUrlCode`, `verificationLevel`, `features[]`, `bannerUrl` kolonları **zaten var**                                                        | `packages/db/prisma/schema.prisma:905`                                                                                                                        |
| `isPublic` ve `discoverable` **ölü kolon** — hiçbir servis yazmıyor, hiçbir sözleşmede yok; tek okuyan admin listesi                                                                          | `apps/web/src/lib/admin/management.ts`, `apps/web/src/components/admin/sections/admin-servers.tsx`                                                            |
| `createWorkspaceServer` bu iki kolonu hiç yazmıyor (default `false`)                                                                                                                          | `apps/web/src/lib/workspace/server-service.ts:914`                                                                                                            |
| `ServerType` benzeri tip ayrımı **yok**                                                                                                                                                       | —                                                                                                                                                             |
| Katılım tek yol: davet kodu                                                                                                                                                                   | `joinWorkspaceServerByInvite` (`invite-service.ts`), `POST /api/v1/mobile/servers/join`                                                                       |
| Kurucu kapısı yok, ama `AdminMembership` + `requireAdminUser({roles})` hazır                                                                                                                  | `schema.prisma:452`, `apps/web/src/lib/admin/access.ts:148`                                                                                                   |
| `AdminRole` = OWNER / ADMIN / SUPPORT / ANALYST / MODERATOR                                                                                                                                   | `schema.prisma:133`                                                                                                                                           |
| `POST /api/v1/admin/servers` **yok** — sadece `GET`                                                                                                                                           | `apps/web/src/app/api/v1/admin/servers/route.ts:7`                                                                                                            |
| 2g payload'ının çoğu davet önizlemesinde zaten üretiliyor, ama anahtar davet kodu (serverId değil) ve web karşılığı yok                                                                       | `apps/web/src/lib/invites/mobile-invite-preview-service.ts` (273 satır)                                                                                       |
| `deleteWorkspaceServer` → `ensureOwner`                                                                                                                                                       | `server-service.ts:1164`                                                                                                                                      |
| `updateWorkspaceServer` → `PermissionBits.MANAGE_SERVER`                                                                                                                                      | `server-service.ts:1054`                                                                                                                                      |
| `CreateServerSchema` `.strict()` **değil** — bilinmeyen alan sessizce düşer                                                                                                                   | `packages/types/src/workspace.ts:203`                                                                                                                         |
| `getOnlineServerMemberCount` = `io.in('server:X').fetchSockets()` — oda başına tüm socket'leri Redis üzerinden serileştirir                                                                   | `apps/web/src/lib/workspace/unread-service.ts:634`                                                                                                            |
| **Migration tuzağı:** Prisma yalnız `rebaseline-migrations/` dizinini okur. `migrations/` bayat (son giriş 20260724), `rebaseline-migrations/` canlı (son giriş `20260805100000_user_badges`) | `packages/db/prisma/`                                                                                                                                         |
| Üyelik yazma noktaları: 6                                                                                                                                                                     | `invite-service.ts:754`, `member-service.ts:376`, `member-service.ts:223`, `member-service.ts:551`, `server-service.ts:951`, `account/privacy-service.ts:505` |
| Presence yaşam döngüsü                                                                                                                                                                        | `socket/server.ts:181` (connect), `socket/handlers/presence.ts:31,87` (durum), `socket/rooms.ts` (oda)                                                        |
| Desktop kendi UI'ı yok — `apps/desktop` yalnız Tauri kabuğu (`src-tauri`), web UI'ı sarar                                                                                                     | `apps/desktop/`                                                                                                                                               |

Son satırın sonucu: "web + desktop + mobil" üç platform değil, **iki istemci yüzeyi** (web ve mobil). Web'de yapılan iş desktop'a bedava gelir.

## 3. Bağlayıcı kararlar

Altı karar, kullanıcı onayıyla kilitlendi.

### K1 — Üç kolon, üç kavram

Talepte üç ayrı kavram var; her biri kendi kolonuna düşer:

| Kavram          | Kolon                                    | Değerler                       |
| --------------- | ---------------------------------------- | ------------------------------ |
| Kim açabilir    | `type` (yeni)                            | `PERSONAL` \| `COMMUNITY`      |
| Kim katılabilir | `isPublic` (mevcut, canlandırılıyor)     | `true` = davetsiz katılım açık |
| Kim görür       | `discoverable` (mevcut, canlandırılıyor) | `true` = keşif listesinde      |

Kural: `type === COMMUNITY` ise `isPublic` zorunlu `true`.

Bu ayrım "herkese açık ama listelenmeyen kişisel sunucu" durumunu (linki olan girer, keşifte yoktur) ek maliyet olmadan verir. Tek enum'a sıkıştırmak (`PRIVATE|PUBLIC|COMMUNITY`) bu durumu imkânsız kılar ve ileride ikinci migration gerektirir.

### K2 — Kurucu kapısı = mevcut `AdminMembership`

`type: COMMUNITY` yazma yetkisi `AdminRole.OWNER` ve `AdminRole.ADMIN`'de. Yeni rol değeri eklenmez, yeni model eklenmez.

Gerekçe: sıfır ek migration, `writeAdminAuditLog` zaten bağlı, admin rol hiyerarşisi testleri değişmez. Granüler bir `FOUNDER` rolü `ensureAdminRoleAllowed` + admin UI + hiyerarşi testlerini S1'e sokar; kazanç yok.

### K3 — Ayrı admin rotası, paylaşılan servis

- Tüketici sözleşmesi (`CreateServerSchema`) `type` alanını **hiç** taşımaz. `POST /api/v1/servers` her zaman `PERSONAL` üretir.
- COMMUNITY yalnız yeni `POST /api/v1/admin/servers` üzerinden doğar.
- İkisi de aynı servisi çağırır: `createWorkspaceServer(userId, input, options?)`.

Gerekçe: kapı çalışma zamanı kontrolüne değil, sözleşme şekline dayanır. Ayrıcalıklı alan hiçbir zaman genel rotanın gövdesine girmez, yani yetki yükseltme yüzeyi sıfırdır. Tek kod yolu korunduğu için çift bakım da yoktur.

### K4 — Topluluk sunucusu koruma modeli

- `type` değişmez. Hiçbir update yolundan yazılamaz.
- `deleteWorkspaceServer` COMMUNITY için 403 döner. Silme yalnız `DELETE /api/v1/admin/servers/[serverId]`.
- `isPublic` / `discoverable` / `verificationLevel`: COMMUNITY'de admin-only; PERSONAL'de `MANAGE_SERVER` biti yeter.
- `ownerId` = sunucuyu kuran admin. Değişmez.

`ownerId`'yi sistem hesabına bağlamak `getAccessContext` / `ensureOwner` çağıran her yolda özel dal ve sahte kullanıcı satırı gerektirir — reddedildi.

`PERSONAL ↔ COMMUNITY` terfisi S4'e ertelendi. `type` kolonu zaten yerinde olacağı için terfi sonradan yalnız bir geçiş servisi ekler, migration gerektirmez.

### K5 — Tek kanonik okuma modeli

`getServerPublicProfile(serverId, viewerId | null)` tek okuma kaynağıdır. Üç tüketici onu çağırır: 2g profil kartı (S2), keşif kartı (S3), davet önizlemesi (mevcut).

`mobile-invite-preview-service.ts` bu servisin ince sarmalayıcısına iner. Kanal izin süzgeci (`resolveChannelPermissions`) tek yerde kalır; davet önizlemesi ile profil kartının ileride ayrışması yapısal olarak imkânsız hale gelir.

### K6 — Denormalize üye sayacı + ayrı presence sayacı

- `Server.memberCount` kolonu, yazma yolunda atomik güncellenir. Okuma yolunda `_count` yok, JOIN yok.
- Çevrimiçi sayısı Redis set'ten gelir. Yeni okuma yollarında `fetchSockets()` **çağrılmaz**.

Gerekçe: `fetchSockets()` oda başına tüm socket nesnelerini Redis üzerinden serileştirir. 12 bin üyeli bir topluluk sunucusu için pahalıdır; N sunuculuk bir keşif listesinde N kez çağrılması ölçeklenmez. Üyelik yazma yolu seyrek, okuma yolu sıcaktır — denormalizasyon doğru tarafı optimize eder.

## 4. Veri modeli

Tek migration: `packages/db/prisma/rebaseline-migrations/20260807HHMMSS_server_type_and_counters/migration.sql` (dizin adı mevcut son girdi `20260805100000_user_badges`'den sonra gelecek şekilde, uygulama anındaki saatle üretilir)

> `migrations/` dizinine **yazma**. Prisma orayı okumaz; migration sessizce hiç koşmaz.

Şema değişikliği:

```prisma
enum ServerType {
  PERSONAL
  COMMUNITY
}

model Server {
  // ... mevcut alanlar
  type        ServerType @default(PERSONAL)
  memberCount Int        @default(0)

  // ... mevcut indexler
  @@index([type, discoverable, memberCount])
}
```

Migration SQL sırası:

1. `CREATE TYPE "ServerType" AS ENUM ('PERSONAL', 'COMMUNITY');`
2. `ALTER TABLE "Server" ADD COLUMN "type" "ServerType" NOT NULL DEFAULT 'PERSONAL';`
3. `ALTER TABLE "Server" ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0;`
4. Backfill:
   ```sql
   UPDATE "Server" s
   SET "memberCount" = (
     SELECT COUNT(*) FROM "ServerMember" m WHERE m."serverId" = s."id"
   );
   ```
5. `CREATE INDEX "Server_type_discoverable_memberCount_idx" ON "Server"("type", "discoverable", "memberCount");`

Tablo adları `@@map` taşımadığı için Prisma varsayılanı (`"Server"`, `"ServerMember"`) geçerlidir; migration yazılmadan önce üretilen SQL ile karşılaştırılarak doğrulanır.

**Geriye dönük uyumluluk:** mevcut tüm satırlar `PERSONAL` + `isPublic=false` + `discoverable=false` olur. Bu bugünkü davranışın birebir aynısıdır. Hiçbir mevcut sunucu davranış değiştirmez.

## 5. Sözleşme katmanı

Dosya: `packages/types/src/workspace.ts`

| Değişiklik                                                                  | Amaç                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ServerTypeSchema = z.enum(["PERSONAL","COMMUNITY"])`                       | tek tanım kaynağı                                                                |
| `CreateServerSchema` → `.strict()`                                          | ayrıcalıklı alan enjeksiyonu 400 döner, sessizce düşmez                          |
| `AdminCreateServerSchema` (yeni)                                            | `CreateServerSchema.extend({ type, isPublic, discoverable, verificationLevel })` |
| `UpdateServerFieldsSchema` + `isPublic?: boolean`, `discoverable?: boolean` | kişisel sunucu görünürlük anahtarı                                               |
| `ServerPublicProfileSchema` (yeni)                                          | §6'daki kanonik okuma modeli                                                     |

`type` bilerek hiçbir update şemasında yer almaz (K4).

**Ön koşul:** `.strict()` eklenmeden önce mevcut web ve mobil create çağrılarının gövdesinde fazladan alan olmadığı doğrulanır. Fazladan alan varsa `.strict()` bu S1'den düşer ve ayrı bir temizlik işine taşınır — bu tek başına K3'ü bozmaz, çünkü asıl kapı `type`'ın şemada hiç bulunmamasıdır.

## 6. Okuma modeli

Yeni dosya: `apps/web/src/lib/servers/server-public-profile-service.ts`

```ts
getServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile>
```

Dönen alanlar:

- Kimlik: `id`, `type`, `name`, `shortName`, `iconUrl`, `bannerUrl`, `description`, `verificationLevel`
- Görünürlük: `isPublic`, `discoverable`
- Sayaçlar: `memberCount`, `onlineMemberCount`
- `channels[]`: `@everyone` rolüne görünür kanallar (`resolveChannelPermissions` süzgecinden geçmiş), her biri `{ id, name, type, voiceParticipantCount }`
- `viewer`: `{ isMember, friendsInServer: { count, avatars: [≤3] } }` — `viewerId === null` ise `null`

`mobile-invite-preview-service.ts` yeniden yazılır: davet kodundan `serverId` çözer, `getServerPublicProfile` çağırır, davete özel alanları (`expiresAt`, `maxUses`) üstüne ekler. Kendi Prisma `select` bloğu ve kendi izin süzgeci kaldırılır.

**Regresyon kapısı:** `apps/mobile/component-tests/mobile-about-community-2g.test.tsx` ve `invites/[code]/preview` route-logic testleri **değiştirilmeden** yeşil kalmalıdır. Bu testlerin düzeltilmesi gerekiyorsa refactor davranışı değiştirmiş demektir — o durumda refactor geri alınır, testler zayıflatılmaz.

## 7. Sayaç mekaniği

### 7.1 `memberCount`

Altı yazma noktasının her biri, kendi transaction'ı içinde atomik güncelleme yapar:

| Konum                            | İşlem                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `invite-service.ts:754`          | katılma → `{ increment: 1 }`                                                                       |
| `member-service.ts:376`          | üye ekleme → `{ increment: 1 }`                                                                    |
| `server-service.ts:951`          | kurucu üyeliği → `{ increment: 1 }`                                                                |
| `member-service.ts:223`          | çıkarma → `{ decrement: 1 }`                                                                       |
| `member-service.ts:551`          | çıkarma/ban → `{ decrement: 1 }`                                                                   |
| `account/privacy-service.ts:505` | hesap silme (`deleteMany`) → önce etkilenen `serverId` listesi okunur, sonra grup grup `decrement` |

Azaltma yolunda taban koruması gerekir: Prisma'nın `{ decrement: 1 }` işlemi negatife düşebilir. Bu yüzden azaltmalar `tx.$executeRaw` ile yazılır:

```sql
UPDATE "Server" SET "memberCount" = GREATEST(0, "memberCount" - 1) WHERE "id" = $1
```

Artırma yolunda böyle bir tehlike yok; orada Prisma'nın `{ increment: 1 }` işlemi kullanılır.

Ayrıca sapma onarımı için `recomputeServerMemberCount(serverId)` yardımcısı yazılır. S1'de yalnız fonksiyon ve testi teslim edilir; bakım scripti kapsam dışıdır.

### 7.2 `onlineMemberCount`

Redis set: `server:{serverId}:online`, üyeler kullanıcı kimlikleri.

- `SADD` — socket sunucu odasına katıldığında (`socket/rooms.ts`) ve presence durumu `OFFLINE` dışına geçtiğinde (`handlers/presence.ts`)
- `SREM` — odadan ayrılma, disconnect (`socket/server.ts`), presence `OFFLINE`'a düşme
- Okuma — profil kartında `SCARD`; çoklu sunucu listesinde tek pipeline

Mevcut `getOnlineServerMemberCount` çağrıları yeni yardımcıya taşınır; dönen değer semantiği aynı kalır (benzersiz, `OFFLINE` olmayan kullanıcı sayısı).

Set'ler kalıcı sayaç değil, türetilmiş durumdur; Redis kaybı durumunda socket yeniden bağlanmalarıyla kendini onarır. Bayat girdilere karşı set'e TTL uygulanır ve yeniden bağlanmada tazelenir.

### 7.3 `friendsInServer`

Yalnız profil kartında ve yalnız `viewerId` varsa hesaplanır. `ServerMember` × izleyicinin arkadaş listesi kesişimi; mevcut `@@index([serverId, userId])` kullanılır. Avatar için `LIMIT 3`, ayrıca toplam sayı.

Keşif listesinde bu alan hesaplanmaz.

## 8. Yazma yolu ve kapılar

| Kapı                                             | Kural                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `POST /api/v1/servers`                           | `type` şemada yok → her zaman `PERSONAL`                                                         |
| `POST /api/v1/admin/servers` (yeni)              | `requireAdminUser({ roles: ["OWNER","ADMIN"] })` + `writeAdminAuditLog`                          |
| `DELETE /api/v1/admin/servers/[serverId]` (yeni) | aynı kapı + audit                                                                                |
| `deleteWorkspaceServer`                          | `type === COMMUNITY` → 403, `ensureOwner`'dan **önce**                                           |
| `updateWorkspaceServer`                          | `isPublic` / `discoverable` / `verificationLevel`: COMMUNITY'de 403; PERSONAL'de `MANAGE_SERVER` |
| `updateWorkspaceServer`                          | `type` alanı hiçbir şemada ve hiçbir servis map'inde yok                                         |

## 9. Test stratejisi

**Migration**

- Backfill sonrası her sunucu için `memberCount === COUNT(ServerMember)`
- Yeni index'in varlığı
- Mevcut satırların `PERSONAL` / `false` / `false` olması

**Kapılar** (altı senaryo)

1. OWNER admin COMMUNITY açar → başarı, audit kaydı yazılır
2. Normal kullanıcı `POST /api/v1/admin/servers` → 403
3. Tüketici create gövdesinde `type: "COMMUNITY"` → sonuç sunucu her hâlükârda `PERSONAL` (bu iddia `.strict()`'ten bağımsız, her zaman geçerli). `.strict()` uygulandıysa ayrıca 400 döndüğü iddia edilir; uygulanmadıysa bu ikinci iddia yazılmaz.
4. Sunucu sahibi COMMUNITY sunucuyu tüketici rotasından siler → 403
5. `MANAGE_SERVER` yetkili üye COMMUNITY'de `isPublic` yazar → 403
6. Sahip PERSONAL'de `isPublic`/`discoverable` yazar → başarı

**Sayaçlar**

- Altı yazma noktasının her biri için katıl/ayrıl/çıkar/ban/hesap-sil sonrası `memberCount` doğrulaması
- Eşzamanlı katılımda atomiklik (iki paralel katılma → `+2`)
- `decrement` taban koruması (0'ın altına düşmez)
- `recomputeServerMemberCount` sapmayı düzeltir

**Okuma**

- Davet önizleme testleri **değiştirilmeden** yeşil (regresyon kapısı)
- `getServerPublicProfile` izin süzgeci: gizli kanal `@everyone`'a görünmez
- `viewerId === null` → `viewer` alanı `null`
- `friendsInServer` en çok 3 avatar döner, sayım tam

**Kapı komutu**

```bash
pwsh -File scripts/quality/Invoke-LocalGate.ps1 -Profile Standard
```

typecheck + jest + node testleri + eslint + format hepsi yeşil olmalı. (Geçerli profiller: Fast, Standard, CI, Mobile, MobileRelease, Security, E2ESmoke, E2EApi, E2ERealtime.)

## 10. S1 kapsamı dışında

Bilinçli olarak ertelendi:

- Keşif rotası ve keşif ekranı — **S3**
- 2g profil kartının web ve mobil ekranları — **S2**
- Davetsiz katılma akışı (ban kontrolü, `maxMembers` tavanı, rate limit) — **S3**
- `PERSONAL ↔ COMMUNITY` terfisi/indirmesi — **S4**
- Öne çıkarma sıralaması, doğrulama rozeti yönetim UI'ı — **S4**
- `memberCount` sapma onarımı için zamanlanmış bakım scripti — S4 veya ayrı iş
- `vanityUrlCode` yönetimi — kapsam dışı, kolon dokunulmadan bırakılır

## 11. Riskler

| Risk                                             | Azaltma                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Migration yanlış dizine yazılır, sessizce koşmaz | `rebaseline-migrations/` zorunlu; migration sonrası UAT'ta kolon varlığı doğrulanır       |
| `.strict()` mevcut istemcileri kırar             | Uygulamadan önce web + mobil create gövdeleri denetlenir; şüphede bırakılır               |
| Davet önizlemesi refactor'ünde davranış kayması  | Mevcut testler değiştirilmeden regresyon kapısı olarak kullanılır                         |
| Sayaç sapması (kaçırılan yazma noktası)          | Altı noktanın hepsi teste bağlanır; `recomputeServerMemberCount` onarım yolu olarak hazır |
| Redis presence set'i bayat kalır                 | TTL + yeniden bağlanmada tazeleme; set türetilmiş durumdur, kalıcı kayıt değil            |
| Backfill büyük tabloda uzun sürer                | Tek `UPDATE ... FROM` ile ölçülür; UAT'ta süre kaydedilir                                 |
