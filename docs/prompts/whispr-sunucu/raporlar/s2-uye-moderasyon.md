# Ş2 — Üye moderasyonu: ban, zaman aşımı, filtreler

> Dalga 1. Kaynak: `docs/prompts/whispr-sunucu/03-dalga1-s2-uye-moderasyon-api.md`.
> Bağımlılık: Ş0 (`raporlar/s0-sozlesme.md`). Karar: **K3** (ban/timeout uçtan uca), K10 (mobil).
> Dal: `uat`. Tarih: 2026-08-25.
>
> **UI yazılmadı.** Hiçbir bileşen dosyasına dokunulmadı.

---

## 1. Mevcut ban yüzeyinin envanteri (şerit öncesi durum)

Prompt §1'in istediği envanter. Aşağıdaki her satır koddan okundu.

### 1.1 `lib/workspace/member-ban-service.ts` (147 satır)

| Fonksiyon                                                | Yetki guard'ı                                              | Ne yapıyordu                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `banWorkspaceMember(actorId, serverId, memberId, input)` | `getAccessContext` → `ensureServerPermission(BAN_MEMBERS)` | `Serializable` işlemde: üyeyi bul (404 `MEMBER_NOT_FOUND`) → kendine ban 400 `INVALID_TARGET` → `assertCanActOnMember` → `serverBan.upsert` → `serverMember.delete` → `decrementServerMemberCount` → audit `MEMBER_BANNED` → `advanceMemberAuthorizationRevision`. Commit sonrası: revizyon yayını + oda önbelleği + soket ayırma + `server:membership:removed` + üye okunmamış fanout. |
| `unbanWorkspaceMember(actorId, serverId, targetUserId)`  | Aynı — `BAN_MEMBERS`                                       | `serverBan.deleteMany` (0 satır → 404 `BAN_NOT_FOUND`) → audit `MEMBER_UNBANNED` → revizyon. Commit sonrası `server:settings:updated`.                                                                                                                                                                                                                                                  |

- **Bağımlılık enjeksiyonu vardı** (`MemberBanServiceDependencies`, 7 alan) — testler DB'siz koşuyor.
- **Mesaj silme penceresi YOKTU.** Gövde `{ reason?: string }` idi, `deleteMessageSeconds` hiç
  okunmuyordu.
- **Üye sayacı zaten doğruydu**: `decrementServerMemberCount(tx, serverId)` işlemin içinde.

### 1.2 Uçlar — prompt'un varsaydığı adresler üründe farklıydı

| Prompt'un dediği                           | Üründe gerçekte olan                                           | Durum                                 |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------- |
| `POST /servers/[serverId]/bans`            | **Yok.** Ban `POST /servers/[serverId]/members/[memberId]/ban` | Adres korundu, gövde hizalandı (§2.2) |
| `DELETE /servers/[serverId]/bans/[userId]` | **Vardı**, `deleteBanRoute` + DI + test                        | Değişmedi                             |
| `GET /servers/[serverId]/bans`             | **Yoktu.** `bans/` altında yalnız `[userId]/` klasörü vardı    | **Açıldı** (§2.3)                     |

Ban ile ban kaldırmanın iki farklı adreste olması bir kaza değil: ban **üyeyi** hedefler
(`memberId`), ban kaldırma **kullanıcıyı** (`userId`) — çünkü banlanan artık üye değildir,
üyelik satırı silinmiştir. İki ucu tek yola toplamak, olmayan bir üyelik kimliği uydurmayı
gerektirirdi. Adresler bu yüzden korundu.

### 1.3 `members/[memberId]/route.ts` ve rol atama

| Uç                                            | Metot    | Yetki                                  | Not                                                                     |
| --------------------------------------------- | -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `servers/[serverId]/members/[memberId]`       | `DELETE` | `kickWorkspaceMember` → `KICK_MEMBERS` | Gövdesiz; `member:kick` rate limit                                      |
| `servers/[serverId]/members/[memberId]/roles` | `PATCH`  | `MANAGE_ROLES`                         | `UpdateWorkspaceMemberRolesSchema`                                      |
| `servers/[serverId]/members`                  | `GET`    | Üyelik                                 | **Yalnız** `cursor` + `limit` okuyordu — `q` yok, filtre yok, sayaç yok |
| `servers/[serverId]/members`                  | `POST`   | `addWorkspaceServerMemberByUsername`   | `member:add`                                                            |

Üçünün ortak kapısı `assertCanActOnMember` (`member-service.ts:44`): sahip hedefi
**403 `OWNER_PROTECTED`**, yükseltilmiş rollü hedef **403 `ROLE_HIERARCHY`**.

### 1.4 Zaman aşımı

- Kolon (`ServerMember.communicationDisabledUntil`) vardı; **hiçbir uç yazmıyordu**.
- Ş0 okuma sözleşmesini açmıştı (`WorkspaceMemberSchema.communicationDisabledUntil`), yani üye
  satırı zaman aşımını **okuyabiliyor** ama kimse **yazamıyordu**.
- `PermissionBits.TIMEOUT_MEMBERS` (bit 21) tanımlıydı, `MODERATOR_PERMISSIONS` içindeydi ve
  `PRIVILEGED_PERMISSION_CACHE_PERMISSIONS` listesindeydi — ama hiçbir yerde **kontrol
  edilmiyordu** (tek kullanımı Ş0'ın `permission-groups.ts` etiketiydi).
- Mesaj gönderme yolunda zaman aşımı kapısı yoktu; susturulmuş üye normalde gönderiyordu.

---

## 2. Ne yapıldı

### 2.1 Yeni dosyalar

| Dosya                                                                                                                 | Satır        | İş                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `apps/web/src/lib/workspace/member-filters.ts`                                                                        | 143          | Saf: rol sınıflandırma + arama/filtre `where` üretimi              |
| `apps/web/src/lib/workspace/member-filters.test.ts`                                                                   | 135          | 8 test                                                             |
| `apps/web/src/lib/workspace/member-timeout.ts`                                                                        | 67           | Zaman aşımı kapısı (`isMemberTimedOut`, `assertMemberNotTimedOut`) |
| `apps/web/src/lib/workspace/member-timeout.test.ts`                                                                   | 73           | 6 test                                                             |
| `apps/web/src/lib/workspace/member-timeout-service.ts`                                                                | 116          | Zaman aşımı yazma servisi                                          |
| `apps/web/src/lib/workspace/member-timeout-service.test.ts`                                                           | 268          | 8 test                                                             |
| `apps/web/src/lib/workspace/member-ban-list.test.ts`                                                                  | 162          | Ban listesi, 5 test                                                |
| `apps/web/src/lib/workspace/member-list-query.test.ts`                                                                | 266          | `q` + 7 çip + sayaç sorgu şekli, 6 test                            |
| `apps/web/src/app/api/v1/servers/[serverId]/members/[memberId]/timeout/route.ts` · `route-logic.ts` · `route.test.ts` | 5 + 51 + 110 | `PATCH` zaman aşımı ucu, 3 test                                    |
| `apps/web/src/app/api/v1/servers/[serverId]/bans/route.ts` · `route-logic.ts` · `route.test.ts`                       | 5 + 45 + 91  | `GET` ban listesi ucu, 2 test                                      |

**Toplam yeni: 1 537 satır, 38 yeni test.**

### 2.2 Düzenlenen dosyalar

| Dosya                                                                              | Ne değişti                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/workspace.ts`                                                  | `ServerBanEntrySchema`, `ServerBansResponseSchema`, `WorkspaceMemberFilterSchema` (7 değer), `WorkspaceMemberCountsSchema`; `WorkspaceMembersResponseSchema` += `memberCounts`; 4 tip dışa aktarımı |
| `packages/types/src/workspace.test.ts`                                             | 4 kapsam kaydı + 2 fixture + 2 yeni sözleşme testi                                                                                                                                                  |
| `apps/web/src/lib/workspace/member-ban-service.ts`                                 | Gövde `ServerBanInput`; sahip hedefi **400**; `deleteRecentMessagesForBan`; audit `deletedMessageCount`; `listWorkspaceServerBans` + `SERVER_BANS_PAGE_LIMIT`                                       |
| `apps/web/src/lib/workspace/server-service.ts`                                     | `WorkspaceServerMemberListOptions` (`q`, `filter`); `buildServerMemberFilterWhere`; `AND` bileşimi; `memberCounts`                                                                                  |
| `apps/web/src/lib/workspace/server-query-helpers.ts`                               | `readVisibleOnlineMemberUserIds` (izleyiciye göre gizlenmiş çevrimiçi kümesi)                                                                                                                       |
| `apps/web/src/lib/workspace/audit-log.ts`                                          | `MEMBER_TIMED_OUT`, `MEMBER_TIMEOUT_REMOVED`                                                                                                                                                        |
| `apps/web/src/lib/workspace/channel-message-send-service.ts`                       | Zaman aşımı kapısı (REST yolu)                                                                                                                                                                      |
| `apps/web/src/lib/workspace/channel-message-send-service.test.ts`                  | Kablolama testi (+1)                                                                                                                                                                                |
| `apps/web/src/lib/socket/handlers/message.ts`                                      | Zaman aşımı kapısı (soket yolu) + `assertMemberNotTimedOut` DI                                                                                                                                      |
| `apps/web/src/lib/socket/handlers/message.test.ts`                                 | 2 mevcut testte stub + 1 yeni test                                                                                                                                                                  |
| `apps/web/src/lib/workspace/client.ts`                                             | `banServerMember`, `unbanServerMember`, `timeoutServerMember`, `fetchServerBans`, `fetchWorkspaceServerMembers({ q, filter })`, 2 query anahtarı                                                    |
| `apps/web/src/lib/api-rate-limit.ts`                                               | `member:timeout` (30/10dk), `server:bans:list` (120/dk)                                                                                                                                             |
| `apps/web/src/app/api/v1/servers/[serverId]/members/route.ts`                      | `q` + `filter` sorgu parametreleri                                                                                                                                                                  |
| `apps/web/src/app/api/v1/servers/[serverId]/members/[memberId]/ban/route-logic.ts` | Yerel şema silindi, `ServerBanSchema`; yanıt `deletedMessageCount` taşıyor                                                                                                                          |
| `apps/web/src/app/api/v1/servers/[serverId]/members/[memberId]/ban/route.test.ts`  | 2 yeni test + fixture güncellemesi                                                                                                                                                                  |
| `apps/web/src/lib/workspace/member-ban-service.test.ts`                            | Ban sonucunun `deletedMessageCount` alanı fixture'a eklendi                                                                                                                                         |
| `apps/web/src/app/api/v1/route-contract.test.ts`                                   | İki yeni uç `EXPECTED_RATE_LIMIT_ACTIONS`'a kaydedildi                                                                                                                                              |
| `apps/web/src/lib/workspace/service.test.ts`                                       | `prisma.serverMember.count` yaması + sayaç iddiası                                                                                                                                                  |

**Migration yok** — Ş0 raporu §8'in dediği gibi `ServerBan` ve `communicationDisabledUntil`
zaten mevcut.

### 2.3 Uçların son hâli

| Metot    | Yol                                             | Yetki             | Gövde / sorgu                    |
| -------- | ----------------------------------------------- | ----------------- | -------------------------------- |
| `PATCH`  | `servers/[serverId]/members/[memberId]/timeout` | `TIMEOUT_MEMBERS` | `ServerMemberTimeoutSchema`      |
| `POST`   | `servers/[serverId]/members/[memberId]/ban`     | `BAN_MEMBERS`     | `ServerBanSchema`                |
| `DELETE` | `servers/[serverId]/bans/[userId]`              | `BAN_MEMBERS`     | —                                |
| `GET`    | `servers/[serverId]/bans`                       | `BAN_MEMBERS`     | `cursor`, `limit`                |
| `GET`    | `servers/[serverId]/members`                    | Üyelik            | `cursor`, `limit`, `q`, `filter` |

---

## 3. Tasarım kararları (gerekçeleriyle)

### 3.1 Filtre **sorguya** girdi, sayfaya değil

`N / toplam` sayacı doğru olacaksa filtre veritabanı sayımına girmek zorunda: sayfa boyu 100'de
kesiliyor ve "sayfadaki satırları say" 101. üyeden sonra yalan söylerdi. Bu yüzden yedi çipin
tamamı bir `Prisma.ServerMemberWhereInput` parçasına indiriliyor.

- **Rol çipleri** (`member`/`moderator`/`admin`): Prisma `where` içinde bit maskesi
  karşılaştıramaz. Çözüm, sunucunun **rollerini bir kez okuyup** kimliğe indirmek
  (`classifyServerRoles`) ve filtreyi `roles: { some/none: { roleId: { in: [...] } } }` ile
  kurmak. Rol sayısı onlarla ölçülür, üye sayısı binlerle — doğru taraf okundu.
- **Presence çipleri** (`online`/`offline`): çevrimiçi kümesi **ham Redis setinden değil**,
  üye satırıyla **aynı gizlilik kararından** üretiliyor (`readVisibleOnlineMemberUserIds`).
  Aksi hâlde `online` çipi, listede `Çevrimdışı` yazan görünmez moddaki bir üyeyi geçirirdi.
- **Arama**: takma ad + hesap adı + kullanıcı adı, `mode: "insensitive"`. Takma ad listede
  **görünen** addır; dışarıda bırakmak "gördüğüm adı arayamıyorum" demekti.
- Rol tablosu ve Redis **yalnız o çip istendiğinde** okunuyor: bugünkü filtresiz liste tek satır
  bile yavaşlamadı (test: `roleQueries` boş, `count` bir kez).

`where` üç parçadan `AND` ile birleşiyor (imleç · arama · çip): üçünün ikisi kendi `OR`/`roles`
parçasını taşıyor, tek nesneye yayılsalar son yazan öncekini sessizce ezerdi.

### 3.2 `moderator` bir erişim seviyesi değil, bir yetenek kümesi

`WorkspaceAccessLevel` üründe `OWNER | ADMIN | MEMBER` ve mobil sözleşmesi ona bağlı (K10).
Dördüncü bir seviye açmak iki istemciyi birden kırardı. Çip bunun yerine dört **üye moderasyonu**
bitinden birine bakar: `MANAGE_MESSAGES`, `KICK_MEMBERS`, `BAN_MEMBERS`, `TIMEOUT_MEMBERS`.
`MUTE_MEMBERS`/`DEAFEN_MEMBERS`/`MOVE_MEMBERS` dışarıda — onlar ses odası kontrolü.
Yönetim yetkisi moderasyonu yutar: bir rol iki çipte birden görünmez, sahip hiçbir zaman
`admin`/`moderator`/`member` çipine düşmez.

### 3.3 Zaman aşımı bir zaman damgası, bir bayrak değil

Süre dolduğunda satırı temizleyen bir cron **yazılmadı** (prompt §2). Okuyan taraf her seferinde
`until > now()` karşılaştırır. Bunun iki sonucu var ve ikisi de kasıtlı:

1. Kapı `requireChannelPermissionForUser`in **önbelleğine giremez** (15 sn'lik ayrıcalıklı
   pencere): zaman aşımı kendiliğinden bittiğinde önbellek hâlâ "susturulmuş" derdi. Bu yüzden
   `assertMemberNotTimedOut` her gönderimde `(serverId, userId)` tekil anahtarıyla taze okur.
2. Süresi geçmiş bir kolon zaman aşımı **değildir** — `member-timeout.test.ts` bunu saniye
   sınırında kilitliyor (`11:59:59` hayır, `12:00:00` hayır, `12:00:01` evet).

### 3.4 Kapı **iki** gönderim yoluna kondu

Prompt yalnız `channel-message-send-service.ts`'i adlandırıyor, ama o dosyanın tek çağıranı
**mobil** rotası (`mobile/channels/[channelId]/messages`). Web'in gönderimi
`socket/handlers/message.ts`'teki `message:send`'den geçiyor. Kapı yalnız birinde dursaydı
"zaman aşımlı üye mesaj gönderemez" kabul kriteri **tarayıcıda hiç geçerli olmazdı**. İkisine de
kondu; soket tarafı ayrıca DI aldı, böylece mevcut yavaş kip testleri veritabanına uzanmıyor.

Sıra da önemli: kapı yetki çözümünden **hemen sonra**, yavaş kipten **önce**. Susturulmuş üye
beklemiyor, gönderemiyor — `SLOW_MODE` yanıtı yanıltıcı olurdu.

Yeni hata kodu üretilmedi: 403 `FORBIDDEN`, `SEND_MESSAGES` reddiyle aynı aile.

### 3.5 `deleteMessageSeconds` **yumuşak** silme

`clearChannelMessages`in sert silmesi kopyalanmadı: o yol yanıt/thread bağlarını çözüp kanal
sayaçlarını sıfırlıyor ve tek bir üyenin mesajları için tüm sunucuda koşturulamaz. Bunun yerine
mevcut `deleteMessage` deseni (`deletedAt` + `deletedById`) kullanıldı, `placeholderExpiresAt`
silme anına eşitlendi — böylece `[deleted]` yer tutucusu hiç görünmüyor. Ban temizliği iz
bırakmaz; moderatörün tek tek silmesi bırakır. Silinen satır sayısı hem audit metadata'sına hem
yanıta giriyor: `deleteMessageSeconds` gönderen çağıran, gerçekte ne temizlendiğini görmeden
"7 gün silindi" yazamaz.

---

## 4. SPEC / prompt'tan sapmalar

| #   | Sapma                                                                       | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ban ucu `POST .../bans` değil, `POST .../members/[memberId]/ban` kaldı.** | Prompt §3 birincisini varsayıyor; üründe ikincisi var, DI'lı ve testli. Ban üyeyi hedefler, ban kaldırma kullanıcıyı — banlanan artık üye değil. Tek yola toplamak olmayan bir üyelik kimliği uydurmayı gerektirirdi. Gövde ve yetki sözleşmesi hizalandı; **adres** korundu (prompt §Sınırlar: "çalışan davranış yeniden yazılmaz").                                                                                                                                                                                                                                  |
| 2   | **Üye çıkarmada sahip hedefi 403 `OWNER_PROTECTED` kaldı, 400 olmadı.**     | Prompt §5 son maddesi 400 istiyor. `assertCanActOnMember` kick + rol atama + ban tarafından paylaşılıyor ve mobil sözleşme testleri 403'ü kilitliyor (`mobile/servers/[serverId]/members/[memberId]/route-logic.test.ts:141`, `.../roles/route-logic.test.ts:233`). K10 "eski mobil sürüm kırılmaz" diyor. **Sunucu tarafı doğrulaması zaten var** (`service.test.ts:470` kilitliyor) — sapma yalnız durum kodunda. Ban ve zaman aşımı uçlarında prompt'un istediği **400 `INVALID_TARGET`** uygulandı, çünkü o iki uç yeni/hizalanan sözleşme ve mobil karşılığı yok. |
| 3   | **`ServerBanSchema.reason` üst sınırı 512 → 200 daraldı.**                  | Eski yerel şema 512 diyordu; Ş0'ın `ServerBanSchema`'sı 200. Sözleşme otoritedir, yerel şema silindi. Yerel DB'de 200 karakteri aşan ban sebebi yok (tablo boş).                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4   | **Geçmiş tarihli zaman aşımı 400 `INVALID_TIMEOUT` ile reddediliyor.**      | Prompt bunu istemiyor ama yasaklamıyor da. Geçmiş bir tarih sessizce hiçbir şey yapardı: kolon dolar, `until > now()` yanlış çıkar, moderatör "sustur"a bastığını sanır. Kaldırmak isteyen `null` gönderir — ayrı bir yol zaten var.                                                                                                                                                                                                                                                                                                                                   |
| 5   | **Mobil üye yanıtı `memberCounts` taşımıyor.**                              | K10. `MobileServerMembersResponseSchema` `.strict()` ve mobil ekranlarda `q`/çip yok. `listMobileWorkspaceServerMembersWithAccess` sayacı düşürüyor; web dalı taşıyor.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | **Ses kanalında konuşma kısıtı yok.**                                       | Prompt §4 bunu açıkça kapsam dışı bırakıyor. Zaman aşımlı üye **metin** gönderemez; sesli kanalda mikrofonu hâlâ açılır. Ş7'nin (ses kanalı) not etmesi gereken açık uç.                                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | **`GET .../bans` sayfa boyu 50, üye listesinin 100'ü değil.**               | Ban listesi sunucu ayarlarının tehlike bölümünde tek blokta çiziliyor; 100'lük sayfa gereksiz. Sabit `SERVER_BANS_PAGE_LIMIT` olarak dışa aktarıldı, istek onu aşamaz.                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 5. TODO(api)

| #   | Ne eksik                                                                                                                                                                                                         | Kimde                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | **Ses kanalında zaman aşımı yok** (bkz. sapma 6). Susturulmuş üye sesli kanala girip konuşabilir.                                                                                                                | Ş7                            |
| 2   | Zaman aşımı **süre seçenekleri** (60 sn / 5 dk / 10 dk / 1 sa / 1 gün / 1 hafta gibi) sözleşmede yok; uç serbest ISO tarih alıyor. Tasarım bir liste gösteriyorsa listeyi UI şeridi kurar ve `until`'ı hesaplar. | Ş14 / ayarlar şeridi          |
| 3   | Zaman aşımının **üst sınırı** yok. Discord 28 gün uygular; SPEC bir sayı vermediği için uydurulmadı.                                                                                                             | Karar bekliyor                |
| 4   | `GET .../bans` yanıtı bir şeritten tüketilmiyor (UI yok). `fetchServerBans` + `workspaceQueryKeys.serverBans` hazır.                                                                                             | Ş13 (Üyeler/Davetler/Tehlike) |
| 5   | Ban ve zaman aşımı için **soket olayı** `server:settings:updated` — ayrı bir `server:member:updated` yok. Üye paneli tüm sunucu detayını tazeler. Daha ince bir olay gerekiyorsa yüzeyi yazan şerit ister.       | Ş5 (sağ panel)                |
| 6   | **Hedefli davet / bekleyen davetler** (K3'ün üçüncü ayağı) Ş3'te.                                                                                                                                                | Ş3                            |
| 7   | `q` **Prisma `contains`** ile çalışıyor; büyük sunucularda trigram indeksi gerekebilir. Bugünkü ölçekte (en büyük yerel sunucu 7 üye) ölçüm yapılamadı.                                                          | Ş14 / ölçek                   |

---

## 6. Doğrulama çıktısı

| Komut                                    | Sonuç                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| `pnpm --filter @wizards/types test`      | ✅ **526 test**, 0 fail (Ş2 öncesi 524)                   |
| `pnpm --filter @wizards/types typecheck` | ✅                                                        |
| `pnpm --filter @wizards/web typecheck`   | ✅                                                        |
| `pnpm --filter @wizards/web lint`        | ✅ 10 config testi + `eslint .` temiz                     |
| `pnpm --filter @wizards/web test`        | ✅ **8 053 test**, 0 fail — dört partide koştu, bkz. §6.2 |
| `pnpm --filter @wizards/db test`         | ✅ **146 test** (+ 25 şema testi), 0 fail                 |
| `pnpm --filter mobile typecheck`         | ✅ (K10: mobil sözleşme değişmedi)                        |

### 6.1 Ş2'nin kendi testleri (tek tek koşturuldu)

```
src/lib/workspace/member-filters.test.ts                        8/8  ✅
src/lib/workspace/member-timeout.test.ts                        6/6  ✅
src/lib/workspace/member-timeout-service.test.ts                8/8  ✅
src/lib/workspace/member-ban-list.test.ts                       5/5  ✅
src/lib/workspace/member-list-query.test.ts                     6/6  ✅
src/lib/socket/handlers/message.test.ts                         9/9  ✅ (+1 yeni)
src/lib/workspace/channel-message-send-service.test.ts          5/5  ✅ (+1 yeni)
src/app/api/v1/servers/[serverId]/bans/route.test.ts            2/2  ✅
src/app/api/v1/servers/[serverId]/members/[memberId]/ban/route.test.ts     4/4 ✅ (+2 yeni)
src/app/api/v1/servers/[serverId]/members/[memberId]/timeout/route.test.ts 3/3 ✅
src/app/api/v1/route-contract.test.ts                          25/25 ✅
```

Kabul kriterlerinin test karşılıkları:

| Kriter                                             | Test                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Zaman aşımı: yetkisiz 403                          | `member-timeout-service.test.ts` → "refuses a member without the timeout permission"                                                           |
| Zaman aşımı: sahip hedefi 400                      | → "refuses the owner as a target with 400, not 403"                                                                                            |
| Zaman aşımı: kendine 400                           | → "refuses the actor as their own target"                                                                                                      |
| Zaman aşımı: kolon yazılıyor / `null` ile kalkıyor | → ilk iki test (`updates` dizisi `[Date]` ve `[null]`)                                                                                         |
| Ban sözleşmesi `ServerBanSchema` ile hizalı        | `ban/route.test.ts` → "carries the delete window…", "refuses a delete window wider than seven days"                                            |
| Sahip banlanamıyor                                 | `member-ban-service.ts:107` (400 `INVALID_TARGET`)                                                                                             |
| Üye sayacı doğru                                   | `decrementServerMemberCount` işlem içinde korundu; `member-ban-service.test.ts` sırayı kilitliyor                                              |
| Zaman aşımlı üye mesaj gönderemiyor                | `message.test.ts` → "refuses a timed-out member before slow mode…"; `member-timeout.test.ts`; `channel-message-send-service.test.ts` kablolama |
| `q` + 7 filtre sunucu tarafında süzüyor            | `member-filters.test.ts` (8) + `member-list-query.test.ts` (6)                                                                                 |
| Yanıt filtreli **ve** toplam sayı taşıyor          | `member-list-query.test.ts` → "reports the filtered count next to the unfiltered total"                                                        |
| Audit + authorization revision her iki eylemde     | `member-timeout-service.test.ts` sıra iddiaları; ban tarafı mevcut testte                                                                      |
| `route-contract.test.ts` yeni uçları tanıyor       | 25/25, iki uç `EXPECTED_RATE_LIMIT_ACTIONS`'ta                                                                                                 |

### 6.2 Tam süit — dört parti, 0 fail

`node scripts/run-node-tests.mjs` **720 test dosyasını tek `node --test` çağrısında** koşuyor ve
bu makinede ~1 050 testten sonra ilerlemeyi kesti (iki denemede de: 446 ve 1 100 satır, 30+ dakika
hareketsiz). Aynı 720 dosya, aynı bayraklarla (`--import tsx --test --test-force-exit`) **dört
partide sorunsuz koştu**; bu bir paralellik/açık-tanıtıcı artefaktı, Ş2 gerilemesi değil —
partiler Ş2'nin dokunduğu her dosyayı kapsıyor.

| Parti                                                         | Dosya   | Test      | Sonuç      |
| ------------------------------------------------------------- | ------- | --------- | ---------- |
| `src/app`                                                     | 151     | 1 029     | ✅ exit 0  |
| `src/components` + `src/hooks`                                | 168     | 2 158     | ✅ exit 0  |
| `src/lib`                                                     | 397     | 4 837     | ✅ exit 0  |
| `src/middleware` · `next-config-sentry` · `scripts` · `store` | 4       | 29        | ✅ exit 0  |
| **Toplam**                                                    | **720** | **8 053** | **0 fail** |

> Tek başına koşturulurken `src/scripts/backfill-mention-kind.test.ts`, `DATABASE_URL` verilmezse
> `DATABASE_URL is required for the PostgreSQL Prisma adapter.` ile düşer. Runner bu değişkeni
> kendisi koyuyor; elle parti koşturan `DATABASE_URL` vermeli.

Ş2'nin açtığı 3 kırık düzeltildi:

- `lib/workspace/service.test.ts` — `prisma.serverMember.count` yaması (sayaç sorgusu eklenince
  her üye testi gerçek veritabanına uzanıyordu) + genel yanıtın `memberCounts` iddiası.
- `lib/workspace/member-ban-service.test.ts` — ban sonucunun `deletedMessageCount` alanı.
- `lib/socket/handlers/message.test.ts` — iki yavaş kip testine zaman aşımı kapısı stub'ı.

Şerit sırasında görülen ve **Ş2'ye ait olmayan** kırıklar (hepsi şerit sonunda Ş3 tarafından
kapatıldı ya da hâlâ o şeritte):

| Test / hata                                                                                                                      | Sahibi         | Durum                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| `packages/types` kapsam testi — `CreateServerInviteSchema`, `ServerPendingInvite*`, `WorkspaceInvitesResponseSchema` fixture'sız | Ş3             | Şerit sonunda yeşil (526/526)                        |
| `servers/[serverId]/invites/route.ts` — `"invite:list"` `ApiRateLimitAction` değil                                               | Ş3             | Şerit sonunda yeşil (`@wizards/web typecheck` temiz) |
| `lib/workspace/service.test.ts` → "keeps createWorkspaceInvite byte-compatible…"                                                 | Ş3             | Şerit sonunda yeşil                                  |
| `components/settings/settings-a11y.test.tsx`, `lib/settings/functional-coverage.test.ts`                                         | Ayarlar paketi | Şerit sonunda yeşil                                  |

## 7. Sonraki şerit için notlar

1. **`WorkspaceMembersResponseSchema` artık `memberCounts` zorunlu taşıyor.** Yeni bir çağıran
   ya da fixture yazan şerit onu vermek zorunda; eksik bırakmak `0 / 0` çizmek olurdu, o yüzden
   `.default()` verilmedi.
2. **Üye listesi testi yazan herkes `prisma.serverMember.count`'u yamalamalı.** Sayaç sorgusu
   `findMany` ile birlikte koşuyor; yamalanmazsa test gerçek veritabanına uzanır ve **asılır**
   (hata vermez, bekler). `service.test.ts`'in `withPatchedEnvironment`'ına ortak yama kondu.
3. **Presence filtresi `readVisibleOnlineMemberUserIds`'ten geçer, ham Redis setinden değil.**
   Kısayol almak görünmez moddaki üyeyi `online` çipinde sızdırır.
4. **`assertMemberNotTimedOut` iki gönderim yolunda da çağrılıyor.** Üçüncü bir gönderim yolu
   açan şerit (thread, forward, sistem mesajı) kapıyı oraya da koymalı; `member-timeout.ts`
   bilerek küçük tutuldu (yalnız `prisma` + `ApiError`) ki sıcak yola bağımlılık taşımasın.
5. **`assertCanActOnMember` üç eylem tarafından paylaşılıyor** (kick, rol atama, ban). Sahip
   hedefinin durum kodunu orada değiştirmek mobil sözleşme testlerini kırar; ban ve zaman aşımı
   kendi 400'lerini `assertCanActOnMember`'dan **önce** atıyor.
6. **`SERVER_BANS_PAGE_LIMIT = 50` istek tarafından aşılamaz** ve imleç `id` üzerinden gidiyor;
   `createdAt` benzersiz değil, art arda atılan iki ban aynı saniyeye düşebilir.
7. **Rate limit eylemleri kayıtlı**: `member:timeout` (30/10dk, `member:ban` ile aynı bütçe),
   `server:bans:list` (120/dk, okuma bütçesi). Yeni bir moderasyon ucu açan şerit
   `EXPECTED_RATE_LIMIT_ACTIONS`'a da yazmalı, yoksa "high-risk mapping" testi sessiz kalır.
8. **Ş3 ile aynı dosyalara dokunuldu** (`packages/types/src/workspace.ts`,
   `lib/workspace/client.ts`, `lib/api-rate-limit.ts`, `route-contract.test.ts`,
   `lib/workspace/service.test.ts`). İki şerit paralel koştuğu için birleştirme sırasında bu beş
   dosya gözden geçirilmeli.
