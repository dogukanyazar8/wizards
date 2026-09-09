# Dalga 1 · Ş1 — DM profil verisi ucu · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** bitti, kapı yeşil. Commit atılmadı.

## Kapı

| Komut                                           | Sonuç                     |
| ----------------------------------------------- | ------------------------- |
| `node --import tsx --test` (üç şerit dosyası)   | 37 / 37                   |
| `pnpm --filter @wizards/web typecheck`          | Ş1 dosyalarında **temiz** |
| `eslint` + `prettier --check` (yeni yedi dosya) | temiz                     |
| `src/app/api/v1/route-contract.test.ts`         | Ş1'in iki ucu geçiyor     |

Typecheck ve route-contract'ta kalan tek kırmızı Ş2'nin (`dm/groups/[conversationId]/profile`)
henüz yazılmamış `route-logic` dosyası — bu şeridin dosyası değil.

Tek dosya koşarken App Router köşeli parantezi glob'a kaçırılmalı:
`node --import tsx --test "src/app/api/v1/dm/[[]conversationId[]]/profile/route-logic.test.ts"`.
Kaçırmadan koşarsanız `node --test` `[conversationId]`'i karakter sınıfı sanar, **sıfır test**
koşar ve "yeşil" görünür (emsal: `scripts/test-glob-path.mjs`).

## Yazılan dosyalar

- `apps/web/src/lib/friends/mutual-friends.ts` + `.test.ts`
- `apps/web/src/lib/dm/profile-service.ts` + `.test.ts`
- `apps/web/src/app/api/v1/dm/[conversationId]/profile/route.ts` + `route-logic.ts` + `route-logic.test.ts`
- `apps/web/src/app/api/v1/mobile/dm/[conversationId]/profile/route.ts`
- `apps/web/src/lib/dm/profile-client.ts`

Sahiplenilmeyen hiçbir dosyaya yazılmadı. `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`,
`lib/dm/client.ts`, `lib/dm/service.ts` yalnız okundu.

## Alan → kaynak tablosu

Hepsi gerçek veriden gelir. **`TODO(api):` yok** — panelin DM kolunda karşılığı olmayan tek bir
alan çıkmadı.

| DTO alanı                              | Kaynak                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `userId`, `name`, `handle`, `initials` | `DMParticipant.user` (`displayName` boşsa `username`)                                                                        |
| `bio`                                  | `User.bio`                                                                                                                   |
| `presence`                             | Redis presence + `resolveVisibilityDecisions` + `redactPresenceCollectionForViewer`                                          |
| `statusText`                           | `User.customStatus`, `readActiveCustomStatus` ile süre süzgecinden geçirilip presence redaksiyonuna **girdi** olarak verilir |
| `tint`                                 | `resolveProfileTint(userId)` (`@wizards/types`)                                                                              |
| `badges`                               | `readUserBadges({ userId })` — karşı tarafın, görüntüleyenin değil                                                           |
| `friendship.since`                     | `FriendRequest.updatedAt`, `status: ACCEPTED`, iki yön OR'lu                                                                 |
| `friendship.durationMonths`            | `since` ile `now` arası tam ay                                                                                               |
| `friendship.metViaServerName`          | aşağıda                                                                                                                      |
| `mutualServers`                        | `listDirectMessageMutualServers` (yeniden yazılmadı), `onlineCount` `server:<id>:online` kümesinden tek boru hattıyla        |
| `mutualFriends`, `mutualFriendTotal`   | yeni `lib/friends/mutual-friends.ts`                                                                                         |
| `notifyLevel`, `muted`, `mutedUntil`   | `DMParticipant` (viewer satırı), `isMuteActive` süzgeciyle                                                                   |
| `privacy`                              | `UserSettings.showReadReceipts` + `showTypingIndicator` (satır yoksa ikisi de `true`)                                        |
| `blocked`                              | `getBlockStatus(viewerId, otherUserId)`                                                                                      |

Sorgu bütçesi **iki tur**: (1) konuşma satırı; (2) rozet · arkadaşlık · ortak arkadaş · ortak
sunucu · gizlilik · engel paralel; (3) presence · sunucu çevrimiçi sayacı · "tanıştınız" paralel.
Üçüncü tur ikinciye bağımlı çünkü kimin presence'ı okunacağı ortak arkadaş kesişiminden çıkıyor.

## Ortak arkadaş sorgusunun şekli

Kesişim **PostgreSQL'de** yapılır, Node'da değil. `User` üzerinden iki ilişkisel filtrenin `AND`'i:

```ts
const connectedTo = (peerId: string) => ({
  OR: [
    { friendRequestsSent: { some: { receiverId: peerId, status: "ACCEPTED" } } },
    { friendRequestsReceived: { some: { senderId: peerId, status: "ACCEPTED" } } },
  ],
});

where = {
  AND: [connectedTo(viewerId), connectedTo(otherUserId)],
  deletedAt: null,
  id: { notIn: [viewerId, otherUserId] },
};
```

`count(where)` + `findMany({ where, orderBy: [{ username: "asc" }], take })` paralel. Toplam
önizleme uzunluğundan **okunmaz**; "ve N kişi daha" ancak gerçek sayaçla doğru olur.

Varsayılan `take` = `MUTUAL_FRIEND_DEFAULT_LIMIT` = 5 (§15.3.5'in dört satırı + bir).
`FriendRequest`'in `@@index([senderId, status])` / `@@index([receiverId, status])` indeksleri bu
şekli zaten karşılıyor.

**Sürpriz:** aynı `where` şekli `lib/social/mobile-user-profile-service.ts` içinde **zaten var**
(dışa açılmamış özel `getMutualFriends`). O dosya bu şeridin yazma listesinde olmadığı için ortak
yardımcıya indirgenmedi; iki kopya bilerek birebir aynı. **İndirgeme ayrı bir iş olarak
önerilir** — yoksa mobil profil kartı ile Mesajlar paneli aynı soruya iki farklı cevap verebilir.
Aynı emsalle uyum için banlı hesap filtresi **eklenmedi** (`deletedAt: null` var, `isBanned` yok).

## `metViaServerName` türetimi (K6)

Kolon eklenmedi. Tek `serverMember.findFirst`:

```ts
store.serverMember.findFirst({
  orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  select: { server: { select: { name: true } } },
  where: {
    pending: false,
    userId: { in: [viewerId, otherUserId] },
    server: {
      AND: [
        { members: { some: { pending: false, userId: viewerId } } },
        { members: { some: { pending: false, userId: otherUserId } } },
      ],
    },
  },
});
```

Yani: **iki tarafın da üye olduğu sunucular** arasından, iki tarafın üyelik satırlarının en eski
`joinedAt`'i. Ortak sunucu yoksa `null` → panel ikinci cümleyi çizmez. Arkadaş değilken sorgu
**hiç açılmaz** (K7 tarih kartını zaten çizmiyor); testi bunu doğruluyor.

**K6'nın kelimesi kelimesine uygulandı, ama bir nüans var:** "en eski `joinedAt`" çoğu zaman iki
kişiden **erken katılanın** satırıdır. Görüntüleyen A sunucusuna 2019'da, karşı taraf 2025'te
girdiyse cevap A olur — oysa ikisinin de 2020'de bulunduğu B sunucusu "tanışma" için daha doğru
cevaptır (`min` over servers of `max(joinA, joinB)`). Karar bağlayıcı olduğu için kod
değiştirilmedi; farkı kayda geçiriyorum.

## Tint kuralının tam tanımı (Ş5 bunu okuyacak)

- **Kişi:** `resolveProfileTint(userId)` — `@wizards/types`, Dalga 0'da yazıldı. FNV-1a hash,
  `primary · success · warning · danger` rotasyonu; `neutral` **yalnız** kimliksiz özne içindir.
  Kendi hash'inizi yazmayın, `DMParticipant.nameColor` okumayın (o grup-kapsamlı ham hex).
  Ray satırı, kimlik bloğu, üye satırı, ortak arkadaş satırı, aday satırı — hepsi bu.
- **Sunucu karosu (§15.3.4):** kişi kuralı **değil**. `resolveMutualServerTint(iconColor)`
  (`lib/dm/profile-service.ts`) sunucunun kendi `Server.iconColor` tonunu kullanır:
  `primary→primary`, `info→primary`, `success→success`, `warning→warning`, `danger→danger`,
  `accent2→neutral`, `null→neutral`. Gerekçe: aynı sunucu ray ve keşfet kartında seçtiği renkle
  çiziliyor; panelde hash'e düşmek onu iki farklı renk yapardı. `ProfileTint` altı tonu
  taşıyamadığı için `info` ve `accent2` paletin içine indiriliyor.

## Şeritlerin bilmesi gereken sürprizler

1. **Mobil rota, `route-logic`'i GÖRELİ yolla içe aktarmak zorunda.**
   `route-contract.test.ts` bir rotanın yetki kapısını, "route-logic" ile biten import'u **rota
   klasörüne göre** çözerek arıyor (`readRouteContractSource`, satır ~1470). `@/app/api/...`
   takma adı o çözümden düşer, dosya okunmaz ve uç sessizce **"kimliksiz rota"** listesine kayar —
   test üç yerden birden kırmızıya döner. Ş1'in mobil ucu bu yüzden
   `../../../../dm/[conversationId]/profile/route-logic` yazıyor. **Ş2'nin
   `dm/groups/[conversationId]/profile/route.ts` dosyası şu an tam olarak bu yüzden kırmızı**
   (`Cannot find module '../../../route-logic'`).
2. **`handle` çıplak kullanıcı adıdır, başında `@` yoktur.** Panel `@{handle}` çizecek. (Emsal:
   keşfet ve bahsedilmeler uçları çıplak `username` döndürüyor; `friends-view.tsx` bileşen içinde
   `@` ekliyor — DTO'da yok.)
3. **`badgeTotal` DTO'da yok.** Payda istemcide `BADGE_IDS.length` (K10). Rozet **metni** de
   i18n'de değil, `BADGE_CATALOG.copy` içinde (Dalga 0 raporu #3).
4. **`friendship` şeması `durationMonths: number` taşıyor**, prompt'un anlattığı
   `durationLabelKey: { years, months }` **değil**. Şema kazandı; "1 yıl 6 ay" cümlesini istemci
   ay sayısından kurar. `since` ISO dizedir, biçimlendirme istemcide.
5. **Presence tek okumada geliyor.** `readPresence` çağrısı karşı taraf **ve** ortak arkadaşların
   hepsini bir `readPresenceState` + bir `resolveVisibilityDecisions` turunda çözüyor. Ş5/Ş6 satır
   başına presence sorgusu **açmasın**; testi bunu kilitliyor.
6. **`mutualServers` tavanı 12, DTO'da `mutualServerTotal` yok.** Bölüm başlığındaki sayı listenin
   uzunluğudur (`ORTAK SUNUCULAR 3`). Ortak arkadaşta durum farklı: orada gerçek toplam
   (`mutualFriendTotal`) var ve önizleme 5 satırla sınırlı.
7. **Engelli çift kısaltılmış gövde alır.** `blocked: true` iken `bio`, `badges`, `friendship`,
   `statusText`, `mutualFriends`, `mutualServers` boşalır ve `presence: "offline"` olur; kimlik
   (`name`, `handle`, `initials`, `tint`) ve görüntüleyenin kendi tercihleri (`notifyLevel`,
   `muted`, `privacy`) kalır. Mobil profil kartının engelli kabuğuyla aynı kural. Ş9'un
   "Engellemeyi kaldır" satırı bu gövdeyle çizilebilir.
8. **Süresi geçmiş sessizlik geri YAZILMIYOR.** K8 "tembel temizler" diyor; okuma yolu satırı
   yazmıyor, yalnız **yok sayıyor**: `muted: false`, `mutedUntil: null` ve `notifyLevel` `NONE`
   ise `ALL` olarak dönüyor. Gerekçe: `muted` ile `notifyLevel` ikizdir (tuzak 5) ve ikisini
   birlikte yazmak Ş4'ün sessize alma ucunun işi; bir GET'in `notifyLevel`'i tahmin etmesi
   gerekirdi (süreli sessizlikten önce `MENTIONS` olan biri `ALL`'a zorlanırdı). **Ş4:** gerçek
   temizliği kendi ucuna ya da bildirim yoluna koy.
9. **Yeni hız sınırı anahtarı açılmadı.** `lib/api-rate-limit.ts` bu şeridin yazma listesinde
   değil ve dört şerit paralel koşuyor. Web ucu `dm:conversation:read` (120/dk), mobil ucu
   `mobile:dm:details` (60/dk) kovasını paylaşıyor. `dm:profile` anahtarını isteyen olursa
   `api-rate-limit.ts` sakinleşince tek elden eklensin.
10. **Yanıt uçta ikinci kez şemadan geçiyor.** `UserProfilePanelDTOSchema.parse(...)` route
    içinde koşuyor; `.strict()` olduğu için servise fazladan bir alan (ham `User` satırı, e-posta)
    sızarsa yanıt **400** olur, sessizce yayınlanmaz. Testi bunu doğruluyor.

## İstemci köprüsü

`lib/dm/profile-client.ts` (K: `client.ts`'e **yazılmadı**, paralel koşuda çakışırdı):

- `dmProfileQueryKeys.profile(conversationId)` → `["dm", "profile", conversationId]` —
  `dmQueryKeys.root` (`["dm"]`) altında kalıyor, toplu geçersizleştirme paneli de kapsıyor.
- `fetchDmProfilePanel(conversationId, init?)` — hata `DMClientError` (mevcut tip).
- `dmProfilePanelQueryOptions(conversationId, enabled)` — `enabled` bayrağı Ş5'in bağlayacağı
  tembellik kapısı; `staleTime = BADGE_QUERY_STALE_TIME_MS` (5 dk), rozet sorgularının kendi
  penceresiyle **aynı**.

## Açık kalan

Yok. Dalga 2'nin Ş5/Ş6/Ş8'i bu ucu doğrudan tüketebilir.
