# Dalga 0 · Ş0 — Sözleşme katmanı

**Ön koşul:** yok. **Kapı:** `pnpm --filter @wizards/web typecheck` + `... test` +
`pnpm --filter @wizards/db generate` yeşil, migration yerel DB'de koşmuş.

Bu şerit ekran çizmez. Dalga 1 ve Dalga 2'nin **aynı anda** çalışabilmesi için ölçüyü, şemayı,
tipi, rotayı ve metni dondurur. Bittiğinde altı şerit birbirine bakmadan ilerleyebilir.

---

## Ş0.1 — Ölçü sözlüğü

**Dosya:** `apps/web/src/lib/discover/metrics.ts` (+ `metrics.test.ts`)

`lib/mentions/metrics.ts` birebir örnektir: `pxToRem`/`pxToEm`/`hairline` `lib/home/metrics.ts`'ten
yeniden ihraç edilir, sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır
yüksekliği, süre. Gölge kayıtlarındaki `alpha` bir opaklıktır; tonu tüketici
`hsl(var(--token)/alpha)` ile verir.

Kaynak sırası (nihai otorite yukarıdan aşağı):

1. `design_handoff/kesfet-paketi/referans/Kesfet-5B.dc.html` — inline `style` değeri
2. `design_handoff/kesfet-paketi/referans/Kesfet-referans.html`
3. `design_handoff/kesfet-paketi/SPEC-KESFET.md`

`SPEC_DEVIATIONS` dizisi SPEC ile HTML arasındaki her **sayısal** farkı kanıt olarak kaydeder
(`{ field, html, spec }`). SPEC'in sessiz kaldığı yer bir çelişki değildir; sözlükte
`// SPEC sessiz` yorumuyla işaretlenir.

Sözlüğün üst düzey blokları:

```
shell        radius 26, borderWidth 1, shadow { y 40, blur 100, spread -55, alpha .85 }
columns      rail 74, nav 228, directory 276, panel 326   // ilk ikisi yalnız referans, çizilmez
sidebar      header{padX 16,padTop 16,padBottom 12}, title{700,22,display,-.02em},
             totalPill{minW 22,h 20,r 7}, search{h 36,r 11,iconSize 15,clear 20},
             sectionLabel{600,10.5,display,.15em}, categoryRow{padY 9,padX 10,r 12,gap 10},
             categoryTile{28,r 9,600,11}, categoryPill{minW 20,h 20,r 7,600,11},
             sortRow{padY 8,padX 10,r 12,dot 8,dotMargin 10},
             inviteCard{padY 14,padX 16,titleSize 12.5,bodySize 11.5,bodyLine 1.45,button{h 34,r 11}}
feedHeader   padY 15, padX 24, gap 14, titleBlock{flexBasis 170},
             title{600,16.5,1.2,display}, sub{500,12,1,body},
             laneGroup{pad 4,r 13}, laneTab{h 33,padX 13,r 10,600,12.5},
             laneCount{minW 17,h 17,r 6,600,10}, iconButton{34,gap 5}
featured     gap 16, marginBottom 18, padY 17, padX 18, r 20,
             tile{60,r 20,600,22,shadow{y 12,blur 26,spread -14}},
             textCol{flexBasis 260}, badge{padY 3,padX 9,r 999,600,10,.04em},
             name{600,18,1.25}, body{13,1.55,maxWidth 520},
             metaPill{padY 4,padX 10,r 999,600,11}, ctaCol{width 146,button{h 38,r 12}}
sectionHead  padTop 2, padBottom 11, gap 11, label{600,10.5,display,.14em}
serverCard   gridMin 262, gridMinLarge 330, gap 12, r 18,
             band 46, tile{44,r 14,marginTop -19,ring 3,600,15},
             name{600,14.5,1.25}, meta{500,11,dot 6,sep 3}, body{12.5,1.5},
             tag{r 999,600,10.5}, actionRow{marginTop 13,padTop 11,padX 14,padBottom 13},
             joinButton{h 32,r 10}, previewButton{h 32,padX 12},
             selectedStripe{width 3,inset 16}
personCard   padTop 15,padX 15,padBottom 13, r 18, avatar 44, presenceDot{12,ring 2.5},
             name{600,14}, handle{500,11.5}, mutual{padY 8,padX 10,r 11,icon 13},
             addButton{h 32}, profileButton 32
channelRow   padY 13, padX 15, r 16, tile{38,r 13,icon 17}, name{600,14},
             context{500,11.5,tile 15}, avatarStack{size 24,overlap -8,ring 2}, preview 32
eventCard    tile 42, badge, title{600,14.5}, actionRow, interestButton, detailButton
filterStrip  padY 11, padX 24
joinedBanner marginTop 14, marginX 24, padY 12, padX 14, r 14, icon 30,
             goButton{h 32}, close 28
panel        header{padTop 15,padX 16,padBottom 13}, label{600,10.5,.15em},
             categoryPill{padY 3,padX 8,r 999,600,10}, close{30,r 10},
             body{gap 14,padY 15,padX 16},
             profileBlock{pad 15,r 18,tile{54,r 17,600,19},name{600,16.5,1.25},body{12.5,1.6}},
             statGrid{cols 3,gap 8,box{padY 11,padX 12,r 14},value{600,15},label 10.5},
             channelRow{padY 8,padX 9,r 11,icon 14,name{500,12.5},count{500,11}},
             mutualRow{gap 2,padY 7,padX 8,r 12,avatar 28,dot{9,ring 2},name{500,12.5}},
             footer{cta{h 36}}
joinModal    width 496, r 22, backdropAlpha .62, shadow{y 40,blur 90,spread -40},
             header{icon 38,title{600,17},close 32},
             body{gap 15,padY 19,padX 24},
             codeField{h 42,r 12}, pasteButton 30,
             optionRow{padY 10,padX 12,r 13,tile 34,name{600,13},radio 20},
             toggle{w 44,h 26}
emptyState   icon 78, ...
errorState   icon 78, ...
transitions  base 160, searchBorder 180
```

Değerler SPEC'ten kopyalanmaz — **`Kesfet-5B.dc.html` içindeki inline `style` okunarak** yazılır.
Yukarıdaki liste kapsamı gösterir, otorite değildir.

**Test:** her blokta en az bir değer için `pxToRem` çıktısı doğrulanır; `SPEC_DEVIATIONS` boş
değilse her kaydın `field`'ı sözlükte gerçekten var olan bir yol olmalıdır.

---

## Ş0.2 — Migration ve şema

**Dosyalar:** `packages/db/prisma/schema.prisma`,
`packages/db/prisma/rebaseline-migrations/<timestamp>_discover_category_languages_channel_activity/migration.sql`

> Prisma bu depoda **yalnız** `rebaseline-migrations` klasörünü okur. Migration başka yere
> yazılırsa sessizce yok sayılır.

### 1. Kategori

```prisma
enum ServerCategory {
  OYUN
  IS
  CALISMA
  KISISEL
  DESTEK
}
```

`model Server` içine:

```prisma
  /// Keşfet dizininin tek sınıflandırma ekseni. `null` = sahibi henüz seçmedi:
  /// sunucu "Tümü"de görünür, kategori sayaçlarına girmez ve kategori
  /// filtresiyle asla eşleşmez.
  category ServerCategory?
```

İndeks:

```prisma
  /// Kategori seçili dizin sorgusu: WHERE category = ? AND discoverable AND
  /// isPublic ORDER BY memberCount DESC. Mevcut
  /// [discoverable, isPublic, memberCount] indeksi kategoriyi taşımadığı için
  /// filtre satır satır elenirdi.
  @@index([category, discoverable, isPublic, memberCount])
```

### 2. Diller

```prisma
  /// Öne çıkan bloğun "Türkçe · İngilizce" pili. `preferredLocale` tek
  /// değerdir ve bildirim/biçimlendirme dilidir; bu kolon sunucunun
  /// konuşulan dillerini sayar. BCP-47 kısa kodu, en fazla 4 giriş.
  languages String[]
```

Şekil doğrulaması (`1..8 karakter`, `≤4 giriş`, küçük harf) `@wizards/types` tarafında; kolon
düz dizidir — `tags` ile aynı desen.

### 3. Kanal hareketi rollup'u

```prisma
/// Keşfet'in "POPÜLER KANALLAR" şeridi son 24 saatteki hareketi gösterir.
/// Canlı COUNT(*) her sayfa yüklemesinde Message tablosunu tarardı; bu tablo
/// saatlik bir işle doldurulur ve şerit yalnız buradan okur.
model DiscoverChannelActivity {
  channelId    String
  windowStart  DateTime
  messageCount Int      @default(0)

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@id([channelId, windowStart])
  @@index([windowStart, messageCount])
}
```

`Channel` modeline `discoverActivity DiscoverChannelActivity[]` ters ilişkisi eklenir.

### 4. Geri doldurma

Migration **veri yazmaz**. `category` null başlar; `languages` boş dizi başlar. Rollup tablosu
boş başlar, ilk saatlik iş doldurur — şerit o ana kadar boş durumunu gösterir (hata değil).

**Test:** `pnpm --filter @wizards/db generate` sonrası `packages/types` derlenir; migration yerel
DB'de koşar ve `\d+ "Server"` çıktısında iki kolon + yeni indeks görünür.

---

## Ş0.3 — Tipler ve rota sözleşmesi

**Dosyalar:** `packages/types/src/discover-screen.ts` (+ `.test.ts`),
`packages/types/src/index.ts` (ihracat), `packages/types/src/workspace.ts` (genişletme),
`apps/web/src/lib/discover/{routes,identity,contracts}.ts` (+ testleri)

### 1. `discover-screen.ts`

SPEC §8 sözleşmesi zod ile yazılır. SPEC'in `memberCountLabel: '48,2B'` gibi **önceden
biçimlendirilmiş** alanları üründe **ham sayıya** çevrilir; biçimlendirme istemcide
`formatServerProfileCount(count, locale)` ile yapılır (bu fonksiyon zaten var,
`packages/types/src/server-profile-presentation.ts`). Sunucunun locale bilmesi gerekmez.

```ts
export const DiscoverLaneSchema = z.enum(["servers", "people", "channels", "events"]);
export const DiscoverCategoryKeySchema = z.enum([
  "all",
  "oyun",
  "is",
  "calisma",
  "kisisel",
  "destek",
]);
export const DiscoverSortKeySchema = z.enum(["popular", "online", "new"]);

export const DiscoverCategorySchema = z.object({
  count: z.number().int().nonnegative(),
  initials: z.string().length(2),
  key: DiscoverCategoryKeySchema,
  label: z.string(),
});

export const DiscoverServerSchema = z.object({
  category: DiscoverCategoryKeySchema.exclude(["all"]).nullable(),
  description: z.string(),
  featured: z.boolean(),
  iconUrl: z.string().nullable(),
  id: z.string(),
  initials: z.string().length(2),
  joined: z.boolean(),
  languages: z.array(z.string()).max(4),
  memberCount: z.number().int().nonnegative(),
  name: z.string(),
  onlineCount: z.number().int().nonnegative(),
  tags: z.array(z.string()).max(5),
});

export const DiscoverPersonSchema = z.object({
  avatarUrl: z.string().nullable(),
  handle: z.string(),
  id: z.string(),
  initials: z.string().length(2),
  /** K5: ortak sunucu tags'lerinden türetilir, kullanıcı profilinden değil. */
  interestTags: z.array(z.string()).max(2),
  /** "3 ortak sunucu · Whispr Topluluğu" — istemcide interpolasyonla kurulur. */
  mutualServerCount: z.number().int().nonnegative(),
  mutualServerName: z.string().nullable(),
  name: z.string(),
  presence: z.enum(["online", "idle", "offline"]),
  requestSent: z.boolean(),
});

export const DiscoverChannelSchema = z.object({
  activityLabel: z.enum(["busy", "live", "weekly", "open", "new", "official"]),
  /** Son 24 saatteki mesaj sayısı; rollup'tan gelir, canlı sayım değil. */
  dailyMessageCount: z.number().int().nonnegative(),
  id: z.string(),
  memberPreview: z.array(z.object({ id: z.string(), initials: z.string().length(2) })).max(3),
  name: z.string(),
  serverCategory: DiscoverCategoryKeySchema.exclude(["all"]).nullable(),
  serverId: z.string(),
  serverName: z.string(),
});

export const DiscoverEventSchema = z.object({
  durationLabel: z.string(),
  entityType: z.enum(["STAGE", "VOICE", "EXTERNAL"]),
  id: z.string(),
  interested: z.boolean(),
  interestedCount: z.number().int().nonnegative(),
  locationLabel: z.string(),
  name: z.string(),
  scheduledStartAt: z.string().datetime(),
  serverId: z.string(),
});

export const DiscoverQuerySchema = z.object({
  category: DiscoverCategoryKeySchema.default("all"),
  cursor: z.string().optional(),
  lane: DiscoverLaneSchema.default("servers"),
  q: z.string().trim().max(80).optional(),
  sort: DiscoverSortKeySchema.default("popular"),
});
```

Sayfa zarfları: `Discover<X>PageSchema = { items, nextCursor: string | null }`.
Sunucu sayfası ayrıca `categories: DiscoverCategory[]` ve `featured: DiscoverServer | null`
taşır (§Ş1).

`activityLabel` bir **enum**, serbest metin değil: `Yoğun/Canlı/Haftalık/Açık/Yeni/Resmî`
karşılıkları i18n'de durur, sunucu sınıf döndürür.

### 2. `workspace.ts` genişletmesi (K3)

```ts
export const ServerPublicProfileFriendSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  /** Keşfet paneli §5.4 rol pili. Sahip de "Yönetici" sayılır. */
  role: z.enum(["admin", "member"]),
  presence: z.enum(["online", "idle", "offline"]),
});
```

`ServerPublicProfileSchema`'ya:

```ts
  /** Panel §5.2 "{n} Sesli oda" kutusu. voiceActiveCount ile karıştırılmaz:
   *  o anlık konuşan kişi sayısıdır, bu oda sayısıdır. */
  voiceRoomCount: z.number().int().nonnegative(),
  category: DiscoverCategoryKeySchema.exclude(["all"]).nullable(),
  languages: z.array(z.string()).max(4),
```

> **Uyarı:** `ServerPublicProfile` sunucu profili kartında da kullanılıyor
> (`components/servers/server-profile-card.tsx`). Alan **eklemek** güvenlidir, alan
> yeniden adlandırmak değildir. `role`/`presence` zorunlu alan olarak eklendiği için profil ucunu
> üreten `route-logic.ts` aynı şeritte (Ş3) güncellenir — Ş0 yalnız şemayı donduramaz, tip hatası
> bırakır. Bu yüzden Ş0.3 şema değişikliğini yaparken üreteci de **geçici olarak** `role:"member"`,
> `presence:"offline"` ile doldurur ve `TODO(Ş3):` bırakır.

### 3. `lib/discover/routes.ts`

```ts
export type DiscoverRouteState = {
  category: DiscoverCategoryKey;
  lane: DiscoverLane;
  modal: "join" | null;
  panelServerId: string | null;
  q: string;
  sort: DiscoverSortKey;
};

export function parseDiscoverRoute(params: URLSearchParams): DiscoverRouteState;
export function buildDiscoverHref(
  state: Partial<DiscoverRouteState>,
  base?: DiscoverRouteState,
): string;
```

Kurallar: bilinmeyen değer varsayılana düşer (hata değil) · varsayılan değerler URL'e **yazılmaz**
(`/discover` temiz kalır) · `q` trim'lenir, boşsa düşer · `panel` ve `modal` aynı anda
bulunabilir ama `Esc` **önce modalı** kapatır (SPEC §7).

### 4. `lib/discover/identity.ts`

```ts
/** SPEC tile metni iki harftir; shortName 4 karaktere kadar çıkabilir ve null olabilir. */
export function toDiscoverInitials(name: string, shortName: string | null): string;
/** ServerCategory <-> CategoryKey; null kategori 'all' değildir, null'dır. */
export function toCategoryKey(category: ServerCategory | null): DiscoverCategoryKey | null;
export function toServerCategory(key: DiscoverCategoryKey): ServerCategory | null;
```

Türkçe büyük harf: `toLocaleUpperCase("tr")` — `istanbul → İSTANBUL`, `ırmak → IRMAK`.
Test tablosu: `Oyun Kulübü Türkiye → OK`, `Sessiz Çalışma Odası → SÇ`, `Ürün Yönetimi → ÜY`,
`Indie Oyun Geliştirme → IG`, tek kelime `Whispr → WH`, `shortName="WSPR" → WS`.

### 5. `lib/discover/contracts.ts`

Kategori dizisi (sıra bağlayıcı: SPEC §3.1 tablosu), her kaydın tonu ve iki harfi:

```ts
export const DISCOVER_CATEGORIES = [
  { key: "all", initials: "TÜ", tone: "primary" },
  { key: "oyun", initials: "OY", tone: "warning" },
  { key: "is", initials: "İŞ", tone: "info" },
  { key: "calisma", initials: "ÇA", tone: "success" },
  { key: "kisisel", initials: "Kİ", tone: "primary" },
  { key: "destek", initials: "DE", tone: "danger" },
] as const;

export const DISCOVER_SORTS = [
  { key: "popular", tone: "primary" },
  { key: "online", tone: "success" },
  { key: "new", tone: "warning" },
] as const;
```

`tone` bir **token adıdır**, renk değil. Tüketici `hsl(var(--${tone}))` kurar.

---

## Ş0.4 — i18n

**Dosyalar:** `apps/web/src/lib/locale/messages/tr.ts`, `.../en.ts`,
`apps/web/src/lib/locale/discover-screen-copy.test.ts`

### 1. Eski anahtar tasfiyesi (K8)

Bugünkü `discover.*` bloğu eski ekrana ait. Karar:

| Anahtar                                                                                                                                                       | Yapılacak                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `discover.title`                                                                                                                                              | **değeri değişir**: `"Sunucuları Keşfet"` → `"Keşfet"` (SPEC §10) |
| `discover.subtitle`, `discover.searchLabel`, `discover.emptyState.*`, `discover.emptySearch.*`, `discover.loadingMore`, `discover.online`, `discover.members` | **silinir** — yeni sözlükteki karşılıkları gelir                  |
| `discover.searchPlaceholder`                                                                                                                                  | **silinir**, yerine `discover.search.placeholder`                 |
| `discover.joining`, `discover.joinError.*`                                                                                                                    | **kalır** — katılma hata yolları hâlâ geçerli                     |

Silinen anahtarın hiçbir tüketicisi kalmadığı `grep` ile kanıtlanır (eski ekran Ş8'de silinene
kadar geçici olarak durur → **anahtarlar Ş8'de silinir, Ş0 yalnız yenilerini ekler ve
`discover.title` değerini düzeltir**).

### 2. Yeni anahtarlar

SPEC §10 listesi **eksiksiz** yazılır, ayrıca SPEC'in gövdesinde geçen ve §10'da olmayan her metin
de anahtarlanır. Tam liste (TR değeri birebir SPEC metni):

```
discover.title                       Keşfet
discover.search.placeholder          Sunucu, kişi veya kanal ara
discover.search.clear                Aramayı temizle                    (aria-label)
discover.categories                  Kategoriler
discover.category.all                Tümü
discover.category.oyun               Oyun
discover.category.is                 İş
discover.category.calisma            Çalışma
discover.category.kisisel            Kişisel
discover.category.destek             Destek
discover.sort                        Sırala
discover.sort.popular                Popüler
discover.sort.online                 En çok çevrimiçi
discover.sort.new                    Yeni eklenenler
discover.invite.title                Davet kodun var mı?
discover.invite.body                 Özel sunuculara kodla katılabilirsin.
discover.invite.cta                  Kodla katıl
discover.lanes.servers               Sunucular
discover.lanes.people                Kişiler
discover.lanes.channels              Kanallar
discover.lanes.events                Etkinlikler
discover.header.title                Keşfet
discover.header.searchResults        Arama sonuçları
discover.header.sub                  {count} sunucu · 6 kategori · {sort} sıralı
discover.header.sub.empty            0 sonuç · Dizinde eşleşme yok · filtreleri temizleyebilirsin
discover.header.sub.error            Bağlantı yok · Dizin eşitlemesi {time}'de kesildi · kendi sunucuların etkilenmedi
discover.header.joinServer           Sunucuya katıl                     (aria-label)
discover.header.cardSize             Kart boyutu                        (aria-label)
discover.featured                    Öne çıkan
discover.featured.member             Zaten üyesin
discover.section.servers             TOPLULUK SUNUCULARI
discover.section.servers.note.popular   Popülerlik sırasına göre
discover.section.servers.note.category  {category} kategorisi
discover.section.servers.note.search    “{q}” için eşleşenler
discover.section.people              KİŞİ ÖNERİLERİ
discover.section.people.note         Ortak sunucu ve ilgi alanına göre
discover.section.channels            POPÜLER KANALLAR
discover.section.channels.note       Son 24 saatteki hareketliliğe göre
discover.section.events              HERKESE AÇIK ETKİNLİKLER
discover.section.events.note         Sunucu üyeliği gerekmez
discover.footnote.servers            Dizin her saat güncellenir · yalnızca herkese açık sunucular listelenir
discover.footnote.other              Öneriler ortak sunucu ve ilgi alanına göre hesaplanır
discover.card.join                   Katıl
discover.card.joined                 Katıldın
discover.card.preview                Önizle
discover.card.online                 {count} çevrimiçi
discover.card.members                {count} üye
discover.person.add                  Arkadaş ekle
discover.person.requested            İstek gönderildi
discover.person.openProfile          Profili aç                         (aria-label)
discover.person.mutualServers        {count} ortak sunucu · {server}
discover.channel.activity.busy       Yoğun
discover.channel.activity.live       Canlı
discover.channel.activity.weekly     Haftalık
discover.channel.activity.open       Açık
discover.channel.activity.new        Yeni
discover.channel.activity.official   Resmî
discover.channel.context             {server} · {detail}
discover.event.interested            İlgileniyorum
discover.event.detail                Detay
discover.event.interestedCount       {count} kişi ilgileniyor
discover.profile.label               Sunucu profili
discover.profile.close               Paneli kapat                       (aria-label)
discover.profile.stats.channels      Kanal
discover.profile.stats.voiceRooms    Sesli oda
discover.profile.stats.founded       Kuruluş
discover.profile.channels            Kanallar
discover.profile.mutuals             Tanıdıkların
discover.profile.mutuals.note        Ortak sunucularından tanıdığın kişiler burada da üye.
discover.profile.role.admin          Yönetici
discover.profile.role.member         Üye
discover.profile.join                Sunucuya katıl
discover.profile.leave               Sunucudan ayrıl
discover.profile.share               Paylaş
discover.join.title                  Sunucuya katıl
discover.join.subtitle               Davet kodu, bağlantı ya da dizinden seçim
discover.join.codeLabel              Davet kodu veya bağlantı
discover.join.codePlaceholder        davet-kodu
discover.join.paste                  Yapıştır
discover.join.codeHelp               Davetler bir kez kullanılabilir ya da süreli olabilir; sunucu sahibi belirler.
discover.join.orFromIndex            veya dizinden
discover.join.optionMeta             {count} üye · {category}
discover.join.visibility             Katıldığımı arkadaşlarım görsün
discover.join.visibilityHelp         Profilinde ortak sunucu olarak listelenir
discover.join.terms                  Topluluk kurallarını kabul etmiş olursun
discover.join.cancel                 İptal
discover.join.submit                 Katıl
discover.joined.banner               {server} sunucusuna katıldın
discover.joined.detail               Sunucu rayına ve Sunucularım listesine eklendi · hoş geldin kanalı açıldı
discover.joined.go                   Sunucuya git
discover.joined.dismiss              Kapat                              (aria-label)
discover.new                         Yeni
discover.empty.title                 Sonuç bulunamadı
discover.empty.body                  “{q}” için dizinde eşleşme yok. Yazımı kontrol edebilir, kategori filtresini kaldırabilir ya da davet kodun varsa doğrudan katılabilirsin.
discover.empty.clearFilters          Filtreleri temizle
discover.empty.enterCode             Davet kodu gir
discover.error.title                 Dizin yüklenemedi
discover.error.body                  Topluluk dizinine şu anda ulaşılamıyor. Kendi sunucularını kullanmaya devam edebilirsin; davet bağlantıları ve kodlar bu hatadan etkilenmez.
discover.error.retry                 Yeniden dene
discover.error.code                  Hata kodu: {code} · son deneme {time}
```

`discover.header.sub` içindeki `{sort}` değeri `popüler` / `çevrimiçi` / `yeni` küçük harfli
biçimlerdir; ayrı anahtarlar (`discover.header.sortWord.*`).

### 3. Kopya testi

`discover-screen-copy.test.ts`, `mentions-screen-copy.test.ts` desenini izler: her anahtarın TR
değeri **sabit dizgi** olarak test dosyasında yazılıdır (SPEC dosyası okunmaz) ve
`tr[key] === expected` doğrulanır. Ayrıca:

- Her TR anahtarının bir EN karşılığı olduğu,
- Hiçbir TR değerinde düz `"` veya `'` bulunmadığı (Türkçe tırnak/kesme zorunlu),
- İnterpolasyon yer tutucularının TR ve EN'de **aynı küme** olduğu

doğrulanır.

---

## Kapı çıktısı

Ş0 raporu `docs/prompts/whispr-kesfet/raporlar/01-dalga0-rapor.md` altına yazılır ve şunları
içerir: `SPEC_DEVIATIONS` tam listesi · migration SQL'i ve yerel koşum çıktısı ·
`ServerPublicProfile` genişlemesinin kırdığı çağrı yerleri ve nasıl geçici doldurulduğu ·
i18n'de SPEC §10 dışında eklenen anahtarların gerekçesi.
