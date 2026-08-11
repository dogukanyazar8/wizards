# Faz 2 raporu — Davet bağlantısı, kaybolan mesajlar, grup çağrısı

Branch `uat`, **commit edilmedi**. Migration **koşulmadı** (kullanıcı koşacak, §Kapı).
Bu fazda hiçbir mobil **ekran** dosyası değişmedi; mobilde yalnız iki dosyaya dokunuldu (bkz. S6).

## Yapılanlar

### B — Davet bağlantısı (K2)

**Şema**

- `packages/db/prisma/rebaseline-migrations/20260811150000_group_invite_disappearing/migration.sql` **(yeni)**: `GroupInvite` tablosu, `GroupDisappearingWindow` enum'u, `DMSystemMessageType`'a `DISAPPEARING_CHANGED`, `DMConversation.disappearingAfter`, `DMMessage.expiresAt` + indeks. Tek migration; C1 aynı dosyaya girdi (02 §C1 böyle söylüyor).
- `GroupInvite.conversationId` **unique**: tasarımda grubun tek bağlantısı var, "yenile" onu yerinde döndürür. `enabled` varsayılan `false`.

**Kod üreteci — tek**

- `apps/web/src/lib/invite/code.ts` **(yeni)**: `generateUniqueInviteCode({ length, isTaken, randomBytes })`. `crypto.randomBytes`, karakter başına **bir bayt**, 20 çarpışma denemesi.
- `workspace/invite-code.ts` bu yardımcıya indirildi (8 karakter + iki tablolu çakışma kontrolü). İki üreteç yok; alfabe `INVITE_CODE_CHARSET` olarak `packages/types`'ta ve 32 karakter olduğu için modulo sapması sıfır.

**Servis** — `apps/web/src/lib/dm/group-invite-service.ts` **(yeni)**

| Fonksiyon               | Kural                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `setGroupInviteEnabled` | `editInfo`. İlk açılış kodu üretir; kapatma satırı silmez, kodu **döndürmez** (E2)                                              |
| `rotateGroupInvite`     | `editInfo`. Yeni kod, `uses = 0`, `rotatedAt`; `enabled = true` (kimsenin kullanamayacağı kod üretmek düğmeyi anlamsız yapardı) |
| `readGroupInvite`       | **yeni** — yalnız üyelik. Kapalıyken `{ enabled: false, code: null }`                                                           |
| `previewGroupInvite`    | Oturum yeter. Ad/ikon/renk/üye **sayısı** + `joinable` + `reason`; **üye listesi yok**                                          |
| `joinGroupViaInvite`    | B2'nin sekiz dalı, sırasıyla                                                                                                    |

- Yetki **tek kapıdan**: `toGroupAuthContext` + `assertGroupPermission(..., "editInfo")` (Faz 1 bağlayıcı karar 1). İlk yazımda kendi rol türetmem vardı — `ADMIN`'i `MEMBER` sayıyordu, atıldı.
- Konuşma okuması **tek sorgu**: yetki kolonları + tam roster aynı `findUnique`'te; kapasite, renk ve engel kontrolü hep o satırdan.
- Katılım **tek transaction**: katılımcı satırı + `uses: { increment: 1 }` + sistem mesajı + `lastMessageAt`. Sayaç uygulama tarafında hesaplanmıyor (testle sabit).

**Uçlar (web + mobil ayna, aynı fazda)**

| Metot + yol                          | Yetki      | Rate limit                   | Mobil ayna |
| ------------------------------------ | ---------- | ---------------------------- | ---------- |
| `GET /dm/groups/[id]/invite`         | üyelik     | `dm:group:update`            | ✓          |
| `PATCH /dm/groups/[id]/invite`       | `editInfo` | `dm:group:update`            | ✓          |
| `POST /dm/groups/[id]/invite/rotate` | `editInfo` | `dm:group:update`            | ✓          |
| `GET /group-invites/[code]/preview`  | oturum     | `group-invite:preview` 20/dk | ✓          |
| `POST /group-invites/[code]/join`    | oturum     | `group-invite:join` 5/dk     | ✓          |

- Hepsi `dm/groups/invite-route-logic.ts`'te, DI'lı ve testli. Kod biçimi (`isGroupInviteCode`) **veritabanına gitmeden** 404 veriyor — tahmin saldırısının ucuz yarısı.
- Realtime: `emitGroupMemberJoined` (katılana `dm:conversation:created`, odaya `dm:conversation:members_changed`), `emitGroupInviteChanged` (`dm:group:invite`, **kod taşımaz**).

**Web sayfası** — `apps/web/src/app/g/[code]/`

- `page.tsx` + `actions.ts` + `components/invite/group-invite-card.tsx`. Oturumsuz → `callbackUrl` ile aynı koda döner.
- Sekiz dalın her biri kendi cümlesini alıyor; eşleme saf (`lib/dm/group-invite-page-copy.ts`) ve testli — iki dilde de her anahtarın karşılığı olduğu testle sabit.
- Mevcut web tasarım dili (`app-panel`, `auth-canvas`); mobil handoff pikselleri kopyalanmadı (K5).

### C — Kaybolan mesajlar (K3)

- **Damgalama** `message-send-service.ts`: `resolveDisappearingExpiry(conversation.disappearingAfter, now)`. V6 argümanın kendisinde — pencere o an okunur, yalnız o mesaja uygulanır.
- **Purge** `apps/web/src/lib/dm/disappearing-service.ts` **(yeni)**: `expiresAt IS NOT NULL AND expiresAt <= now`, batch limitli, global tarama. **Sert silme** (kullanıcı kararı): satır gider, ek dosya satırları cascade ile gider, UploadThing anahtarları `extractUploadThingFileKey` + `UTApi.deleteFiles` ile temizlenir.
- **Sıra**: bul → **sil** → olay → depo temizliği. §4.10 testle sabitlendi. Silme 0 satır döndüyse (yarışı kaybettiysek) **hiç olay gitmez**.
- **Worker** `disappearing-worker.ts` **(yeni)**: `startOutboxWorker` deseni, 60 sn, batch 500, `apps/web/server.ts`'te soket sunucusundan **sonra** başlıyor.
- **İstemci sözleşmesi**: `DMMessagePayload.expiresAt`, `dm:message:expired { conversationId, messageIds }`, ve **okuma filtresi** üç servis fonksiyonunda + sohbet listesi önizlemesinde.
- Sistem mesajı: `updateGroupSettings` yalnız pencere **gerçekten değiştiyse** `DISAPPEARING_CHANGED` satırı yazar ve `lastMessageAt` bump'lar; diğer altı ayar hâlâ sessiz.

### D — Grup çağrısı (K1)

- `apps/web/src/lib/dm/group-call-state.ts` **(yeni)**: Redis `dm:call:<conversationId>`, TTL 6 saat (her yazmada tazelenir), saf indirgeyiciler `applyGroupCallJoin` / `applyGroupCallLeave` / `toGroupCallStateDTO` / `shouldRingParticipant` / `planGroupCallSignals`.
- **Yarış kuralı**: `applyGroupCallJoin(null, …)` başlatır, `applyGroupCallJoin(state, …)` katılır — "başlat" ve "katıl" aynı fonksiyon, ikinci çağıran ikinci oda açmıyor.
- Socket: `dm:call:join` ve `dm:call:leave` **yeni**; `dm:call:state` her değişimde konuşmanın **tüm** üyelerine. `dm:call:accept` de duruma yazıyor (istemci `join` göndermeyi unutursa roster yalan söylerdi). `dm:call:cancel`/`end` durumdan düşürüyor.
- Halka yalnız `notifyLevel !== NONE` **ve** çağrıda olmayan üyelere; `dm:call:state` herkese.
- LiveKit: **değişiklik yok**. `resolveDMRoomName` zaten katılımcı sayısına bakmıyor; 3+ ve 32 kişilik grupta tek oda verdiği, üye olmayana vermediği testle sabitlendi.

## Bağlayıcı kararlar

1. **Davet kodu sunucuda üretilir**, tek üreteçten (`lib/invite/code.ts`). İstemciden kod kabul eden yol yok (testle sabit).
2. **Kapalı davet = kod yok**: `enabled: false` iken `code`/`url`/`displayUrl` hepsi `null` döner. Kapatma satırı silmez; tekrar açınca **aynı** link geri gelir, yenileme ayrı bir eylemdir.
3. **Daveti okumak üyelik, değiştirmek `editInfo` ister.** Kod açıksa her üye paylaşabilir.
4. **Kaybolan mesaj silmesi geri alınamaz ve dosyayı da alır.** Yumuşak silme yolu (`deleteDMMessage`) purge için kullanılmaz.
5. **Sıra değişmez: önce sil, sonra yay.** 0 satır silindiyse olay yok.
6. **Purge tek örnekte koşar; kilit Redis'te** (`SET NX PX`, 55 sn), bırakma token karşılaştırmalı Lua ile.
7. **Kaybolan mesaj sistem mesajı `DISAPPEARING_CHANGED`**, `systemValue` pencere enum'u (`OFF|H24|D7|D90`). Cümleyi okuyan kurar.
8. **Çağrı durumu Redis'te, olay `dm:call:state`**; istemci kendi roster'ını türetmez. `active: false` çağrının bittiğidir.
9. **`notifyLevel === NONE` çalmaz ama `dm:call:state` alır.**
10. `expiresAt` filtresi **dört** okuma yüzeyinde: `listDMMessages`, `listDMThreadMessages` (ana + yanıtlar), `searchDMMessages`, sohbet listesi önizlemesi.

## Sapmalar

| #   | Sapma                                                                                                        | Gerekçe                                                                                                                                                                                                              | Kullanıcıya soruldu                               |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| S1  | Purge **sert silme** + UploadThing temizliği; 02 §C3 "mevcut mesaj silme servisinden geçer" diyordu          | `deleteDMMessage` yumuşak silme: her kaybolan mesaj için kalıcı "silindi" yer tutucusu bırakır, aktör kullanıcı ister ve dosyaya hiç dokunmaz — üçü de §4.10 ile çelişiyordu                                         | **Evet** — "Sert silme + dosya temizliği" seçildi |
| S2  | Yeni enum değeri `DISAPPEARING_CHANGED`; 02 §C2 "enum genişletmek için yeni migration açmaya değmez" diyordu | Bu faz zaten migration açıyor, ek maliyet sıfır. Mevcut bir tipi yeniden kullanmak istemci kopyasını tipin adıyla çelişir hâle getirirdi                                                                             | **Evet** — "Yeni enum" seçildi                    |
| S3  | Rate limit **kullanıcı anahtarlı**; 02 §B3 "IP başına" öneriyordu                                            | İki uç da oturum zorunlu, ve bu depoda güvenilir proxy doğrulaması yok — istemcinin uydurduğu `x-forwarded-for` ile anahtarlamak sahte güvenlik olurdu                                                               | **Evet** — "Kullanıcı anahtarlı" seçildi          |
| S4  | LiveKit'te `createRoom({ maxParticipants })` **çağrılmadı**; 02 §D4 istiyordu                                | Token yalnız katılımcıya veriliyor ve grup zaten 32 ile sınırlı, yani oda 32'yi aşamaz. Açık `createRoom` her token isteğine bir LiveKit HTTP çağrısı ekler ve kontrol düzlemi erişilemezken çağrıyı tamamen kırardı | **Evet** — "Üyelik tavanına güven + test" seçildi |
| S5  | `GET /dm/groups/[id]/invite` **eklendi** (B3'te yoktu)                                                       | Aksi hâlde istemci, başkasının açtığı daveti göstermek için toggle atmak zorunda kalırdı. Yetkisi yalnız üyelik; kapalıyken kod dönmüyor                                                                             | Hayır — E2'yi bozmadığı için                      |
| S6  | Mobilde **iki dosya** değişti: `src/dm/group-system-message-copy.ts` + `src/locale/mobile-copy.ts`           | Yeni enum değeri mobil `switch`'i derlemede kırdı. İkisi de ekran dosyası değil; ekran dosyası sayısı sıfır kaldı                                                                                                    | Hayır — derleme zorunluluğu                       |
| S7  | `dm:group:member-joined` **yazılmadı**; B2 adım 10 öneriyordu                                                | `dm:conversation:members_changed` zaten tüm konuşmayı taşıyor. `emitGroupMemberJoined` katılana ayrıca `dm:conversation:created` gönderiyor — iki farklı ihtiyaç, iki mevcut olay, üçüncü bir isim değil             | Hayır                                             |
| S8  | `GroupInvite`'ta `@@index([code])` **yok**                                                                   | `code @unique` zaten b-tree indeks. 02 §B1 modeli `ServerInvite`'tan kopyalıyordu, orada da fazlalık; ikinci indeks yalnız yazma maliyeti                                                                            | Hayır                                             |
| S9  | `DMMessage_expiresAt_idx` **kısmi değil, düz**                                                               | Prisma kısmi indeks modelleyemiyor; yalnız SQL'de duran indeks bir sonraki `migrate dev`'de drift okunur. Not migration'a yazıldı                                                                                    | Hayır                                             |
| S10 | `sendDirectMessage` DI'sına üç alan eklendi (`createMessage`, `findBlockedUserIds`, `now`)                   | Damganın satıra ulaştığı ancak böyle **davranışsal** olarak kanıtlanabiliyordu (web testinde DB yok). Hepsi yazmanın önündeki adımlar; yazma sonrası yollar kasıtla enjekte edilmedi                                 | Hayır                                             |

## Kapı sonucu

| Komut                                     | Sonuç                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`       | ✅ 300/300 (öncesi 269)                                                               |
| `pnpm --filter @wizards/web test`         | ✅ 2409/2409 (öncesi 2269)                                                            |
| `pnpm --filter @wizards/web typecheck`    | ✅ temiz                                                                              |
| `pnpm --filter @wizards/mobile typecheck` | ✅ temiz (kapıda yok, ek kontrol)                                                     |
| `pnpm --filter @wizards/mobile test`      | ✅ 1758/1758 (ek kontrol)                                                             |
| `cd apps/mobile && npx jest`              | ✅ 1237/1237, 132 suite (ek kontrol)                                                  |
| `pnpm --filter @wizards/web lint`         | ✅ temiz (ek kontrol)                                                                 |
| `prisma validate` / `prisma generate`     | ✅ temiz                                                                              |
| `graphify update .`                       | ✅ (ilk deneme Windows yol hatasıyla düştü, ikinci deneme geçti — topoloji değişmedi) |

### §F kontrol listesi

- [x] Kapalı davette kod üretilmiyor; açınca üretiliyor; yenileyince eski kod ölüyor — `setGroupInviteEnabled` üç testi + `rotateGroupInvite` yeni kod/`uses = 0`/`rotatedAt`. Eski kod satırın üstüne yazıldığı için `loadInviteByCode` `null` döner → `404 INVITE_NOT_FOUND`.
- [x] Katılma sırasının 8 dalı — bulunamadı / kapalı / süresi dolmuş / tükenmiş / zaten üye / dolu / engelli / başarı, her biri ayrı test; ayrıca "kapalı, süresi dolmuş ve tükenmiş" aynı anda doğruyken **kapalı** raporlanıyor.
- [x] Eşzamanlı iki katılmada `uses` iki artıyor — `writeJoin` gövdesi `$transaction` + `uses: { increment: 1 }` içeriyor ve uygulama tarafı hesap **yok** (kaynak testi; web koşucusunda DB yok).
- [x] Purge worker: süresi dolmuş satır siliniyor, dolmamış duruyor, olay **silmeden sonra** gidiyor — 13 test.
- [x] Süresi dolmuş sabitli mesaj silinince `pinnedMessageId` NULL oluyor — Faz 1 FK'si `ON DELETE SET NULL`; migration ve `schema.prisma` iki ayrı testle sabit, ayrıca boş `dm:group:pin` yayını testli.
- [x] `startGroupCall` iki eşzamanlı çağrıda tek oda üretiyor — `applyGroupCallJoin` `startedAt`'i koruyor.
- [x] `notifyLevel = NONE` üyeye halka gitmiyor, `dm:call:state` gidiyor — `planGroupCallSignals` dört testi.
- [x] Grup konuşması için LiveKit token'ı alınabiliyor (3+ katılımcı) — 3 ve 32 kişilik grup, üye olmayan, engelli, yok olan konuşma: 5 test.
- [x] Web `/g/[code]` sekiz dalın hepsinde doğru mesajı veriyor; oturumsuz akış giriş sonrası koda dönüyor — eşleme testli, her dalın **farklı** anahtarı ve iki dilde karşılığı olduğu sabit.

## §G ek maddeleri

**Worker'ın tek örnek garantisi.** Redis kilidi (`SET dm:disappearing:sweep <token> PX 55000 NX`). `SKIP LOCKED` seçilmedi: süpürme satır satır bir claim değil, birincil anahtar listesiyle tek `deleteMany` — kiralanacak satır yok. TTL (55 sn) periyottan (60 sn) **kısa**: ölen bir replikanın kilidi bir sonraki tick'ten önce unutulur. Bırakma, değeri karşılaştıran kısa bir Lua betiği — süresi aşan bir süpürme, araya giren başka bir örneğin kilidini silemesin diye. Redis erişilemezse tick atlanır, worker ölmez.

**Kaybelen mesaj sistem mesajı tipi.** Yeni enum değeri `DISAPPEARING_CHANGED` (S2). `systemValue` pencere enum'unu taşır; cümleyi web'de `dm.group.system.disappearingChanged`, mobilde `groupSystemDisappearingChanged` kurar, pencere adı dört ayrı kopya anahtarından gelir. Bilinmeyen bir pencere değeri satırı boşaltmaz, olduğu gibi yazılır.

**Rate limit değerleri.**

| Anahtar                                                | Limit | Pencere             |
| ------------------------------------------------------ | ----- | ------------------- |
| `group-invite:preview` / `mobile:group-invite:preview` | 20    | 60 sn               |
| `group-invite:join` / `mobile:group-invite:join`       | 5     | 60 sn               |
| `dm:group:update` (davet aç/kapa/yenile/oku)           | 30    | 60 sn (mevcut kova) |

## Cihaz testi yerine: `curl` ile doğrulanabilir uç listesi

Bu fazda **arayüz yok**; aşağıdaki uçlar oturum çerezi/bearer ile doğrulanabilir. `<C>` konuşma id'si, `<K>` davet kodu.

1. `PATCH /api/v1/dm/groups/<C>/invite` gövde `{"enabled":true}` → `200`, `invite.code` 12 karakter, `invite.url` deployment host'uyla `/g/<K>`.
2. Aynı ucu `{"enabled":false}` ile çağır → `200`, `invite.code` **null**, `invite.url` null.
3. Tekrar `{"enabled":true}` → **aynı** kod geri gelir.
4. `POST /api/v1/dm/groups/<C>/invite/rotate` → `200`, **yeni** kod, `uses: 0`.
5. `GET /api/v1/dm/groups/<C>/invite` **üye olmayan** hesapla → `403`.
6. `GET /api/v1/group-invites/<eskiK>/preview` (4'ten önceki kod) → `404 INVITE_NOT_FOUND`.
7. `GET /api/v1/group-invites/<K>/preview` başka hesapla → `200`, `memberCount` var, gövdede **`participants` yok**.
8. `POST /api/v1/group-invites/<K>/join` aynı hesapla → `200`, `alreadyMember: false`; tekrar çağır → `200`, `alreadyMember: true`.
9. Daveti kapat, sonra `POST .../join` → `403 INVITE_DISABLED`.
10. `GET /api/v1/group-invites/kısa/preview` → `404` (kod biçimi; sunucu DB'ye gitmez).
11. Aynı hesapla 6 kez arka arkaya `POST .../join` → altıncısı `429 RATE_LIMITED`.
12. Tarayıcıda `/g/<K>`: oturumsuz → `/login?callbackUrl=/g/<K>`; oturumlu → grup kartı; `Katıl` → `/channels/@me/<C>`.
13. `PATCH /api/v1/dm/groups/<C>/settings` gövde `{"disappearingAfter":"H24"}` → `200`; sohbetin son mesajı `systemType: "DISAPPEARING_CHANGED"`, `systemValue: "H24"`.
14. Aynı gövdeyi tekrar gönder → `200`, **yeni sistem mesajı yok**.
15. Bir mesaj gönder, `GET /api/v1/dm/<C>/messages` → o mesajda `expiresAt` dolu, 24 saat sonrası.
16. `disappearingAfter` `OFF`'a çek, yeni mesaj gönder → yeni mesajda `expiresAt: null`, **eski mesajın damgası duruyor** (V6).
17. Soket dinleyicisi ile `dm:call:start` gönder → `dm:call:state` `active: true` ve tek katılımcı; ikinci hesap `dm:call:join` → aynı `startedAt`, iki katılımcı.
18. İki katılımcı da `dm:call:leave` → son ayrılışta `active: false` + `dm:call:ended`.
19. `notifyLevel: "NONE"` olan üyeye `dm:call:incoming` **gelmiyor**, `dm:call:state` **geliyor**.
20. 3 kişilik grupta `POST /api/v1/livekit/token` gövde `{"conversationId":"<C>"}` → `200`, oda `dm:<C>`; üç hesap için de aynı oda.

### Migration'ın uygulanması

`rebaseline-migrations/` altında olduğu için UAT deploy'unda mevcut Prisma akışıyla kendiliğinden koşar; deploy'un `SUCCESS` olduğu doğrulanır (`railway deployment list` + `x-railway-fallback` başlığı). Yerelde önce:

```bash
pnpm --filter @wizards/db exec prisma migrate dev --name group_invite_disappearing
```

Yerel DB `db push` yönetimli olduğu için Prisma drift görüp reset önerebilir. **Faz 1'in migration'ı da hâlâ koşulmadı** — ikisi sırayla uygulanır.

## Bilinen boşluklar

- **Mobil istemci hiçbir yeni ucu/olayı çağırmıyor.** Davet istemcisi, `dm:call:state` dinleyicisi, `dm:message:expired` önbellek temizliği ve `/g/<code>` deep-link dalı **Faz 3**'ün işi (02 §B4 bunu zaten Faz 3 rota işi olarak işaretliyor).
- **Web tarafında davet arayüzü yok**: `/g/[code]` sayfası var, ama grubu yönetenin daveti açtığı panel **Faz 5**'e devredildi (Faz 1 raporundaki web ekran listesine "davet satırı" eklenir).
- `dm:group:invite` olayı yalnız `enabled` taşır; istemci kodu görmek için `GET .../invite` atar. Bilinçli — kod her istemcinin belleğinde durmasın diye.
- **Purge sonrası depo temizliği yeniden denenmiyor**: UploadThing çağrısı başarısız olursa satırlar yine de silinmiş olur ve dosya sahipsiz kalır (log'a düşer). Sahipsiz dosya taraması bu pakette yok.
- `expiresAt` filtresi sohbet listesi önizlemesinde **bellek içi**: süresi geçmiş son mesaj, süpürme gelene kadar (≤60 sn) satırı önizlemesiz bırakır, bir öncekine düşmez.
- **Grup çağrısı ekranı yok** (D5 gereği Faz 5); ekran paylaşımı grup çağrısında bu pakette hiç yok.
- `GroupInvite.maxUses` / `expiresAt` kolonları var ama **hiçbir uç yazmıyor** — tasarımda karşılığı yok, şema `ServerInvite` paritesi için taşıyor.
- **Ölçüm notu:** `DMMessage_expiresAt_idx` düz b-tree; `expiresAt` satırların çoğunda NULL olacağı için indeks tablo boyutuyla büyür. Kısmi indekse (`WHERE "expiresAt" IS NOT NULL`) geçiş, Prisma bunu modelleyebildiğinde veya drift'i kabul eden ayrı bir migration ile yapılır. UAT'de tablo büyüdükten sonra tekrar bakılmalı.
