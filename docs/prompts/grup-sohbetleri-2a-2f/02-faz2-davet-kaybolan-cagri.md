# Faz 2 — Davet bağlantısı, kaybolan mesajlar, grup çağrısı

**Ön koşul:** Faz 1 kapısı geçti. **Sonraki faz:** 03.
**Önce oku:** `00-ortak-baglam.md`, `raporlar/01-rapor.md`.

```bash
graphify query "server invite code generation join flow"
```

```bash
graphify query "dm call start livekit room socket handler"
```

---

## A. Neden bu faz var

K1, K2, K3 üç ayrı arka uç özelliği ve üçü de ekran değil **altyapı**. Ekran fazlarına karışırlarsa 2f tek başına üç hafta sürer. Burada üçü de sunucu tarafında bitirilir; mobil girişleri Faz 4/5'te yalnız **çağırır**.

Bu fazda da **mobil ekran dosyası değişmez.**

---

## B. Görev grubu 1 — Davet bağlantısı (K2)

### B1 — Model

`packages/db/prisma/rebaseline-migrations/<UTCzaman>_group_invite/`

```prisma
model GroupInvite {
  id             String    @id @default(uuid())
  code           String    @unique @db.VarChar(12)
  conversationId String    @unique
  createdById    String
  enabled        Boolean   @default(false)
  uses           Int       @default(0)
  maxUses        Int?
  expiresAt      DateTime?
  rotatedAt      DateTime?
  createdAt      DateTime  @default(now())

  conversation DMConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  creator      User           @relation(fields: [createdById], references: [id], onDelete: Cascade)

  @@index([code])
}
```

`conversationId @unique` bilinçli: tasarımda grubun **tek** bağlantısı var, "yenile" onu döndürür. Çoklu davet istenirse ayrı bir karar gerekir — bu pakette yok.

Kod üretimi `ServerInvite` üretecinin **aynısını** kullanır (`crypto.randomBytes` tabanlı, §4.11). İki üreteç yazma; mevcut olanı `apps/web/src/lib/invite*/` altında bul ve paylaşılan bir yardımcıya çıkar.

### B2 — Servis: `apps/web/src/lib/dm/group-invite-service.ts`

| Fonksiyon                          | Kural                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `setGroupInviteEnabled(...)`       | `editInfo` izni. **İlk açılışta** kod üretilir (K2: kapalıyken kod yok). Kapatma satırı silmez, `enabled=false` yapar |
| `rotateGroupInvite(...)`           | `editInfo` izni. Yeni kod, `uses = 0`, `rotatedAt` damgası. Eski kod anında geçersiz                                  |
| `previewGroupInvite(code)`         | Grup adı, ikon/renk, üye sayısı, `joinable` + `reason`. **Üye listesi dönmez**                                        |
| `joinGroupViaInvite(code, userId)` | Aşağıdaki sıra                                                                                                        |

`joinGroupViaInvite` sırası — her adım kendi hata kodunu döner:

1. Kod var mı → `404 INVITE_NOT_FOUND`
2. `enabled` → `403 INVITE_DISABLED`
3. `expiresAt` geçmiş mi → `410 INVITE_EXPIRED`
4. `maxUses` doldu mu → `410 INVITE_EXHAUSTED`
5. Zaten üye mi → `200` + mevcut konuşma (hata değil, doğrudan sohbete girer)
6. Kapasite `GROUP_DM_MAX_PARTICIPANTS` → `409 GROUP_FULL`
7. Engel kontrolü (`blocking.ts`) — gruptaki biri engellemişse `403 BLOCKED`
8. Katılım: `role: MEMBER`, `nameColor: pickNextMemberNameColor(...)`, `historyFromAt: resolveHistoryFloor(conversation.historyVisibility, now)`, `uses` artışı — **tek transaction**
9. Sistem mesajı `MEMBER_ADDED`, `systemValue: "invite"`
10. Realtime: `dm:group:member-joined` + katılan kullanıcıya konuşma listesi güncellemesi

`uses` artışı adım 8'in içinde ve **atomik** (`increment`). Ayrı `update` yazan çözüm iki eşzamanlı katılımda sayacı kaçırır.

### B3 — Uçlar

| Metot + yol                                             | Yetki                           |
| ------------------------------------------------------- | ------------------------------- |
| `PATCH /api/v1/dm/groups/[conversationId]/invite`       | `editInfo`                      |
| `POST /api/v1/dm/groups/[conversationId]/invite/rotate` | `editInfo`                      |
| `GET /api/v1/group-invites/[code]/preview`              | oturum gerekli, üyelik gerekmez |
| `POST /api/v1/group-invites/[code]/join`                | oturum gerekli                  |

Mobil aynaları `/api/v1/mobile/...` altında. Önizleme ve katılma uçlarına **rate limit** takılır (`api-rate-limit.ts`) — kod deneme saldırısı bu iki uçtan gelir. Öneri: IP başına dakikada 20 önizleme, 5 katılma.

### B4 — Paylaşılabilir bağlantı metni

`resolveAppOrigin()` (`apps/web/src/lib/app-origin.ts`) + sabit yol `/g/<code>`. Tasarımdaki `whispr.gg/g/mobil-ekibi` bir **örnektir**; host çalışma zamanından gelir, kodda sabit yazılmaz. Görüntülenen metin `resolveAppOriginDisplayHost()` + `/g/<code>`.

Deep link: sunucu davetleri `/invite/<code>` yolunu kullanıyor; grup daveti **`/g/<code>`**. İki yol çakışmamalı — mobil link yönlendiricisinde ayrı dal açılır (Faz 3 rota işi).

### B5 — Web davet sayfası `/g/[code]` (K5)

`apps/web/src/app/g/[code]/page.tsx` — sunucu davet önizleme sayfasının kardeşi, aynı desende:

- Oturumsuz kullanıcı → giriş sonrası aynı koda dönen `callbackUrl`.
- Önizleme: grup adı, avatar/renk, üye sayısı, `joinable` durumu; **üye listesi gösterilmez**.
- `Katıl` düğmesi `join` ucunu çağırır; başarıda konuşmaya yönlendirir.
- Sekiz hata dalının her biri için insan okunur mesaj (kapalı / süresi dolmuş / tükenmiş / dolu / engelli / bulunamadı).
- Mevcut web tasarım dili (`packages/ui`) — mobil handoff pikselleri kopyalanmaz.
- Bağlantı paylaşımı için `resolveAppOrigin()` kullanılır; metin `resolveAppOriginDisplayHost()`.

---

## C. Görev grubu 2 — Kaybolan mesajlar (K3)

### C1 — Şema

Aynı migration dosyasına eklenebilir:

```prisma
enum GroupDisappearingWindow { OFF H24 D7 D90 }
```

- `DMConversation.disappearingAfter GroupDisappearingWindow @default(OFF)`
- `DMMessage.expiresAt DateTime?` + `@@index([expiresAt])`

### C2 — Damgalama

Mesaj oluşturan **tek yol** `message-send-service.ts`. Orada:

```
expiresAt = conversation.disappearingAfter === "OFF" ? null : now + pencere
```

V6: pencere değişimi geçmişe uygulanmaz. Değişiklik `updateGroupSettings` içinden geçer, `editInfo` izni ister ve bir sistem mesajı bırakır (yeni `DMSystemMessageType` değeri gerekiyorsa `systemValue` ile mevcut bir tip kullanılır — enum genişletmek için yeni migration açmaya değmez; karar raporda yazılır).

### C3 — Purge worker

`apps/web/src/lib/dm/disappearing-worker.ts`, `apps/web/src/lib/outbox/worker.ts:43` imzasıyla aynı desende; `apps/web/server.ts` içinde `startOutboxWorker()` yanına `startDisappearingMessageWorker()` eklenir.

Sözleşme:

- Periyot 60 sn, batch 500, `expiresAt IS NOT NULL AND expiresAt <= now()`.
- Silme **mevcut mesaj silme servisinden** geçer (ek dosyaların temizliği oradaki mantığa bağlı). Ham `deleteMany` yazılmaz.
- **Sıra: önce sil, sonra `dm:message:expired` yay** (§4.10). Tersi istemcinin silinen mesajı geri yüklemesine yol açar.
- Worker tek örnekte koşar; birden fazla web örneği varsa `SKIP LOCKED` veya kısa süreli Redis kilidi kullanılır. Hangisi seçildiyse rapora yazılır.
- Sabitlenmiş mesaj süresi dolarsa `pinnedMessageId` FK `SetNull` ile kendiliğinden düşer (Faz 1 B1); ayrıca `dm:group:pin` boş yayını gider.
- Hata durumunda batch atlanır, worker ölmez; log `logger.ts` üzerinden.

### C4 — İstemci sözleşmesi

- Mesaj DTO'suna `expiresAt` eklenir (nullable).
- `dm:message:expired { conversationId, messageIds }` olayı yayınlanır; istemci önbellekten çıkarır.
- Okuma sorgusu **ayrıca** `expiresAt` geçmiş satırları eler (worker gecikirse kullanıcı süresi geçmiş mesaj görmez).

---

## D. Görev grubu 3 — Grup çağrısı (K1)

### D1 — Bugün hazır olan

- LiveKit oda adı `dm:${conversationId}` — katılımcı sayısına bakmıyor (`livekit/server.ts:190`).
- `dm:call:start` konuşmanın **tüm diğer** katılımcılarına `dm:call:incoming` + push yolluyor (`socket/handlers/dm.ts:229`).
- `DM_CALL_RING_TTL_MS = 45_000`, `DMCallStatus` dört durum (`call-state.ts`).

Yani halka fan-out'u yeniden yazılmaz. **Eksik olan üç şey** aşağıda.

### D2 — Aktif çağrı durumu (yeni)

`apps/web/src/lib/dm/group-call-state.ts` — Redis'te konuşma başına tek kayıt (mevcut presence Redis istemcisi kullanılır):

```
key   dm:call:<conversationId>
value { startedAt, video, participants: { userId, joinedAt }[] }
ttl   çağrı boyunca yenilenir; son katılımcı çıkınca silinir
```

Fonksiyonlar: `startGroupCall`, `joinGroupCall`, `leaveGroupCall`, `readGroupCallState`. Hepsi saf mantık + ince Redis sarmalayıcı; saf kısım testli.

**Yarış kuralı:** iki kişi aynı anda başlatırsa **tek oda** olur — `startGroupCall` "varsa katıl" semantiğiyle yazılır (`SET NX` benzeri), ikinci çağıran `joinGroupCall`'a düşer.

### D3 — Socket olayları

| Olay                | Yön    | İçerik                                                                         |
| ------------------- | ------ | ------------------------------------------------------------------------------ |
| `dm:call:start`     | mevcut | Grupta: durum oluşturulur, **çağrıda olmayan** üyeler çalar                    |
| `dm:call:state`     | yeni ↓ | `{ conversationId, active, video, participants[] }` — konuşmanın tüm üyelerine |
| `dm:call:join`      | yeni ↑ | Süregelen çağrıya katılma (çalmadan)                                           |
| `dm:call:leave`     | yeni ↑ | Ayrılma; son kişi çıkınca `dm:call:ended`                                      |
| `dm:call:cancelled` | mevcut | Kimse cevaplamadan iptal                                                       |
| `dm:call:ended`     | mevcut | Durum silinir                                                                  |

- `dm:call:state` **her değişimde** yayılır; 2d başlığındaki "çağrı sürüyor" göstergesi ve 2e'deki "Katıl" bunu okur.
- Halka yalnız **`notifyLevel !== NONE`** olan üyelere gider; `NONE` olan üye çağrıyı sessizce listede görür (2f §2 "ses ve titreşim yok" kuralının çağrıya uzantısı — bu bir karardır, rapora yazılır).
- Zaten başka bir çağrıda olan üye çalınmaz.

### D4 — LiveKit tarafı

- Oda oluşturulurken `maxParticipants = GROUP_DM_MAX_PARTICIPANTS`.
- Token üretimi mevcut uçtan (`conversationId` gövdesiyle) — değişiklik yok, yalnız grup konuşması için de çağrılabildiği testle kanıtlanır.
- Video yayını grup çağrısında **isteğe bağlı** başlar (2e'deki "Görüntülü" video açık başlatır, 2d'deki telefon butonu kapalı başlatır).

### D5 — Yapılmayacak

- Yeni bir çağrı ekranı **bu fazda** yazılmaz (Faz 5).
- Çağrı kaydı/DB modeli yok — durum yalnız Redis'te, mevcut 1:1 tasarımıyla aynı.
- Ekran paylaşımı grup çağrısında bu pakette yok.

---

## E. Bağlayıcı kararlar (sonraki fazları kısıtlar)

1. Grup davet bağlantısı **tek ve döndürülebilir**; yol `/g/<code>`, host çalışma zamanından.
2. Kapalı davet = **kod yok**. Arayüz kapalıyken bağlantı metni göstermez.
3. Kaybolan mesaj penceresi **geçmişe uygulanmaz**; silme geri alınamaz; istemci hem olayla hem sorgu filtresiyle korunur.
4. Grup çağrısı durumu **Redis'te**, olay `dm:call:state`; mobil bu olayı dinler, kendi durumunu türetmez.
5. `notifyLevel === NONE` olan üye **çalmaz**.

---

## F. Kapı

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Kontrol listesi:

- [ ] Kapalı davette kod üretilmiyor; açınca üretiliyor; yenileyince eski kod `404`/`410`.
- [ ] Katılma sırasının 8 dalının her biri için test var (bulunamadı / kapalı / süresi dolmuş / tükenmiş / zaten üye / dolu / engelli / başarı).
- [ ] Eşzamanlı iki katılmada `uses` iki artıyor (atomik increment testi).
- [ ] Purge worker: süresi dolmuş satır siliniyor, dolmamış duruyor, olay **silmeden sonra** gidiyor.
- [ ] Süresi dolmuş sabitli mesaj silinince `pinnedMessageId` NULL oluyor.
- [ ] `startGroupCall` iki eşzamanlı çağrıda tek oda üretiyor.
- [ ] `notifyLevel = NONE` üyeye halka gitmiyor, `dm:call:state` gidiyor.
- [ ] Grup konuşması için LiveKit token'ı alınabiliyor (3+ katılımcı).
- [ ] Web `/g/[code]` sayfası sekiz dalın hepsinde doğru mesajı veriyor; oturumsuz akış giriş sonrası koda dönüyor.

---

## G. Rapor

`raporlar/02-rapor.md` — §8 formatı. Ek olarak:

- Worker'ın tek örnek garantisi nasıl sağlandı (kilit yöntemi).
- Kaybolan mesaj sistem mesajı için hangi `DMSystemMessageType` kullanıldı.
- Rate limit değerleri.

Cihaz testi bu fazda da **yok**; yerine `curl`/Postman ile doğrulanabilir uç listesi yazılır.
