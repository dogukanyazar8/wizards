# 00 — Ortak bağlam (okunur, uygulanmaz)

Her şerit bu dosyayı **kendi faz dosyasından önce** okur. Burada yazan hiçbir madde şeritte
yeniden tartışılmaz.

---

## 1. Kapsam sınırı

**Geliştirilecek:** 276 px dizin kolonu · akış başlığı · 4 şerit · öne çıkan blok · 4 kart dili ·
326 px sunucu profili paneli · 496 px katıl modalı · filtre şeridi · katılım onay şeridi · boş
durum · hata durumu.

**Dokunulmaz:** sol sunucu rayı (74), Whispr logosu altındaki gezinme paneli (228), sol alttaki
kullanıcı barı. Diff'in bu üç bileşene değen tek yeri:

- `Keşfet` satırının bu rotada aktif olması (zaten `app-nav-panel.tsx` içinde `/discover`
  satırı var — yeni satır eklenmiyor, aktiflik kuralı doğrulanıyor).
- Katılınca sunucu rayına ve `Sunucularım` listesine `Yeni` etiketli satırın eklenmesi
  (SPEC §2 ölçüleri). Bu iki liste `workspaceQueryKeys.servers` sorgusundan beslenir; Keşfet
  yalnızca mutasyonu tetikler ve sorguyu geçersiz kılar.

---

## 2. Doğrulanmış gerçekler (kod tabanından okundu, tahmin değil)

### 2.1 Rota ve kabuk

| Gerçek                                                                | Kanıt                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/discover` rotası var, tek satır: `<ServerDiscoveryScreen />`        | `apps/web/src/app/(main)/discover/page.tsx`                                                                 |
| Eski ekran 250 satır, tek ızgara, kategori/şerit/panel yok            | `apps/web/src/components/servers/server-discovery-screen.tsx`                                               |
| `selectThirdColumn('/discover')` bugün **`null`** döndürüyor          | `apps/web/src/lib/home/third-column.ts` — dosya başındaki yorum `/discover`'ı açıkça `null` dalında sayıyor |
| 3. kolon genişliği CSS değişkeni ile geliyor: `--third-column-width`  | `wizards-shell.tsx:1165`                                                                                    |
| `messages` ve `mentions` rayları da 276 px                            | `third-column.ts` yorumu + `MENTIONS_METRICS.shell`                                                         |
| Gezinme panelinde `/discover` satırı zaten var (`Compass` ikonu)      | `app-nav-panel.tsx:57`                                                                                      |
| Kabukta mobil drawer makinesi var (`isMobile`, `MobileDrawerTrigger`) | `wizards-shell.tsx:254,368,395`, `server-rail.tsx`                                                          |
| Sunucu listesi sorgu anahtarı `["workspace","servers"]`               | `lib/workspace/client.ts:52`                                                                                |

### 2.2 Veri katmanı

| Gerçek                                                                                                                                         | Kanıt                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sunucu dizini servisi **var ve optimize**                                                                                                      | `lib/servers/server-discovery-service.ts` — keyset imleç (`f\|memberCount\|id`), iki fazlı featured/rest okuma, `EXPLAIN` gerekçeleri yorumda |
| İndeksler hazır: `[discoverable,isPublic,memberCount]` ve `tags` GIN                                                                           | `packages/db/prisma/schema.prisma` `model Server`                                                                                             |
| `Server` alanları: `shortName` (≤4), `tags[]`, `features[]`, `memberCount`, `discoverable`, `isPublic`, `type`, `createdAt`, `preferredLocale` | aynı model                                                                                                                                    |
| `Server`'da **kategori kolonu yok**                                                                                                            | aynı model                                                                                                                                    |
| `SERVER_DISCOVERY_FEATURED_FLAG = "FEATURED"` (features dizisinde)                                                                             | `server-discovery-service.ts`                                                                                                                 |
| `ServerPublicProfile` şeması kanalları, tanıdıkları, `createdAt`, online/üye, tags, `joined`, `voiceActiveCount` taşıyor                       | `packages/types/src/workspace.ts`                                                                                                             |
| `ServerPublicProfileFriendSchema` **yalnız** `{id, displayName, avatarUrl}` — rol ve presence **yok**                                          | aynı dosya                                                                                                                                    |
| Sesli oda **sayısı** yok; `voiceActiveCount` aktif kişi sayısıdır                                                                              | aynı dosya                                                                                                                                    |
| `POST /api/v1/servers/[serverId]/join` var                                                                                                     | `app/api/v1/servers/[serverId]/join/route.ts`                                                                                                 |
| `POST /api/v1/servers/join` (davet kodu) var                                                                                                   | `app/api/v1/servers/join/route.ts`                                                                                                            |
| `DELETE /api/v1/servers/[serverId]/members/me` (ayrıl) var                                                                                     | `app/api/v1/servers/[serverId]/members/me/route.ts`                                                                                           |
| `GET /api/v1/friends/suggestions` var, `listFriendSuggestions(userId)`                                                                         | `app/api/v1/friends/suggestions/route.ts`                                                                                                     |
| `ScheduledEvent` + `ScheduledEventInterest` + `interestedCount` **var**                                                                        | `schema.prisma` — "İlgileniyorum" ve "{n} kişi ilgileniyor" gerçek veriyle çalışır                                                            |
| Herkese açık **kanal** keşfi ucu **hiç yok**                                                                                                   | `app/api/v1/**` taraması                                                                                                                      |
| Hız sınırı anahtarları: `server:discover` 240/60sn, `friend:suggestions` **30/60sn**                                                           | `lib/api-rate-limit.ts:119,307`                                                                                                               |

### 2.3 Tasarım sistemi

| Gerçek                                                                            | Kanıt                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--info: 199 89% 48%` **zaten tanımlı** — SPEC'in istediği değerin birebir aynısı | `app/globals.css:37`. **Yeni token üretilmeyecek.**                                    |
| `--info-readable` tema başına ayrı ezilmiş                                        | `globals.css:57,199,209,245`                                                           |
| Tema `<html>` üzerinde `theme-light` / `theme-dark` sınıflarıyla                  | `globals.css:70,135`                                                                   |
| Ölçü sözlüğü deseni hazır: `pxToRem`, `pxToEm`, `hairline`                        | `lib/home/metrics.ts:20,32,40`; `lib/mentions/metrics.ts` bunları yeniden ihraç ediyor |
| Kopya testi deseni hazır                                                          | `lib/locale/mentions-screen-copy.test.ts`, `messages-screen-copy.test.ts`              |
| i18n anahtarları **düz string** (`"discover.title"`), iç içe nesne değil          | `lib/locale/messages/tr.ts:2885`                                                       |

### 2.4 Bileşen envanteri — SPEC §11 ile **çelişen** üç madde

SPEC §11 `Button` ve `FriendCard` kullanılmasını söylüyor. İkisi de **yok**:

| SPEC diyor   | Gerçek                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `components/ui/button.tsx` **yok**. Ekranlar token sınıflı ham `<button>` yazıyor (Bahsedilmeler ve eski Keşfet dâhil). Keşfet de aynısını yapar; yeni ortak `Button` **açılmaz** (kapsam dışı, 40+ çağrı yerini etkiler). |
| `FriendCard` | **yok**; karşılığı `components/friends/friend-row.tsx` (`FriendRow`) — satır dili, kart dili değil. Kişi kartı sıfırdan yazılır, `FriendRow`'un token ve presence dili örnek alınır.                                       |

Var olanlar (kullanılacak): `ui/avatar`, `ui/badge`, `ui/input`, `ui/modal`, `ui/skeleton`,
`ui/toggle-switch` (katıl modalının 44×26 anahtarı), `ui/toast`, `ui/context-menu`,
`shell/server-icon`, `shell/channel-item`, `shell/server-member-panel` (panel iskeleti),
`shared/user-profile-popover`, `invite/desktop-invite-prompt` (davet akışı dili).

---

## 3. Alınmış kararlar (K1–K12)

K1–K8 kullanıcı onayı taşır; K9–K12 SPEC'in doğrudan sonucudur.

**K1 · Kategori = DB kolonu.** `enum ServerCategory { OYUN IS CALISMA KISISEL DESTEK }` +
`Server.category ServerCategory?` (null = sınıflandırılmamış, dizinde "Tümü"de görünür ama
kategori sayacına girmez) + `@@index([category, discoverable, isPublic, memberCount])`. Sunucu
ayarları görünürlük bölümüne kategori seçimi eklenir (`server-settings-overlay.tsx`).

**K2 · Kanal şeridi = yeni uç + saatlik rollup.** `DiscoverChannelActivity` tablosu
(`channelId`, `windowStart`, `messageCount`), saatlik iş tarafından doldurulur. Uç yalnız
`discoverable && isPublic` sunucuların `isPrivate = false` metin kanallarını döndürür.

**K3 · Profil paneli üç alanı da alır.** `ServerPublicProfileFriendSchema`'ya `role:
'Yönetici'|'Üye'` ve `presence: 'online'|'idle'|'offline'`; profile `voiceRoomCount`;
`Server.languages String[]` kolonu (öne çıkan bloğun `Türkçe · İngilizce` pili).

**K4 · `Yeni` etiketi:** sunucuya ilk giriş **veya** `joinedAt + 24 saat` — hangisi önceyse.
Kalıcılık `localStorage` (`wizards.discover.seenServers.v1`), yeni kolon yok.

**K5 · Kişi etiketleri ortak sunucu `tags`'lerinden.** İki kişinin ortak olduğu sunucuların
`tags` değerlerinden en sık iki tanesi. `User.interests` **açılmaz**.

**K6 · Arama aktif şeritte arar.** Tek `q`, tek istek, tek boş durum. Sunucu şeridinde ad +
açıklama + etiket + kategori üzerinde; kişi şeridinde ad + kullanıcı adı; kanal şeridinde kanal
adı + kaynak; etkinlik şeridinde başlık + yer.

**K7 · Kart boyutu `localStorage`'da** (`wizards.discover.cardSize.v1`), URL'de değil.

**K8 · Eski ekran silinir, eski uç kalır.** `server-discovery-screen.tsx` ve onu çağıran sayfa
gider. `/api/v1/servers/discover` ve testleri durur. `/api/v1/mobile/servers/discover`
**hiç** etkilenmez.

**K9 · Debounce 250 ms.** SPEC §7. Mevcut kodun 500 ms'i SPEC'e uyar (eski ekranla birlikte gider).

**K10 · Mavi doğrulama ikonu yok.** Kabul kriteri açık. Eski karttaki `BadgeCheck` Keşfet'te
çizilmez. `verified` alanı tipte kalır (sunucu profili başka yerde kullanıyor), Keşfet okumaz.

**K11 · Öne çıkan blok `features[] ∋ FEATURED` bayrağından gelir.** Referans HTML'deki
"Whispr Topluluğu" sabit metni **örnek veridir**; üründe bayraklı ilk sunucu çizilir. Bayraklı
sunucu yoksa blok **hiç** çizilmez (boş kutu değil).

**K12 · Durum URL'de.** `/discover?lane=servers&cat=oyun&sort=online&q=…&panel=<serverId>&modal=join`.
Bilinmeyen değer varsayılana düşer, hata vermez.

---

## 4. Tuzaklar (8 madde)

1. **`friend:suggestions` hız sınırı 30/60sn.** Kişiler şeridi bir tarama yüzeyi; 30 istek/dk
   arama debounce'u ile birleşince kullanıcıyı 429'a sokar. Ş2 kendi anahtarını açar
   (`discover:people`, 120/60sn) ve `listFriendSuggestions`'ı doğrudan çağırır — HTTP üzerinden
   kendi ucunu çağırmaz.

2. **Keyset imleç `OR` ile bozulur.** `server-discovery-service.ts` içindeki yorum, iki kolona
   yayılan `OR` yüzünden sargable olmayan bir sorgunun nasıl derin sayfalarda çöktüğünü
   `EXPLAIN` ile kaydediyor. Kategori filtresi eklenirken bu yapı **korunur**: kategori bir
   `WHERE` eşitliğidir, imlece girmez.

3. **Sıralama değişince imleç anlamını yitirir.** `popular` (memberCount), `online`
   (onlineCount), `new` (createdAt) üç ayrı sıralama kolonu demek. İmleç formatı sıralama
   anahtarını **taşımalı** (`p|…`, `o|…`, `n|…`), yoksa sıralama değiştiğinde eski imleç sessizce
   yanlış sayfayı verir. `online` Redis'ten geliyor (`countServerOnlineMembersBatch`) —
   veritabanı kolonu değil, bu yüzden `online` sıralaması **sayfa içinde** değil, önce sınırlı
   bir aday kümesi çekilip sonra sıralanarak yapılır; sınır ve gerekçe Ş1'de.

4. **Kategori sayaçları ayrı sorgu ister.** `TÜ 20 · OY 4 · İŞ 4 · ÇA 4 · Kİ 4 · DE 4` sayaçları
   filtrelenmiş listeden türetilemez (kategori seçiliyken diğerlerinin sayısı da doğru kalmalı).
   Tek `groupBy(category)` + `where { discoverable, isPublic }`, aramadan **etkilenir**,
   kategori seçiminden **etkilenmez**.

5. **`shortName` 4 karakter, tasarım 2 harf istiyor.** Tile metni (`OK`, `SÇ`, `ÜY`) SPEC'te iki
   harf. `shortName` null olabilir ve 4 karaktere kadar çıkabilir. Türetme kuralı tek yerde
   (`lib/discover/identity.ts`): `shortName` varsa ilk iki karakteri, yoksa ad içindeki ilk iki
   kelimenin baş harfleri, tek kelimede ilk iki harf. Türkçe büyük harf dönüşümü `tr` locale ile
   (`i → İ`, `ı → I`).

6. **Öne çıkan blok panel açılınca gizlenir.** Kabul kriteri: "detay paneli açıldığında
   gizleniyor". Aynı anda akış başlığındaki **şerit grubu ve ikon grubu da `display:none`**
   (SPEC §4.1 daralma kuralı). Üçü tek bir `isPanelOpen` koşuluna bağlanır.

7. **Panel 326 px ana kolonu 782 → 456 px'e düşürür.** Kart ızgarası `minmax(262px, 1fr)` ile
   456 px'te tek kolona iner — bu **doğru** davranıştır, kırılım değil. `Büyük` boyutta (330px)
   yine tek kolon. Izgara `minmax` değeri değiştirilmez, panel açıkken özel bir kural yazılmaz.

8. **Türkçe metinler birebir.** SPEC'teki her cümle karakterine kadar aynı. `“…”` tırnakları
   Türkçe çift tırnak (U+201C/U+201D), kesme işareti `'` (U+2019), ayırıcı `·` (U+00B7).
   `discover-screen-copy.test.ts` bunu SPEC dosyasından okumadan, sabit dizgilerle doğrular.

---

## 5. Kalite çıtası

- **Tip:** `any` yok, `as` daraltması yok. Sunucudan gelen her gövde zod ile ayrıştırılır.
- **Test:** her saf fonksiyon (imleç kodlama, kategori türetme, baş harf türetme, rota
  ayrıştırma, sıralama seçimi) için birim testi. Her uç için `route-logic.test.ts`. Her ekran
  bileşeni için render testi (`*.test.tsx`).
- **Erişilebilirlik:** kart `article`, her eylem gerçek `button`, ikon-only butonda `aria-label`,
  kategori listesi `role="listbox"` + `aria-selected`, şeritler `role="tablist"` +
  `aria-controls`, sayı pilleri metin karşılığı taşır (`aria-label="20 sunucu"`), modal ve panel
  focus tuzaklı, `Esc` sırayla kapatır, kapanışta focus tetikleyiciye döner. Renk tek başına
  anlam taşımaz (presence noktası + metin).
- **Performans:** dizin kolonu ile ızgara **bağımsız** yüklenir; ızgara geciktiğinde kolon
  beklemez (6 kartlık `Skeleton`). Arama 250 ms debounce. Izgara keyset ile sayfalanır
  (`IntersectionObserver` sentinel). Kart bileşenleri `memo`.
- **Ölçekleme:** hiçbir yerde `px` arbitrary değeri yok — `pxToRem` üzerinden `rem`. Hairline'lar
  `max(1px, 0.0625rem)`. İkonlar `em`.
- **Renk:** yalnız token. Yeni hex, yeni token, yeni tema sınıfı yok.
- **Yazı tipi:** `--font-display` (Outfit) / `--font-sans` (Figtree) token'ları üzerinden;
  hiçbir bileşende sabit font adı yok.

---

## 6. Şerit dosya sahipliği (çakışma yasağı)

| Şerit | Sahiplendiği dizin/dosyalar                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ş0    | `packages/types/src/discover-screen.ts`, `packages/db/prisma/**`, `apps/web/src/lib/discover/{metrics,routes,identity,contracts}.ts`, `lib/locale/messages/{tr,en}.ts`         |
| Ş1    | `app/api/v1/discover/servers/**`, `lib/discover/servers-service.ts`                                                                                                            |
| Ş2    | `app/api/v1/discover/{people,channels}/**`, `lib/discover/{people,channels}-service.ts`, rollup işi                                                                            |
| Ş3    | `app/api/v1/discover/{events,servers/[serverId]}/**`, `lib/discover/{events,join}-service.ts`, `lib/servers/client.ts` (yalnız ekleme)                                         |
| Ş4    | `lib/home/third-column.ts`, `components/shell/wizards-shell.tsx` (yalnız `discover` dalı), `components/discover/discover-sidebar*.tsx`                                         |
| Ş5    | `components/discover/discover-{page,feed-header,featured,filter-strip}*.tsx`                                                                                                   |
| Ş6    | `components/discover/discover-{server-card,person-card,channel-row,event-card,grid,skeleton}*.tsx`                                                                             |
| Ş7    | `components/discover/server-profile-panel*.tsx`                                                                                                                                |
| Ş8    | `components/discover/server-join-modal*.tsx`, `components/discover/discover-joined-banner*.tsx`, `components/shell/app-nav-panel.tsx` + `server-rail.tsx` (yalnız `Yeni` pili) |
| Ş9    | `components/discover/discover-{empty,error}-state*.tsx`, `lib/discover/scale.ts`                                                                                               |
| Ş10   | `apps/web/e2e/specs/discover/**`, parity raporu                                                                                                                                |

`components/discover/discover-page.tsx` Ş5'in dosyasıdır; Ş6–Ş9 ona **prop ekler**, içine kod
yazmaz. Ekleme gereken her prop faz dosyasında adıyla listelenmiştir.
