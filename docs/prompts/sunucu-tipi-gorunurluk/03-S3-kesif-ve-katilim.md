# 03 — S3: Keşif yüzeyi + davetsiz katılım

Önce `00-ortak-baglam.md` oku. `02` bitti (rapor: `raporlar/02-rapor.md`) — keşif kartları oradaki profil kartına götürür.

Bu dalga `isPublic` ve `discoverable` kolonlarını ilk kez gerçekten kullanılır hale getirir. Kullanıcılar davet kodu olmadan sunucu bulup katılabilir.

---

## S2'nin bıraktığı sözleşme — tüket, yeniden yazma

**Okuma:**

```
getVisibleServerPublicProfile(serverId, viewerId)             // erişim kuralı burada, TEK yerde
getVisibleServerPublicProfileWithDatabase(db, serverId, viewerId)
```

`apps/web/src/lib/servers/server-public-profile-service.ts`. Gizli sunucu **404** döner, 403 değil. Keşif yolunda da aynı kural geçerli — ikinci bir görünürlük kontrolü yazma.

**Uçlar:** `GET /api/v1/servers/[serverId]/profile`, `GET /api/v1/mobile/servers/[serverId]/profile`.

**Sunum modeli** — `packages/types/src/server-profile-presentation.ts`, dört saf fonksiyon. **Keşif kartı da bunları çağırır**, kendi biçimlendirmesini yazmaz:

```ts
formatServerProfileCount(value, locale); // 12400 → "12,4B" / "12.4K"
resolveServerProfileChannelBadge(channel);
resolveServerProfileFriendStack(friends, count);
resolveServerProfileJoinAction(joined); // { kind: "go" | "join", label }
```

**Yüzeyler:**

| Platform | Ne                   | Nerede                                                                                            |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| Web      | rota                 | `app/(main)/servers/[serverId]/about/page.tsx`                                                    |
| Web      | kart                 | `components/servers/server-profile-card.tsx`                                                      |
| Web      | giriş noktası deseni | `components/shell/channel-sidebar.tsx:1661`                                                       |
| Web      | iskelet              | `components/shell/shell-skeletons.tsx` → `ServerProfileCardSkeleton`                              |
| Mobil    | ekran                | `MobileServerProfileScreen` + `ServerProfileScreenContainer` (`mobile-screen-containers.tsx:929`) |
| Mobil    | rota                 | `ServerProfile` — üç nav dosyasında kayıtlı, derin bağlantı `server/:serverId/about`              |

**Test taban çizgisi (S2 sonrası, kontrolcü ölçümü):** web `1957/1957`, mobil node `1667/1667`, mobil jest `1160/1160` (127 suite). Sayın bunun altına düşmemeli.

**Açık boşluk:** S2'nin görsel paritesi doğrulanmadı — kart 2g tasarımıyla yan yana konmadı. Keşif kartını çizerken profil kartının stilini kaynak alıyorsan bunu bil.

---

## Bağlayıcı kararlar

1. **Katılma yolu tektir.** `joinWorkspaceServerByInvite` mevcut ve davet kodunu tüketiyor. Davetsiz katılım için ikinci bir üyelik oluşturma yolu **yazılmaz** — ortak bir iç fonksiyona indirilir, iki giriş noktası (davetli / açık) onu çağırır. İki kopya, iki farklı ban kontrolü demektir.
2. **Katılma sırasında zorunlu kontroller, bu sırayla:** ban (`ServerBan`) → zaten üye mi → `maxMembers` tavanı → `isPublic` doğru mu. Herhangi biri düşerse üyelik satırı oluşmaz ve `memberCount` artmaz.
3. **Sıralama indexten gelir.** `@@index([type, discoverable, memberCount])` var. Keşif sorgusu `where { discoverable: true, isPublic: true }` + `orderBy memberCount desc` ile bu index'i kullanır. Uygulama katmanında sıralama yapılmaz.
4. **Sayfalama cursor tabanlıdır**, `skip/take` değil. Büyük ofsetler Postgres'te tarama maliyeti üretir.
5. **Çevrimiçi sayısı bu dalgada Redis'e geçer.** `00`'daki üçüncü sözleşme detayı burada değişir: liste `N` sunucu için tek Redis pipeline ile `SCARD` okur. Tek sunucu profili (S2) DB yolunda kalabilir ya da aynı anda geçirilir — **hangisini seçersen iki yüzeyin aynı sayıyı gösterdiğini test et.** Farklı sayı göstermek kabul edilemez.

   Presence modülüne dokunurken `00`'daki "Çevrimiçi presence sözleşmesi" bölümü bağlayıcıdır. Özellikle: **tek yazıcı `applyServerOnlinePresenceForSocket`**, ham `add/removeServerOnlineMember` çağırma. Sen yalnız **okuma** tarafına toplu bir fonksiyon ekliyorsun — yazma yolunun yarış değişmezine dokunma, orada üç Critical kusur zaten bir kez düzeltildi.

---

## Bölüm A — Keşif okuma yolu

**Teslim:**

- `apps/web/src/lib/servers/server-discovery-service.ts` — saf yarı + enjekte edilen `PrismaClient` yarısı.
- `listDiscoverableServers({ cursor, limit, query? })` → kart başına: `id`, `name`, `shortName`, `iconUrl`, `bannerUrl`, `description`, `memberCount`, `onlineCount`, `verified`, `type`.
- Kart yükü **profil yükünün alt kümesidir** — kanal listesi, arkadaş kesişimi, izin süzgeci burada **hesaplanmaz.** N sunucu × izin çözümlemesi listeyi öldürür.
- Çevrimiçi sayıları tek Redis pipeline ile toplu okunur (`server-online-presence.ts`'e çoklu okuma ekle; tekil `countServerOnlineMembers` aynı setten okumalı).
- Arama: `query` verilirse `name` üzerinde. Trigram/full-text kurma — `contains` yeterli, veri hacmi bunu kaldırır. Ölçüp yavaş bulursan rapora yaz, index önerisi ver, ama bu promptta kurma.

**Uçlar:**

- `GET /api/v1/servers/discover`
- `GET /api/v1/mobile/servers/discover`
- Rate limit eylemleri kaydedilir.

## Bölüm B — Katılma yazma yolu

**Teslim:**

- `invite-service.ts`'teki üyelik oluşturma gövdesi ortak bir iç fonksiyona indirilir: varsayılan rol ataması, sistem mesajı, `memberCount` artırımı, socket odası bağlama — hepsi orada, tek transaction.
- `joinPublicWorkspaceServer(userId, serverId)` — karar 2'deki dört kontrolü uygular, sonra ortak fonksiyonu çağırır.
- `joinWorkspaceServerByInvite` davranışı **değişmez**; yalnız aynı ortak fonksiyonu çağırır hale gelir. Mevcut davet testleri düzenlenmeden yeşil kalır — bu, indirgemenin doğruluk kapısıdır.
- Uçlar: `POST /api/v1/servers/[serverId]/join` ve mobil karşılığı. `parseJsonBody` gerekiyorsa gövdesiz kayıt (`BODYLESS_MUTATING_METHOD_PATHS`) — `route-contract.test.ts:1327` bunu zorunlu kılıyor.
- Rate limit: katılma agresif sınırlanır. Kullanıcı başına saatlik makul bir tavan; sayı seçimini rapora gerekçelendir.

**Test etmen gerekenler:** banlı kullanıcı 403 ve `memberCount` artmaz; zaten üye 409/200 idempotent (hangisini seçtiğini yaz); `maxMembers` dolu 403; `isPublic: false` sunucuya doğrudan `serverId` ile katılma denemesi 404 (varlık sızdırmaz).

## Bölüm C — Görünürlük ayarları (kişisel sunucular)

Sahip, kişisel sunucusunu açık/kapalı ve listelenir/listelenmez yapabilmeli. Sözleşme hazır: `UpdateServerFieldsSchema` `isPublic`/`discoverable` taşıyor, `assertVisibilityFieldsWritable` COMMUNITY'yi koruyor.

**Teslim:**

- Web sunucu ayarları yüzeyine (`server-settings-overlay.tsx`) iki anahtar.
- Mobil `mobile-server-settings-screen.tsx`'e aynı iki anahtar.
- `discoverable` yalnız `isPublic` açıkken anlamlıdır — kapalıyken devre dışı ve açıklaması görünür olsun. Kapatıldığında `discoverable` da kapanır (sunucu tarafında zorla, yalnız UI'da değil).
- COMMUNITY sunucularda ikisi de salt okunur, sebebi görünür ("topluluk sunucusu, yönetim ekibi tarafından yönetilir").

## Bölüm D — Keşif ekranları

**Web:** `app/(main)/discover/` rotası. Kart ızgarası, arama kutusu, sonsuz kaydırma (cursor). Karta tıklama S2 profil kartına gider.

**Mobil:** yeni `Discover` ekranı; üç navigasyon dosyasına da kaydedilir (`mobile-navigation-types.ts`, `mobile-navigator.tsx`, `mobile-linking.ts`). Sunucu rail'inin altındaki "+" akışına ya da sunucu oluştur/katıl sayfasına giriş noktası — mevcut `mobile-server-create-join-sheet.tsx` doğal yer.

Liste performansı: mobilde `FlashList`, `getItemType` sabit, satır bileşeni memo'lu. **Sorgu sonucuna memoize etme** — bu repoda daha önce yanmış bir tuzak.

## Bölüm E — Kopya metinleri

TR + EN. Boş durum ("Henüz keşfedilecek sunucu yok"), arama boş sonucu, katılma hataları (banlı, dolu, kapalı) için ayrı ve dürüst metinler. Genel "bir şeyler ters gitti" ile geçiştirme.

---

## Yapılmayacaklar

- Öneri/kişiselleştirme algoritması — sıralama `memberCount desc`, o kadar
- Kategori/etiket sistemi (S4'te değerlendirilir)
- Sunucu davet bağlantısı üretimi — zaten var
- Terfi/indirme (S4)
- Ayrı arama servisi, Elasticsearch, trigram index

## Kapı

`00 §5`'teki biçim — bu makinede `pwsh` yok, mutlak yol şart:

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
```

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Mobile
```

Mobilde **iki ayrı süit** var, ikisini de koş:

```
pnpm --filter @wizards/mobile test
```

```
pnpm --filter @wizards/mobile test:components
```

Ek: keşif sorgusunun index'i kullandığını `EXPLAIN` ile göster (yerel DB yeter). Sequential scan çıkarsa düzelt.

## Teslim listesi

- [ ] A: keşif servisi + iki uç + toplu Redis çevrimiçi okuma
- [ ] B: ortak üyelik fonksiyonu, `joinPublicWorkspaceServer`, dört kontrol, davet testleri düzenlenmeden yeşil
- [ ] C: görünürlük anahtarları web + mobil, COMMUNITY salt okunur
- [ ] D: keşif ekranları web + mobil, üç navigasyon kaydı
- [ ] E: TR + EN kopya, dürüst hata metinleri
- [ ] Kapı: iki profil yeşil + `EXPLAIN` kanıtı
