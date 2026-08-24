# Dalga 1 · Ş3 — Etkinlik şeridi, profil ucu, katılma yolu

**Ön koşul:** Dalga 0. **Paralel:** Ş1, Ş2, Ş4, Ş5, Ş6.
**Kapı:** uç testleri + istemci sarmalayıcı testleri yeşil.

Üç iş: **`GET /api/v1/discover/events`**, `ServerPublicProfile` ucunun Ş0.3'te açtığı üç alanı
gerçek veriyle doldurmak, ve katıl / ayrıl / kodla katıl yolunu tek istemci katmanında toplamak.

---

## Sahiplenilen dosyalar

```
apps/web/src/app/api/v1/discover/events/route.ts + route-logic.ts + route-logic.test.ts
apps/web/src/app/api/v1/discover/events/[eventId]/interest/route.ts + route-logic(.test).ts
apps/web/src/lib/discover/events-service.ts        (+ .test.ts)
apps/web/src/lib/discover/join-client.ts           (+ .test.ts)
apps/web/src/lib/servers/server-profile-service.ts (yalnız üç alan)
apps/web/src/app/api/v1/servers/[serverId]/profile/route-logic.ts (yalnız üç alan)
apps/web/src/lib/api-rate-limit.ts                 (yalnız yeni anahtar ekleme)
```

---

## A · Herkese açık etkinlikler

### A.1 Yüklem

```
event.status = SCHEDULED
event.scheduledStartAt >= now
sunucu.discoverable = true AND sunucu.isPublic = true
kanal yoksa (externalLocation) VEYA kanal.isPrivate = false
```

Kullanıcının **üye olduğu** sunucuların etkinlikleri de döner — SPEC "Sunucu üyeliği gerekmez"
diyor, "üye olmadığın sunucular" demiyor. Kart bunu ayırt etmez.

Sıralama: `scheduledStartAt asc, id asc`. Keyset imleç `e|<epochMs>|<id>`.
Hız sınırı: `discover:events` → `{ limit: 120, windowSeconds: 60 }`.

### A.2 Alan eşlemesi

| `DiscoverEvent` alanı                                                   | Kaynak                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`, `scheduledStartAt`, `entityType`, `interestedCount`, `serverId` | `ScheduledEvent`                                                                                     |
| `durationLabel`                                                         | `scheduledEndAt - scheduledStartAt`; `scheduledEndAt` null ise **boş string** (kart o satırı çizmez) |
| `locationLabel`                                                         | `"{sunucu adı} › {kanal adı}"`, kanal yoksa `"{sunucu adı} › {externalLocation}"`                    |
| `interested`                                                            | istekteki kullanıcının `ScheduledEventInterest` satırı — sayfa id'leri tek sorguda                   |

Saat metni (`Yarın 20:00`, `Cmt 14:00`) **istemcide** kurulur; sunucu ISO döndürür. Zaman dilimi
tarayıcınındır, sunucunun değil.

### A.3 "İlgileniyorum" mutasyonu

`POST /api/v1/discover/events/[eventId]/interest` ve `DELETE` aynı yolda.

- Idempotent: `ScheduledEventInterest` birincil anahtarı üzerinden `upsert` / `deleteMany`.
- `interestedCount` **satır sayısından türetilir**, `+1` ile artırılmaz. Şemadaki yorum bunu
  zaten söylüyor: sayaç tek başına idempotent olamaz.
- Yanıt: `{ interested: boolean, interestedCount: number }` — istemci iyimser günceller, yanıt
  düzeltir.
- Yetki: etkinlik A.1 yüklemine uyuyorsa yeter; üyelik aranmaz.

---

## B · Profil ucu genişletmesi (K3)

Ş0.3 şemaya üç alan ekledi ve üreteci `TODO(Ş3):` ile geçici doldurdu. Bu şerit onları gerçekler.

### B.1 `mutualFriends[].role` ve `.presence`

Mevcut sorgu ortak arkadaşları `ServerMember` üzerinden çekiyor. Ek olarak:

- `role`: üyenin rollerinden herhangi biri `ADMINISTRATOR` veya `MANAGE_SERVER` iznini taşıyorsa
  **veya** üye sunucu sahibiyse → `"admin"`, aksi halde `"member"`. İzin çözümü sayfa başına tek
  seferdir (ortak arkadaş sayısı zaten sınırlı).
- `presence`: Redis socket kaydından; `INVISIBLE` → `"offline"`.

### B.2 `voiceRoomCount`

`Channel` sayımı: `where { serverId, type: "VOICE", isPrivate: false }`. Mevcut kanal sorgusuna
ek bir `count` — ayrı round-trip değil, aynı `$transaction` içinde.

`voiceActiveCount` **değiştirilmez**; ikisi ayrı anlam taşır ve panelde ayrı yerlerde kullanılır.

### B.3 `category` ve `languages`

Doğrudan `Server` kolonlarından. `category` null ise panel kategori pilini çizmez ve profil
bloğunun tonu `--primary`'e düşer (SPEC kategori tonunu varsayıyor; null durumu SPEC'te yok, bu
karar Ş3 raporuna yazılır).

### B.4 Geriye dönük uyum

`ServerPublicProfile` başka üç yerde tüketiliyor (`server-profile-card.tsx`,
`/servers/[serverId]/about`, mobil profil ekranı). Yeni alanlar **zorunlu** eklendiği için
üreteci güncellemek yeterlidir; tüketiciler yeni alanları okumasa da derlenir. Mobil uç
(`/api/v1/mobile/servers/[serverId]`) farklı bir projeksiyon kullanıyorsa **dokunulmaz**.

---

## C · Katılma yolu

Yeni uç **açılmaz**. Üç mevcut uç bir istemci katmanında toplanır:

```ts
// lib/discover/join-client.ts
export async function joinDiscoverServer(
  serverId: string,
): Promise<{ serverId: string; name: string }>;
export async function leaveDiscoverServer(serverId: string): Promise<void>;
export async function redeemDiscoverInvite(
  code: string,
): Promise<{ serverId: string; name: string }>;
```

| Fonksiyon              | Uç                                             |
| ---------------------- | ---------------------------------------------- |
| `joinDiscoverServer`   | `POST /api/v1/servers/[serverId]/join`         |
| `leaveDiscoverServer`  | `DELETE /api/v1/servers/[serverId]/members/me` |
| `redeemDiscoverInvite` | `POST /api/v1/servers/join`                    |

### C.1 Davet kodu ayrıştırma

Modal alanı `whispr.app/` önekiyle çalışıyor ama kullanıcı tam URL yapıştırabilir. Saf fonksiyon:

```ts
export function parseInviteCode(raw: string): string | null;
```

Kabul edilen biçimler: `abc12345` · `whispr.app/abc12345` · `https://whispr.app/invite/abc12345` ·
`https://<herhangi-origin>/invite/abc12345`. Kod `[A-Za-z0-9]{1,8}` (şemada
`inviteCode @db.VarChar(8)`), `vanityUrlCode` daha uzun olabilir — o yüzden ayrıştırıcı uzunluk
dayatmaz, yalnız yol/öneki temizler ve boşluk kırpar. Eşleşme yoksa `null` → modal alan kenarı
`--danger` ve `Katıl` pasif.

### C.2 Başarıdan sonra geçersizleme

```ts
await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers }); // ray + Sunucularım
await queryClient.invalidateQueries({ queryKey: discoverQueryKeys.servers() }); // ızgara kartı
queryClient.setQueryData(discoverQueryKeys.profile(serverId), (old) => ({ ...old, joined: true }));
```

Kart durumu, onay şeridi ve kabuk listeleri **aynı anda** güncellenir (kabul kriteri). Bunun için
üçü de tek `onSuccess` içinde tetiklenir; ayrı efektlere bölünmez.

### C.3 Hata yolları

Mevcut `discover.joinError.*` anahtarları korunur (Ş0.4 K8 tablosu): `banned`, `full`,
`unavailable`, `generic`. `redeemDiscoverInvite` ayrıca **süresi dolmuş / kullanılmış kod**
hatasını taşır — mevcut uç ne dönüyorsa ona bağlanır, yeni hata sınıfı uydurulmaz.

### C.4 Socket

Sunucu tarafında **yeni olay yayılmaz**. Katılma zaten `server.member.joined` benzeri bir olay
üretiyorsa Keşfet onu dinler ve `discoverQueryKeys.servers()` geçersizler. Üretmiyorsa bu bir
`TODO(api):` olarak Ş3 raporuna yazılır ve istemci yalnız kendi mutasyonunun `onSuccess`'ine
güvenir — **uydurma olay adı dinlenmez**.

`discover.index.updated` olayı SPEC'te geçiyor ama üründe karşılığı yok. Dizin saatlik
güncellendiği için (SPEC §4.3 alt notu) gerçek zamanlı bir itmeye ihtiyaç da yok. Karar:
**bu olay uygulanmaz**, gerekçe raporda.

---

## D · Testler

`events-service.test.ts`: özel kanaldaki etkinlik dönmüyor · keşfedilemeyen sunucunun etkinliği
dönmüyor · geçmiş etkinlik dönmüyor · `scheduledEndAt` null iken `durationLabel` boş ·
`locationLabel` üç varyantı.

`interest` uç testi: iki kez `POST` sonrası sayaç 1 · `DELETE` sonrası 0 · olmayan etkinlikte 404.

Profil uç testi: sahip `admin` rolü alıyor · `MANAGE_SERVER` taşıyan rol `admin` ·
`INVISIBLE` ortak arkadaş `offline` · `voiceRoomCount` özel sesli kanalı saymıyor.

`join-client.test.ts`: `parseInviteCode` dört kabul biçimi + beş ret biçimi (boş, boşluklu,
`?query` içeren, farklı yol, 60 karakter) · `joinDiscoverServer` hata sınıflarını doğru
anahtara eşliyor.
