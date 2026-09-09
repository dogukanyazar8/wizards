# Ş0 — Sözleşme, veri ve ölçü katmanı

> Dalga 0, kilit şerit. Kaynak: `docs/prompts/whispr-sunucu/01-dalga0-s0-sozlesme.md`.
> Otorite: `design_handoff/design_handoff_sunucu/design/Sunucu.dc.html` inline `style` >
> `SPEC-SUNUCU.md` > `PROMPT.md`. Dal: `uat`. Tarih: 2026-08-25.
>
> **UI yazılmadı.** Hiçbir bileşen dosyasına dokunulmadı.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                                                 | Satır | İş                                                       |
| ------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| `packages/db/prisma/rebaseline-migrations/20260825120000_server_screen/migration.sql` | 21    | `Server.iconColor` + `Server.slowModeDelay`              |
| `packages/db/prisma/schema-server-screen.test.mjs`                                    | 99    | Şema/migration sözleşmesi (12 test)                      |
| `apps/web/src/lib/servers/metrics.ts`                                                 | 1756  | `SERVER_METRICS` ölçü sözlüğü                            |
| `apps/web/src/lib/servers/parity.test.ts`                                             | 623   | Sözlük ↔ referans HTML parity kapısı (28 test)           |
| `apps/web/src/lib/servers/permission-groups.ts`                                       | 153   | 4 grup × 18 satır + 3 hazır ayar + sayaçlar              |
| `apps/web/src/lib/servers/permission-groups.test.ts`                                  | 138   | 16 test                                                  |
| `apps/web/src/lib/servers/discovery-tag-groups.ts`                                    | 102   | 5 grup × 4 etiket + kod rozetleri                        |
| `apps/web/src/lib/servers/discovery-tag-groups.test.ts`                               | 84    | 9 test                                                   |
| `apps/web/src/lib/servers/channel-visibility.ts`                                      | 58    | Daraltılmış kategori filtresi (saf)                      |
| `apps/web/src/lib/servers/channel-visibility.test.ts`                                 | 104   | 9 test                                                   |
| `apps/web/src/lib/servers/server-slow-mode.ts`                                        | 45    | `max(server, channel)` + kaynak çözümü (saf)             |
| `apps/web/src/lib/servers/server-slow-mode.test.ts`                                   | 78    | 11 test                                                  |
| `apps/web/e2e/specs/design/server-parity.spec.ts`                                     | 74    | 10 yüzey × 4 çözünürlük × 2 tema iskeleti (`test.fixme`) |

**Toplam yeni: 3335 satır.**

### 1.2 Düzenlenen dosyalar

| Dosya                                                | Ne değişti                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                   | `Server` modeline iki kolon + yorum                                         |
| `packages/db/package.json`                           | `schema-server-screen.test.mjs` test listesine eklendi                      |
| `packages/types/src/workspace.ts`                    | 6 yeni şema, 6 alan, K6 daraltması, 6 tip dışa aktarımı (+148 satır)        |
| `packages/types/src/workspace.test.ts`               | 6 kapsam kaydı + 5 yeni sözleşme testi + fixture'lar                        |
| `apps/web/src/app/globals.css`                       | `--accent-2` + `--accent-2-foreground` (K8)                                 |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`   | 56 anahtarlık `server.*` iskeleti (iki dilde eşit)                          |
| `apps/web/src/lib/workspace/server-query-helpers.ts` | `parseServerIconTone` + 4 alan mapper'lara bağlandı                         |
| `apps/web/src/lib/workspace/server-service.ts`       | `select`'lere 4 kolon, iki projeksiyona 4 alan                              |
| `apps/web/src/lib/workspace/invite-service.ts`       | `workspaceInviteSelect`'e `targetUserId` (mobil dalının kopyası kaldırıldı) |
| 8 test dosyası (web + mobil fixture)                 | Yeni zorunlu alanlar fixture'lara eklendi                                   |

### 1.3 Migration

```sql
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "iconColor" TEXT;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "slowModeDelay" INTEGER NOT NULL DEFAULT 0;
```

`pnpm --filter @wizards/db db:migrate:deploy` yerel `wizards` DB'sinde koştu:

```
Applying migration `20260825120000_server_screen`
All migrations have been successfully applied.
```

Kolon doğrulaması (`information_schema`):

| Kolon           | Tip       | Nullable | Varsayılan |
| --------------- | --------- | -------- | ---------- |
| `iconColor`     | `text`    | YES      | —          |
| `slowModeDelay` | `integer` | NO       | `0`        |

Geri doldurma yapılmadı: 7 sunucunun **0**'ında `iconColor` dolu, **0**'ında `slowModeDelay ≠ 0`.
Mevcut sunucuların görünümü değişmedi.

---

## 2. K6 tarama sonucu (daraltmadan **önce**)

Prompt'un istediği üç sorgu, iki yerel veritabanında koşturuldu.

| Sorgu                                                                                | `wizards` | `wizards_e2e` |
| ------------------------------------------------------------------------------------ | --------- | ------------- |
| `SELECT count(*) FROM "Role" WHERE length(name) > 32`                                | **0**     | **0**         |
| `SELECT count(*) FROM "ScheduledEvent" WHERE length(name) > 60`                      | **0**     | **0**         |
| `SELECT count(*) FROM "ScheduledEvent" WHERE length(coalesce(description,'')) > 180` | **0**     | **0**         |

Gerçekleşen en uzun değerler: rol adı **9**, etkinlik adı **34**, etkinlik açıklaması **11** karakter.
Satır sayıları: 21 rol, 2 etkinlik, 7 sunucu (`wizards`); e2e DB'de rol/etkinlik yok.

**İhlal yok → K6 daraltması uygulandı:**

- `WorkspaceRoleMutationSchema.name` · `CreateWorkspaceRoleSchema.name`: 48 → **32**
- `ServerScheduledEventFieldsSchema.name` · `CreateServerScheduledEventSchema.name`: 100 → **60**
- `ServerScheduledEventFieldsSchema.description`: 1000 → **180**

Sınırlar `workspace.test.ts` içinde tam değerde geçip +1'de düşerek kanıtlandı.

> **UAT taraması koşulamadı.** UAT veritabanına dışarıdan bağlanılamıyor
> (`reference_railway_uat_migration_check`). Aynı üç `SELECT` UAT'a deploy **öncesinde**
> koşturulmalı; ihlal çıkarsa daraltma geri alınır ya da düzeltme scripti yazılır. Bu, Ş1'in
> deploy adımına devredilen tek açık maddedir.

---

## 3. Bugünkü `serverSettings.*` anahtar listesi (Ş11–Ş13 taşıyacak)

**112 anahtar.** `server.*` öneki bugün hâlâ 0 eşleşme veriyordu; iskelet o ağacı açtı.

```
serverSettings.access                      serverSettings.roles.color
serverSettings.closeOverlay                serverSettings.roles.createDescription
serverSettings.copy                        serverSettings.roles.createRole
serverSettings.deleteDescription           serverSettings.roles.createTitle
serverSettings.deleteOpen                  serverSettings.roles.editTitle
serverSettings.deleteOwnerOnly             serverSettings.roles.everyoneRole
serverSettings.deleteOwnerOnlyDenied       serverSettings.roles.everyoneRoleHint
serverSettings.deleteTitle                 serverSettings.roles.groupAdmin
serverSettings.events.cancel               serverSettings.roles.groupGeneral
serverSettings.events.cancelled            serverSettings.roles.groupModeration
serverSettings.events.channel              serverSettings.roles.groupVoice
serverSettings.events.channelNone          serverSettings.roles.mentionable
serverSettings.events.create               serverSettings.roles.mentionableBadge
serverSettings.events.description          serverSettings.roles.mentionableDescription
serverSettings.events.edit                 serverSettings.roles.noPermissions
serverSettings.events.empty                serverSettings.roles.overviewDescription
serverSettings.events.endAt                serverSettings.roles.overviewTitle
serverSettings.events.entityType           serverSettings.roles.permissionDescription
serverSettings.events.eventDescription     serverSettings.roles.permissions
serverSettings.events.externalLocation     serverSettings.roles.presetAdmin
serverSettings.events.interested           serverSettings.roles.presetAdminDescription
serverSettings.events.loadError            serverSettings.roles.presetMember
serverSettings.events.name                 serverSettings.roles.presetMemberDescription
serverSettings.events.save                 serverSettings.roles.presetModerator
serverSettings.events.startAt              serverSettings.roles.presetModeratorDescription
serverSettings.events.title                serverSettings.roles.presets
serverSettings.inviteCreatedBy             serverSettings.roles.protected
serverSettings.inviteExpiresAt             serverSettings.roles.roleLibrary
serverSettings.invitePermanent             serverSettings.roles.roleLibraryDescription
serverSettings.kick                        serverSettings.roles.roleName
serverSettings.manageDescription           serverSettings.roles.roleNamePlaceholder
serverSettings.memberCount                 serverSettings.roles.safeRole
serverSettings.members.assignable          serverSettings.roles.safeRoleHint
serverSettings.members.description         serverSettings.roles.saveError
serverSettings.members.noAssignableRoles   serverSettings.roles.saveRole
serverSettings.members.ownerProtected      serverSettings.roles.selectedPermissions
serverSettings.members.roleAssignment      serverSettings.roles.systemRole
serverSettings.members.roleOn              serverSettings.roles.systemRoleHint
serverSettings.members.title               serverSettings.roles.totalRoles
serverSettings.members.total               serverSettings.saveOverview
serverSettings.noInvites                   serverSettings.serverName
serverSettings.overviewSavedDescription    serverSettings.serverShortName
serverSettings.overviewSavedTitle          serverSettings.serverShortNameHint
serverSettings.ownerRequired               serverSettings.serverShortNamePlaceholder
serverSettings.revoke                      serverSettings.tab.danger
serverSettings.roles.assignableRoles       serverSettings.tab.invites
serverSettings.tab.members                 serverSettings.tab.overview
serverSettings.tab.roles                   serverSettings.tags.add
serverSettings.tags.description            serverSettings.tags.empty
serverSettings.tags.invalid                serverSettings.tags.limitReached
serverSettings.tags.placeholder            serverSettings.tags.remove
serverSettings.tags.title                  serverSettings.title
serverSettings.visibility.communityLocked  serverSettings.visibility.description
serverSettings.visibility.discoverableDescription
serverSettings.visibility.discoverableRequiresPublic
serverSettings.visibility.discoverableTitle
serverSettings.visibility.isPublicDescription
serverSettings.visibility.isPublicTitle    serverSettings.visibility.title
```

Ayrıca `shell.channelSidebar.serverSettings` bu ağacın dışında ama aynı yüzeyi adlandırıyor;
Ş4 kenar çubuğunu yazarken `server.menu.settings`'e geçirmeli, eskisini bırakmamalı.

---

## 4. SPEC'ten sapmalar

### 4.1 Sözlüğe kaydedilen sayısal sapma (`SPEC_DEVIATIONS`)

| Alan                      | HTML | SPEC | Not                                                          |
| ------------------------- | ---- | ---- | ------------------------------------------------------------ |
| `sidebar.menuRowIconSize` | 18   | 17   | §2.2 "ikon 17" der, HTML `18×18` kutusu çizer. HTML otorite. |

Referansın tamamı tarandı; **başka sayısal çelişki bulunmadı** (ray 74, kanal çubuğu 252, sağ
panel 326, pencere genişlikleri, ayarlar 1180/262, ikon kutuları, anahtar ölçüleri, tarih
kutusu 52×56 — hepsi SPEC ile birebir).

### 4.2 Sayıya dökülemeyen sapmalar (sözlük yorumunda kayıtlı)

1. **Bildirim penceresinin ayağı ortak ayak değil.** §6 ortak ayağı `14px 22px` + üst kenar +
   `surface-secondary/.5` zemin diyor; §6.4'ün ayağı `16px 22px 18px`, kenarsız ve zeminsiz.
   Sözlük ikisini de taşır (`modal.footer*` ve `modal.plainFooter*`).
2. **Pencere gövdesinin boşluğu tek değer değil.** Kategori `20/22/22`; kanal · davet · etkinlik
   `18/22/20`; sunucu oluşturma formu `18/22/22`.
3. **Anahtar ölçüsü iki tür.** §8.5 "her yetki satırında 38×21" der ve **yetki** satırı gerçekten
   38×21'dir; Görünürlük · İçerik · Üyeler · Tehlike satır anahtarları 40×22'dir.
4. **Keşif kod rozeti iki ölçü.** Sunucu ayarlarında 31×31, sunucu oluşturma penceresinde 29×29.
   SPEC ikisini de vermez.
5. **README'nin yarıçap merdiveni eksik.** README `6 · 8 · 9 … 26 · 999` yazıyor; HTML ayrıca
   **17** (ayarlar profil önizleme ikonu) ve dörtlü mikro merdiven **2 · 4 · 5 · 7** (seviye
   çubuğu, aktif kanal şeridi, rol/gizli çipi, `SEN` çipi) kullanıyor. Sözlük 17'yi ana
   merdivene aldı, dördünü ayrı `microRadii` listesinde tuttu — ikisini karıştırmak "kart
   yarıçapı 2 olabilir" demek olurdu. `parity.test.ts` iki listenin kesişmediğini denetler.
6. **`--accent-2` tek `:root` bloğunda tanımlandı, iki tema bloğunda değil.** Prompt "açık ve
   koyu blokların ikisine de" diyor; `globals.css`'te `--info`, `--danger`, `--success`,
   `--warning` **hiçbiri** tema bloklarında yaşamıyor — dördü de 23 paletin ortak tabanı olan
   `:root` bloğunda tek kez tanımlı ve tema blokları yalnız `--surface-*` / `--text-*` ailesini
   eziyor. `--accent-2` kardeşlerinin yanına, aynı düzenle kondu: sonuç ikisinde de tanımlı ve
   ikisinde de aynı değer — SPEC'in istediği bu.

### 4.3 K1 sapması (plan kararı, yeniden kayda geçirildi)

`SERVER_METRICS` gezinme paneli genişliği **taşımıyor**; `HOME_METRICS.panel.width = 280`
okunuyor. SPEC §1'in 228'i `NAV_PANEL_SPEC_WIDTH` sabitinde ve dosya başındaki yorumda duruyor;
`parity.test.ts` sapmanın `NAV_PANEL_ADJUSTMENTS.width = { from: 228, to: 280 }` kaydıyla
eşleştiğini zorluyor. Ray 74 · kanal çubuğu 252 · sağ panel 326 SPEC'teki gibi.

---

## 5. Karar gerektiren tek madde — `Geçmişi oku` yetkisi

**SPEC §8.5 Genel grubunun üçüncü satırı `Geçmişi oku` istiyor; üründe böyle bir yetki biti yok.**
`PermissionBits` 25 anahtar taşıyor ve hiçbiri "mesaj geçmişini oku" değil (`READ_MESSAGE_HISTORY`
ve `EMBED_LINKS` deposun hiçbir yerinde geçmiyor; en yüksek kullanılan bit 24, 25 boş).

Üç seçenek vardı:

1. **Yeni anahtar açmak** — Ş0'ın sınırı yasaklıyor ("yeni yetki anahtarı üretilmez").
2. **Var olan bir anahtara bağlamak** — `CLEAR_CHANNEL_HISTORY` "geçmişi **sil**"dir ve `Üye`
   hazır ayarı Genel grubun tamamını açtığı için **her üyeye veri silme yetkisi** verirdi;
   `MENTION_EVERYONE` ise her üyeye `@herkes` hakkı verirdi. İkisi de etiketiyle çelişir ve
   ürüne zarar verir.
3. **Satırı `alwaysOn` çizmek** — geçmişi görmek bu üründe `VIEW_CHANNEL`'ın doğal sonucu, ayrı
   bir kapısı yok.

**Üçüncüsü uygulandı.** Satır 18'lik listede duruyor, `key`'i yok, `alwaysOn: true` taşıyor ve
sayaca dâhil. Bu seçim SPEC'in kendi örneğiyle de doğrulanıyor: `14 yetki seçili` = Genel (5) +
Ses ve Medya (5) + Moderasyon (4); kapatılamaz satır sayılmasaydı toplam 13 çıkardı.

> **Ş12'nin kararı:** gerçek bir bit isteniyorsa `PermissionBits` bit 25 boş. Karar verilene
> kadar satır kapatılamaz çizilir; `permission-groups.test.ts` bunu kilitliyor.

Kalan **17 satır 17 ayrı mevcut anahtara** bağlı, hiçbiri iki kez kullanılmıyor:

| Grup         | Satır → anahtar                                                                         |
| ------------ | --------------------------------------------------------------------------------------- |
| Genel        | `VIEW_CHANNEL` · `SEND_MESSAGES` · _(alwaysOn)_ · `USE_GIFS` · `ADD_REACTIONS`          |
| Ses ve Medya | `CONNECT_VOICE` · `SPEAK` · `USE_VIDEO` · `STREAM` · `ATTACH_FILES`                     |
| Moderasyon   | `MANAGE_MESSAGES` · `KICK_MEMBERS` · `TIMEOUT_MEMBERS` · `MANAGE_INVITES`               |
| Yönetim      | `MANAGE_CHANNELS` · `MANAGE_ROLES` · `MANAGE_SERVER` · `ADMINISTRATOR` (yalnızca sahip) |

İki eşleme açıklama istiyor:

- **`Bağlantı ekle` → `USE_GIFS`.** Üründe gömülü bağlantı/GIF **tek** bittir; ayrı bir
  `EMBED_LINKS` yok.
- **`Üye sustur` → `TIMEOUT_MEMBERS`.** `MUTE_MEMBERS` ses kanalındaki mikrofon kapatmadır;
  tasarımın moderasyon satırı konuşma yasağını anlatıyor ve K3 zaman aşımını uçtan uca istiyor.

---

## 6. TODO(api)

| #   | Ne eksik                                                                                                                                                                                                                                                                                                         | Kimde               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | `iconColor` ve `slowModeDelay` **okunuyor** ama hiçbir uç **yazmıyor**. `UpdateServerFieldsSchema` alanları taşıyor; `PATCH /servers/[serverId]` gövdeyi kolona yazmalı.                                                                                                                                         | Ş1                  |
| 2   | `resolveEffectiveSlowMode` yazıldı ama `channel-message-send-service.ts`'e **bağlanmadı**; bugün yalnız kanal süresi uygulanıyor.                                                                                                                                                                                | Ş1                  |
| 3   | `TransferServerOwnershipSchema` var, uç yok. Sahip değişimi + eski sahibin Admin'e düşmesi + audit satırı + `authorizationRevision` artışı.                                                                                                                                                                      | Ş1                  |
| 4   | `ServerBanSchema` / `ServerMemberTimeoutSchema` var, web ucu yok. `member-ban-service.ts` ve `/servers/[serverId]/bans` mevcut, bağlanacak.                                                                                                                                                                      | Ş2                  |
| 5   | `WorkspaceMember.communicationDisabledUntil` artık okunuyor ve **gerçek kolondan** besleniyor; ama zaman aşımını **yazan** uç yok.                                                                                                                                                                               | Ş2                  |
| 6   | `WorkspaceInvite.targetUserId` okunuyor; hedefli davet **oluşturan** uç (`TargetedInviteSchema`) yok. Bekleyen davet listesi mobil dalında var, web dalında yok.                                                                                                                                                 | Ş3                  |
| 7   | K6 daraltmasının **UAT** taraması koşmadı (bkz. §2).                                                                                                                                                                                                                                                             | Ş1 deploy adımı     |
| 8   | `lib/home/token-audit.ts` kapsamına `lib/servers` **eklenmedi**: kapsam listesi paylaşılan bir denetim ve `lib/servers` altında bu paketten önce gelen dosyalar var (`discovery-presentation.ts` vb.). Ş0 bunun yerine `parity.test.ts` ile sözlükte renk olmadığını kanıtlıyor. Kapsam genişletmesi Ş14'ün işi. | Ş14                 |
| 9   | `server-parity.spec.ts`'in 80 kombinasyonunun tamamı `test.fixme`.                                                                                                                                                                                                                                               | Ş4–Ş13, kapanış Ş14 |

---

## 7. Doğrulama çıktısı

| Komut                                         | Sonuç                                       |
| --------------------------------------------- | ------------------------------------------- |
| `pnpm --filter @wizards/types test`           | ✅ **524 test**, 0 fail (Ş0 öncesi 519)     |
| `pnpm --filter @wizards/db test`              | ✅ **146 test**, 0 fail                     |
| `pnpm --filter @wizards/db db:migrate:deploy` | ✅ `20260825120000_server_screen` uygulandı |
| `pnpm --filter @wizards/types typecheck`      | ✅                                          |
| `pnpm --filter @wizards/db typecheck`         | ✅                                          |
| `pnpm --filter @wizards/web typecheck`        | ✅                                          |
| `pnpm --filter mobile typecheck`              | ✅ (6 fixture hatası düzeltildikten sonra)  |
| `pnpm --filter @wizards/web lint`             | ✅ 10 config testi + `eslint .` temiz       |
| `pnpm --filter @wizards/web test`             | ⚠️ bkz. aşağıda                             |

### 7.1 Ş0'ın kendi testleri (tek tek koşturuldu)

```
node --test packages/db/prisma/schema-server-screen.test.mjs        12/12 ✅
node --import tsx --test src/lib/servers/parity.test.ts             28/28 ✅
node --import tsx --test src/lib/servers/permission-groups.test.ts  \
                        src/lib/servers/discovery-tag-groups.test.ts \
                        src/lib/servers/channel-visibility.test.ts   \
                        src/lib/servers/server-slow-mode.test.ts     43/43 ✅
node --import tsx --test src/lib/locale/messages.test.ts              9/9  ✅
```

### 7.2 `@wizards/web test` — iki **Ş0 dışı** kırık

Tam suite 6402 test koşuyor. Ş0'ın açtığı 5 kırığın **üçü** düzeltildi (sözleşme yeni zorunlu
alan kazandığı için fixture güncellemesi):

- `lib/workspace/service.test.ts` — üye satırı `communicationDisabledUntil`, davet satırı
  `targetUserId` (3 karakterizasyon testi).

Kalan **iki kırık Ş0'a ait değil** ve şeritten önce de kırıktı — ikisinin de dosyası git'te
**untracked** (`??`), yani başka bir şeridin commit edilmemiş işinden geliyor:

| Test                                                                            | Dosya                                                    | Neden                                                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `anahtar 'switch' + 'aria-checked'; kilitli olan 'aria-disabled' ve açıklamalı` | `components/settings/settings-a11y.test.tsx` (untracked) | Test `aria-disabled={locked \|\| undefined}` bekliyor, bileşen `aria-disabled={locked \|\| disabled \|\| undefined}` yazıyor |
| dosya düzeyinde hata                                                            | `lib/settings/functional-coverage.test.ts` (untracked)   | Tek başına koşturulduğunda **4/4 geçiyor**; tam suite altında dosya düzeyinde düşüyor                                        |

Ş0 ikisine de dokunmadı; Ayarlar paketinin sahibi kapatmalı.

Yolda görülen üçüncü bir Ş0 dışı kırık: `apps/web/scripts/tailwind-v4-pipeline.test.mjs` →
`class consumers use Tailwind v4 utility names` üç eski yardımcı sınıf adı buluyor
(`outline-none`, `shadow-sm`, `transition-[transform,background-color]`). Sahibi
`components/home/home-friends-strip.tsx` (commit edilmemiş, Ana Sayfa paketi). Bu dosya hiçbir
kapı komutunun (`test`/`lint`/`typecheck`) içinde koşmuyor, o yüzden gate'i düşürmüyor —
ama Ş14 token/sınıf denetimini yaparken kapatılmalı.

---

## 8. Sonraki şerit için notlar

1. **`WorkspaceServerSummary` artık iki zorunlu alan taşıyor.** `iconColor` ve `slowModeDelay`
   `mapServerSummary` üzerinden geçiyor; yeni bir çağıran eklerken ikisini de vermek zorunda.
   `parseServerIconTone` düz metin kolonu enum'a indiriyor ve tanımadığı değeri `null`'a
   düşürüyor — tonu geri alan bir sürüm sonrası yanıt hâlâ ayrıştırılabilir kalsın diye.
2. **`.default(null)` alanının çıktısı zorunludur.** `targetUserId` ve
   `communicationDisabledUntil` istekte opsiyonel, ama `z.infer` çıktısında `string | null`.
   Bu yüzden hem web hem mobil fixture'ları güncellendi; yeni bir fixture yazan şerit aynı
   tuzağa düşecek.
3. **`ServerIconTone` değeri `accent2`, token adı `--accent-2`.** Tire sözleşmede yok, çünkü ton
   aynı zamanda nesne anahtarı olarak kullanılıyor. `hsl(var(--accent-2))` eşlemesi tüketicide.
4. **`microRadii` ana merdivene karıştırılmamalı.** `parity.test.ts` iki listenin kesişmediğini
   ve `*Radius` biten her değerin birleşimde olduğunu denetliyor; yeni bir yarıçap eklemek
   listeye yazmayı gerektirir.
5. **Sözlük renk taşımaz ve bu test edilir.** `parity.test.ts` serileştirilmiş sözlükte hex,
   `hsl(`/`rgb(`/`oklch(`, `--token` ve font adı aramıyor — sızıntı sözlükte başlarsa orada
   yakalanıyor. `alpha` kayıtları opaklıktır, renk değil.
6. **`server-parity.spec.ts` bir kapı değil, envanterdir.** `SURFACES` listesindeki `lane` alanı
   hangi şeridin hangi satırı açacağını söylüyor; `testId` değerleri henüz DOM'da yok, yüzeyi
   yazan şerit `data-testid`'i sabitleyip `test.fixme`'yi kaldırır.
7. **`shell.channelSidebar.serverSettings` anahtarı `serverSettings.*` ağacının dışında** ama
   aynı yüzeyi adlandırıyor; Ş4 kenar çubuğunu yazarken `server.menu.settings`'e geçirmeli.
8. **Ban · zaman aşımı · hedefli davet için migration yok ve olmayacak.** `ServerBan`,
   `ServerMember.communicationDisabledUntil`, `ServerInvite.targetUserId` zaten mevcut;
   `schema-server-screen.test.mjs` bunu kilitliyor (migration `CREATE TABLE` içermiyor).
9. **`invite-service.ts` mobil dalındaki `{ ...workspaceInviteSelect, targetUserId: true }`
   kopyası kaldırıldı**; `targetUserId` artık ortak `select`'te. İki dalın davet şekli tekrar
   ayrışırsa `mapInvites` sessizce `undefined` döndürür.
