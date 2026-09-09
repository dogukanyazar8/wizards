# Dalga 1 · Ş2 — Grup profil verisi ucu + iki eksik yönetici eylemi

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15'in **grup** kolunu besleyen okuma ucunu, üye
listesini ve bugün karşılığı olmayan iki yönetici eylemini yaz. Bu şerit **arayüz çizmez**.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` ve
`design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` §15.1 (grup kolu), §15.3 madde 1/3/6, §15.4,
§15.5 madde 3.
Kod tabanı için `graphify query "dm group route logic settings members invite pins"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/dm/group-profile-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/dm/group-service.ts` (yalnız **yeni** fonksiyonlar: `clearGroupHistory`,
  `deleteGroupConversation`) + mevcut test dosyasına yeni `describe` blokları
- `apps/web/src/app/api/v1/dm/groups/[conversationId]/profile/route.ts` (yeni)
- `apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts` (yalnız **GET** eklenir;
  mevcut `POST` korunur)
- `apps/web/src/app/api/v1/dm/groups/[conversationId]/history/route.ts` (yeni — `DELETE`)
- `apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts` (yalnız **DELETE** eklenir)
- `apps/web/src/app/api/v1/dm/groups/route-logic.ts` (yalnız yeni route fonksiyonları)
- `apps/web/src/app/api/v1/mobile/dm/groups/[conversationId]/profile/route.ts` (yeni, K1)
- `apps/web/src/lib/dm/group-profile-client.ts` (yeni) — fetch + query key. **`lib/dm/client.ts`'e yazma** (paralel çakışma).

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, `components/**`, `apps/mobile/**`.

## Ne yapılacak

### 1. `getGroupProfilePanel(viewerId, conversationId)`

`GroupProfilePanelDTO` döner. Kaynaklar:

| DTO alanı                            | Kaynak                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| `name`, `initials`, `avatarColor`    | `DMConversation` (`avatarColor` **swatch adı**, tuzak 4)   |
| `description`                        | `DMConversation.description` (`VarChar(120)`)              |
| `memberCount`, `onlineCount`         | `DMParticipant` sayımı + presence                          |
| `viewerRole`                         | viewer'ın `DMParticipant.role`                             |
| `createdAt`, `ownerName`             | `DMConversation.createdAt` + `ownerId` → görünen ad        |
| `pinnedMessages`                     | mevcut `DMPinnedMessage` okuması — yeniden yazma           |
| `invite`                             | mevcut `GroupInvite` (kod, URL, `expiresAt`); yoksa `null` |
| `addPolicy`                          | `DMConversation.permAddMembers`                            |
| `historyVisibility`                  | `DMConversation.historyVisibility`                         |
| `notifyLevel`, `muted`, `mutedUntil` | viewer'ın `DMParticipant` satırı                           |

`viewerRole` yanıtta **bilgi** amaçlıdır; yetki kararı her zaman sunucuda yeniden verilir (kural 8).

### 2. `GET .../members` — §15.4 üye listesi

`GroupMemberRowDTO[]`, `YÖNETİCİ` ve `ÜYE` gruplaması **istemcide** yapılır; uç düz liste +
`role` döner. Sıralama: önce `OWNER`/`ADMIN`, sonra ad. `isSelf` bayrağı `Sen` pill'i için.
`statusText` presence metnidir (`Odak modu · 25 dk`, `Çevrimdışı · dün 22:10`); ham `lastSeenAt`
da döner ki istemci biçimlendirsin. İmleçli sayfalama (K16); 250 üye sınırı var, ilk sayfa
panelin gösterdiği kadarını kapsar.

### 3. `clearGroupHistory(actorId, conversationId)` — yeni

- Yalnız `OWNER` / `ADMIN`. Sunucuda **yeniden** doğrula.
- Mesajları fiziksel silmek yerine her katılımcının `historyFromAt` değerini `now()` yapar —
  şemadaki alan tam bunun için var (`2c §7`) ve kaybolan mesaj / FK zincirini bozmaz.
  Kararın gerekçesini yorumla yaz; "hard delete daha temiz görünüyor" diyen bir sonraki okuyucu
  bu satırı görsün.
- `AuditLog` yazar; grup soketine "geçmiş temizlendi" olayı basar ki açık istemciler listeyi
  tazelesin.
- Toast: `messages.toast.historyCleared`.

### 4. `deleteGroupConversation(actorId, conversationId)` — yeni

- Yalnız `OWNER`. `ADMIN` bile yapamaz — SPEC `Grubu sil` satırını yönetici olarak işaretliyor,
  ama sahiplik ile yöneticilik farkı korunur; kararı yorumla yaz ve arayüzün de yalnız sahibe
  göstermesi için `viewerRole === "OWNER"` bayrağını Ş8'e sözleşmeyle bildir.
- Konuşma + katılımcılar + davet + sabitlenenler `onDelete: Cascade` ile düşer; el ile silme
  döngüsü yazma.
- `AuditLog` yazar; her katılımcının soketine "grup silindi" olayı basar.
- Toast: `messages.toast.groupDeleted`.

### 5. Uçlar

| Uç                                           | Metot  | Yetki       |
| -------------------------------------------- | ------ | ----------- |
| `/api/v1/dm/groups/[conversationId]/profile` | GET    | katılımcı   |
| `/api/v1/dm/groups/[conversationId]/members` | GET    | katılımcı   |
| `/api/v1/dm/groups/[conversationId]/history` | DELETE | OWNER/ADMIN |
| `/api/v1/dm/groups/[conversationId]`         | DELETE | OWNER       |

Hepsi `requireApiUserId` → `enforceApiRateLimit` → zod → üyelik/rol → iş.
Yıkıcı iki uç için ayrı, **daha sıkı** rate limit anahtarı kullan.

Mobil karşılığı yalnız `profile` için açılır (K1); yıkıcı eylemlerin mobil karşılığı bu paketin
kapsamı dışında — raporda not düş.

## Test

- Profil ucu: katılımcı değilken 403, 1:1 DM id'siyle 400, davet yokken `invite: null`.
- Üyeler: sıralama, `isSelf`, imleç.
- `clearGroupHistory`: üye rolüyle 403, admin ile `historyFromAt` yazılıyor, mesaj **silinmiyor**,
  audit yazılıyor.
- `deleteGroupConversation`: admin (owner değil) ile 403, owner ile siliniyor, audit yazılıyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/03-rapor.md` — `Grubu sil` yetkisinin OWNER'a bağlanma gerekçesi, geçmiş
temizlemenin `historyFromAt` ile çözülmesi, mobil yıkıcı uçların neden açılmadığı.
