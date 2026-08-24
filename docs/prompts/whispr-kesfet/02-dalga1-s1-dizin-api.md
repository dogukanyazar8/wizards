# Dalga 1 · Ş1 — Dizin API'si (sunucular şeridi)

**Ön koşul:** Dalga 0. **Paralel:** Ş2, Ş3, Ş4, Ş5, Ş6 ile aynı anda koşabilir.
**Kapı:** `route-logic.test.ts` + `servers-service.test.ts` yeşil.

Tek uç: **`GET /api/v1/discover/servers`**. Sunucular şeridinin ızgarasını, kategori sayaçlarını
ve öne çıkan bloğu tek yanıtta verir.

---

## Sahiplenilen dosyalar

```
apps/web/src/app/api/v1/discover/servers/route.ts
apps/web/src/app/api/v1/discover/servers/route-logic.ts
apps/web/src/app/api/v1/discover/servers/route-logic.test.ts
apps/web/src/lib/discover/servers-service.ts
apps/web/src/lib/discover/servers-service.test.ts
apps/web/src/lib/api-rate-limit.ts          (yalnız yeni anahtar ekleme)
```

`lib/servers/server-discovery-service.ts` **okunur, değiştirilmez** (K8: eski uç durur). Yeni
servis onun keyset ve iki-fazlı okuma iskeletini **devralır**, kopyalamaz: ortak parçalar
(`SERVER_DISCOVERY_SELECT`, `countServerOnlineMembersBatch` çağrısı) oradan import edilir.

---

## 1. İstek sözleşmesi

```
GET /api/v1/discover/servers?cat=oyun&sort=online&q=dil&cursor=p|48200|s1&limit=24
```

| Parametre | Tip                   | Varsayılan | Not                            |
| --------- | --------------------- | ---------- | ------------------------------ |
| `cat`     | `DiscoverCategoryKey` | `all`      | bilinmeyen değer → `all`       |
| `sort`    | `DiscoverSortKey`     | `popular`  |                                |
| `q`       | string ≤80            | —          | trim, boşsa yok sayılır        |
| `cursor`  | string                | —          | sıralama anahtarını taşır (§3) |
| `limit`   | 1..50                 | 24         |                                |

Doğrulama `DiscoverQuerySchema` ile; şema dışı değer 400 değil **varsayılana düşüş** (K12).
`limit` aralık dışıysa kırpılır.

Hız sınırı: yeni anahtar `discover:servers` → `{ limit: 240, windowSeconds: 60 }`
(mevcut `server:discover` ile aynı sınıf, ayrı sayaç).

---

## 2. Yanıt sözleşmesi

```ts
{
  items: DiscoverServer[];
  nextCursor: string | null;
  /** Kategori sayaçları — yalnız ilk sayfada (cursor yokken) dolu, sonraki sayfalarda null. */
  categories: DiscoverCategory[] | null;
  /** Öne çıkan sunucu — yalnız ilk sayfada, cat=all ve q boşken; aksi halde null. */
  featured: DiscoverServer | null;
  /** Filtreye uyan toplam — başlık alt satırındaki "{n} sunucu" bunu okur. */
  totalCount: number;
}
```

`categories` ve `featured` sonraki sayfalarda `null` döner çünkü sonsuz kaydırmada her sayfada
yeniden hesaplanmaları saf israftır; istemci ilk sayfadaki değeri saklar.

---

## 3. İmleç — sıralama anahtarını taşır (tuzak 3)

Mevcut format `f|memberCount|id` (faz + değer + id). Yeni format **sıralama harfi** ekler:

```
<sortMarker>|<phase>|<value>|<id>
  sortMarker : p (popular) | o (online) | n (new)
  phase      : f (featured) | r (rest)
  value      : popular → memberCount
               new     → createdAt epoch ms
               online  → §3.1
```

`decodeDiscoverCursor` imlecin `sortMarker`'ı istekteki `sort` ile **eşleşmiyorsa `null`
döner** — istemci sıralamayı değiştirince eski imleç sessizce yanlış sayfa vermez, sayfalama
baştan başlar. Aynı kural `cat` ve `q` için de geçerlidir: bunlar imlece girmez ama değiştiklerinde
istemci `queryKey` değiştiği için sorgu zaten sıfırlanır; sunucu tarafında ek kontrol yok.

Keyset yüklemi tek kolon üzerinde kalır (tuzak 2): `WHERE (value, id) < (?, ?)` biçiminde
bileşik karşılaştırma; iki kolona yayılan `OR` **yazılmaz**.

### 3.1 `online` sıralamasının sınırı

`onlineCount` bir veritabanı kolonu değil, Redis'ten `countServerOnlineMembersBatch` ile gelen
türetilmiş bir sayıdır. Postgres onu sıralayamaz. Kural:

1. Filtreye uyan sunuculardan `memberCount desc` ile **en fazla `ONLINE_SORT_POOL = 200`** kayıt
   çekilir (üyesi en çok olan 200 sunucu, çevrimiçi sayısının anlamlı olduğu havuz).
2. Havuzun `onlineCount`'ları tek `countServerOnlineMembersBatch` çağrısıyla alınır.
3. Havuz bellekte `onlineCount desc, id asc` sıralanır ve sayfalanır.
4. İmleç `o|r|<onlineCount>|<id>` olur; sonraki sayfa aynı havuzu yeniden kurup imleçten sonrasını
   verir (havuz deterministik: aynı filtre + aynı `memberCount desc` sırası).
5. `nextCursor`, havuz tükendiğinde `null` olur — **havuzdan sonrası gösterilmez** ve bu
   `log`'lanır: `discover.servers.online_pool_truncated { total, pool: 200 }`.

Bu sınır bir kısıttır, gizlenmez: SPEC "En çok çevrimiçi" sıralamasını bir keşif yardımı olarak
tanımlıyor, tam sıralı bir liste olarak değil.

---

## 4. Kategori sayaçları (tuzak 4)

```sql
SELECT category, COUNT(*) FROM "Server"
WHERE discoverable AND "isPublic" AND <arama yüklemi>
GROUP BY category
```

- Kategori seçiminden **etkilenmez** (kategori seçiliyken diğer satırların sayısı doğru kalmalı).
- Aramadan **etkilenir** (04-durum.png: arama sonucunda sayaçlar daralır).
- `category IS NULL` satırı sayaçlara **girmez**, ama `all` sayacına girer:
  `all = COUNT(*)` (null dâhil), diğerleri `GROUP BY` satırından.
- Etiket ve iki harf `DISCOVER_CATEGORIES`'ten gelir; sunucu yalnız `key` + `count` üretir,
  istemci `contracts.ts` ile birleştirir. (Yanıt tipi yine tam `DiscoverCategory` döner —
  etiket i18n'de olduğu için sunucu `label` alanını **boş string** verir ve istemci doldurur;
  bu şemada `label: z.string()` olarak kalır, sunucu dil bilmez.)

---

## 5. Arama (K6)

Sunucu şeridinde arama **dört alan** üzerinde çalışır (SPEC §7):

| Alan     | Yüklem                                                            |
| -------- | ----------------------------------------------------------------- |
| ad       | `name ILIKE '%'                                                   |     | q   |     | '%'` |
| açıklama | `description ILIKE '%'                                            |     | q   |     | '%'` |
| etiket   | `tags @> ARRAY[lower(q)]` (GIN indeksli tam eşleşme)              |
| kategori | `q` bir kategori adına (TR) eşleşiyorsa `category = <o kategori>` |

Kategori eşleşmesi **sunucuda** yapılamaz (TR etiketler i18n'de). Çözüm: istemci arama metnini
gönderirken kategori eşleşmesini kendisi tespit eder ve `cat` parametresini **değiştirmez**;
bunun yerine `q` ile birlikte `catHint=<key>` gönderir. Sunucu `catHint` varsa yüklemi
`(name ILIKE … OR description ILIKE … OR tags @> … OR category = catHint)` yapar.

> Neden `catHint`: "oyun" yazan kullanıcı hem adında "oyun" geçen sunucuları hem de Oyun
> kategorisindeki sunucuları görmeli. Kategori adlarını sunucuya gömmek uygulamayı tek dile
> kilitlerdi.

`description ILIKE '%…%'` indekssizdir. Kabul edilir çünkü arama yüklemi her zaman
`discoverable AND isPublic` ile birlikte çalışır ve o küme indeksle daraltılır. Dizin 50k satırı
geçtiğinde `pg_trgm` GIN indeksi eklenmesi gerekir — bu bir `TODO(perf):` notu olarak servise
yazılır, şimdi eklenmez.

---

## 6. Öne çıkan blok (K11)

`features @> ARRAY['FEATURED']` olan, `discoverable AND isPublic` sunuculardan `memberCount desc`
ilk kayıt. Koşul: `cat === 'all'` **ve** `q` boş. Aksi halde `featured: null`.

Öne çıkan sunucu **ızgaradan çıkarılmaz** — SPEC ızgaranın onu da içerdiğini gösteriyor
(01-durum.png'de "Whispr Destek" hem blokta hem listede yok; blok ayrı bir sunucu). Karar:
**öne çıkan sunucu ızgarada da görünür**; iki yerde aynı kartı görmek bir hata değil, vurgudur.
Bu kararın gerekçesi Ş1 raporuna yazılır ve Ş10 parity'sinde ekran görüntüsüyle doğrulanır.

---

## 7. Yetki ve gizlilik

- Uç `requireApiUserId()` ister — anonim erişim yok.
- Yalnız `discoverable AND isPublic` sunucular döner. `type` filtresi **yok** (mevcut serviste de
  yok; PERSONAL sunucu da keşfedilebilir olabilir).
- `joined` alanı istekteki kullanıcının `ServerMember` satırından gelir; N+1 olmaması için sayfa
  id'leri tek `findMany({ where: { userId, serverId: { in: ids } } })` ile çekilir.
- Kullanıcının **yasaklı** olduğu sunucular listede kalır ama `joined:false` görünür; katılma
  denemesi mevcut `discover.joinError.banned` yolunu tetikler. (Yasaklı sunucuyu listeden
  gizlemek, yasağın varlığını sızdırmadan tutarlı bir hata mesajı vermekten daha kötüdür.)

---

## 8. Testler

`servers-service.test.ts` (saf, DB'siz):

- imleç kodlama/çözme: üç sıralama × iki faz, bozuk girdiler, sıralama uyuşmazlığında `null`
- kategori sayacı birleştirme: `all` null kategorileri sayar, diğerleri saymaz
- arama yüklemi kurulumu: `q` + `catHint` kombinasyonları
- `online` havuz sıralaması ve kesme davranışı

`route-logic.test.ts`:

- varsayılan parametreler (`/discover/servers` → `cat=all, sort=popular, limit=24`)
- bilinmeyen `cat`/`sort` değerleri varsayılana düşer, 400 dönmez
- `cursor` varken `categories` ve `featured` `null`
- `cat!=all` veya `q` doluyken `featured` `null`
- hız sınırı aşımında 429 ve `Retry-After`
- oturumsuz istekte 401
