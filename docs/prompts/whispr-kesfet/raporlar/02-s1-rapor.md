# Ş1 — Dalga 1 · Sunucu dizini API · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit yok.**
Görev dosyası: `docs/prompts/whispr-kesfet/02-dalga1-s1-dizin-api.md`.

## Sonuç

`GET /api/v1/discover/servers` tamamlandı. Uç oturum ister, kendi `240/60 sn` hız bütçesini
kullanır ve yanıtı Zod ile doğrular. Kategori filtresi, `popular / online / new` sıralamaları,
dört alanlı arama, ilk sayfa kategori sayaçları, öne çıkan sunucu, toplam sonuç ve sıralama
anahtarını taşıyan keyset imleç uygulanmıştır.

Sol kabuk (`74 px ray + 228 px nav + kullanıcı barı`) ve değişmez
`lib/servers/server-discovery-service.ts` değiştirilmedi.

## Dosyalar

- `apps/web/src/app/api/v1/discover/servers/route.ts`
- `apps/web/src/app/api/v1/discover/servers/route-logic.ts`
- `apps/web/src/app/api/v1/discover/servers/route-logic.test.ts`
- `apps/web/src/lib/discover/servers-service.ts`
- `apps/web/src/lib/discover/servers-service.test.ts`
- `apps/web/src/lib/api-rate-limit.ts` — yalnız `discover:servers` anahtarı
- `docs/prompts/whispr-kesfet/raporlar/02-s1-rapor.md`

## Uygulama kararları

### İstek ve güven sınırı

- `cat` ve `sort` bilinmiyorsa varsayılana düşer; `limit` `1..50` aralığına kırpılır.
- `q` trimlenir ve ortak 80 karakter sözleşmesinden geçer. `catHint`, yalnız geçerli bir
  kategori anahtarıysa ve `q` varsa kullanılır.
- Kimlik doğrulama ve `discover:servers` hız sınırı servis I/O'sundan önce çalışır. `429`
  yanıtı `Retry-After: 60` taşır.
- Liste her zaman `discoverable = true AND isPublic = true` ile sınırlıdır.

### Arama ve sayaçlar

- Arama: ad ve açıklamada case-insensitive substring; etikette normalize edilmiş tam dizi
  eşleşmesi; `catHint` ile kategori eşleşmesi.
- Etiket normalizasyonu yeni bir kural üretmez; değişmez ortak servisteki
  `normalizeServerDiscoveryTagQuery` kullanılır. Regresyon testi `AI -> ai` davranışını sabitler.
- Kategori sayaçları yalnız ilk sayfada hesaplanır. Seçili kategoriden etkilenmez, aramadan
  etkilenir; kategorisiz kayıt yalnız `all` toplamına girer.
- `description ILIKE '%…%'` için görevde istenen `TODO(perf)` eşiği korundu: dizin 50 bin satırı
  geçmeden `pg_trgm` eklenmedi.

### Sıralama ve imleç

İmleç biçimi: `<sort>|<phase>|<value>|<id>`.

- `popular`: `(memberCount, id)` bileşik keyset; `memberCount DESC, id DESC`.
- `new`: `(createdAt, id)` bileşik keyset; `createdAt DESC, id DESC`; epoch değeri JavaScript
  `Date` aralığı dışındaysa güvenilmeyen imleç reddedilir.
- `online`: `memberCount DESC` ile en çok 200 aday; tek Redis batch; bellekte
  `onlineCount DESC, id ASC`; imleç `onlineCount + id` taşır.
- Online aday kümesi 200'de kesilirse `discover.servers.online_pool_truncated` olayı
  `{ total, pool: 200 }` ile loglanır. Havuz bitince `nextCursor: null` olur.
- İmlecin sıralama anahtarı istekle eşleşmezse imleç yok sayılır ve sayfalama baştan başlar.

### Öne çıkan sunucu

Öne çıkan blok yalnız ilk sayfada, `cat=all` ve boş aramada üretilir. En yüksek üyeli
`FEATURED` sunucu seçilir. Sunucu ızgaradan çıkarılmaz: blok ayrı vurgu, ızgara ise tam dizindir;
aynı sunucunun iki yüzeyde görünmesi sözleşmedeki bilinçli karardır.

Mevcut `SERVER_DISCOVERY_SELECT`, `SERVER_DISCOVERY_FEATURED_FLAG` ve etiket normalizasyonu
değişmez ortak servisten; Redis batch yardımcısı mevcut presence modülünden import edildi.

## Doğrulama

| Kontrol                                           | Sonuç                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Dalga 0 ön kapısı                                 | **PASS** — DB generate, types typecheck, types discovery `20/20`, web discover `75/75` |
| Ş1 odak testleri (`route + service + rate-limit`) | **PASS — 27/27**                                                                       |
| Sahiplik dosyaları ESLint                         | **PASS**                                                                               |
| Yeni Ş1 dosyaları Prettier                        | **PASS**                                                                               |
| Salt-okunur kod incelemesi                        | **PASS — kritik 0; iki doğruluk bulgusu düzeltildi**                                   |
| `pnpm --filter @wizards/web typecheck`            | **FAIL — 2 kapsam dışı hata**                                                          |
| `pnpm --filter @wizards/web lint`                 | **PASS**                                                                               |
| `pnpm --filter @wizards/web test`                 | **FAIL — 4697 test; 4692 pass, 4 fail, 1 skip**                                        |
| `graphify update .`                               | **NOT RUN — sahiplenilen dosyalar dışına yazacağı için**                               |

### Tam kapıdaki kapsam dışı kırıklar

`typecheck` iki hata verir; ikisi de Etkinlikler şeridindedir:

- `apps/web/src/lib/events/mutations.ts:1` — `@wizards/db` içinde
  `ScheduledEventRsvpStatus` ihracı yok.
- `apps/web/src/lib/workspace/scheduled-event-service.ts:1` — aynı eksik ihraç.

`test` dört hata verir:

- `app/api/v1/route-contract.test.ts` — mobile channel `thread-follow` PUT/DELETE rotaları
  bodyless allowlist'te yok.
- `hooks/use-next-event-clock.test.ts` — kaynak sözleşmesi `/api/v1/events?limit=0` bekliyor;
  Etkinlikler istemcisi `/api/v1/events?tab=all&limit=0` taşıyor.
- `lib/messages/audit-budget.test.ts` içinde iki bütçe testi —
  `components/dm/group-create-dialog.tsx:608:38` konumunda tek `hsl(` borcu var; kayıtlı bütçe 0.

Bu dosyalar Ş1 sahipliğinde değildir; değiştirilmedi. Tam süitte Ş1 rota testleri PASS'tir.

## Ek gözlemler

- **medium:** `new` sıralaması `createdAt` kullanıyor; mevcut Prisma şemasında discovery
  filtresiyle uyumlu `createdAt` indeksi yok. Büyük veri kümesinde derin sayfalama sıralama
  maliyeti doğurabilir. Migration dosyaları Ş1 sahipliğinde olmadığı için indeks ve `EXPLAIN`
  bu şeritte yapılmadı.
- **minor:** `apps/web/src/lib/discover/client.ts` bugün `catHint` serialize etmiyor. API kolu
  hazırdır; kategori adıyla aramanın ekrandan çalışması istemci sahibinin bu parametreyi
  göndermesine bağlıdır.
- **minor:** 200'den büyük online havuzda her sayfa kesme logu üretebilir. Gürültü görülürse log
  sampling ortak gözlemlenebilirlik katmanında ele alınmalıdır.
