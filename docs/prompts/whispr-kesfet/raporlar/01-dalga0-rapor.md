# Ş0 — Dalga 0 · Sözleşme katmanı · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit yok.**
Görev dosyası: `docs/prompts/whispr-kesfet/01-dalga0-sozlesme.md`.

Bu şerit ekran çizmedi, bileşen yazmadı. Ölçü, şema, tip, rota ve metin donduruldu; Dalga 1 ile
Dalga 2 artık birbirini beklemeden ilerleyebilir.

---

## 0. Değişen dosyalar

**Yeni**

| Dosya                                                                                                                | İş                                |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `apps/web/src/lib/discover/metrics.ts` (+ `.test.ts`)                                                                | Ş0.1 ölçü sözlüğü                 |
| `apps/web/src/lib/discover/routes.ts` (+ `.test.ts`)                                                                 | Ş0.3 rota sözleşmesi              |
| `apps/web/src/lib/discover/identity.ts` (+ `.test.ts`)                                                               | Ş0.3 baş harf + kategori dönüşümü |
| `apps/web/src/lib/discover/contracts.ts` (+ `.test.ts`)                                                              | Ş0.3 sıra/ton sözleşmesi          |
| `packages/types/src/discover-screen.ts` (+ `.test.ts`)                                                               | Ş0.3 zod sözleşmeleri             |
| `packages/db/prisma/rebaseline-migrations/20260821140000_discover_category_languages_channel_activity/migration.sql` | Ş0.2                              |
| `apps/web/src/lib/locale/discover-screen-copy.test.ts`                                                               | Ş0.4 kopya testi                  |

**Değişen**

| Dosya                                                       | Değişiklik                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                          | `ServerCategory` enum, `Server.category`, `Server.languages`, kategori indeksi, `DiscoverChannelActivity`, `Channel.discoverActivity` |
| `packages/db/src/index.ts`                                  | `ServerCategory` tip ihracı                                                                                                           |
| `packages/types/src/index.ts`                               | `export * from "./discover-screen"`                                                                                                   |
| `packages/types/src/workspace.ts`                           | K3 genişlemesi (aşağıda)                                                                                                              |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`               | 102 yeni anahtar + `discover.title` değer düzeltmesi                                                                                  |
| `apps/web/src/lib/servers/server-public-profile-service.ts` | Yeni alanların üretimi (2 gerçek, 3 geçici)                                                                                           |
| 5 test fixture dosyası                                      | Zorunlu alanların eklenmesi (§3.2)                                                                                                    |

---

## 1. Ş0.1 — Ölçü sözlüğü

`DISCOVER_METRICS` 20 üst blok taşıyor: `shell · columns · sidebar · feedHeader · featured ·
sectionHead · serverCard · personCard · channelRow · eventCard · filterStrip · joinedBanner ·
panel · joinModal · emptyState · errorState · joinedShell · transitions`. Her değer
`Kesfet-5B.dc.html` içindeki inline `style`'dan okundu; SPEC'ten kopyalanmadı.

### 1.1 `SPEC_DEVIATIONS` — tam liste

Tek kayıt var:

| `field`             | `html` | `spec` | Gerekçe                                                                                                                                                                                                                                                             |
| ------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transitions.hover` | `140`  | `160`  | SPEC-ANA-SAYFA §1 "Geçişler: tümü `0.16s`" diyor. `dc.html` kart ve çip hover'ında `transition:border-color .14s,transform .14s` yazıyor — kart ızgarası aynı anda düzinelerce elemanı hareket ettirdiği için tasarım bilerek kısa süre seçmiş. Sözlük HTML'i aldı. |

Bu paket, Bahsedilmeler'den de temiz çıktı: SPEC-KESFET doğrudan HTML'den çıkarılmış ve
**verilen her sayı HTML ile birebir uyuştu**. §1–§6 arasındaki 200'ü aşkın ölçü tek tek
karşılaştırıldı; başka sayısal çelişki bulunmadı.

### 1.2 SPEC'in sessiz kaldığı yerler (çelişki değil)

Sözlükte `// SPEC sessiz` yorumuyla işaretli, HTML'den okunmuş 14 değer:

`sidebar.searchFontSize` 13 · `sidebar.sortLabelFontSize/LineHeight` 13/1.2 ·
`sidebar.divider*` 13/16/11 · `sidebar.inviteButtonFontSize` 12 · `feedHeader.subMarginTop` 5 ·
`feedHeader.iconButtonRadius` 11 · `featured.metaPillBorderWidth` 1 ·
`serverCard.joinButtonFontSize` 11.5 · `serverCard.selectedStripeRadiusEnd` 4 ·
`panel.ctaRadius` 11 · `joinModal.headerIconBoxRadius` 13 · `joinModal.fieldLabel*` (11px/.13em)
· `emptyState.iconBoxRadius` 26 · `joinedShell.navTileFontSize` 11.

İkisi ayrıca not edilmeye değer:

- **Modal etiketi ekranın etiketiyle aynı değil.** `DAVET KODU VEYA BAĞLANTI` `600 11px/.13em`,
  ekranın her yerindeki bölüm etiketi ise `600 10.5px/.15em`. Ş8 ikisini birleştirmemeli.
- **`Önizle` butonunun yatay padding'i iki yerde farklı.** Sunucu kartında 12, kanal satırında 13. HTML böyle; sözlük iki ayrı alan taşıyor.

### 1.3 Sözlüğün doğruladığı üç aritmetik

`metrics.test.ts` bunları test olarak sabitledi:

- `74 + 228 + 276 = 578`, `1360 − 578 = 782` (SPEC §1).
- `782 − 326 = 456`; 456'lık akışta 24+24 padding düşünce 408 kalır, iki kolon `2×262 + 12 = 536`
  isterdi. **Panel açıkken tek kolon doğru davranıştır** (Tuzak 7) — `minmax` değiştirilmeyecek.
- Modal anahtarı: `44 − 20 − 3 = 21` (açık knob konumu) ve `26 − 20 = 2×3` (dikey boşluk).

---

## 2. Ş0.2 — Migration

### 2.1 SQL

`packages/db/prisma/rebaseline-migrations/20260821140000_discover_category_languages_channel_activity/migration.sql`

```sql
-- 1. Category
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServerCategory') THEN
    CREATE TYPE "ServerCategory" AS ENUM ('OYUN', 'IS', 'CALISMA', 'KISISEL', 'DESTEK');
  END IF;
END
$$;

ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "category" "ServerCategory";

CREATE INDEX IF NOT EXISTS "Server_category_discoverable_isPublic_memberCount_idx"
  ON "Server" ("category", "discoverable", "isPublic", "memberCount");

-- 2. Languages
ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 3. Channel activity rollup
CREATE TABLE IF NOT EXISTS "DiscoverChannelActivity" (
  "channelId"    TEXT NOT NULL,
  "windowStart"  TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "DiscoverChannelActivity_pkey" PRIMARY KEY ("channelId", "windowStart")
);

-- + DiscoverChannelActivity_channelId_fkey (ON DELETE CASCADE)
CREATE INDEX IF NOT EXISTS "DiscoverChannelActivity_windowStart_messageCount_idx"
  ON "DiscoverChannelActivity" ("windowStart", "messageCount");
```

Veri yazılmadı: `category` `NULL`, `languages` boş dizi, rollup tablosu boş başlar. Şerit ilk
saatlik iş koşana kadar boş durumunu gösterir — bu bir hata değil, rollup'ın henüz koşmadığına
dair doğru bir cümledir.

### 2.2 Yerel koşum çıktısı

```
$ pnpm --filter @wizards/db db:migrate:deploy
Datasource "db": PostgreSQL database "wizards", schema "public" at "localhost:5432"

39 migrations found in prisma/migrations

Applying migration `20260821140000_discover_category_languages_channel_activity`

The following migration(s) have been applied:

migrations/
  └─ 20260821140000_discover_category_languages_channel_activity/
    └─ migration.sql

All migrations have been successfully applied.
```

```
$ pnpm --filter @wizards/db db:migrate:status
40 migrations found in prisma/migrations
Database schema is up to date!
```

### 2.3 Yerel DB doğrulaması

`information_schema` + `pg_indexes` + `pg_enum` okundu:

```
Server kolonları
  category   USER-DEFINED  ServerCategory  nullable=YES  default=null
  languages  ARRAY         _text           nullable=NO   default=ARRAY[]::text[]

ServerCategory: OYUN, IS, CALISMA, KISISEL, DESTEK

indeksler
  CREATE INDEX "Server_category_discoverable_isPublic_memberCount_idx"
    ON public."Server" USING btree (category, discoverable, "isPublic", "memberCount")
  CREATE UNIQUE INDEX "DiscoverChannelActivity_pkey"
    ON public."DiscoverChannelActivity" USING btree ("channelId", "windowStart")
  CREATE INDEX "DiscoverChannelActivity_windowStart_messageCount_idx"
    ON public."DiscoverChannelActivity" USING btree ("windowStart", "messageCount")

DiscoverChannelActivity kolonları
  channelId    text                         NOT NULL
  windowStart  timestamp without time zone  NOT NULL
  messageCount integer                      NOT NULL default 0
```

### 2.4 Bir uyarı: migration adı sıralamada geriye düşüyor

Yerel DB'de **Etkinlikler** şeridinin `20260821150000_events_screen` migration'ı zaten
uygulanmıştı; bizimki `…140000` olduğu için ad sırasında ondan **önce** duruyor. İkisi bağımsız
(farklı tablolar, ortak kolon yok) ve `migrate status` temiz. Boş bir veritabanında replay sırası
`140000 → 150000` olur ve yine sorunsuz koşar. Yine de Ş10 parity kapısında `migrate reset`
denenirse bu sıranın bilinçli olduğu bilinmeli.

---

## 3. Ş0.3 — Tipler, rota, kimlik

### 3.1 SPEC §8 taslağından üç bilinçli sapma

1. **Sayılar ham.** Taslak `memberCountLabel: '48,2B'` istiyor; şema `memberCount: 48200`
   döndürüyor. Biçimlendirme locale'e bağlı bir sunum kararıdır ve `formatServerProfileCount`
   ile istemcide yapılır (fonksiyon zaten var). Sunucunun istemcinin dilini bilmesi gerekmiyor.
2. **`activityLabel` enum.** `Yoğun/Canlı/Haftalık/Açık/Yeni/Resmî` sunucudan **sınıf** olarak
   gelir; Türkçesi `discover.channel.activity.*` anahtarındadır. Sunucudan metin dönseydi ekran
   İngilizceye çevrilemezdi.
3. **`category` `null` olabilir ve `"all"` değildir.** `"all"` kullanıcının filtreyi kapattığını,
   `null` sunucunun sınıflandırılmadığını söyler. `DiscoverServerCategoryKeySchema` `"all"`
   kabul etmez; test bunu sabitledi.

### 3.2 `ServerPublicProfile` genişlemesinin kırdığı çağrı yerleri

`ServerPublicProfileFriendSchema` iki, `ServerPublicProfileSchema` üç **zorunlu** alan kazandı.
Kırılan yedi yer ve nasıl kapatıldığı:

| #   | Yer                                                                | Ne yapıldı                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `lib/servers/server-public-profile-service.ts` — üretici           | `category` ve `languages` **gerçek kolondan** okunuyor (select'e eklendi, `toCategoryKey` ile çevriliyor). `voiceRoomCount` ve tanıdıkların `role`/`presence` alanı `TODO(Ş3)` ile geçici dolduruldu. |
| 2   | `packages/types/src/workspace.test.ts`                             | `serverPublicProfile` fixture'ı üç alanı aldı; `ServerPublicProfileFriendSchema` davranış kapsamı kaydı yenilendi (geçersiz örnek artık "rol/presence eksik" oldu).                                   |
| 3   | `packages/types/src/mobile.test.ts`                                | Aynı fixture + **davet önizleme sınırı** listesi (§3.3).                                                                                                                                              |
| 4   | `packages/types/src/server-profile-presentation.test.ts`           | `friend()` yardımcısı `presence:"offline"`, `role:"member"` aldı.                                                                                                                                     |
| 5   | `app/api/v1/servers/[serverId]/profile/route-logic.test.ts`        | fixture                                                                                                                                                                                               |
| 6   | `app/api/v1/mobile/servers/[serverId]/profile/route-logic.test.ts` | fixture                                                                                                                                                                                               |
| 7   | `app/api/v1/mobile/invites/[code]/preview/route-logic.test.ts`     | fixture                                                                                                                                                                                               |

**`TODO(Ş3):` bırakılan iki yer — gerekçesiyle:**

- `voiceRoomCount: 0`. Profil servisinin çektiği kanal listesi `hasMoreChannels` ile kapalıdır;
  o listeden sesli oda saymak büyük bir sunucuda **sessizce eksik** bir sayı üretirdi. Ş3
  ayrı bir `channel.count({ where: { serverId, type: "GUILD_VOICE" } })` okuması ekleyecek.
  O güne kadar panel `0 Sesli oda` yazar — yanlış bir sayı yerine açıkça boş bir kutu.
- `mutualFriends[].role = "member"`, `presence = "offline"`. Rol, arkadaşın o sunucudaki
  `ServerMember.roles` kaydından; presence, `ServerPublicProfileAdmin`'in zaten kullandığı Redis
  socket kaydından gelecek. İkisi de bu sorgu şeklinin bugün koşmadığı **ikinci** bir okuma.

### 3.3 Davet önizleme sınırı bilerek genişletildi

`packages/types/src/mobile.test.ts` içindeki "mobile invite preview exposure boundary" testi,
`ServerPublicProfileSchema`'ya alan eklenince kırılmak üzere yazılmış bir güvenlik kapısıdır
(özel bir sunucunun davet kodunu elinde tutan kişi bu payload'ı görür). Üç yeni alan tek tek
değerlendirildi ve listeye **gerekçe yorumuyla** eklendi:

- `category` — herkese açık dizin sınıflandırması; özel bir sunucuda bile yalnız altı kovadan
  hangisinde olduğunu söyler, aynı payload'daki `tags` dizisiyle aynı ayrıntı düzeyi.
- `languages` — sahibin dizin için yazdığı diller; `description` ile aynı sınıf bilgi.
- `voiceRoomCount` — aynı payload'daki `channels` dizisi zaten sesli odaları listeliyor
  (`hasMoreChannels` ile kapalı); bu yalnız davet sahibinin sayabileceği bir sayıyı tamamlıyor.

### 3.4 Rota

`parseDiscoverRoute` / `buildDiscoverHref` K12'yi uyguluyor:
`/discover?lane=…&cat=…&sort=…&q=…&panel=<serverId>&modal=join`.

- Tanınmayan değer varsayılana düşer, **atmaz** (`lane=uzay` → `servers`).
- Varsayılanlar adrese yazılmaz; `/discover?lane=servers&cat=all` üretilmez.
- `q` trim'lenir, boşsa düşer, 80 karakterde kesilir (sunucudaki `DiscoverQuerySchema.q` ile aynı sınır).
- Anahtar sırası sabit: `lane, cat, sort, q, panel, modal`. Bir tur gidip gelme testi var.

Faz dosyasında adı geçmeyen ama kuralı §3'te yazılı olan üç saf yardımcı da burada:
`closeTopDiscoverLayer` (SPEC §7 — `Esc` **önce modalı**, sonra paneli kapatır),
`clearDiscoverFilters` ve `hasActiveDiscoverFilters` (SPEC §4.8 — filtre şeridi ne zaman çizilir).
`clearDiscoverFilters` **şeridi, paneli ve modalı korur**: Kanallar şeridinde arama yapan
kullanıcıyı "Filtreleri temizle" Sunucular'a atmaz.

### 3.5 Baş harf türetmesi — SPEC dizinindeki çözülemez satır

`toDiscoverInitials` SPEC §9'daki 20 sunucunun **19'unu** kuraldan üretiyor. Bir satır
**türetilemez**:

| Ad                      | Tasarım | Kuralın ürettiği |
| ----------------------- | ------- | ---------------- |
| `Indie Oyun Geliştirme` | `IG`    | `IO`             |

`IG`, ikinci kelimenin ("Oyun") atlanıp üçüncüsünün alınmasıdır. Aynı tabloda
`Oyun Kulübü Türkiye` → `OK`, yani **üçüncü** kelime atlanmıştır. İki satırı birden üreten
konumsal bir kural yoktur; tasarımın `IG`si elle yazılmış örnek veridir. Üründe bunun karşılığı
`Server.shortName` kolonudur — dizin seed'i (Ş1/Ş10) o sunucuya `shortName = "IG"` yazdığında
tile birebir tasarımdaki gibi çizilir. Test tablosu bu satırı kısa adıyla tutuyor ve kuralın
`IO` ürettiğini ayrıca sabitliyor.

Ayrıca **bağlaç kuralı** eklendi: SPEC §9'daki `Yürüyüş ve Doğa` tasarımda `YD` çizilir, `YV`
değil. Kural — üç ve daha fazla kelimeli adlarda, ilk kelimeden sonraki bağlaçlar
(`ve · ile · veya · ya · and · or · of · the`) atlanır; eleme ilk kelimeye dokunmaz ve listeyi
iki kelimenin altına düşürmez. `Ve Yayınları` ilk harfini kaybetmez.

Türkçe büyük harf `toLocaleUpperCase("tr")` ile: `istanbul kulübü → İK`, `ırmak → IR`.
Çıktı her zaman **tam iki karakter** (şema `z.string().length(2)` istiyor): tek harf kalırsa
harf tekrarlanır (`W → WW`), hiç harf yoksa `??`.

---

## 4. Ş0.4 — i18n

### 4.1 Sayılar

- **102 yeni anahtar** TR + EN.
- **1 değer düzeltmesi:** `discover.title` `"Sunucuları Keşfet"` → `"Keşfet"` (SPEC §10).
- **0 silme.** K8 gereği eski ekranın 10 anahtarı Ş8'e kadar duruyor; kopya testi
  `LEGACY_KEYS_PENDING_REMOVAL` listesiyle onların **hâlâ var olduğunu** doğruluyor, böylece
  Ş8 silme işini unutamaz. `discover.joinError.*` ve `discover.joining` kalıcıdır.

### 4.2 SPEC §10 dışında eklenen anahtarların gerekçesi

SPEC §10 30 anahtar veriyor ve başlığında "örnek" diyor. Kalan 72 anahtar SPEC'in **gövdesinde
geçen** metinlerdir; gruplar ve gerekçeleri:

| Grup                        | Anahtar sayısı | Gerekçe                                                                                                                                                                 |
| --------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| aria-label'lar              | 6              | PROMPT kural 5: ikon-only butonlar `aria-label` taşır. `search.clear`, `header.joinServer`, `header.cardSize`, `person.openProfile`, `profile.close`, `joined.dismiss`. |
| Kategori adları             | 6              | SPEC §3.1 tablosu (`Tümü · Oyun · İş · Çalışma · Kişisel · Destek`) §10'da yok ama dizin kolonunun tamamı bu altı metinden ibaret.                                      |
| Akış başlığı                | 8              | §4.1 üç alt satır hâli (normal/boş/hata) + `{sort}` sözcükleri + `Arama sonuçları`.                                                                                     |
| Bölüm başlıkları ve notları | 12             | §4.3 tablosu: dört etiket + beş not + iki alt not.                                                                                                                      |
| Kanal hareket pilleri       | 6              | §4.6 `Yoğun/Canlı/Haftalık/Açık/Yeni/Resmî`. Şema enum döndürdüğü için karşılıkları sözlükte olmak **zorunda**.                                                         |
| Etkinlik kartı              | 3              | §4.7 `İlgileniyorum · Detay · {n} kişi ilgileniyor`.                                                                                                                    |
| Panel                       | 8              | §5.2 üç istatistik etiketi, §5.4 iki rol pili, §5 `Paylaş`, `Sunucuya katıl`, tanıdıklar notu.                                                                          |
| Katıl modalı                | 10             | §6 alt başlık, yardım metni, placeholder, `Yapıştır`, seçenek alt satırı, görünürlük yardımı, koşullar satırı, `İptal`.                                                 |
| Onay şeridi + `Yeni` pili   | 4              | §4.8 detay satırı, `Sunucuya git`, §2 `Yeni`.                                                                                                                           |
| Boş / hata durumu           | 7              | §4.9 iki gövde metni, dört buton, hata kodu satırı.                                                                                                                     |
| Kart / kişi meta            | 2              | §4.4 `{count} çevrimiçi` / `{count} üye` (§10'da var), §4.5 ortak sunucu satırı (yok).                                                                                  |

### 4.3 Üç metin kararı

1. **`{sort}` kısa sözcük.** Görev dosyası `popüler / çevrimiçi / yeni` diyor ve
   `discover.header.sortWord.*` anahtarlarını istiyor. `dc.html` ise sıralama etiketinin
   tamamını küçültüyor (`"en çok çevrimiçi sıralı"`). **Görev dosyası uygulandı**; ayrım burada
   kayıtlı, çünkü Ş5 akış başlığını yazarken referans HTML'e bakarsa fark görecek.
2. **Bölüm etiketleri sözlükte büyük harf saklanıyor** (`TOPLULUK SUNUCULARI`). `dc.html`
   küçük harf saklayıp CSS `text-transform:uppercase` uyguluyor — ama CSS büyük harf dönüşümü
   Türkçe'de `ı → I` üretmek için `lang="tr"` ister ve bir yerde unutulursa `TOPLULUK
SUNUCULARi` çıkar. Değeri büyük harf saklamak bu tuzağı tamamen kaldırıyor; test bunu
   `toLocaleUpperCase("tr")` ile sabitliyor.
3. **Tırnak ve kesme işareti.** Tuzak 8 uygulandı: `“…”` (U+201C/U+201D), `’` (U+2019), `·`
   (U+00B7). Kopya testi TR değerlerinde **düz `"` ve `'` bulunmadığını** ve ayırıcı taşıması
   gereken dokuz anahtarın gerçekten `·` içerdiğini doğruluyor.

### 4.4 Kopya testi ne doğruluyor

`discover-screen-copy.test.ts` — 15 test:
SPEC'teki 102 cümlenin birebir eşitliği (sabit dizgi, SPEC dosyası okunmuyor) · her anahtarın EN
karşılığı · boş değer yok · interpolasyon adlarının iki dilde aynı kümesi · düz tırnak yok ·
ayırıcı `·` · başlık/ray/CTA metinlerinin tek kaynaktan okunduğu (`discover.title ===
discover.header.title`, `profile.join === join.title === header.joinServer`,
`card.join === join.submit`) · bölüm etiketlerinin büyük harfliliği · eski anahtarların hâlâ
durduğu.

---

## 5. Kapı

| Komut                                         | Sonuç                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/db db:generate`       | ✅                                                                              |
| `pnpm --filter @wizards/db db:migrate:deploy` | ✅ 1 migration uygulandı                                                        |
| `pnpm --filter @wizards/db db:migrate:status` | ✅ `Database schema is up to date!`                                             |
| `pnpm --filter @wizards/db test`              | ✅ 109/109                                                                      |
| `pnpm --filter @wizards/types typecheck`      | ✅                                                                              |
| `pnpm --filter @wizards/types test`           | ✅ 508/508                                                                      |
| `pnpm --filter @wizards/web typecheck`        | ✅                                                                              |
| `pnpm --filter @wizards/mobile typecheck`     | ✅ (K3 genişlemesi mobili kırmadı)                                              |
| `pnpm --filter @wizards/web test`             | ⚠️ `tests 4224 · pass 4220 · fail 3` — **üç kırık da bu şeritten önce kırıktı** |
| `pnpm --filter @wizards/web lint`             | ⚠️ tek hata, bu şeritten önce kırıktı                                           |

Bu şeridin eklediği 75 test (`lib/discover/*` + `discover-screen-copy`) ve `packages/types`
tarafındaki 20 test tamamen yeşil. Dokunduğum dosyalar `eslint` ve `prettier` ile temiz.

### 5.1 Ş0'dan önce kırık olan üç test + bir lint hatası

Üçü de bu şeridin dokunmadığı dosyalardan geliyor; hiçbiri Keşfet paketinin sahipliğinde değil,
o yüzden düzeltilmedi:

| Kırık                                                                                                          | Kaynak                                                                                                 | Kanıt                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `API v1 route contract › requires mutating routes to either parse JSON centrally or be documented as bodyless` | `DELETE mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotası bodyless listesinde yok | `git status`: rota klasörü `??` (Bahsedilmeler dalgası, uncommitted) |
| `Mesajlar denetim bütçesi › components/dm bütçeyi aşmaz`                                                       | `components/dm/group-create-dialog.tsx:608` `hsl(` literali (borç 1 > bütçe 0)                         | `git status`: ` M` (Mesajlar dalgası, uncommitted)                   |
| `Mesajlar denetim bütçesi › components/dm bütçesi gerçekten harcanmış`                                         | aynı dosya, aynı literal                                                                               | aynı                                                                 |
| `lint`: `no-assign-module-variable`                                                                            | `apps/web/src/lib/events/parity.test.ts:318`                                                           | `git status`: `??` (Etkinlikler dalgası, uncommitted)                |

İlk üçü **Bahsedilmeler/Mesajlar** şeritlerinin, dördüncüsü **Etkinlikler** şeridinin sahibinde.

---

## 6. Dalga 1 ve Dalga 2 için not

- `DiscoverServerPageSchema` `categories` ve `featured` alanlarını **ayrıca** taşıyor. Sayaçlar
  filtrelenmiş listeden türetilemez (Tuzak 4); Ş1 tek `groupBy(category)` koşacak.
- İmleç formatı şemada `z.string().min(1).max(128)`; sıralama anahtarını taşıma zorunluluğu
  (Tuzak 3, `p|… o|… n|…`) Ş1'in kararı — Ş0 yalnız alanı ve sınırını dondurdu.
- `DISCOVER_CATEGORIES[].tone` bir **token adıdır** (`primary/warning/info/success/danger`),
  renk değil. Tüketici `hsl(var(--${tone}))` kurar. `--info` `globals.css:37`'de zaten tanımlı;
  yeni token üretilmedi.
- `DISCOVER_CARD_SIZE_STORAGE_KEY` ve `DISCOVER_SEEN_SERVERS_STORAGE_KEY` sürüm ekli
  (`.v1`): şekli değişen bir tercihin eski kaydı sessizce okunamaz.
- `DISCOVER_NEW_BADGE_TTL_MS = 86_400_000` (K4) ve `DISCOVER_FEATURED_FLAG = "FEATURED"` (K11,
  mevcut `server-discovery-service.ts` ile aynı dizgi) `contracts.ts` içinde.
- `dc.html` içindeki üst arama şeridi + yatay kategori şeridi **5a yönüne** aittir (`dirA`).
  5B'de yoktur; sözlükte de yoktur. Ş5 referans dosyayı açarken bunu görecek.
