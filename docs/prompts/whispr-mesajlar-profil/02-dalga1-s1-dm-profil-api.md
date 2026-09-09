# Dalga 1 · Ş1 — DM profil verisi ucu

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15'in **DM** kolunu besleyen tek okuma ucunu ve eksik
iki alt sorguyu yaz. Bu şerit **arayüz çizmez**; Dalga 2 Ş5/Ş6/Ş8 bu ucu tüketecek.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` ve
`design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` §15.1, §15.3, §15.5.
Kod tabanı için `graphify query "dm details panel mutual servers badges friend request"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/dm/profile-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/friends/mutual-friends.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/dm/[conversationId]/profile/route.ts` (yeni)
- `apps/web/src/app/api/v1/dm/[conversationId]/profile/route-logic.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/mobile/dm/[conversationId]/profile/route.ts` (yeni, K1)
- `apps/web/src/lib/dm/profile-client.ts` (yeni) — fetch + query key. **`lib/dm/client.ts`'e yazma:** üç şerit birden oraya ekleyecekti, paralel koşuda çakışır.

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, herhangi bir `components/**`
dosyası, `apps/mobile/**`.

## Ne yapılacak

### 1. `getDmProfilePanel(viewerId, conversationId)` — `lib/dm/profile-service.ts`

`UserProfilePanelDTO` döner (Dalga 0 Ş0.3 şeması). Tek servis, tek yerden okunur; panelin altı
bölümü için altı ayrı istek atılmaz.

Kaynaklar:

| DTO alanı                                              | Kaynak                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `initials`, `handle`, `presence`, `statusText` | mevcut DM katılımcı okuması (`DmParticipantDTO` üreten yol)                                                                                                                                      |
| `tint`                                                 | Ş5'in yazacağı avatar tint yardımcısı ile **aynı** kural; servis tarafında `DMParticipant.nameColor` ya da userId hash'i hangisi kullanılıyorsa o (kuralı yorumla sabitle, iki taraf ayrışmasın) |
| `bio`                                                  | `User.bio` (gerçek #10)                                                                                                                                                                          |
| `badges`, `badgeTotal`                                 | mevcut rozet servisi; `badgeTotal = BADGE_IDS.length` (K10)                                                                                                                                      |
| `friendship.since`                                     | `FriendRequest.updatedAt`, `status: ACCEPTED`, iki yön OR'lanır (K7)                                                                                                                             |
| `friendship.metViaServerName`                          | ortak sunucular arasında `ServerMember.joinedAt` en eskisi (K6); ortak sunucu yoksa `null`                                                                                                       |
| `mutualServers`                                        | mevcut `mutual-servers` yolu — **yeniden yazma**, servisi çağır                                                                                                                                  |
| `mutualFriends`                                        | yeni `lib/friends/mutual-friends.ts`                                                                                                                                                             |
| `notifyLevel`, `muted`, `mutedUntil`                   | `DMParticipant` (viewer satırı)                                                                                                                                                                  |
| `privacy`                                              | `UserSettings.showReadReceipts` + `showTypingIndicator` (viewer'ın kendi tercihi)                                                                                                                |
| `blocked`                                              | mevcut engelli kontrolü                                                                                                                                                                          |

Arkadaş değilse `friendship: null` (K7) — panel o kartı çizmeyecek.

`friendship.durationLabelKey`: ham gün sayısı **değil**, i18n'in tükettiği yapı
(`{ years, months }`). Tarih biçimlendirmesi istemcide yapılır; servis ISO dize ve sayı döner.

### 2. `getMutualFriends(viewerId, otherUserId, limit)` — `lib/friends/mutual-friends.ts`

`FriendRequest`'in `ACCEPTED` satırlarından iki tarafın arkadaş kümesinin kesişimi. **Tek**
sorguda çözülür (iki liste çekip JS'te kesiştirmek 5.000 arkadaşta ölür); `server-public-profile-service.ts`
içindeki ortak-arkadaş emsalini oku ve aynı yaklaşımı kullan. Varsayılan `limit` panelin
gösterdiği kadar + 1 (fazlası "ve N kişi daha" için sayaç olur). Presence mevcut presence
okumasından gelir, ayrı sorgu açılmaz.

### 3. Uç

`GET /api/v1/dm/[conversationId]/profile`

- `requireApiUserId` → `enforceApiRateLimit(userId, "dm:profile")` → `DMConversationParamsSchema`
- Viewer bu konuşmanın katılımcısı **değilse** 403. Konuşma grup ise 400 (grup kolu Ş2'de).
- Yanıt `UserProfilePanelDTOSchema.parse(...)` ile doğrulanır — şema ile servis ayrışırsa test
  değil **çalışma zamanı** yakalasın.
- E-posta, IP, ham `User` satırı yanıta girmez (kural 8).

Mobil karşılığı `/api/v1/mobile/dm/[conversationId]/profile` aynı route-logic'i çağırır (K1).

### 4. İstemci köprüsü

`lib/dm/client.ts` içine `fetchDmProfilePanel` + `dmQueryKeys.profile(conversationId)`.
Sorgu **tembel** kurulur: `enabled` bayrağı panel açık olduğunda true olacak (Ş5 bağlayacak).
`staleTime` rozet önbelleği için `@wizards/types` içindeki mevcut rozet tazelik penceresiyle
uyumlu seçilir.

## Test

`route-logic.test.ts`: katılımcı değilken 403, grup id'siyle 400, arkadaş değilken
`friendship: null`, ortak sunucu yokken `metViaServerName: null`, `badgeTotal === 16`,
yanıtın şemadan geçtiği.
`mutual-friends.test.ts`: kesişim doğru, kendini içermez, limit uygulanır, boş kesişim `[]`.
`profile-service.test.ts`: her alanın kaynağından geldiği (sahte Prisma ile).

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/02-rapor.md` — hangi alan gerçek veriden, hangisi `TODO(api):`, tint kuralının
tam tanımı (Ş5 bunu okuyacak).
