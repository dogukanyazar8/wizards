# 14 — Sunucu sorgu maliyeti: sınırsız okumalar ve seri turlar

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 12 landed olması iyi (indeksler yerinde olsun ki ölçüm anlamlı olsun). 13 landed.

## Sorun

`take` olmayan okumalar, JS'te yapılan toplamalar, bağımsız olduğu hâlde sıralı bekleyen sorgular. Hiçbiri hata vermiyor — yalnız her ay biraz daha yavaşlıyor.

## Kural

Bu promptta **davranış değişmiyor**. Aynı sonucu daha ucuza üret. Bir sorgunun sonucu değişiyorsa yanlış şey yapıyorsun.

## Kapsam

### Sınırsız okumalar → sayım veya sayfalama

| Yer                                                     | Sorun                                                                                                                                | Yap                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `lib/admin/snapshots/overview.ts:40`                    | `UserDailyMetric` `take`'siz, 2× pencere (180 güne kadar); JS'te toplanıyor. Kardeş loader aynı tabloyu `SCAN_LIMIT` ile sınırlıyor. | Seriler ve toplamlar için `groupBy({ by: ["date"], _sum })`; `topUsers` için ayrı `groupBy({ by: ["userId"] })` + `take: 8`. |
| `lib/admin/notification-campaigns.ts:269`, `:157`       | Alıcı sayımı tüm id'leri çekip `.length` okuyor; önizleme bütçesi 60/dk.                                                             | `countCampaignRecipients(segment)` → `prisma.user.count()`. `getCampaignRecipientIds` yalnız dondurma yolunda kalsın.        |
| `lib/badges/badge-sweep.ts:201`                         | Süresi dolan rozetler `findMany().length`. Sonuç kümesi yalnız büyüyor.                                                              | `count()`.                                                                                                                   |
| `lib/admin/management.ts:349`, `:400`                   | Sunucu listesi her sunucunun **tüm** kanallarını çekip 12'ye kesiyor; sayfa 100 sunucuya kadar.                                      | Nested select'e `take: 12`; toplamları `channel.groupBy` ile al.                                                             |
| `lib/moderation/case-queries.ts:204`                    | (11 no'lu promptta ele alındı — burada tekrar yapma.)                                                                                | —                                                                                                                            |
| `lib/servers/server-public-profile-service.ts:99`       | Herkese açık profil tüm kanalları `take`'siz, kanal başına iki LATERAL ve iki izin çözümlemesiyle çekiyor. Kimliksiz erişilebilir.   | `take` + "daha fazla kanal" bayrağı; izin çözümlemesini kanal başına bir kez yap.                                            |
| `lib/workspace/scheduled-event-service.ts:96`           | Etkinlik listesi `take`'siz; `includePast=true` tek filtreyi kaldırıyor.                                                             | Sınırlanmış `take` + cursor; rotaya `limit` parametresi.                                                                     |
| `lib/dm/service.ts:1183`                                | Paylaşılan medya toplamı konuşmanın tüm geçmişi üzerinde sınırsız ve indekssiz `count`, her detay açılışında.                        | Sayacı konuşma satırına denormalize et **veya** cache'le. Başlık yaklaşık toplamla yetiniyor — basit olanı seç.              |
| `lib/friends/queries.ts:80`, `:133`, `:152`             | Üç arkadaş okuması `take`'siz (13'te rate limit eklendi, sayfalama burada).                                                          | Keyset sayfalama + `take`.                                                                                                   |
| `lib/social/mobile-user-profile-service.ts:293`, `:262` | Ortak arkadaş iki tam listeyi belleğe çekip JS'te kesiştiriyor, her profil kartı açılışında.                                         | Kesişimi SQL'e taşı, veya `MUTUAL_PREVIEW_LIMIT` kadar `take` + ayrı `count`.                                                |

### Seri turlar → paralel veya birleşik

| Yer                                                                           | Sorun                                                                                                                                                                                                                               | Yap                                                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app/api/v1/mobile/bootstrap/route.ts:258`                                    | İki bağımsız okuma iki `Promise.all` partisinden **sonra** sıralı; üstelik `timing.measure` dışında.                                                                                                                                | İlk partiye kat.                                                                                                          |
| `app/api/v1/channels/[channelId]/read/route.ts:84`, `:102`                    | İki bağımsız mesaj araması sıralı; aynı dosya 37. satırda `Promise.all` kullanıyor.                                                                                                                                                 | Tek `Promise.all`.                                                                                                        |
| `app/api/v1/mobile/channels/[channelId]/read/route.ts:51`, `:66`              | Altı sıralı dalga; üçü yeter.                                                                                                                                                                                                       | Üç dalgaya indir. `serverBan` sorgusunu **koru** — izin cache'i isabetinde ban yeniden kontrol edilmiyor.                 |
| `lib/notifications/service.ts:200`                                            | Davet canlılık sorgusu dördüncü seri dalga, oysa yalnız daha önce hesaplanan metadata'ya bağlı.                                                                                                                                     | Üstteki `Promise.all`'a kat.                                                                                              |
| `lib/livekit/server.ts:191`, `:200`                                           | Konuşma varlık kontrolü + katılımcı listesi sıralı; ikincisi tek başına yeterli.                                                                                                                                                    | `findUnique`'i düşür, boş katılımcı listesinden "bulunamadı" türet.                                                       |
| `lib/messages/search-service.ts:157`, `:171`                                  | `assertChannelSearchAccess` bir `channel.findUnique` yapıyor; iki satır sonraki izin çağrısı aynı kontrolleri yapıyor ve kanalı **döndürüyor**. Sonuç çağıran tarafından atılıyor. Cache isabetinde bu, isteğin tek DB turu oluyor. | `findUnique`'i sil, kanalı izin çağrısının dönüşünden al.                                                                 |
| `lib/analytics/service.ts:452`, `:153`                                        | Ses odasından çıkış: oturum × UTC gün × Serializable rozet işlemi üçlü iç içe sıralı döngü; ~18-20 sıralı tur, istek yolunda.                                                                                                       | `mediaUsageSession.update`'leri tür başına tek `updateMany`; metrik ve rozet işini sınırlı eşzamanlılıkla paralelleştir.  |
| `lib/workspace/permission-service.ts:814` · `permission-cache.ts:603`, `:643` | Soğuk açılışta sunucu başına ayrı Redis komut seti — 50 sunucu ≈ 100 tur.                                                                                                                                                           | Partili bir `readCachedVisibleChannelIdsBatch`: tüm anahtarlar tek `mget`, revizyonlar tek `readRevisionMap`.             |
| `lib/dm/disappearing-worker.ts:108`                                           | Süre dolma fan-out'u konuşma başına bir `void` roster sorgusu; 500'lük partide 200 eşzamanlı sorgu, 60 sn'de bir.                                                                                                                   | Konuşma id'lerini topla, tek `findMany({ conversationId: { in: ids } })`, bellekte grupla, tur başına bir kez `await` et. |
| `lib/account/service.ts:197`                                                  | Profil güncelleme yayını alıcı başına bir `emit`; Redis adaptöründe her biri ayrı publish.                                                                                                                                          | Oda adlarını topla, tek `io.to([...]).emit(...)` — `emitToUserRooms` yardımcısı zaten var.                                |

### Payload şişmesi

`lib/dm/realtime-service.ts:125` · `lib/outbox/service.ts:336`, `:141`

Outbox satırı tüm roster'ı yedi alanlı tam kullanıcı nesneleriyle serileştiriyor; iş yalnız `locale` okuyor. `toJsonValue` saf bir cast, TypeScript çalışma zamanında hiçbir şey kırpmıyor.

Yap: kuyruğa koymadan önce katılımcıları `{ muted, notifyLevel, userId, user: { locale } }` şekline indir. Tip ile gerçeği hizala.

## Yapılmayacak

- Yeni cache katmanı, yeni okuma modeli, materialized view.
- Sorgu sonuçlarının **içeriğini** değiştirmek.
- Prisma'yı ham SQL'e çevirmek — yalnız `groupBy`/`count`/`take` gibi Prisma'nın kendi araçları.
- Admin arayüzünü değiştirmek.

## Kabul kriterleri

1. Listelenen her sınırsız okuma ya `take` ya `count`/`groupBy` kullanıyor.
2. Listelenen her seri çift paralel veya birleşik.
3. Sorgu **sonuçları** değişmedi — mevcut testler yeşil, yeni test eski davranışı iddia ediyor.
4. Outbox payload'ı yalnız işin okuduğu alanları taşıyor.

## Testler

- Her değiştirilen okuma için: aynı girdiyle aynı çıktı (sahte Prisma ile çağrı şeklini de iddia et — `take`/`groupBy` varlığı).
- `bootstrap`/`read` rotaları: sorgu sayısının düştüğü (sahte sayaç).
- Outbox payload'ı: serileştirilen nesnenin yalnız beklenen alanları taşıdığı.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
