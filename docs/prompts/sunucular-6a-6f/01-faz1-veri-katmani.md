# Faz 1 — Veri katmanı: DB + API + tipler + web paritesi

> Önce `00-ortak-baglam.md` oku. Branch `uat`. caveman ultra. Kararsız kalırsan sor. Cihaz testini kullanıcı yapar. İzinsiz commit yok.

**Ön koşul:** yok — paketin ilk fazı.
**Hedef:** 6c/6d/6e'nin ihtiyaç duyduğu her veriyi backend'den okunabilir/yazılabilir yap. Bu fazda **hiçbir mobil ekran değişmez**.

---

## A. Neden bu faz var

6d ve 6e, bugün var olmayan yedi veri parçası istiyor: davet adresi, etiketler, haftalık mesaj sayısı, kategorili kanal listesi (son etkinlik + katılımcı + özel bayrağı), yönetici listesi, katılım tarihi/erişim tipi, yaklaşan etkinlik. 6c ise sessize alma ve yıldızlama yazma uçları istiyor.

Bunlar mobil ekran yazılırken keşfedilirse faz 5 üç tura çıkar. Hepsi burada kapanır.

---

## B. Görevler

### B1 — Migration: `Server.tags` + `UserServerSettings.starred`

Dizin: **`packages/db/prisma/rebaseline-migrations/<timestamp>_server_tags_and_starred/`** (00 §4.2 — başka dizin sessizce koşmaz).

```prisma
model Server {
  // ...
  tags String[]            // yeni: keşif etiketleri, küçük harf, max 5 adet
}

model UserServerSettings {
  // ...
  starred Boolean @default(false)   // yeni: rail'de en üste sabitle
}
```

Kurallar:

- `tags`: her etiket `1..24` karakter, `^[a-z0-9-]+$` (slug), sunucu başına **en fazla 5**. Doğrulama `packages/types` şemasında; DB'de yalnız dizi.
- `starred` varsayılan `false`; satır yoksa `false` sayılır (`UserServerSettings` lazy oluşur).
- Index: `Server` üzerinde etiketle arama yapılacaksa `@@index([tags], type: Gin)` ekle — keşif araması etiket üzerinden filtreliyor (6d: etikete dokunma keşif aramasına gider).

### B2 — Şema/tip katmanı: `ServerPublicProfileSchema` genişletmesi

`packages/types/src/workspace.ts`. `ServerPublicProfileChannelSchema` (satır `412`) ve `ServerPublicProfileSchema` (satır `430`) genişletilir. **Yalnız 6d/6e'de render edilen alanlar** (00 §2.2).

`ServerPublicProfileChannelSchema` eklenenler:

| Alan             | Tip                                                 | Nereye gider                                      |
| ---------------- | --------------------------------------------------- | ------------------------------------------------- |
| `id`             | `string`                                            | satır dokunma hedefi                              |
| `categoryId`     | `string \| null`                                    | 6e kategori gruplaması                            |
| `categoryName`   | `string \| null`                                    | 6e başlık                                         |
| `lastActivityAt` | `string \| null` (ISO)                              | 6d/6e metin kanalı sağ sütun (`31 Tem`)           |
| `participants`   | `{ id, displayName, avatarUrl, shortName }[]` max 3 | 6e ses kanalı katılımcı avatarları                |
| `isPrivate`      | `boolean`                                           | 6e "Özel" çipi + üye değilse %50 opak/dokunulamaz |

`ServerPublicProfileSchema` eklenenler:

| Alan                 | Tip                                  | Nereye gider                                                                 |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `inviteAddress`      | `string \| null`                     | 6d `whispr.gg/mobile-test` — `vanityUrlCode` varsa ondan, yoksa `inviteCode` |
| `tags`               | `string[]` max 5                     | 6d etiket çipleri                                                            |
| `channelCount`       | `number`                             | 6d istatistik "Kanal"                                                        |
| `voiceActiveCount`   | `number`                             | 6d istatistik "Seste" (success renkli)                                       |
| `weeklyMessageCount` | `number \| null`                     | 6d istatistik "Bu hafta"; `null` → hücre `—`                                 |
| `createdAt`          | `string` (ISO)                       | 6e "Oluşturulma"                                                             |
| `joinedAt`           | `string \| null` (ISO)               | 6e "Katılımın"; üye değilse `null` → satır gizlenir                          |
| `accessLevel`        | `"invite" \| "public" \| "approval"` | 6e "Erişim" → `Davetle` / `Herkese açık` / `Onaylı`                          |
| `admins`             | `ServerPublicProfileAdminSchema[]`   | 6e YÖNETİCİLER                                                               |
| `upcomingEvent`      | `ServerScheduledEventSchema \| null` | 6d etkinlik kartı                                                            |
| `canManageServer`    | `boolean`                            | 6c "Sunucu ayarları" satırı + 6d/6e admin aksiyonları                        |
| `notificationLevel`  | `"all" \| "mentions" \| "none"`      | 6c "Bildirim ayarları" değeri                                                |
| `muted`              | `boolean`                            | 6c "Sessize al" toggle durumu                                                |
| `starred`            | `boolean`                            | 6c "Yıldızla" toggle durumu                                                  |

Yeni şema `ServerPublicProfileAdminSchema`:

```
id, username, displayName, avatarUrl, shortName,
role: "owner" | "admin",
presence: "online" | "offline",
lastSeenAt: string | null
```

`presence`/`lastSeenAt` kaynağı: **`AppSession.lastSeenAt` `_max`** (00 dışı gerçek — DM son görülme sözleşmesiyle aynı kaynak). `lastMessageAt` kullanma, iki taraflı ve yalan söyler. Görünmez kullanıcı sunucuya `OFFLINE` olarak ulaşır.

### B3 — `ScheduledEvent` canlandırma (tam özellik)

Model şemada var (`schema.prisma:1692`), `apps/` içinde sıfır kullanımı var. Bu görev onu uçtan uca kullanılır hale getirir.

**Şema (`packages/types/src/workspace.ts`)**

```
ServerScheduledEventSchema:
  id, serverId, channelId | null, channelName | null,
  name (1..100), description (0..1000) | null,
  scheduledStartAt (ISO), scheduledEndAt (ISO) | null,
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED",
  entityType: ScheduledEventEntityType,
  externalLocation | null,
  interestedCount, viewerInterested (boolean),
  attendeeCount (kanal canlı sayısı; ses etkinliğinde)

CreateServerScheduledEventSchema: name, description?, channelId?, scheduledStartAt, scheduledEndAt?, entityType, externalLocation?
UpdateServerScheduledEventSchema: aynı alanlar, hepsi optional, en az biri zorunlu (refine)
```

**Servis** `apps/web/src/lib/workspace/scheduled-event-service.ts` (yeni):

- `listServerScheduledEvents(serverId, viewerId, { includePast })`
- `getUpcomingServerScheduledEvent(serverId, viewerId)` — `status = SCHEDULED`, `scheduledStartAt >= now()`, `orderBy scheduledStartAt asc`, `take 1`. Profil rotası bunu kullanır.
- `createServerScheduledEvent` / `updateServerScheduledEvent` / `cancelServerScheduledEvent` — yetki: `MANAGE_SERVER` (veya mevcut "sunucu yönet" izni; kod tabanındaki gerçek izin adını kullan, yenisini uydurma).
- `setServerScheduledEventInterest(eventId, userId, interested)` — `interestedCount` atomik `increment`/`decrement`, tekrarlı çağrı **idempotent** (aynı kullanıcı iki kez "ilgileniyorum" derse sayaç iki artmaz). İlgi kaydı için ayrı tablo gerekiyorsa B1 migration'ına `ScheduledEventInterest(eventId, userId) @@unique` ekle — sayaç tek başına idempotent olamaz.

**Rotalar** (`apps/web/src/app/api/v1/mobile/servers/[serverId]/events/`):

| Metot  | Yol                         | Action                   |
| ------ | --------------------------- | ------------------------ |
| GET    | `events`                    | `server:events:list`     |
| POST   | `events`                    | `server:events:create`   |
| PATCH  | `events/[eventId]`          | `server:events:update`   |
| DELETE | `events/[eventId]`          | `server:events:cancel`   |
| POST   | `events/[eventId]/interest` | `server:events:interest` |

> **00 §4.1 zorunlu kayıt:** her satır için `route-contract.test.ts` `EXPECTED_RATE_LIMIT_ACTIONS` listesine `{action, method, routePath}` eklenecek ve action `apps/web/src/lib/api-rate-limit.ts`'de tanımlı olacak. `interest` gövdesiz mutasyonsa `BODYLESS_MUTATING_METHOD_PATHS`'e de girer.

**"Katıl" düğmesi kuralı (6d):** etkinlik saatinden **15 dk öncesine kadar** buton `Hatırlat` (= interest toggle); 15 dk kala ve sonrasında `Katıl` (= etkinliğin `channelId`'sine bağlan). Bu eşik saf fonksiyon olarak `packages/types` veya web lib'de yaşar; iki istemci aynı fonksiyonu çağırır.

### B4 — Etiket yazma yüzeyi

- Şema: `UpdateServerTagsSchema` — `tags: string[]`, her biri slug, max 5, tekrarsız, küçük harfe normalize.
- Rota: `PATCH /api/v1/mobile/servers/[serverId]/route.ts` mevcut sunucu güncelleme ucuna `tags` alanını ekle (**yeni rota açma** — mevcut `server:update` action'ı yeniden kullanılır, route-contract'a yeni satır gerekmez).
- Keşif: `ServerDiscoveryQuerySchema` (`packages/types/src/workspace.ts:477`) `query` alanı bugün ad/açıklama arıyor. Etiket eşleşmesini de kapsayacak şekilde genişlet — 6d'de etikete dokunma keşif aramasına gidiyor. Yeni parametre ekleme, mevcut `query`'yi etiketlerde de arat.
- `ServerDiscoveryCardSchema`'ya `tags: string[]` ekle (keşif kartında etiket gösterimi için).

### B5 — Yıldızla + sessize al + bildirim seviyesi yazma ucu

Tek rota, tek action — üç ayrı uç açma:

`PATCH /api/v1/mobile/servers/[serverId]/settings` → action `server:user-settings:update`

Gövde (`UpdateServerUserSettingsSchema`, hepsi optional, en az biri zorunlu):

```
starred?: boolean
muted?: boolean
mutedUntil?: string | null
notificationLevel?: "all" | "mentions" | "none"
```

- `UserServerSettings` satırı yoksa **upsert** et.
- `notificationLevel` ↔ `messageNotifications` eşlemesi tek yerde yaşasın (`server-service.ts` içinde saf map fonksiyonu); iki yönde de test edilsin.
- Yanıt: güncel `{ starred, muted, mutedUntil, notificationLevel }`.

### B6 — Profil rotası birleştirme

`apps/web/src/app/api/v1/mobile/servers/[serverId]/profile/route.ts` B2'deki genişletilmiş modeli döndürür. Kritik kurallar:

1. **Tek okuma modeli.** `ServerPublicProfileSchema` üç yüzeyi besliyor (profil kartı, keşif kartı, davet önizleme — `workspace.ts:425–429` yorumu). İzin filtresini ikinci kez yazma.
2. **N+1 yasak.** Kanallar + kategoriler + son mesaj tarihleri + katılımcılar + yöneticiler tek turda toplanır. Kanal başına sorgu açan bir çözüm reddedilir (00 §2 ve platform denetimindeki N+1 bulguları).
3. **`weeklyMessageCount`**: `Message` üzerinde `createdAt >= now() - 7 gün` ve sunucunun kanalları için `count`. `(channelId, createdAt)` indeksi yoksa B1'e ekle. Sonuç 5 dk cache'lenir (mevcut cache yardımcısını kullan, yenisini yazma). Hesaplanamıyorsa `null` dön — rotayı düşürme.
4. **Üye olmayan görünüm:** `joined === false` iken `joinedAt = null`, özel kanallar `isPrivate: true` ile listelenir ama `participants` boş döner, `notificationLevel`/`muted`/`starred` varsayılan döner. Özel kanalın **adı** sızmamalıysa mevcut izin filtresinin kararına uy — yeni bir gizlilik politikası icat etme, mevcut davranışı koru ve rapora yaz.
5. **Davet önizleme rotası** (`/api/v1/mobile/invites/[slug]/preview`) aynı genişletilmiş modeli dönmeli — Faz 5 tek gövde ile iki rotayı besleyecek. Dönmüyorsa Faz 5 kırılır.

### B7 — Web paritesi

`starred` ve `tags` DB'ye giriyor; web istemci görmezse iki istemci ayrışır (00 §4.10).

- Web sunucu ayarlarına etiket düzenleyici (mevcut ayar formu kalıbı, max 5 slug çipi).
- Web sunucu listesinde/rail'inde `starred` sunucular en üstte — mobil Faz 4 ile aynı sıralama kuralı.
- Web sunucu profil kartına `tags` render'ı.
- Web etkinlik yönetimi (liste + oluştur + düzenle + iptal) — admin yüzeyi web'de yaşar, mobil form Faz 5'te gelir.

---

## C. Bağlayıcı kararlar (sonraki fazları kısıtlar)

1. `ServerPublicProfileSchema` **tek okuma modelidir**; Faz 5 ikinci bir profil şeması tanımlayamaz.
2. Kullanıcı-sunucu tercihleri (`starred`/`muted`/`notificationLevel`) **tek PATCH ucundan** yazılır; Faz 4 ayrı uç açamaz.
3. Etiket doğrulaması `packages/types` içindedir; istemciler kendi doğrulamasını yazamaz.
4. "Katıl vs Hatırlat" 15 dk eşiği **saf fonksiyondur**; iki istemci de onu çağırır, kendi eşiğini hesaplamaz.
5. Sıralama kuralı: `starred desc` → mevcut sıralama. Faz 4 rail sıralamasını bundan türetir.

---

## D. Yapılmayacaklar

- Mobil ekran, bileşen veya tema dosyasına dokunmak (Faz 2+).
- Etkinlik için tekrarlayan (recurring) etkinlik, davet, hatırlatma push'u eklemek — tasarımda yok.
- `ScheduledEvent.imageUrl` için yükleme akışı kurmak — alan var, UI yok, boş bırak.
- Yeni cache altyapısı yazmak; mevcut yardımcıyı kullan.
- `features` alanını etiketler için yeniden yorumlamak.
- Sunucu tipi (`ServerType`) semantiğine dokunmak — S1–S4 kapandı, o sözleşme değişmez.

---

## E. Kapı

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Ayrıca:

- Migration `packages/db/prisma/rebaseline-migrations/` altında ve yerel DB'de koşuyor.
- `route-contract.test.ts` yeşil — beş yeni action kayıtlı.
- Profil rotası için sorgu sayısı ölçüldü ve kanal sayısından bağımsız (N+1 yok) — rapora sorgu sayısını yaz.

## F. Rapor

`docs/prompts/sunucular-6a-6f/raporlar/01-rapor.md` — 00 §8 formatı. Ek olarak:

- Genişletilmiş `ServerPublicProfile` alanlarının **tam listesi** (Faz 5 buna göre yazacak).
- Etkinlik rotalarının tam yol + action tablosu.
- Profil rotasının sorgu sayısı ve `weeklyMessageCount` cache stratejisi.
- Özel kanal adının üye olmayana sızıp sızmadığı — mevcut davranış ne ise yazılı olarak.
