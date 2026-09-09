# Ş1 — Sunucu yazma uçları: ikon rengi, yavaş mod, sahiplik devri

> Dalga 1, API şeridi. Kaynak: `docs/prompts/whispr-sunucu/02-dalga1-s1-sunucu-yazma-uclari.md`.
> Bağımlılık: Ş0 (`raporlar/s0-sozlesme.md`). Paralel: Ş2, Ş3.
> Otorite: `design/Sunucu.dc.html` > `SPEC-SUNUCU.md` §8.1 · §8.3 · §8.9 > `PROMPT.md`.
> Dal: `uat`. Tarih: 2026-08-25.
>
> **UI yazılmadı.** Hiçbir bileşen dosyası açılmadı, hiçbir `.tsx` bileşenine dokunulmadı.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                                          | Satır | İş                                                                             |
| ------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------ |
| `apps/web/src/lib/workspace/channel-slow-mode.ts`                              | 49    | Yavaş modun tek kapısı: `max(server, channel)` + `MANAGE_MESSAGES` muafiyeti   |
| `apps/web/src/lib/workspace/channel-slow-mode.test.ts`                         | 106   | 7 test — dört senaryo + iki muafiyet + `retryAfterSeconds`                     |
| `apps/web/src/lib/workspace/server-ownership-service.ts`                       | 190   | `transferServerOwnership` — kolon + rol + audit + üç revizyon                  |
| `apps/web/src/lib/workspace/server-ownership-service.test.ts`                  | 276   | 8 test, sahte `tx` üzerinde işlem sırası dâhil                                 |
| `apps/web/src/lib/workspace/channel-message-send-service.test.ts`              | 113   | 4 test — REST yolunun yavaş mod kapısı (Ş2 aynı dosyaya kendi paketini ekledi) |
| `apps/web/src/app/api/v1/servers/[serverId]/transfer-ownership/route-logic.ts` | 49    | Uç gövdesi, enjekte edilebilir bağımlılıklarla                                 |
| `apps/web/src/app/api/v1/servers/[serverId]/transfer-ownership/route.ts`       | 8     | Next işleyicisi                                                                |
| `apps/web/src/app/api/v1/servers/[serverId]/transfer-ownership/route.test.ts`  | 80    | 3 test — hız bütçesi, `acknowledged:false`, bilinmeyen alan                    |

**Toplam yeni: 871 satır.**

### 1.2 Düzenlenen dosyalar

| Dosya                                                                           | Ne değişti                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/workspace/server-service.ts`                                  | `buildServerUpdateData` + `requiresChannelPermissionMetadataInvalidation` saf fonksiyonlara ayrıldı; `iconColor`/`slowModeDelay` yazımı; mobil projeksiyona iki alan |
| `apps/web/src/lib/workspace/server-service.test.ts`                             | +12 test (yeni sütunlar, önbellek geçersizleştirme, silme onayı birebirliği)                                                                                         |
| `apps/web/src/lib/workspace/audit-log.ts`                                       | `SERVER_OWNERSHIP_TRANSFERRED` eylemi                                                                                                                                |
| `apps/web/src/lib/workspace/permission-service.ts`                              | İki `server` `select`'ine ve iki projeksiyona `slowModeDelay`                                                                                                        |
| `apps/web/src/lib/workspace/permission-cache.ts`                                | Anlık görüntü tipine + `parseSnapshot` denetimine `server.slowModeDelay`                                                                                             |
| `apps/web/src/lib/workspace/permission-cache.test.ts`                           | Beklenen `channel.server` şekli güncellendi                                                                                                                          |
| `apps/web/src/lib/workspace/channel-message-send-service.ts`                    | REST gönderim yoluna yavaş mod kapısı (**bugüne kadar hiç yoktu**)                                                                                                   |
| `apps/web/src/lib/workspace/client.ts`                                          | `iconColor`/`slowModeDelay` gövdeye; `updateServerAppearance` · `updateServerSlowMode` · `transferServerOwnership`                                                   |
| `apps/web/src/lib/socket/handlers/message.ts`                                   | `checkChannelSlowModeForSend` ortak kapıya delege; iki süreyi alıyor                                                                                                 |
| `apps/web/src/lib/socket/handlers/message.test.ts`                              | +1 test (sunucu süresi kanaldan uzunsa kazanır) + fixture                                                                                                            |
| `apps/web/src/app/api/v1/route-contract.test.ts`                                | Yeni uç `server:update` bütçesiyle eşleştirildi                                                                                                                      |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/route-logic.ts` · `.test.ts` | K10 opsiyonel iki alan                                                                                                                                               |
| `packages/types/src/mobile.ts`                                                  | `MobileWorkspaceServerDetailSchema.server`'a `iconColor?` · `slowModeDelay?`                                                                                         |
| `apps/web/scripts/run-node-tests.mjs`                                           | **Şerit dışı**, bkz. §4.5 — `ENAMETOOLONG` kapısı                                                                                                                    |

---

## 2. Görev maddeleri

### 2.1 `PATCH /api/v1/servers/[serverId]` (§1)

- `buildServerUpdateData` saf fonksiyona ayrıldı; `updateWorkspaceServer` onu çağırıyor.
  Ayırmanın nedeni testlenebilirlik değil **ayırt edilebilirlik**: `iconColor` için
  "alan yok" (dokunma) ile "alan `null`" (seçimi kaldır) ancak kurulan yükü okuyan bir test
  ayırabilir. Üç durum da ayrı testte kilitli.
- `iconColor: null` = deterministik türetmeye dönüş. Kolon `NULL`'a yazılıyor, alan atlanmıyor.
- `slowModeDelay` `ServerSlowModeSchema`'nın 12 değerinden biri; `Kapalı` = `0` ve `0` da yazılıyor.
- Yetki değişmedi: mevcut `assertServerUpdateAllowed` → `MANAGE_SERVER` + topluluk kapısı.
- Yanıt `getWorkspaceServerDetail`'den geliyor ve iki alanı **her zaman** taşıyor
  (`WorkspaceServerSummarySchema` ikisini de zorunlu okuyor, Ş0).

### 2.2 Yavaş mod — `max(server, channel)` (§2)

Prompt "`channel-message-send-service.ts`'e bağla" diyor. Kod okununca iki şey çıktı:

1. O servis yavaş modu **hiç** uygulamıyordu. Kural yalnız soket `message:send` işleyicisindeydi
   (`lib/socket/handlers/message.ts`), yani aynı hesap mobil REST ucundan (`POST
/api/v1/mobile/channels/:channelId/messages`) sınırsız gönderebiliyordu.
2. `channel.server` projeksiyonu `features` ve `messageCharacterLimit` taşıyordu, `slowModeDelay`
   taşımıyordu.

Yapılan:

- `lib/workspace/channel-slow-mode.ts` → `checkEffectiveChannelSlowMode`. **Ham `delaySeconds`
  almıyor**, iki süreyi alıp `resolveEffectiveSlowMode` (Ş0'ın saf fonksiyonu) ile etkin olanı
  kendisi çözüyor. Etkin süreyi çağıranın hesaplaması, bir yolun sunucu ayarını unutabilmesi
  demekti — nitekim bir yol zaten unutuyordu.
- Soket işleyicisinin `checkChannelSlowModeForSend`'i gövdesini bu kapıya devretti; imzası
  `{ channelDelaySeconds, serverDelaySeconds }` oldu. Dışa aktarım adı korundu.
- REST yolunda `assertChannelSlowModeAllowsSend` aynı kapıdan geçiyor.
- `MANAGE_MESSAGES` muafiyeti aynen korundu (`hasPermission` `ADMINISTRATOR`'ı da kapsıyor).
- Yeni hata kodu üretilmedi: `SLOW_MODE` + "Slow mode is active. Please wait before sending
  another message." REST tarafında `429`, okunamayan pencere `503 RATE_LIMIT_UNAVAILABLE`
  (soket yolu gibi kapalı düşüyor).
- `server.slowModeDelay` kanal izin anlık görüntüsüne girdi; bu yüzden
  `requiresChannelPermissionMetadataInvalidation` `slowModeDelay`'i de sayıyor. Saymasaydı
  yeni ayar ilk 15 saniye boyunca (`PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS`) sessizce
  yalan söylerdi.

Dört senaryo testli (yalnız kanal · yalnız sunucu · ikisi/uzun olan · ikisi kapalı), üstelik
"uzun olan" iki yönde de: 60↔15 ve 15↔60.

### 2.3 `POST /api/v1/servers/[serverId]/transfer-ownership` (§3)

Tek `Serializable` işlemde:

1. `Server.ownerId` → hedef,
2. eski sahip **Admin** rolünü alır (`memberRole.createMany` + `skipDuplicates`),
3. `AuditLog` satırı — `SERVER_OWNERSHIP_TRANSFERRED`, `targetType: "SERVER"`,
   `changes: { newOwnerUserId, previousOwnerUserId }`,
4. `advanceServerAuthorizationRevision` **önce**, sonra iki `advanceMemberAuthorizationRevision`.

Sıra tesadüf değil: özne revizyonu sunucu sayacını okuyor, sunucu sayacı sonra artsaydı iki üye
yayını geçersiz kıldıkları revizyonla damgalanırdı. Test sırayı `operations` dizisiyle kilitliyor.

Kapılar: yalnız sahip (`403`), hedef üye olmalı (`400 MEMBER_NOT_FOUND`), hedef sahip olamaz
(`400 INVALID_TARGET`, DB'ye hiç dokunmadan). Soket: mevcut `server:settings:updated`.
Hız bütçesi: `server:update` (yeni anahtar açılmadı).

### 2.4 Silme onayı (§4)

`assertServerDeleteAllowed` **değiştirilmedi**; davranış testle sabitlendi: büyük/küçük harf
farkı, ad içindeki fazladan boşluk, ön ek, son ek ve uçtaki boşluklu metin reddediliyor;
doğru adla bile admin `403`. Uçtaki boşlukları **şema** kırpıyor
(`DeleteServerSchema.confirmationName` `.trim()`), servis değil — test ikisini ayırıyor.

### 2.5 Okuma tarafı (§5)

- `getWorkspaceServerDetail` iki alanı döndürüyor (Ş0'ın bağladığı yol; canlı DB'de doğrulandı).
- `WorkspaceServerSummary` (ray + nav paneli) `iconColor` taşıyor — K12'nin tek kaynağı.
- `client.ts`: `updateServerAppearance` · `updateServerSlowMode` · `transferServerOwnership`.
  İlk ikisi tek uca giden ince sarmalayıcı; swatch satırı ve çip grubu kendi alanını adıyla
  yazsın diye.

### 2.6 Mobil (K10) (§6)

- Yazma sözleşmesi **değişmedi** ve değişmesine gerek de yoktu:
  `MobileServerUpdateFieldsSchema = UpdateServerFieldsSchema.omit({ iconUrl: true })`, yani
  iki alan Ş0'da zaten türemişti.
- Okuma tarafında `MobileWorkspaceServerDetailSchema.server`'a `iconColor?` ve `slowModeDelay?`
  **opsiyonel** eklendi; mobil ekran dosyalarına dokunulmadı.

---

## 3. Uçtan uca doğrulama (yerel `wizards` veritabanı)

Geçici bir betikle gerçek servis çağrıldı, sonra sunucu **eski hâline döndürüldü**
(`ownerId`, `iconColor`, `slowModeDelay`).

```
server: ed95f724-… "Yazılım Geliştirme" { iconColor: null, ownerId: cee6e1c1-…, slowModeDelay: 0 }
1. PATCH response carries both columns
2. fresh detail read carries both columns
3. iconColor:null cleared the column and left slowModeDelay alone
4. transfer to a non-member rejected
5. non-owner caller rejected (403)
6. ownerId moved; authorizationRevision 3n -> 4n
7. audit row: {"changes":{"newOwnerUserId":"5744a1ce-…","previousOwnerUserId":"cee6e1c1-…"},
               "targetId":"5744a1ce-…","targetType":"SERVER","userId":"cee6e1c1-…"}
8. old owner roles after transfer: Admin
9. subject revisions: 5744a1ce=2 cee6e1c1=1
ROUND TRIP OK
restored owner + columns
```

Sonrasında yedi sunucunun tamamı `icon=null slow=0 owner=cee6e1c1` olarak doğrulandı.
Geriye kalan tek iz, devrin kendi `AuditLog` satırı (1 adet) — silinmedi, çünkü denetim satırını
silmek bu şeridin öğretmek istediği alışkanlığın tersi.

---

## 4. SPEC'ten ve prompt'tan sapmalar

### 4.1 `Sunucu Sahibi` diye bir rol yok

Prompt §3 "hedef `Sunucu Sahibi` rolünü alır" diyor. Üründe böyle bir rol satırı **yok**:
sahiplik `Server.ownerId` kolonu ve `deriveAccessLevel` doğrudan onu okuyor
(`createWorkspaceServer` yalnız `Admin` · `Moderator` · `@everyone` üretiyor). Devir kolonu
taşıyor; hedefe ayrıca bir rol eklenmiyor çünkü `OWNER` zaten her rolün üstünde.

### 4.2 Admin rolü yoksa yaratılıyor

SPEC §8.9 eski sahibin **Admin'e düşeceğini** söz veriyor. Rolü silinmiş ya da yeniden
adlandırılmış bir sunucuda bu söz tutulamazdı. Çözüm sırayla: (1) `permissions ==
SERVER_ADMIN_PERMISSIONS` olan varsayılan-olmayan rol, (2) adı `Admin` olan rol, (3) yoksa
`createWorkspaceServer`'ın ürettiğiyle aynı satır oluşturulur. Sessizce düz üyeye düşürmek
alternatifti; o, sözü tutmamak olurdu.

### 4.3 `ipHash` çalışma alanı denetim satırında yok

Prompt §3 "`ipHash` mevcut düzende" diyor. Mevcut düzende **yok**: `ipHash` `AdminAuditLog`
kolonu (`lib/admin/audit-log.ts`), çalışma alanının `AuditLog` modelinde böyle bir kolon
bulunmuyor. Devir satırı `writeWorkspaceAuditLog` ile, ban/kick/rol satırlarıyla birebir aynı
şekilde yazıldı. Kolon istenirse migration gerekir — bu şeridin sınırı dışında.

### 4.4 REST gönderim yolu yavaş modu hiç uygulamıyordu

Prompt §2 "etkin gecikme … uygulanır" varsayımıyla yazılmış; gerçekte
`channel-message-send-service.ts`'te yavaş mod **yoktu**. Kural eklendi. Bu bir davranış
değişikliği: mobil uçtan gönderim artık yavaş moda tabi. Kapsamın içinde sayıldı, çünkü
"yavaş modu mesaj gönderme servisine bağla" tam olarak bunu istiyor ve aksi hâlde sunucu
geneli ayar bir istemcide gerçek, diğerinde süs olurdu.

### 4.5 Şerit dışı düzeltme: `pnpm --filter @wizards/web test` hiç koşmuyordu

Kapı komutu, tek bir teste ulaşmadan `spawnSync … ENAMETOOLONG` ile ölüyordu: Windows komut
satırı 32 767 karakterle sınırlı, açık dosya listesi ise **718 dosyada 34 315 karaktere**
ulaşmıştı. Benim üç yeni test dosyam olmadan da (~34 135) sınırın üstünde — yani kırık bu
şeritten önce oluşmuştu, ama hiçbir şerit kapıyı geçemiyordu.

`apps/web/scripts/run-node-tests.mjs`'e 20 satırlık yedek yol eklendi: liste bütçeyi aşarsa
iki glob deseni (`src/**/*.test.ts`, `src/**/*.test.tsx`) gönderiliyor. `node --test` zaten her
konumsal argümanı glob olarak okuyor — `escapeTestGlobPath` bu yüzden var — dolayısıyla küme
aynı. Açık liste varsayılan olarak kaldı. Şerit sınırının dışında; kaydı burada.

### 4.6 Sözleşmeden gelen sapma yok

Ölçü sözlüğüne, tokenlara, `hsl(var(--token))` kuralına ve i18n ağacına dokunulmadı — bu şerit
hiç görsel yüzey üretmiyor. Yeni hata kodu, yeni soket olayı, yeni hız-limit anahtarı,
yeni yetki biti **üretilmedi**.

---

## 5. TODO(api)

| #   | Ne eksik                                                                                                                                                                                                 | Kimde                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Ş0'ın 1–3 numaralı TODO'ları **kapandı**: iki kolon yazılıyor, `resolveEffectiveSlowMode` bağlı, devir ucu açık.                                                                                         | —                                  |
| 2   | **K6 daraltmasının UAT taraması hâlâ koşmadı.** UAT veritabanına dışarıdan bağlanılamıyor. Deploy **öncesinde** koşmalı; ihlal çıkarsa daraltma geri alınır ya da düzeltme scripti yazılır. SQL aşağıda. | Deploy adımı                       |
| 3   | `AuditLog`'da `ipHash` yok (§4.3). İstenirse migration + `writeWorkspaceAuditLog` imzası.                                                                                                                | Karar bekliyor                     |
| 4   | Sahiplik devri **UI'sı yok** (Tehlike bölgesi kartı). Uç hazır, `client.ts` yardımcısı hazır.                                                                                                            | Ş13                                |
| 5   | Sunucu geneli yavaş mod ve ikon rengi **UI'sı yok**. Uç ve yardımcılar hazır.                                                                                                                            | Ş11 (İçerik ve Mesajlaşma · Genel) |
| 6   | Kanal penceresindeki "sunucu ayarı daha uzun" ipucu için `resolveSlowModeSource` (Ş0) hâlâ tüketilmedi.                                                                                                  | Ş8                                 |

```sql
SELECT count(*) FROM "Role" WHERE length(name) > 32;
SELECT count(*) FROM "ScheduledEvent" WHERE length(name) > 60;
SELECT count(*) FROM "ScheduledEvent" WHERE length(coalesce(description,'')) > 180;
```

---

## 6. Doğrulama çıktısı

| Komut                                    | Sonuç                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`      | ✅ **526 test**, 0 fail                                               |
| `pnpm --filter @wizards/db test`         | ✅ **146 test**, 0 fail                                               |
| `pnpm --filter @wizards/types typecheck` | ✅                                                                    |
| `pnpm --filter @wizards/web typecheck`   | ✅                                                                    |
| `pnpm --filter mobile typecheck`         | ✅                                                                    |
| `pnpm --filter @wizards/web lint`        | ✅ 10 config testi + `eslint .` temiz                                 |
| `pnpm --filter @wizards/web test`        | ⚠️ **6510 test**, 6502 pass, 5 fail — **beşi de Ş2/Ş3'ün**, bkz. §6.2 |

### 6.1 Ş1'in kendi testleri (tek tek koşturuldu)

```
channel-slow-mode.test.ts                                   7/7   ✅
channel-message-send-service.test.ts (Ş1 paketi)            4/4   ✅
server-ownership-service.test.ts                            8/8   ✅
server-service.test.ts                                     31/31  ✅ (12'si Ş1'in)
transfer-ownership/route.test.ts                            3/3   ✅
socket/handlers/message.test.ts                             9/9   ✅
mobile/servers/[serverId]/route-logic.test.ts              13/13  ✅
route-contract.test.ts → "keeps high-risk route rate-limit
  actions mapped to the intended method"                          ✅
```

**Ş1'in eklediği test sayısı: 35.**

### 6.2 Kalan 5 kırık Ş1'e ait değil

Üçü davet (Ş3), ikisi üye moderasyonu (Ş2) şeridinin commit edilmemiş işinden geliyor:

| Test                                                                                                   | Dosya                                                                                                         | Sahibi |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------ |
| `GET authenticates, rate limits, validates params, lists, and maps canonical URLs without codes`       | `mobile/servers/[serverId]/invites/route-logic.test.ts`                                                       | Ş3     |
| `POST validates the body after params, creates with details, and returns a strict invite without code` | aynı                                                                                                          | Ş3     |
| `PUT replaces the shared link with the requested lifetime`                                             | `…/invites/sheet`                                                                                             | Ş3     |
| `commits ban, persistent revision and outbox before cluster eviction`                                  | `member-ban-service.test.ts` — servis `deletedMessageCount` döndürmeye başladı, sahte hâlâ eski şekli veriyor | Ş2     |
| `keeps public member rows unchanged while exposing raw authorization roles internally`                 | `service.test.ts` — yanıt `memberCounts: { filtered, total }` kazandı, beklenti güncellenmedi                 | Ş2     |

Ş1 bu beş dosyanın hiçbirine dokunmadı. Yol boyunca iki kırık daha görüldü ve **geçti**
(başka şeritler kendi işini bitirirken düzeltti): `invite-service.ts`'te eksik `AccessContext`
tipi ve `ban/route.test.ts`'te `deletedMessageCount` tip uyuşmazlığı.

---

## 7. Sonraki şerit için notlar

1. **Yavaş modun tek kapısı `checkEffectiveChannelSlowMode`.** Yeni bir gönderim yolu açan şerit
   ham `delaySeconds` hesaplamamalı; iki süreyi kapıya vermeli. `resolveEffectiveSlowMode`'u
   doğrudan çağırmak yalnız **gösterim** içindir (kanal penceresinin "şu an geçerli süre" satırı).
2. **`channel.server` artık üç alan taşıyor** (`features`, `messageCharacterLimit`,
   `slowModeDelay`) ve bu şekil `permission-cache.ts`'in `parseSnapshot` denetiminde kilitli.
   Dördüncüyü ekleyen şerit üç yeri birden güncellemek zorunda: `permission-service.ts`'in iki
   `select`'i ve iki projeksiyonu, `permission-cache.ts`'in iki tipi ve denetimi, bir de
   `requiresChannelPermissionMetadataInvalidation`. Sonuncusunu atlamak, ayarın ilk 15 saniye
   boyunca yalan söylemesi demek.
3. **`AuditLog.action` serbest metin, enum değil.** Yeni eylem eklemek yalnız
   `WorkspaceAuditAction` birleşimine bir satır; migration gerekmiyor. Ş2 aynı dosyaya
   `MEMBER_TIMED_OUT` / `MEMBER_TIMEOUT_REMOVED` ekledi, çakışma olmadı.
4. **`transferServerOwnership` `ownerId`'yi değiştirdiği için sunucu revizyonu da artıyor.**
   `ownerId` her üyenin önbelleklenmiş izin bağlamının parçası; yalnız iki kişinin özne
   revizyonunu artırmak, geri kalan üyelere eski sahibi 15 saniye daha yönetici göstermek olurdu.
5. **`server:update` bütçesi artık iki uç tarafından paylaşılıyor** (`PATCH /servers/:id` ve
   `POST /servers/:id/transfer-ownership`). `route-contract.test.ts` eşlemeyi kilitliyor; üçüncü
   bir sunucu-yazma ucu açan şerit ya bu bütçeyi paylaşmalı ya da listeye kendi satırını eklemeli.
6. **Mobil detay yanıtına eklenen iki alan opsiyonel.** `MobileWorkspaceServerDetailSchema.server`
   `strict` değil, yani şemaya yazılmayan bir alan sessizce **düşer** — mobil yanıta alan ekleyen
   şerit şemayı da güncellemeli, yoksa uç doğru veriyi üretip yanıt onu atar.
7. **`pnpm --filter @wizards/web test` artık glob yedeğiyle koşuyor** (§4.5). Test dosyası
   ekleyen şerit `ENAMETOOLONG` görürse bu yedeğin devre dışı kaldığını (ya da bütçenin
   düşürülmesi gerektiğini) bilsin.
8. **Yerel `wizards` veritabanında bir `SERVER_OWNERSHIP_TRANSFERRED` denetim satırı var** ve
   `ed95f724…` sunucusunun `authorizationRevision`'ı 3'ten 4'e çıktı. İkisi de §3'teki uçtan uca
   doğrulamanın izi; sahiplik ve iki kolon eski değerlerine döndürüldü.
