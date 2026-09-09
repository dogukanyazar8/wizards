# Dalga 1 · Ş2 — Grup profil verisi ucu + iki yönetici eylemi · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

| Komut                                                                                                | Sonuç                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `node --import tsx --test src/lib/dm/group-profile-service.test.ts src/lib/dm/group-service.test.ts` | 121 / 121                                                                                                    |
| `node --import tsx --test src/app/api/v1/dm/groups/route-logic.test.ts`                              | 45 / 45 (16'sı yeni)                                                                                         |
| `node --import tsx --test src/app/api/v1/route-contract.test.ts`                                     | benim rotalarım geçiyor; **tek kalan hata Ş4'ün `mobile/account/privacy/route.ts` dosyası** (bkz. §7)        |
| `pnpm --filter @wizards/web typecheck`                                                               | **kendi dosyalarımda temiz** — kalan iki hata `src/lib/desktop/runtime.test.ts` içinde, bu paketten bağımsız |
| `npx eslint` (12 dokunulan dosya)                                                                    | temiz                                                                                                        |
| `npx prettier --check`                                                                               | temiz                                                                                                        |

`DATABASE_URL` gerekiyor: `@wizards/db` modül yüklenirken bağlantı dizesini doğruluyor.
Süit koşucusu (`apps/web/scripts/run-node-tests.mjs`) bunu kendisi enjekte ediyor; elle
koşarken `DATABASE_URL=postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests` vermek şart.

---

## Yazılan dosyalar

**Yeni:** `lib/dm/group-profile-service.ts` (+ `.test.ts`), `lib/dm/group-profile-client.ts`,
`api/v1/dm/groups/[conversationId]/profile/route.ts`,
`api/v1/dm/groups/[conversationId]/history/route.ts`,
`api/v1/mobile/dm/groups/[conversationId]/profile/route.ts`.

**Eklendi (mevcut satırlara dokunulmadı):** `lib/dm/group-service.ts` (+2 fonksiyon, +1 import),
`lib/dm/group-service.test.ts` (+2 `describe`), `api/v1/dm/groups/route-logic.ts`
(+4 route, +1 bağımlılık tipi), `api/v1/dm/groups/route-logic.test.ts` (+5 `describe`),
`.../[conversationId]/members/route.ts` (+`GET`), `.../[conversationId]/route.ts` (+`DELETE`).

**Sahiplenme listesi dışında tek ek:** `api/v1/route-contract.test.ts` (+2 satır kayıt) —
gövdesiz mutasyon rotaları orada zorunlu kayıt altında, gerekçesi §5.3'te.
`lib/api-rate-limit.ts` **değiştirilmedi** (§5.2).

---

## 1. `Grubu sil` neden yalnız `OWNER`?

SPEC §15.5.3 satırı **yönetici** olarak işaretliyor. Kodda `ADMIN` bile yapamıyor; gerekçe
`deleteGroupConversation`'ın üstündeki yorumda da duruyor:

- Paneldeki öteki yönetici satırlarının hepsi geri alınabilir ya da dar kapsamlı.
  `Geçmişi temizle` içeriği **gizler**, `Gruptan ayrıl` **bir** kişiyi çıkarır. Silme ise 250
  kişinin sohbetini aynı anda ve geri dönülemez biçimde yok eder.
- Kod tabanının kendi emsali aynı yeri çiziyor: `updateMemberRole` "yönetici atamak yalnız
  sahibindir" diyor, çünkü yönetici atayabilen yönetici zaten sahiptir. Grubu silebilen bir
  yönetici de öyle — o noktada sahiplik hiçbir şey ifade etmez.
- Yetki **sunucuda** yeniden türetiliyor: `assertGroupOwner(toContext(conversation, actorId))`.
  İstemcinin `role` alanı karara girmiyor; uç zaten gövdesiz (aşağıya bakın).

**Ş8'e sözleşme:** `Grubu sil` satırı yalnız `viewerRole === "OWNER"` iken çizilir. `ADMIN`'e
çizilirse buton 403 döner — kapı burada, satırın görünürlüğü yalnız düzen kararı.

## 2. `Geçmişi temizle` neden `historyFromAt`?

Mesaj **silinmiyor**; her katılımcının `DMParticipant.historyFromAt` değeri `now()` yapılıyor.
Kolon zaten 2c §7'de "bu üyenin okuyabileceği en eski mesaj" için açılmış ve beş DM okuma yolu
onu **zaten** uyguluyor (`toHistoryWindowFilter`). Üç neden koda yorum olarak yazıldı:

1. `DMMessage` yanıtların, thread köklerinin, tepkilerin, eklerin, sabitlenenlerin ve anket
   satırlarının ebeveyni. Geçmişi `deleteMany` ile silmek bu zinciri konuşma boyunca patlatır;
   kaybolan mesaj işçisi de aynı satırları geziyor.
2. Grup geçmişi ortak mülk. Bir yöneticinin tek tıkla 249 kişinin yazdığını **yok etme** hakkı
   yok; tabanı yükseltmek içeriği konuşmadan kaldırır, var olmaktan çıkarmaz.
3. Destek eliyle geri alınabilir ve denetlenebilir; sert silme ikisi de değil.

**Kapatılmamış tek uç (bilerek):** `historyVisibility: "ALL"` olan bir grupta temizlemeden
**sonra** katılan biri hiç taban almaz (`resolveHistoryFloor` `null` döner) ve gizlenen mesajları
görür. Kapatmak için konuşma seviyesinde bir `historyClearedAt` kolonu gerekir — migration demek,
bu şeridin kapsamı dışında. Kod yorumunda da yazılı. **Öneri:** ayrı iş olarak açılsın.

## 3. Kullanılan socket olay adları

| Olay                              | Oda(lar)                                           | Yük                             | Yeni mi?       |
| --------------------------------- | -------------------------------------------------- | ------------------------------- | -------------- |
| `dm:conversation:history_cleared` | `dm:<id>` **+** her katılımcının `user:<id>` odası | `{ clearedAt, conversationId }` | **Evet**       |
| `dm:conversation:removed`         | her katılımcının `user:<id>` odası                 | `{ conversationId }`            | Hayır — mevcut |

`Grubu sil` bilerek **yeni bir olay üretmiyor**. Okuyucu açısından "gruptan çıkarıldın" ile
"grup silindi" aynı olgu: bu konuşma artık yok. `dm:conversation:removed`'ın istemci tarafı
zaten önbellekten ve raydan düşürüyor, ve olay `lib/socket/events.ts` içinde **tipli**.
Ayrıca `io.in("dm:<id>").socketsLeave("dm:<id>")` çağrılıyor: `dm:join` girişi kapıyor ama içeride
duran soketi hiç atmıyor.

**Ş8 / Ş9'un yapması gereken iki şey:**

1. `dm:conversation:history_cleary` değil — **`dm:conversation:history_cleared`**. Bu ad
   `apps/web/src/lib/socket/events.ts` içindeki tipli listede **yok**; sunucu tarafı
   `emit(event: string, ...)` üzerinden bastığı için derleniyor, ama dinleyiciyi yazan şerit
   satırı oraya eklemeli: `"dm:conversation:history_cleared": (data: { clearedAt: string;
conversationId: string }) => void;`. O dosya bu şeridin yazma listesinde değildi.
2. Silinen grubun LiveKit odası (`dm:<conversationId>`) sökülmüyor. `evictRemovedGroupMember`
   bunu üye başına yapıyor ama 250 kişilik bir grupta 250 LiveKit çağrısı demekti. LiveKit
   odaları kısa ömürlü; yine de "silinen grupta süren çağrı" kenar durumu açık.

## 4. Mobil yıkıcı uçlar neden açılmadı?

K1 mobil **ekran** dosyalarını dondurdu; `apps/mobile/**` hiçbir şeridin yazma listesinde yok.
Yani `Geçmişi temizle` / `Grubu sil` için mobilde bir yüzey **yok** ve bu pakette olmayacak.
Yüzeyi olmayan yıkıcı bir uç, özellik değil korumasız bir yetenektir: yalnız API'yi konuşan
bir istemcinin elinde kalır ve kimse onun arkasındaki onay akışını görmez. Bu yüzden mobil
karşılığı **yalnız `profile`** için açıldı (prompt da böyle diyor).

Mobil uç kendi dosyasında duruyor ve `mobile/dm/groups/route-logic.ts` dosyasına **dokunulmadı**
(o dosya sahiplenme listesinde değildi): rota `groupProfileDefaults` üzerine `authenticate` ve
`rateLimits.read` biniyor, yanıtı `GroupProfilePanelDTOSchema` ile yeniden parse ediyor.
Miras alınan yıkıcı bağımlılıklar orada **ulaşılamaz** — dosya yalnız `GET` mount ediyor.

---

## 5. Kardeş şeritlerin bilmesi gereken sürprizler

### 5.1 `AuditLog` grup DM'e yazamıyor

`AuditLog.serverId` **null olamayan** bir `Server` foreign key'i. Grup DM'in sunucusu yok, yani
kural 8'in "yıkıcı uçlar `AuditLog` yazar" cümlesi bu tabloda **fiziksel olarak imkânsız**.
Sunucusuz tek denetim tablosu `AdminAuditLog`: `adminUserId` nullable, `action` serbest metin,
`targetType`/`targetId` serbest. İki eylem oraya yazıyor:

- `action: "DM_GROUP_HISTORY_CLEARED"` / `"DM_GROUP_DELETED"`, `targetType: "DMConversation"`,
  `targetId: conversationId`, `metadata: { memberCount }`, `adminUserId: actorId`.
- İkisi de mutasyonla **aynı transaction** içinde yazılıyor — `writeAdminAuditLog(args, tx)`
  bir `Pick<PrismaClient, "adminAuditLog">` alıyor ve transaction istemcisi onu karşılıyor.
- `ipHash` / `userAgentHash` için rotadan `request.headers` servise geçiriliyor
  (`GroupAdminActionOptions.headers`).

**Bilinmesi gereken iki sonuç:** (a) `adminUserId` adı yanıltıcı — burada "eylemi yapan" demek,
grup sahibi admin değil. (b) `loadAdminAuditSnapshot` son 10 satırı **filtresiz** okuyor, yani
grup silme satırları admin konsolunun genel denetim şeridinde görünecek. Sunucu konsolunun kendi
şeridi (`listAdminServerAuditTrail`) `targetType: "Server"` süzdüğü için **orayı kirletmiyor**.
Yıkıcı eylemin platform çapındaki izde görünmesi zaten istenen davranış; yine de kayda geçsin.

### 5.2 İki hız sınırı kovası **isteniyor**, açılmadı — ana oturum eklemeli

`lib/api-rate-limit.ts` paylaşımlı dosya ve koordinatör kararı gereği bu şerit ona
**dokunmadı**. Yıkıcı iki uç şu an mevcut grup yazma kovasını (`dm:group:update`, 30/60)
harcıyor. Prompt'un istediği "ayrı ve daha sıkı kova" `ApiRateLimitAction =
keyof typeof API_RATE_LIMITS` olduğu için yeni anahtar olmadan yazılamıyor.

**Ana oturumun `API_RATE_LIMITS` içine eklemesi gereken iki satır** (emsalleri
`channel:clear-history` 10/60 ve `server:delete` 5/saat):

```ts
"dm:group:clear-history": { limit: 10, windowSeconds: 60 * 60 },
"dm:group:delete": { limit: 5, windowSeconds: 60 * 60 },
```

Kod bunun için hazır: `groupProfileDefaults.rateLimits` üç ayrı yuva taşıyor
(`clearHistory` / `delete` / `read`) ve iki uç kendi yuvasını okuyor. Eklendiğinde
`route-logic.ts` içinde **iki dize** değişir, başka hiçbir şey. `route-logic.ts` içindeki
`TODO(rate-limit):` yorumu ve `route-logic.test.ts` içindeki
"keeps a separate bucket slot for each destructive row" testi bu değişikliğin sessizce
unutulmamasını sağlıyor.

**Risk değerlendirmesi (geçici durum kabul edilebilir):** `Grubu sil` idempotent değil ama
ikinci istek zaten 404 alır (konuşma yok); `Geçmişi temizle` tabanı tekrar `now()` yapar,
yani tekrarın zararı yok. 30/60 bir yeniden deneme fırtınasını durdurur; yine de asıl kova
gelmeli.

### 5.2b Rota dosyasında `route-logic` import'u **göreli** olmalı, `@/app/...` takma adı değil

`route-contract.test.ts` içindeki `readRouteContractSource`, bir rotanın mantık dosyasını
"`route-logic` ile biten her import'u **rotanın kendi klasörüne göre** çöz" diyerek buluyor:

```ts
logicPaths.add(path.resolve(routeDirectory, `${statement.moduleSpecifier.text}.ts`));
```

Takma ad (`@/app/api/v1/...`) `path.resolve` için anlamsız bir yola çıkar, `existsSync` yanlış
döner ve dosya **sessizce atlanır**. Sonuç: uç "kimlik kapısı yok" listesine düşer, test
kırmızı olur ama sebebi görünmez. Mobil profil rotam bu yüzden
`"../../../../../dm/groups/route-logic"` kullanıyor (çirkin ama doğru) ve gerekçe dosyanın
başında yorum olarak duruyor. Beş rota dosyasının beşi de betikle doğrulandı.

**Mevcut kod tabanında bu tuzağa düşen dosyalar var:**
`mobile/dm/groups/route-logic.ts` ve `mobile/account/privacy/route.ts` takma ad kullanıyor.
Birincisi bir _route-logic_ dosyası (rota değil), o yüzden test onu farklı bir yoldan
buluyor ve sorun çıkmıyor; ikincisi gerçek bir rota ve **şu an testi kırıyor** (§7).

### 5.3 `route-contract.test.ts` gövdesiz mutasyon rotalarını kayıt altında tutuyor

`BODYLESS_MUTATING_METHOD_PATHS` diye açık bir liste var ve gövdesiz her yeni `DELETE`/`POST`
oraya **yazılmak zorunda**, yoksa süit kırmızı. `DELETE dm/groups/[conversationId]` ve
`DELETE dm/groups/[conversationId]/history` eklendi. **Ş4'ün de aynı şeyi yapması gerekebilir**
(engelleme/bildirme uçlarından gövdesiz olan varsa). Aynı dosyada ayrıca
"her mutasyon rotası merkezî parser çağırmalı" ve "yüksek riskli rotalar doğru bucket'a
bağlanmalı" testleri var — AST üzerinden çalışıyorlar, kandırılamıyorlar.

### 5.4 `GroupProfilePanelDTO.invite.url` **tam URL**, tasarımdaki kısa biçim değil

§15.4 `whispr.app/g/s24-ekibi` çiziyor; Dalga 0'ın şeması tek bir `url` alanı taşıyor.
Kopyalanabilir olması gereken bir bağlantı şemasız gönderilemez, o yüzden uç
`buildGroupInviteUrl` çıktısını (tam URL) veriyor. **Ş7 kısa biçimi kendisi türetir**
(`url.replace(/^https?:\/\//, "")`). `GroupInviteDTO.displayUrl` alanı zaten var ama panel DTO'suna
girmedi — sözleşme Dalga 0'da kapandı, tek alan.

### 5.5 `statusText` = kullanıcının **kendi** durum metni, sunucu cümlesi değil

`Odak modu · 25 dk` gibi satırlar `PresenceFields.customStatus`. `Çevrimdışı · dün 22:10`
sunucuda **üretilmiyor**: DTO `presence` (`online|idle|dnd|offline`) ve ham `lastSeenAt`
taşıyor, cümleyi istemci kendi dilinde kuruyor (kural 3). Presence ve `lastSeenAt` **birlikte**
redakte ediliyor (`redactPresenceCollectionForViewer`) — ayrı çekilse, presence'ı gizlenen
birinin son görülme zamanı sızardı.

### 5.6 Tint `resolveProfileTint(userId)`'den, `nameColor`'dan değil

Prompt'un düzeltmesi uygulandı ve testle sabitlendi (`item.tint === resolveProfileTint(id)` +
`tint` hiçbir zaman `#` ile başlamıyor). `DMParticipant.nameColor` ham hex **ve** gruba özel;
aynı kişi rayda başka, listede başka renk olurdu.

### 5.7 `onlineCount` = "OFFLINE olmayan" — mevcut emsalle aynı

`lib/dm/service.ts:814` konuşma DTO'sunda zaten `participants.filter((p) => p.status !== "OFFLINE")`
yapıyor. Aynı kural kullanıldı, yani `Boşta` ve `Rahatsız etmeyin` **çevrimiçi** sayılıyor.
Redis'in hiç bilmediği bir üye `OFFLINE`'a düşüyor (yoksa `undefined !== "OFFLINE"` sayacı şişirirdi).

### 5.8 Süresi dolmuş sessizlik okuma sırasında **tembel temizleniyor**

K8 gereği `getGroupProfilePanel` süresi geçmiş bir sessizliği yok sayıyor **ve**
`DMParticipant.muted/mutedUntil` satırını temizliyor. `notifyLevel`'a **dokunulmuyor**: sürenin
dolması bir bildirim tercihi değişikliği değil, üyenin sessize almadan önceki seçimi geri geliyor.
Bir `GET` içinde yazma bilinçli ve sınırlı — yalnız süreyi ilk gören istek ödüyor.
**Ş4'e:** mute yazma yolunda ikinci bir temizlik gerekmiyor.

### 5.9 `toInitials("Sürüm 2.4 Ekibi")` → `S2`, ve bu **doğru**

Tasarımın grup karosu tam olarak `S2` çiziyor. Baş harf yardımcısı ilk iki **kelimeden** birer
harf alıyor; "SE" beklemek yanlış. `lib/messages/rail-presentation.ts` yeniden yazılmadı, import
edildi (`toInitials`, `toMessagesPresence`).

### 5.10 Ayrı bağımlılık tipleri açıldı, mevcutlar büyütülmedi

`GroupServiceDependencies` ve `GroupRouteDependencies` dört çağrı yeri + iki test kurucusu
tarafından **tam** doldurulmuş durumda; iki/dört fonksiyon için onları büyütmek her birine
kullanılmayan stub yazdırırdı (ve `mobile/dm/groups/route-logic.ts` yazma listemde değil).
Bunun yerine `GroupAdminActionDependencies` (servis) ve `GroupProfileRouteDependencies` (rota)
açıldı. **Kardeş şeritler için emsal:** aynı dosyalara dokunacaksanız aynı yolu izleyin.

---

## 6. Sözleşme özeti (Ş7 / Ş8 için)

| Uç                                      | Metot  | Yetki       | Yanıt                                  |
| --------------------------------------- | ------ | ----------- | -------------------------------------- |
| `/api/v1/dm/groups/[id]/profile`        | GET    | katılımcı   | `{ profile: GroupProfilePanelDTO }`    |
| `/api/v1/dm/groups/[id]/members`        | GET    | katılımcı   | `GroupMemberPage` (**sarmalayıcısız**) |
| `/api/v1/dm/groups/[id]/history`        | DELETE | OWNER/ADMIN | `200 { clearedAt }`                    |
| `/api/v1/dm/groups/[id]`                | DELETE | **OWNER**   | `204`                                  |
| `/api/v1/mobile/dm/groups/[id]/profile` | GET    | katılımcı   | `{ profile: GroupProfilePanelDTO }`    |

- Üye listesi sorgusu: `?cursor=<opaque>&limit=<1..100>`; varsayılan sayfa **50**, tavan 100.
  İmleç base64url JSON (`{ tier, name, userId }`), keyset — imleç satırı gruptan ayrılsa bile
  doğru yerden devam ediyor. `total` her sayfada tam üye sayısı.
- Sıralama: `OWNER`+`ADMIN` katmanı önce, sonra ada göre (`localeCompare(…, "tr")`), sonra
  `userId`. `YÖNETİCİ` / `ÜYE` başlıkları **istemcide** gruplanır.
- İstemci köprüsü: `lib/dm/group-profile-client.ts` — `groupProfileQueryKeys.panel(id)` ve
  `.members(id)` **ayrı** anahtarlar (§15.2 tembel sekme kuralı), `fetchGroupProfilePanel`,
  `fetchGroupMembersPage`, `clearGroupHistoryRequest`, `deleteGroupConversationRequest`.
  `lib/dm/client.ts`'e **yazılmadı**; hata sınıfı olarak oradan `DMClientError` import ediliyor.
- Hata durumları: yok → 404, katılımcı değil → 403, 1:1 DM id'si → 400, boş/bozuk id → 400.
  Bozuk **imleç** 400 değil: geçersiz token "listenin başı" olarak okunuyor, çünkü o istemcinin
  kendi opak jetonu ve bayat bir tanesi paneli kilitlememeli.

## 7. Açık kalan

1. **`dm:group:clear-history` ve `dm:group:delete` kovaları** `API_RATE_LIMITS` içine eklenmeli
   — tam satırlar §5.2'de. Ana oturum, tek elden.
2. **Ş4'ün `src/app/api/v1/mobile/account/privacy/route.ts` dosyası `route-contract.test.ts`'i
   kırıyor.** Benim dosyam değil, ama sebebi §5.2b'deki tuzağın ta kendisi: rota
   `@/app/api/v1/users/me/privacy/route-logic` takma adıyla import ediyor, test mantık dosyasını
   okuyamıyor ve uç iki listeye birden düşüyor ("kimliksiz rota" + "kimlik kapısı çağırmayan
   rota"). Düzeltme tek satır: import'u `"../../../users/me/privacy/route-logic"` yap
   (derinlik sayılmalı). Ş4'e iletilmeli.
3. `historyClearedAt` kolonu (bkz. §2) — ayrı iş.
4. `dm:conversation:history_cleared` `lib/socket/events.ts` tip listesine eklenmeli — dinleyiciyi
   yazan şerit.
5. Silinen grubun LiveKit odası sökülmüyor (bkz. §3).
