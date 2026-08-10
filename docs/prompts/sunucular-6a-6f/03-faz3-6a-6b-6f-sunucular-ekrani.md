# Faz 3 — 6a + 6b + 6f: Sunucular ekranı v2

> Önce `00-ortak-baglam.md` oku. Branch `uat`. caveman ultra. Kararsız kalırsan sor. Cihaz testini kullanıcı yapar. İzinsiz commit yok.

**Ön koşul:** Faz 2 landed, `02-rapor.md` okundu (token anahtarları + saf model imzaları buradan).
**Tasarım:** HTML `35–108` (6a), `111–172` (6b), `324–366` (6f). PROMPT.md `305–350`, `419–433`.
**Hedef:** başlıktaki beş butonu ikiye indir, uzun ad sorununu kapat, kategori `+`'sını sil, filtre şeridini ve etiketli FAB'ı getir.

---

## A. Bilgi mimarisi değişikliği (PROMPT.md §6.0)

| Aksiyon         | Eski yeri                                                                             | Yeni yeri                           |
| --------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| Ara             | header ikonu                                                                          | header ikonu (kalıyor)              |
| Sunucu bilgisi  | header ikonu (`workspace-browser.tsx:653–677`)                                        | **"⋯" menüsü** (Faz 4)              |
| Üye davet et    | header ikonu (`678–698`)                                                              | **"⋯" hızlı aksiyon** (Faz 4)       |
| Sunucu ayarları | header ikonu (`701–725`)                                                              | **"⋯" liste satırı** (Faz 4)        |
| Kanal oluştur   | header `+` (`726–740`) **ve** kategori `+` (`workspace-channel-section-list.tsx:146`) | **tek "+ Kanal" FAB**               |
| Sunucu değiştir | ad + chevron                                                                          | ad + chevron (değişmedi → 1c sheet) |

> Faz 4 henüz yok. Bu fazda "⋯" butonu **render edilir** ve geçici olarak Faz 4'te dolacak bir sheet'i açar. Sheet'in Faz 3'teki asgari hâli: kimlik satırı + `Sunucu bilgisi` / `Üyeler` / `Sunucu ayarları` / `Sunucudan ayrıl` satırları — yani **kaldırılan üç header butonunun hepsi erişilebilir kalır**. Faz 4 bunun üstüne 6c'nin tam hâlini kurar. Erişimi bir faz boyunca düşürmek yasak.

---

## A0. Faz 1/2 borçları — bu fazda kapanır

Faz 1 ve Faz 2 denetiminde bulundu, doğrulandı, henüz uygulanmadı. **B'ye geçmeden önce bunlar kapanır** — hepsi 6a/6b'nin doğrudan performans veya doğruluk yolunda.

### A0.1 — `filterMobileWorkspaceSections` boş yolda dizi tahsis ediyor

`apps/mobile/src/app/mobile-sunucular-model.ts:328` — `filter === "all"` iken `return [...sections]`. "Tümü" varsayılan ve en sık durum; Sunucular ana sekme ve her presence tick'inde yeniden render oluyor. Her render yeni dizi referansı = FlashList'in bail-out'u ölür.

- Dönüş tipini `readonly TSection[]` yap, `all` yolunda **girdiyi olduğu gibi** döndür.
- Faz 3 çağrıyı `useMemo(..., [sections, filter, liveVoiceChannelIds])` içine alır.

### A0.2 — Canlı ses Set'i render başına iki kez kuruluyor

`collectLiveVoiceChannelIds` hem `filterMobileWorkspaceSections` hem `hasMobileWorkspaceLiveVoice` içinde çalışıyor (`:332`, `:364`).

- İkisine de hazır `ReadonlySet<string>` kabul eden bir imza ver (mevcut `voiceStates` imzası geriye dönük kalabilir).
- Ekran Set'i bir kez `useMemo` ile kurar, ikisine de geçer.
- `getMobileWorkspaceUnreadChannelCount` de filtre şeridi için her render'da tüm kanalları geziyor — o da memoize edilir.

### A0.3 — Profil kanal listesinde kategori sırası yanlış

`SERVER_PUBLIC_PROFILE_SELECT` (`apps/web/src/lib/servers/server-public-profile-service.ts:51`) kanalları **yalnız `channel.position`** ile sıralıyor. `ChannelCategory.position` (`schema.prisma:1089`) hiç uygulanmıyor — workspace servisi (`server-service.ts:566`) doğru yapıyor, profil servisi yapmıyor.

Sonuç: `groupMobileProfileChannelsByCategory`'nin "ilk görülme = tasarımın sırası" yorumu (`mobile-sunucular-model.ts:540`) **yanlış**. Kategori pozisyonları kanal pozisyonlarıyla aynı yönde artmıyorsa 6e kategori sırası bozulur.

- Düzeltme tek satır: `orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { id: "asc" }]`.
- Model yorumu düzeltilir; sıralamayı doğrulayan bir test eklenir (iki kategori, kanal pozisyonları ters yönde).
- Şema değişikliği **gerekmiyor**.

### A0.4 — Yönetici presence'ı `onlineCount` ile çelişiyor

`onlineCount` Redis `SCARD server:<id>:online`'dan (`:530`), yönetici `presence` `AppSession.lastSeenAt` 2 dk penceresinden (`:435`). Aynı ekranda "3 çevrimiçi" + tüm yöneticiler çevrimdışı mümkün.

- `ServerOnlinePresenceRedis` tipine `smismember` ekle (compose + CI Redis 8.8; komut 6.2+).
- `presence` boolean'ı Redis'ten gelir; `appSession.groupBy` **kalır** — 6e'nin "2 saat önce" metni ondan.
- `getOnlineServerMemberCount` ile aynı fail-open: Redis `ready` değilse ikisi de sıfır/çevrimdışı. Tutarlı şekilde bozuk, çelişkili değil.
- DB sorgu bütçesi değişmez (5/7); bütçe testi (`server-public-profile-service.test.ts:621`) yeşil kalmalı.

### A0.5 — Haftalık mesaj sayısında single-flight yok

`getServerWeeklyMessageCount` 5 dk TTL ile cache'li ama soğuk yolda kilit yok: kalabalık sunucuda her 5 dakikada bir yavaş istek, eşzamanlı açılışta thundering herd. `message.count` profil rotasındaki **tek** veri hacmiyle ölçeklenen sorgu.

- `SET key NX` kilidi veya stale-while-revalidate: bir istek hesaplar, kalanlar bayat sayıyı alır.
- TTL 5 → 15 dk ("Bu hafta" yavaş hareket eden istatistik).
- Uzun vade borç olarak rapora yaz: ham `Message` yerine günlük rollup'tan türetme.

---

## A1. Sunucu geneli mesaj araması (kullanıcı kararı, 2026-08-10)

6b placeholder'ı **"Kanallarda ve mesajlarda ara"** olacak, yani arama gerçekten mesaj içeriğini kapsayacak. Bugün yok: `searchChannelMessages` (`apps/web/src/lib/messages/search-service.ts:193`) `WHERE m."channelId" = $1` ile **tek kanala** bağlı. `Message.content_search` GIN tsvector indeksi hazır (`20260725000000_uat_schema_baseline/migration.sql:1579`).

1. **Servis**: `searchServerMessages` — aynı dosya, `searchChannelMessages`'ın kardeşi. `WHERE c."serverId" = $1 AND m."channelId" = ANY($2)` + `content_search @@ websearch_to_tsquery(...)`. Kanal listesi **görüntüleyenin `VIEW_CHANNEL` izniyle** süzülür; izin filtresi ikinci kez yazılmaz, `assertChannelSearchAccess`'in dayandığı yardımcı yeniden kullanılır. Keyset sayfalama, `take` sınırlı.
2. **Rota**: `GET /api/v1/mobile/servers/[serverId]/messages/search` — action `mobile:server:messages:search`, budget kardeş arama uçlarıyla aynı. 00 §4.1: `route-contract.test.ts` `EXPECTED_RATE_LIMIT_ACTIONS` + `api-rate-limit.ts` kaydı zorunlu. Web ikizi (`/api/v1/servers/[serverId]/messages/search`) da açılır.
3. **İstemci + query**: mobil istemci fonksiyonu + `mobile-query-keys.ts` anahtarı, debounce'lu (min 2 karakter, mevcut arama debounce kalıbı).
4. **UI**: arama kutusuna yazınca liste iki bölüme ayrılır — **KANALLAR** (ad eşleşmesi, mevcut yerel filtre) ve **MESAJLAR** (yeni uç). Mesaj satırı: kanal adı + yazar + tek satır önizleme + zaman; dokunma mesaja gider. Sonuç yoksa boş durum.
5. **Kopya kararı**: `workspaceChannelSearchPlaceholderExpanded` **kalır ve tek anahtar olur**; 6a (toggle'la açılan alan) ve 6b (kalıcı kutu) ikisi de onu okur. Eski `workspaceChannelSearchPlaceholder` **silinir** — iki anahtarlı durum bu fazda kapanır, kalıcı olmaz.

> **Not (borç, bu fazda çözülmez):** tsvector `to_tsvector('english', ...)` ile üretiliyor — Türkçe gövdeleme yanlış. Mevcut kanal-içi aramayı da aynı şekilde etkiliyor, bu paketin işi değil. Rapora yaz.

---

## B. 6a — Sol rail görünümü

### B1 — Rail (62 px)

- Avatar `42×42` r15, dikey aralık `11`, kapsayıcı `padding: 12px 0`, dikey scroll.
- Rozet mantığı 1a ile aynı: bahsetme → kırmızı sayaç (`minWidth 17, h17, r9, #E5484D`, `2px #F6F7FB` kenarlık, `9.5/800 #fff`); okunmamış → primary nokta (`11×11`, `2px #F6F7FB` kenarlık).
- Aktif sunucu: solda `4×28` bar, sağ köşeler `3`, `#4F46E5`, avatarın `left: -9`; avatar halkası `0 0 0 2px #F6F7FB, 0 0 0 4px #4F46E5` (RN'de iki katmanlı `borderWidth` veya iki sarmalayıcı `View` — gölge ile taklit etme, kenar keskin olmalı).
- Liste sonunda `26×1 #DEE1EF` ayraç, ardından kesikli `+` (`42×42 r15`, `1.5px dashed #C9CDE4`, beyaz zemin, ikon `16` stroke `#6B7194` 2.2) → 1c "Katıl / Kur".
- Sıralama `sortMobileServersByStar` (Faz 2 B3) — yıldızlılar üstte. Faz 4 yıldızlamayı açacak; sıralama şimdiden bağlanır.

### B2 — Başlık bloğu (rail sağı, `paddingRight: 14`)

**Ad satırı** — `padding: 6px 0 2px`, `alignItems: "flex-start"`, `gap: 8`:

- Ad sarmalayıcısı: `flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 6`.
- Ad: `getMobileServerNameLayout(name, "header")` → `19/800`, `lineHeight 22.4`, `letterSpacing -0.19`, `numberOfLines={2}`, `ellipsizeMode="tail"`.
- Chevron `14` stroke `#6B7194` 2.4, `marginTop: 5`, `flex: none` — **ada bitişik, sağa yaslanmaz**.
- Ad + chevron **tek dokunma hedefi** → 1c sunucu seçici sheet (mevcut `mobile-workspace-server-switcher-sheet.tsx`).
- Sağda **tam iki** buton, `flex: none`, `34×34 r12`, beyaz, `1px #E7E9F4`:
  1. **ara** — büyüteç `15` stroke `#4F46E5` 2 (`circle r6.5` + `M16 16l4 4`). Arama alanını açar (mevcut toggle davranışı korunur).
  2. **"⋯"** — üç nokta `16` fill `#4F46E5`, `r=1.9`, `cx = 5/12/19` → sunucu menüsü.

**Meta satırı** — `padding: 2px 0 9px`, `gap: 6`: `5 üye` · `7 kanal` · `● 2 seste`. Metin `11.5/600 #6B7194`, ayraç `·` `#C9CDE4`, son parça `11.5/700 #22A366` + `6×6` yeşil nokta. Sayılar canlı veriden.

**Filtre şeridi** — ray `#E9EBF5` r13 `padding: 3`, `marginBottom: 10`, üç eşit segment (`flex: 1`, `padding: 7px 0`, r10):

| Segment       | Seçili                                                     | Seçilmemiş                                                                                                             |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Tümü**      | beyaz + elevation `0 2px 6px rgba(30,34,53,.10)`, `12/800` | `12/600 #6B7194`                                                                                                       |
| **Okunmamış** | aynı                                                       | `12/600 #6B7194` + kırmızı sayaç rozeti (`minWidth 16 h16 r8 #E5484D`, `9.5/800 #fff`) — **sayı 0 ise rozet gizlenir** |
| **Sesli**     | aynı                                                       | `12/600 #6B7194` + canlı ses varsa `6×6 #22A366` nokta                                                                 |

Davranış: `filterMobileWorkspaceSections` (Faz 2 B3) listeyi filtreler. `voice` yalnız ses kanalları, **canlı olanlar üstte**. Seçim `use-mobile-workspace-filter` ile kullanıcı+sunucu başına saklanır, varsayılan `Tümü`.

### B3 — Kategori başlığı (yeni hâli)

`chevron(11) + KATEGORİ ADI + kanal sayısı`. **Sağda buton yok.**

- Açık: chevron aşağı, stroke `#8A90B0` 2.6; başlık `10.5/800 ls 1.26 #8A90B0`; sayı `10.5/700 #C0C5DC`.
- Kapalı: chevron `rotate(-90deg)` stroke `#B7BCD4`; başlık `#B7BCD4`; içinde okunmamış varsa sayının sağında `6×6 #4F46E5` nokta (`marginLeft: 2`).
- Padding: ilk başlık `0 4px 5px`, sonrakiler `11px 4px 5px`.
- **Tüm satır** dokunma hedefi = daralt/aç (mevcut `use-mobile-collapsed-sections`).
- **Uzun basma → kategori menüsü** (yeniden adlandır / sırala / sil, yalnız yetkili). Mevcut kategori düzenleme yüzeyi `mobile-workspace-editor-sheets.tsx`'te; onu bağla, yenisini yazma. Sıralama (drag) yoksa menüden çıkar ve rapora yaz.
- Boş kategori (0 kanal) listede kalır, **daima kapalı** görünür (`getMobileCategoryHeaderState`).

### B4 — Kanal satırları

1a anatomisi geçerli. `padding: 8px 10px`, r14, `gap: 10`, ikon kutusu `30×30 r10`.

| Durum              | Kural                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aktif              | zemin `#EEF0FE`, ikon kutusu beyaz (kenarsız), ad `14/800 #4F46E5`                                                                                                                                                                                                                                           |
| Okunmamış          | ad `14/800`, sağda `minWidth 18 h18 r9 #4F46E5` rozet `10/800 #fff`                                                                                                                                                                                                                                          |
| Bahsetme           | ad `14/800`, önizlemede `@kullanıcı` `#4F46E5 700`, rozet `#E5484D` `@1`                                                                                                                                                                                                                                     |
| Okunmuş            | ad `14/600 #6B7194`, önizleme `11.5 #9AA0BC`, yalnız saat                                                                                                                                                                                                                                                    |
| **Canlı ses**      | beyaz kart + `1px #D8EFE3`, `marginBottom: 4`; ikon kutusu `#E7F6EE` + `#22A366`; ad `14/700`; alt satır `Canlı · {n} kişi konuşuyor` `11/600 #22A366`; sağda katılımcı avatarları `22×22 r50%`, `2px #fff` kenar, `marginLeft: -7`, `8.5/800`; **Katıl** pill `padding 5px 10px r10 #22A366`, `11/800 #fff` |
| **Boş ses** (yeni) | zemin yok; ikon kutusu beyaz + `1px #E7E9F4`, ikon `#9AA0BC`; ad `14/600 #6B7194`; alt satır `Boş · sesli kanal` `11.5 #9AA0BC`; **Katıl butonu yok** — satıra dokunmak kanala bağlar                                                                                                                        |

Sağ sütun (zaman + rozet): `alignItems: "flex-end"`, `gap: 3`, zaman `10.5/600 #9AA0BC`.

Önizleme `showPreviews` ayarıyla kapatılabilir (mevcut davranış korunur).

### B5 — FAB

- Yalnız `isAdmin` (kanal yönetimi yetkisi). Yetkisizde **render edilmez** (disable değil).
- 6a: `right: 16`, `bottom: 100`, `height: 46`, r16, `paddingHorizontal: 16`, `gap: 7`; ikon `18` stroke `#fff` 2.4; etiket `Kanal` `13.5/800 #fff`; elevation `0 10px 24px rgba(79,70,229,.42)`.
- Dokunma → 1d "Oluştur" menüsü (`mobile-workspace-create-sheets.tsx`). **Kategori ön-seçimi yok** — kategori 1e formundan seçilir. Mevcut `categoryId` parametresi bu çağrıda `null` geçer.

---

## C. 6b — Compakt görünüm

Rail yok. Farklar:

- **Sunucu kartı** tam genişlik: `flex: 1`, beyaz, r18, `1px #E7E9F4`, elevation `0 4px 12px rgba(30,34,53,.05)`, `padding: 8px 12px 8px 8px`, `gap: 10`, kapsayıcı `padding: 8px 16px 0`, `gap: 8`.
  - Avatar `38×38 r14`; üstünde toplam okunmamış rozeti (`top: -4, right: -4`, `minWidth 16 h16 r8 #E5484D`, `2px #fff`, `8.5/800`) — diğer sunucuların toplamı (`getMobileOtherServersUnreadTotal`).
  - Ad `getMobileServerNameLayout(name, "card")` → `15.5/800`, `lineHeight 18.6`, **2 satır clamp**.
  - Alt satır `5 üye · 7 kanal · 2 seste`, `11/600 #6B7194`, son parça `#22A366 700`.
  - Sağda chevron `14` `#6B7194` 2.4.
  - **Tüm kart** → 1c sheet.
- Kartın sağında **tek** buton: `42×42 r15` beyaz + `1px #E7E9F4`, "⋯" ikon `17` fill `#4F46E5` → sunucu menüsü. **Davet ve ayarlar butonları kaldırıldı.**
- Kalıcı arama kutusu kalır: beyaz r15, `1px #E7E9F4`, `padding: 10px 14px`, `margin: 10px 16px 0`, `gap: 9`, ikon `15 #9AA0BC`, placeholder `13.5 #9AA0BC` **"Kanallarda ve mesajlarda ara"**.
  - Kapsam genişletildi: kanal adı **+ mesaj içeriği** — **A1'deki yeni sunucu geneli arama ucundan** gelir. Placeholder yalan söyleyemez.
- Filtre şeridi 6a ile birebir, `margin: 10px 16px 0`.
- Liste alanı `top: 232`, `bottom: 86`, yanlarda `16`.
- Kanal satırları: `padding: 9px 10px`, ikon kutusu `32×32 r11`, ad `14.5`. Canlı ses satırında Katıl pill `padding 6px 12px r11`, `11.5/800`; alt satır katılımcı adlarını listeler (`Canlı · aysegul_dev, dogukanyazar`).
- FAB: `right: 18`, `bottom: 104`, `height: 50`, r18, `paddingHorizontal: 18`, ikon `19`, etiket `14/800`.

---

## D. 6f — Uzun ad standardı (bağlayıcı, tüm yüzeyler)

Başlıkta ad `19/800/lh 1.18`, kullanılabilir genişlik ≈ `258px` (390 ekran, rail'li).

| Durum           | Davranış                                                               |
| --------------- | ---------------------------------------------------------------------- |
| ≤ 1 satır       | tek satır, kırpma yok                                                  |
| 2 satıra taşar  | 2 satıra sarar, **kırpma yok** — başlık bloğu büyür, liste aşağı kayar |
| 2 satırdan uzun | 2 satırda keser, sondan `…`                                            |

- Ad `flex: 1, minWidth: 0`; butonlar `flex: none`. **Bu yüzden başlıkta en fazla iki buton olabilir.**
- Chevron ada bitişik (`alignItems: "flex-start"` + `marginTop: 5`), sağa yaslanmaz.
- Diğer bağlamlar: kart/sheet `15.5–16/800`, yine 2 satır. **6e yapışkan başlık tek satır + ellipsis** (dikey alan sabit).
- **Yasak:** sabit `maxWidth` ile kısaltma, ortadan kırpma (`Mobile…Server`), ada göre punto küçültme, marquee.

Test verisi (kabul kriteri 15): `"Türkiye Mobil Uygulama Geliştiricileri ve Tasarımcıları Topluluğu Resmî Sunucusu"` — 390px ekranda iki satır, sondan `…`, butonlar kaymıyor, ad hiçbir noktada 96px'e sıkışmıyor.

---

## E. Silinecekler (kod tabanında kalmayacak)

1. `workspace-channel-section-list.tsx:146–148` kategori `+` butonu — buton, `onPress` handler'ı, `testID="mobile-workspace-section-create-*"`, ilgili prop zinciri ve bu testID'ye bakan **tüm testler**.
2. `workspace-browser.tsx` header'daki bilgi (`653–677`), davet (`678–698`), ayarlar (`701–725`) ve `+` (`726–740`) butonları.
3. Bu butonlara özel stil anahtarları (`mobileWorkspaceCompactAddButton`, `mobileWorkspaceCreateButton`) artık kullanılmıyorsa silinir; kullanılıyorsa yeniden adlandırılır.
4. `numberOfLines={1}` sunucu adı kullanımları (`606–618`).
5. `workspaceChannelSearchPlaceholder` kopya anahtarı (A1.5) — yerine `...Expanded` tek anahtar kalır.

Kabul kriteri 14: **kategori başlıklarında hiçbir `+` yok**, kanal oluşturmanın tek giriş noktası FAB.

---

## F. Yapılmayacaklar

- 6c'nin tam hâlini yazmak (Faz 4). Bu fazda menü **asgari** — dört satır, kaldırılan erişimi karşılar.
- 1c sunucu seçici sheet'ini yeniden tasarlamak — değişmiyor.
- 1d/1e formlarının içeriğini değiştirmek; yalnız kategori ön-seçimi kaldırılır.
- Kategori sürükle-bırak sıralama yazmak (tasarımın "sıradaki adımlar"ı, kapsam dışı).
- Koyu tema için ayrı ekran yazmak — token grubu Faz 2'de iki varyantlı, ekran tek.
- Kanal satırı uzun basma menüsünü değiştirmek (mevcut davranış korunur).

---

## G. Kapı

A0 ve A1 backend'e dokunduğu için web/types kapıları da koşar.

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

`apps/mobile` dizininden (tam süit — Faz 2 taban çizgisi 130 süit / 1182 test):

```bash
npx jest
```

Kabul (kod ile doğrulanır, göz kararı değil):

0. **A0 kapandı:** `filter === "all"` yolunda yeni dizi tahsisi yok (referans eşitliği testle iddia edilir); canlı ses Set'i render başına bir kez; profil sorgusu kategori pozisyonuyla sıralı (ters pozisyonlu iki kategoriyle test); yönetici presence'ı Redis'ten, sorgu bütçesi hâlâ 5/7; haftalık sayımda single-flight var.
   0b. **A1 kapandı:** sunucu geneli arama ucu izin filtreli, `route-contract` yeşil, mobil arama iki bölümlü sonuç veriyor, eski placeholder anahtarı repoda yok.

1. Repo genelinde `mobile-workspace-section-create` araması **sıfır** sonuç.
2. Başlık satırında render edilen buton sayısı **≤ 2** — testle iddia edilir (rail ve compact ayrı ayrı).
3. Uzun ad testi: iki satır + `…`, buton konumu değişmiyor.
4. Filtre şeridi üç modu doğru filtreliyor; okunmamış rozeti canlı sayıdan; seçim yeniden mount sonrası korunuyor.
5. Yetkisiz kullanıcıda FAB **render edilmiyor** (query ile yok, `disabled` değil).
6. Kapalı kategori döndürülmüş chevron + soluk başlık + (varsa) primary nokta; boş kategori listede ve kapalı.
7. Boş ses kanalı satırında Katıl butonu yok; dokunma kanala bağlanıyor.

> RNTL 14: `render()` ve `fireEvent.*` **await** edilir (00 §4.5).

## H. Rapor

`docs/prompts/sunucular-6a-6f/raporlar/03-rapor.md` — 00 §8. Ek olarak:

- Silinen buton/handler/test listesi (kabul kriteri 14/16 kanıtı).
- "Mesajlarda ara" kapsamının gerçekten karşılanıp karşılanmadığı; karşılanmıyorsa hangi karar alındı.
- Kategori uzun-basma menüsünde hangi maddeler var, hangileri yok.
- Cihaz test listesi: uzun adlı sunucu, 0 okunmamış, yalnız ses kanallı sunucu, yetkisiz hesap, koyu tema.
