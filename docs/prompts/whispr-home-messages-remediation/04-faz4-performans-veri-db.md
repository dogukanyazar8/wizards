# Faz 4 Prompt — Performans, Veri Sahipliği, DB

`00-ortak-baglam.md` ve Faz 1–3 raporlarını oku. Önce ölç, sonra en küçük yapısal düzeltmeyi uygula.
Mikro-optimizasyon, kanıtsız cache, denormalized counter veya ikinci veri katmanı kurma. Yerel `uat`;
commit/push/deploy yok.

## Hedef

Duplicate DM fetch/listener, mesaj satırı re-render, poll timer/relation maliyeti ve kanıtlanabilir DB query
borçlarını azalt. Correctness ve security invariantlarını performans uğruna gevşetme.

## Başlangıç

```powershell
graphify query "useDMConversations consumers socket listener React Query message memo poll timer query rows events upcoming count replyToId index Home initial requests"
git status --short --branch
rg -n "useDMConversations|useMinuteClock|poll:updated|replyToId|events/upcoming|POLL_SELECT" apps/web/src packages/db/prisma
```

Önce ölçüm tablosu çıkar:

- Her `useDMConversations` çağrısı: route, query ihtiyacı, socket listener ihtiyacı.
- `/api/v1/dm` initial request sayısı: Home, Messages empty, active DM.
- Her socket event için aktif listener sayısı.
- 50 görünür mesajdan biri vote/pin update olduğunda yeniden render olan `MessageItem` sayısı.
- Görünür poll sayısı arttıkça timer sayısı.
- Poll GET/vote sorgusunda getirilen DB satırı/alanı.
- `events/upcoming` ve reply lookup için gerçek query planı; mümkün değilse `NOT RUN`.

## 1. DM query ve realtime sahipliği

- React Query fetch katmanı ile realtime subscription katmanını ayır.
- Aynı kullanıcı için DM realtime sync'in tek açık sahibi olsun.
- Salt conversation okuyan consumer yeni socket listener açmasın.
- En yakın mevcut Messages owner/context kullan. Uygulama geneli yeni store/provider yalnız mevcut shell
  mimarisi bunu açıkça gerektiriyorsa; aksi hâlde kurma.
- Home yalnız unread count için tüm DM listesini çekmemeli; mevcut `useUnreadCounters`/özet endpoint'i yeterliyse
  onu kullan.
- Query key, stale time, invalidation ve logout/user-change temizliği testle sabitlensin.

Kabul: tek route mount'unda `/dm` duplicate network isteği yok; event listener sayısı event başına bir; iki
consumer aynı cache verisini görür.

## 2. MessageItem ve poll render maliyeti

- `MessageItem`e render başına yeni poll ReactNode verme. Stabil callback veya yalnız ilgili message/poll id
  değişince üretilen memoized slot kullan.
- Comparator gerçek davranış prop'larını atlamasın; stale closure üretme.
- Vote/pin update yalnız hedef mesajı ve gerekli aggregate yüzeyi yeniden çizsin.
- Existing `message-item-memo.test.ts` ve performance testini gerçek referans sayımlarıyla güçlendir.

## 3. Ortak zaman kaynağı

- Poll countdown kart başına interval/timeout açmamalı.
- Mevcut `useMinuteClock`ı tek shared cadence ile kullan; expiry yakınında gereken hassasiyet varsa yalnız ilgili
  kart için bounded one-shot timer kullan.
- Tab hidden/visible geçişinde drift düzelsin; cleanup tam olsun.
- Fake timer testi: 100 poll kartı için 100 interval oluşmadığını kanıtla.

## 4. Poll query satır büyümesi

- Current `POLL_SELECT`/relation include'larını say. Normal poll DTO yalnız option counts + current viewer vote
  istiyorsa bütün voter satırlarını/kimliklerini çekme.
- Prisma aggregate/groupBy veya mevcut SQL deseninden en basitini seç. Anonymous/non-anonymous voter listesi
  ayrı yetkili endpoint ise normal DTO'dan ayır.
- Option sayısı en fazla 6 olsa da voter sayısı büyüyebilir; 250 üyeli fixture ile satır ve response boyutu ölç.
- Değişiklik yalnız önceki query'nin büyümesi kanıtlandıysa yapılır. Aksi durumda `NO CHANGE — NOT PROVEN`.

## 5. `Message.replyToId` index doğrulaması

Rapor eski schema okumasında indekssiz dedi; güncel rebaseline baseline içinde
`Message_replyToId... WHERE replyToId IS NOT NULL` bulunabilir.

Sıra:

1. `schema.prisma`, bütün `rebaseline-migrations`, archive olmayan aktif migration zinciri ve migration testini ara.
2. Yalnız loopback test DB'de `pg_indexes` ile gerçek index'i doğrula.
3. Index varsa ikinci migration ekleme; schema/migration contract testi eksikse onu ekle.
4. Index yoksa yeni additive rebaseline migration oluştur; mevcut uygulanmış migration'ı düzenleme.
5. `EXPLAIN (ANALYZE, BUFFERS)` ile reply lookup'ın index'i kullandığını yeterli fixture üzerinde kanıtla.

Migration adı zaman sırasına uygun ve tek amaçlı olsun. UAT/prod DB'ye uygulama.

## 6. `events/upcoming.totalCount`

- Exact `totalCount` API sözleşmesini koru.
- Query'yi gerçek filtreler ve yeterli event fixture'ıyla ölç.
- Pahalıysa önce matching composite/partial index veya query shape düzelt; cached/denormalized counter son seçenek
  ve bu fazda ancak açık kanıt + mevcut invalidation sahibi varsa.
- Exact count'u sessizce cap/approximate yapma.

## 7. Home ve büyük veri sınırları

- Home'un kendi altı endpoint'i ile shell endpoint'lerini ayrı ölç. “11 request” tek başına bug değildir.
- Aynı veriyi isteyen duplicate çağrıyı birleştir; zorunlu shell/version/settings çağrılarını sırf sayıyı düşürmek
  için kaldırma.
- 100 arkadaş ve 250 üyeli grup fixture'ında DOM, query ve response büyümesini ölç. Existing virtualization/
  pagination desenini kullan; ölçüm yeşilse yeni mekanizma kurma.

## Kabul bütçeleri

- Güvenlik filtresi kaldırılmamış.
- Initial Home request sayısı artmamış; duplicate `/dm` kaldırılmış veya zorunluluğu kanıtlanmış.
- DM realtime listener: event başına/user başına en fazla 1.
- Poll kartı başına recurring timer: 0.
- Tek poll update bütün görünür mesajları yeniden render etmez.
- Yeni DB query sınırsız relation row taşımıyor; plan/row kanıtı raporda.
- Bundle'a yeni dependency yok.

## Doğrulama

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/components/chat/message-item-memo.test.ts src/components/chat/message-item-contract.test.ts src/hooks/use-poll.test.ts src/app/api/v1/events/upcoming/route-logic.test.ts
pnpm.cmd --filter @wizards/db test
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/web build
graphify update .
```

DB planı gerçekçi fixture/loopback DB olmadan PASS değildir.

Rapor: `docs/prompts/whispr-home-messages-remediation/raporlar/04-faz4-rapor.md`.
