# Dalga 1 · Ş2 — Kişiler ve Kanallar şeritleri

**Ön koşul:** Dalga 0. **Paralel:** Ş1, Ş3, Ş4, Ş5, Ş6.
**Kapı:** iki uç testi + rollup işi testi yeşil.

İki uç: **`GET /api/v1/discover/people`** ve **`GET /api/v1/discover/channels`**. Kanal şeridinin
hareket verisini üreten **saatlik rollup işi** de bu şeridin sorumluluğundadır.

---

## Sahiplenilen dosyalar

```
apps/web/src/app/api/v1/discover/people/route.ts
apps/web/src/app/api/v1/discover/people/route-logic.ts
apps/web/src/app/api/v1/discover/people/route-logic.test.ts
apps/web/src/app/api/v1/discover/channels/route.ts
apps/web/src/app/api/v1/discover/channels/route-logic.ts
apps/web/src/app/api/v1/discover/channels/route-logic.test.ts
apps/web/src/lib/discover/people-service.ts        (+ .test.ts)
apps/web/src/lib/discover/channels-service.ts      (+ .test.ts)
apps/web/src/lib/discover/channel-activity-rollup.ts (+ .test.ts)
apps/web/src/lib/outbox/worker.ts                  (yalnız saatlik bloğa bir çağrı)
apps/web/src/lib/api-rate-limit.ts                 (yalnız yeni anahtar ekleme)
```

---

## A · Kişiler şeridi

### A.1 Kaynak

`lib/friends/suggestions-service.ts` içindeki `listFriendSuggestions(userId)` **doğrudan
çağrılır** — HTTP üzerinden `/api/v1/friends/suggestions` çağrılmaz.

> Gerekçe (tuzak 1): `friend:suggestions` hız sınırı 30/60sn. Keşfet bir tarama yüzeyi; arama
> debounce'u ile birleşince kullanıcıyı 429'a sokardı. Ayrıca kendi API'sini HTTP ile çağırmak
> bir round-trip ve bir serileştirme israfıdır.

Yeni hız sınırı anahtarı: `discover:people` → `{ limit: 120, windowSeconds: 60 }`.

### A.2 `DiscoverPerson` üretimi

| Alan                                     | Kaynak                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `handle`, `avatarUrl`      | `FriendSuggestionDTO`                                                                                                             |
| `initials`                               | `toDiscoverInitials(name, null)` (Ş0.4 `identity.ts`)                                                                             |
| `presence`                               | Redis socket kaydı — `online` / `idle` / `offline`. Kullanıcı `INVISIBLE` ise `offline` döner (mevcut `getVisibleStatus` kuralı). |
| `mutualServerCount` + `mutualServerName` | ortak `ServerMember` satırları; ad, **en çok üyeli** ortak sunucunun adı                                                          |
| `interestTags`                           | **K5**: ortak sunucuların `tags` dizilerinden frekansı en yüksek iki etiket. Eşitlikte alfabetik. Ortak sunucu yoksa boş dizi.    |
| `requestSent`                            | bekleyen `FriendRequest` satırı                                                                                                   |

`interestTags` hesabı tek sorguda: ortak sunucuların `tags` kolonları çekilir, bellekte sayılır.
Ortak sunucu sayısı zaten `FRIEND_SUGGESTION_MAX` ile sınırlı olduğundan N+1 yoktur.

### A.3 Arama (K6)

`q` varsa `name ILIKE` **veya** `username ILIKE` üzerinde süzülür. Öneri motoru sıralamayı
belirlemeye devam eder; arama yalnızca daraltır. Öneri havuzunda eşleşme yoksa şerit **boş
durumunu** gösterir — genel kullanıcı aramasına düşülmez (gizlilik: Keşfet bir kullanıcı dizini
değildir).

### A.4 Sayfalama

Öneri havuzu `FRIEND_SUGGESTION_MAX` ile zaten sınırlı. Uç `nextCursor: null` döner ve tek
sayfada biter. İstemci sonsuz kaydırma sentinel'ini bu şeritte **kurmaz**.

---

## B · Kanallar şeridi

### B.1 Görünürlük yüklemi (K2 — gizlilik kritik)

Bir kanal ancak **üç koşulun hepsi** sağlanırsa döner:

```
kanal.type = TEXT
kanal.isPrivate = false                 -- rol kısıtlı kanal asla dizine girmez
sunucu.discoverable = true AND sunucu.isPublic = true
```

Ek olarak, kanalda **rol bazlı izin geçersiz kılması** varsa (`ChannelPermissionOverwrite`
satırı `@everyone` rolünün `VIEW_CHANNEL` iznini kaldırıyorsa) kanal döndürülmez. Bu kontrol
`isPrivate` bayrağının kapsamadığı bir sızıntı yoludur ve testte açıkça doğrulanır.

Kanal içeriği (mesajlar) **hiç** döndürülmez. Şerit yalnız ad, kaynak sunucu, hareket etiketi ve
3 kişilik avatar önizlemesi gösterir. Avatar önizlemesi sunucunun **çevrimiçi** üyelerinden
seçilir ve `INVISIBLE` kullanıcılar dışlanır.

### B.2 Hareket verisi ve rollup

`DiscoverChannelActivity` tablosu (Ş0.2) saatlik doldurulur:

```ts
// lib/discover/channel-activity-rollup.ts
export async function rollUpDiscoverChannelActivity(deps): Promise<{ rows: number }>;
```

- Pencere: kapanan son tam saat (`windowStart` = saat başı, UTC).
- Kapsam: yalnız B.1 yüklemine uyan kanallar — özel kanalların mesajı **hiç sayılmaz**.
- Sorgu: `groupBy(channelId)` + `where { channelId in …, createdAt: { gte, lt } }` üzerinde
  `_count`. Silinmiş mesajlar sayılmaz.
- Yazma: `createMany` + `skipDuplicates` (aynı saat iki kez koşarsa idempotent).
- Budama: `windowStart < now - 30 gün` satırları silinir.

**Zamanlayıcı:** `lib/outbox/worker.ts` içindeki saatlik bakım bloğu. Kod yorumunun dediği gibi
bu blok "uygulamanın sahip olduğu tek zamanlayıcı"dır; ayrı bir cron kurulmaz. Çağrı, bloktaki
diğer işler gibi kendi `try/catch`'i içinde koşar — bu iş patlarsa rozet süpürmesi ve mobil medya
temizliği etkilenmez.

`dailyMessageCount` = son 24 pencerenin toplamı.

### B.3 `activityLabel` türetimi

SPEC altı etiket veriyor. Sunucu bunları **sınıf** olarak döndürür (metin i18n'de):

| Sınıf      | Kural                                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| `official` | kanalın sunucusu `features ∋ VERIFIED`                                          |
| `live`     | kanalın sunucusunda o an aktif sesli/sahne oturumu var (`voiceActiveCount > 0`) |
| `busy`     | `dailyMessageCount ≥ 200`                                                       |
| `open`     | kanal bir sesli odaya bağlı **veya** `dailyMessageCount ≥ 50`                   |
| `new`      | kanal son 7 günde oluşturulmuş                                                  |
| `weekly`   | diğer hepsi                                                                     |

Sıra bağlayıcıdır: ilk eşleşen kazanır. Eşikler `channels-service.ts` içinde adlandırılmış
sabitlerdir, satır içi sayı değil.

### B.4 Sıralama ve sayfalama

`sort` parametresi bu şeritte **yok sayılır** — SPEC §4.3 notu "Son 24 saatteki hareketliliğe
göre" diyor, tek sıralama var. Uç `sort` alırsa 400 dönmez, yok sayar.

Sıralama: `dailyMessageCount desc, id asc`. Keyset imleç `c|<count>|<id>`.
Hız sınırı: `discover:channels` → `{ limit: 120, windowSeconds: 60 }`.

### B.5 Arama (K6)

`q` varsa kanal adı **veya** sunucu adı üzerinde `ILIKE`. `#` öneki kullanıcı yazmışsa
kırpılır (`#tasarım` → `tasarım`).

---

## C · Testler

`people-service.test.ts`:

- `interestTags` frekans sayımı, eşitlikte alfabetik sıra, ortak sunucu yokken boş dizi
- `INVISIBLE` kullanıcı `offline` görünür
- `mutualServerName` en çok üyeli ortak sunucudan gelir

`channels-service.test.ts`:

- özel kanal (`isPrivate`) dönmüyor
- `@everyone` `VIEW_CHANNEL` kaldırılmış kanal dönmüyor
- keşfedilemeyen sunucunun herkese açık kanalı dönmüyor
- `activityLabel` kural sırası: aynı anda `official` + `busy` olan kanal `official` alır
- eşik sınırları (199 → `open`, 200 → `busy`)

`channel-activity-rollup.test.ts`:

- idempotent: aynı pencere iki kez koşunca satır sayısı değişmiyor
- özel kanalın mesajı sayılmıyor
- 30 günden eski satırlar budanıyor
- boş pencerede `rows: 0` ve hata yok

`route-logic.test.ts` (her iki uç):

- oturumsuz 401, hız sınırı 429
- `q` daraltıyor, öneri havuzu dışına çıkmıyor (kişiler)
- rollup tablosu boşken kanal şeridi **boş liste** dönüyor, 500 değil
