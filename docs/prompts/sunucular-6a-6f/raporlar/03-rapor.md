# Faz 3 raporu — 6a + 6b + 6f: Sunucular ekranı v2

Branch `uat`. Commit yok, her şey uncommitted.

> **İki açık karar kullanıcı tarafından kapatıldı (2026-08-10):** ikisi de (b) seçeneğiyle,
> yani **uygulandı**. Ayrıntı §7 (ayrılma ucu) ve §8 (mesaja atlama).

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                                        | Satır        |
| -------------------------------------------------------------------------------------------- | ------------ |
| `apps/mobile/src/app/screens/workspace-header-row.tsx`                                       | 170          |
| `apps/mobile/src/app/screens/workspace-filter-strip.tsx`                                     | 78           |
| `apps/mobile/src/app/screens/workspace-server-menu-sheet.tsx`                                | 143          |
| `apps/mobile/src/app/screens/workspace-message-search-results.tsx`                           | 103          |
| `apps/mobile/component-tests/mobile-servers-6a-6b-6f.test.tsx`                               | 374          |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/messages/search/route.ts`                 | 58           |
| `apps/web/src/app/api/v1/servers/[serverId]/messages/search/route.ts`                        | 59           |
| `apps/web/src/lib/servers/server-weekly-message-count.test.ts`                               | 163          |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/me/{route,route-logic}.ts` + test | 8 + 51 + 117 |
| `apps/mobile/scripts/mobile-channel-message-anchor.test.ts`                                  | 139          |

### Değişen dosyalar (bu fazda dokunulanlar; Δ = `git diff --numstat`)

| Dosya                                                            | Δ           | Ne                                                                                                                                                               |
| ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/app/screens/workspace-browser.tsx`              | +196/−189   | Beş buton → `WorkspaceHeaderRow`; filtre şeridi, arama sonuç bölümleri, etiketli FAB, "⋯" sheet, kategori editörü; A0.1/A0.2 memo hattı                          |
| `apps/mobile/src/app/screens/home-screen.styles.ts`              | +316/−88    | `theme.workspace` tabanlı yeni stiller (başlık, filtre, kategori sayacı, boş ses, FAB pill, arama sonucu, menü kartı); rail token'landı; 3 ölü stil silindi      |
| `apps/mobile/src/app/screens/workspace-channel-section-list.tsx` | +68/−32     | Kategori `+` silindi; sayaç + kapalı ton + okunmamış noktası; uzun basma → kategori editörü; boş ses satırı                                                      |
| `apps/mobile/src/app/screens/workspace-add-action-buttons.tsx`   | +38/−14     | FAB yuvarlak (+) → etiketli "+ Kanal" pill, iki layout                                                                                                           |
| `apps/mobile/src/app/mobile-sunucular-model.ts`                  | (A0)        | `filterMobileWorkspaceSections` `readonly` döner + `all` yolunda aynı referans; `collectMobileLiveVoiceChannelIds` export; iki yardımcı hazır `Set` kabul ediyor |
| `apps/mobile/src/design/mobile-line-icon-definitions.ts`         | +9          | `dots-horizontal` (6a "⋯")                                                                                                                                       |
| `apps/mobile/src/locale/mobile-copy.ts`                          | +111/−2     | 5 yeni anahtar × 2 dil; **`workspaceChannelSearchPlaceholder` silindi**                                                                                          |
| `apps/mobile/src/query/mobile-query-keys.ts`                     | +21         | `serverMessageSearch(serverId, query)`                                                                                                                           |
| `apps/mobile/src/search/mobile-message-search-client.ts`         | +47         | `buildMobileServerMessageSearchPath` + `searchMobileServerMessages`                                                                                              |
| `apps/web/src/lib/messages/search-service.ts`                    | +112/−1     | **A1** `searchServerMessages`                                                                                                                                    |
| `apps/web/src/lib/servers/server-public-profile-service.ts`      | (A0.3/A0.4) | Kanal sıralaması kategori pozisyonuyla; yönetici presence Redis'ten                                                                                              |
| `apps/web/src/lib/servers/server-weekly-message-count.ts`        | tam yazım   | **A0.5** single-flight + 15 dk tazelik + 45 dk bayat pencere                                                                                                     |
| `apps/web/src/lib/socket/server-online-presence.ts`              | +30         | `smismember` tipi + `readServerOnlineMembers` (fail-open)                                                                                                        |
| `apps/web/src/lib/workspace/unread-service.ts`                   | +15         | `getOnlineServerMemberIds` (aynı istemci, aynı test seam'i)                                                                                                      |
| `apps/web/src/lib/api-rate-limit.ts`                             | +4          | `mobile:server:messages:search` (40/60sn), `server:messages:search` (80/60sn)                                                                                    |
| `apps/web/src/app/api/v1/route-contract.test.ts`                 | +73/−1      | İki yeni rota kaydı, M1 sayacı 37 → 38                                                                                                                           |
| `.maestro/phase4-server-management.yml`                          | +7/−1       | Davet/ayarlar artık "⋯" menüsünden; üyeler satırı ayarlar ekranının kendi satırından                                                                             |
| `apps/mobile/scripts/mobile-phase4-server-management.test.ts`    | +39/−34     | İki sözleşme testi menü/başlık dosyalarına taşındı                                                                                                               |
| `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`     | +8/−6       | Akıştaki fazladan "⋯" adımı                                                                                                                                      |
| `apps/mobile/component-tests/mobile-redesign-servers.test.tsx`   | +80/−42     | Silinen stiller negatif iddia; rail ve başlık token'a bağlandı                                                                                                   |
| `apps/mobile/scripts/mobile-sunucular-model.test.ts`             | +3 test     | A0.1 referans eşitliği, A0.2 hazır Set                                                                                                                           |
| `apps/mobile/scripts/mobile-message-search-client.test.ts`       | +40         | Sunucu geneli arama yolu                                                                                                                                         |
| `apps/web/src/lib/servers/server-public-profile-service.test.ts` | +5 test     | A0.3 sıralama (3), A0.4 presence (2)                                                                                                                             |
| `apps/web/src/lib/{socket,workspace}/*.test.ts`                  | +2 her biri | Redis çiftlerine `smismember`                                                                                                                                    |

---

## 2. Bağlayıcı kararlar (Faz 4/5'i kısıtlar)

1. **Başlıkta en fazla iki ikon butonu vardır ve bu yapısal bir kuraldır.** Ad `flex: 1, minWidth: 0`, butonlar `flex: none`. Kural `WorkspaceHeaderRow` üzerinde test edilir (`mobile-workspace-header-actions` çocuk sayısı). Faz 4 üçüncü bir buton ekleyemez — her yeni giriş "⋯" menüsüne gider.
2. **Taşınan eylemler kendi testID'lerini korudu.** Menü satırları `mobile-server-profile-open-<id>`, `mobile-server-members-open-<id>`, `mobile-server-invite-share-<id>`, `mobile-server-settings-open-<id>`. Faz 4 menüyü yeniden yazarken bu dördünü **aynı id'lerle** taşımak zorunda; e2e akışı ve iki sözleşme testi bunlara bakıyor.
3. **Kanal oluşturmanın tek giriş noktası FAB'dır.** `onCreateInSection` prop zinciri ve kategori ön-seçimi kod tabanında yok; `MobileWorkspaceCreateSheets` her zaman `categoryId: null` ile açılıyor.
4. **Kategori düzenleme uzun basmadadır** ve mevcut `MobileWorkspaceEditorSheets` (`category-edit`) yüzeyini açar — yeniden adlandır + sil aynı sheet'te. Yeni bir kategori menüsü yazılmadı.
5. **Kapalı kategorinin okunmamış noktası ekrandan gelir, modelden değil.** Görünür bölüm zaten boşaltılmış oluyor (`channels: []`), bu yüzden `WorkspaceChannelSectionList` `unreadSectionIds` alıyor. `getMobileCategoryHeaderState` chevron/ton/kapalılık için hâlâ tek otorite.
6. **`filterMobileWorkspaceSections` `all` yolunda girdi dizisini döndürür** (`readonly TSection[]`). Çağıran `useMemo` içinde tutmak zorunda; kopyalayan bir çağrı A0.1'i geri getirir.
7. **Arama kutusu tek placeholder anahtarı okur:** `workspaceChannelSearchPlaceholderExpanded`. Eski anahtar silindi, iki-anahtar durumu kapandı.
8. **Sunucu geneli arama tek servisten geçer:** `searchServerMessages`. Kanal listesi `listChannelIdsByServerForUserWithPermission` ile süzülür; ikinci bir izin filtresi yazılamaz.
9. **Yönetici presence'ı Redis `server:<id>:online` kümesidir** (`getOnlineServerMemberIds`). `AppSession.lastSeenAt` yalnız "en son görüldü" metnini besler. Faz 5 profili çizerken ikisini karıştırmamalı.
10. **Haftalık sayım iki pencereli:** 15 dk taze, 45 dk bayat servis edilebilir, arada tek kazanan yeniden hesaplar. Cache anahtarı `…:weekly-messages:v2`, kilit `…:weekly-messages:lock:v2`. Test seam'i (`ServerWeeklyMessageCountCache`) artık `acquireLock` de istiyor.

---

## 3. Tasarımdan / prompt'tan sapmalar

### 3.1 "⋯" menüsü: beş satır (kullanıcı kararı, kapandı)

Prompt menüyü **bilgi / üyeler / ayarlar / ayrıl** olarak sayıyordu; kaldırılan header butonları ise bilgi / **davet** / ayarlar. Kullanıcı kararı: **ayrılma ucu bu fazda yazılsın**. Menü artık beş satır taşıyor:
**bilgi / üyeler / davet (yetkiliyse) / ayarlar (yetkiliyse) / ayrıl (sahip değilse)** — §7.

### 3.2 Mesaj sonucu artık mesaja gidiyor (kullanıcı kararı, kapandı)

`around` penceresi, iki yönlü gezinme ve vurgulama bu fazda yazıldı — §8.

### 3.3 Diğer sapmalar

| Sapma                                                                                                                                                 | Gerekçe                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlık `WorkspaceHeaderRow` adında ayrı bir dosyaya çıktı                                                                                             | "En fazla iki buton" ve 6f clamp'i, ekranı bir oturumla açmadan iddia edilebilsin diye. Kabul 2/3 bu bileşene karşı test ediliyor.                                                                                         |
| Kategori uzun-basma menüsünde **sıralama yok**                                                                                                        | 03 §B3 "sıralama (drag) yoksa menüden çıkar" diyor; sürükle-bırak yüzeyi yok. Menü = yeniden adlandır + sil.                                                                                                               |
| Kategori menüsü liste değil, doğrudan editör sheet'i                                                                                                  | Mevcut `MobileWorkspaceEditorSheets` `category-edit` durumunda iki eylemi de taşıyor; araya ikinci bir menü koymak yeni yüzey demekti (00 §2.3).                                                                           |
| `dots-horizontal` ikonu **stroke** modda, `r=1.9` fill yerine `strokeWidth 3.8` yuvarlak uç                                                           | İkon kiti fill modunda yalnız `path` kabul ediyor; yuvarlak uç aynı diski çiziyor, ikinci bir ikon modu açılmadı.                                                                                                          |
| Web arama ikizi (`/api/v1/servers/[serverId]/messages/search`) yazar/tarih/`exact` filtrelerini de kabul ediyor; mobil uç yalnız `q`/`limit`/`cursor` | Mobil kutu tek metin alanı — render edilmeyen parametre yasak (00 §2.2). Web ikizi kanal aramasının kardeşi olduğu için onun imzasını taşıyor.                                                                             |
| Compact başlıkta **tek** buton ("⋯")                                                                                                                  | 6b'de arama kutusu kalıcı; ayrıca bir arama toggle'ı ikinci butonu boşa harcardı. §C "kartın sağında tek buton" ile birebir.                                                                                               |
| `mobile-server-members-open-.*` Maestro adımı ayarlar ekranının `mobile-server-members-row`'una çevrildi                                              | O adım akışta sunucu ayarları ekranındayken koşuyor; `…members-open` id'si o ekranda hiç yoktu (kod tabanında hiçbir yerde yoktu) — adım zaten ölüydü. Aynı id şimdi "⋯" menüsünde yaşıyor.                                |
| Rail ölçüleri 66/44/52 → **62/42/50** (token)                                                                                                         | 6a B1 birebir. Aktif halka (2px zemin + 2px primary) korunmuş, 4×28 bar token'a bağlandı.                                                                                                                                  |
| `searchServerMessages` için DB'li test yok                                                                                                            | Kardeşi `searchChannelMessages`'ın da yok; servis modül seviyesinde `prisma` içe aktarıyor. İzin filtresi **yapısal**: kanal listesi izin servisinden geliyor, sorguda ikinci bir filtre yok. Uç `route-contract` altında. |
| A0.3 testi sorgunun `orderBy`'ını iddia ediyor (sahte DB sıralamıyor) + `buildServerPublicProfile`'ın sırayı bozmadığını                              | Sahte veritabanı `orderBy` uygulamıyor; sıralamayı gerçekten yapan SQL, o yüzden "hangi sıralama istendi" doğru iddia noktası.                                                                                             |

---

## 4. Kapı çıktıları (gerçek çıktı)

```bash
pnpm --filter @wizards/types test
```

```
ℹ tests 212
ℹ pass 212
ℹ fail 0
```

```bash
pnpm --filter @wizards/web test
```

```
ℹ tests 2141
ℹ suites 483
ℹ pass 2141
ℹ fail 0
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=mobile --mode=check
(çıktı yok — temiz, exit 0)
```

```bash
pnpm --filter @wizards/mobile test
```

```
ℹ tests 1723
ℹ suites 300
ℹ pass 1723
ℹ fail 0
```

`apps/mobile` dizininden:

```bash
npx jest
```

```
Test Suites: 131 passed, 131 total
Tests:       1200 passed, 1200 total
```

Taban çizgisi 130 süit / 1182 test → **131 / 1200** (+1 süit, +18 test). Düşüş yok.

Kapı listesinde yok ama web tipleri de değişti:

```bash
pnpm --filter @wizards/web typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
(çıktı yok — temiz)
```

```bash
graphify update .
```

```
[graphify watch] Rebuilt: 23767 nodes, 55990 edges, 1080 communities
Code graph updated.
```

### Kabul kriterleri

| #   | Kriter                                       | Durum | Kanıt                                                                                                                                                                                                       |
| --- | -------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | A0 kapandı                                   | ✅    | `all` referans eşitliği testi; hazır `Set` testi (model süiti); `orderBy` + üç sıralama testi; iki presence testi; beş single-flight testi. Profil sorgu bütçesi hâlâ **5/7** (`query budget` süiti yeşil). |
| 0b  | A1 kapandı                                   | ✅    | `route-contract` 25/25; iki rota + iki action kayıtlı; mobil iki bölümlü sonuç testi; eski placeholder anahtarı repoda yok                                                                                  |
| 1   | `mobile-workspace-section-create` repoda yok | ✅    | Yalnızca `docs/prompts/sunucular-6a-6f/*.md` içinde geçiyor (prompt metni); kodda ve testlerde **sıfır**                                                                                                    |
| 2   | Başlıkta ≤ 2 buton                           | ✅    | rail: 2 (`search` + `⋯`), compact: 1 — ikisi de testli                                                                                                                                                      |
| 3   | Uzun ad testi                                | ✅    | 79 karakterlik isim, iki layout: `numberOfLines=2`, `ellipsizeMode="tail"`, "⋯" hâlâ yerinde                                                                                                                |
| 4   | Filtre şeridi                                | ✅    | Üç segment `onChange`; rozet 0'da gizli, 4'te görünür; canlı ses noktası. Kalıcılık `useMobileWorkspaceFilter` üzerinden (saf katman Faz 2'de testli)                                                       |
| 5   | Yetkisizde FAB render edilmiyor              | ✅    | Kaynak iddiası: `{canManageChannels && servers.length > 0 ? <MobileWorkspaceCreateFab` — `disabled` yok                                                                                                     |
| 6   | Kapalı kategori                              | ✅    | Döndürülmüş chevron + soluk başlık + primary nokta; boş kategori listede ve kapalı                                                                                                                          |
| 7   | Boş ses satırı                               | ✅    | "Boş · sesli kanal", Katıl pill yok, satıra dokunma kanala bağlanıyor                                                                                                                                       |

---

## 5. Cihaz test listesi (kullanıcı yapar)

| #   | Ekran                     | Adım                                                                     | Beklenen                                                                                                             |
| --- | ------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Sunucular (rail)          | Bir sunucu aç                                                            | Başlıkta **iki** buton: büyüteç ve "⋯". Bilgi/davet/ayarlar/+ yok                                                    |
| 2   | Aynı ekran                | "⋯" dokun                                                                | Sheet: Sunucu bilgisi / Üyeler / Davet et (yetkiliyse) / Sunucu ayarları (yetkiliyse). Dördü de doğru ekrana gidiyor |
| 3   | Uzun adlı sunucu          | Adı 60+ karakter olan sunucuyu aç                                        | Ad iki satıra sarıyor, sondan `…`, butonlar yerinden oynamıyor, liste aşağı kayıyor                                  |
| 4   | Filtre şeridi             | Okunmamış → Sesli → Tümü                                                 | Liste her modda doğru süzülüyor; "Sesli"de canlı odalar üstte                                                        |
| 5   | Filtre kalıcılığı         | "Okunmamış" seç, başka sunucuya geç, geri dön; sonra uygulamayı kapat aç | Seçim o sunucuda korunuyor, diğer sunucu "Tümü"                                                                      |
| 6   | 0 okunmamış sunucu        | Her şeyi okunmuş bir sunucu aç                                           | "Okunmamış" segmentinde kırmızı rozet **yok**                                                                        |
| 7   | Yalnız ses kanallı sunucu | Boş bir sesli kanala bak                                                 | "Boş · sesli kanal", Katıl butonu yok; satıra dokunmak odaya bağlıyor                                                |
| 8   | Canlı ses                 | Bir odaya ikinci cihazdan gir                                            | Satır kart görünümüne geçiyor, Katıl pill'i ve avatarlar geliyor; şeritteki "Sesli" segmentinde yeşil nokta          |
| 9   | Kategori                  | Kategori başlığına dokun / uzun bas                                      | Dokunma: aç/kapa + sayaç. Uzun basma (yetkili): kategori düzenleme sheet'i (ad + sil)                                |
| 10  | Kategori                  | Kapalı kategoride okunmamış bırak                                        | Başlık soluk, sayacın sağında mor nokta                                                                              |
| 11  | Arama (compact)           | Kutuya "gel" gibi 2+ harf yaz                                            | KANALLAR bölümü ad eşleşmesi, MESAJLAR bölümü gerçek mesaj sonuçları; sonuç yoksa "Mesaj bulunamadı"                 |
| 12  | Arama sonucu              | Bir mesaj satırına dokun                                                 | O mesajın kanalı açılıyor (mesaja konumlanma yok — §3.2)                                                             |
| 13  | Arama (rail)              | Büyüteç butonuna bas                                                     | Arama alanı açılıyor, placeholder "Kanallarda ve mesajlarda ara"; tekrar basınca kapanıyor ve metin siliniyor        |
| 14  | FAB                       | Kanal yönetim yetkisi olan hesap                                         | Sağ altta "+ Kanal" pill'i; dokununca 1d menüsü, kategori **ön-seçimsiz**                                            |
| 15  | Yetkisiz hesap            | Kanal yönetemeyen üye ile aynı sunucu                                    | FAB **hiç yok**; kategori uzun basma bir şey açmıyor; "⋯" menüsünde yalnız bilgi + üyeler                            |
| 16  | Koyu tema                 | Ayarlar › Görünüm › Koyu; 1–14'ü tekrarla                                | Filtre şeridi, kategori tonları, boş ses satırı, FAB ve menü koyu varyantta okunur; marka gölgesi yalnız FAB'da      |
| 17  | Dil                       | English'e geç                                                            | "All/Unread/Voice", "Search channels and messages", "Channel", "Empty · voice channel", menü satırları İngilizce     |
| 18  | Sunucu profili (API/UI)   | Bir sunucunun profilini aç                                               | Yönetici noktaları ile üstteki "N çevrimiçi" artık **çelişmiyor**; kanal listesi kategori sırasına göre              |
| 19  | Maestro                   | `phase4-server-management` akışını koş                                   | Davet ve ayarlar adımları "⋯" menüsünden geçiyor, akış sonuna kadar gidiyor                                          |

---

## 6. Devredilen borç

1. **tsvector `english` ile üretiliyor** — Türkçe gövdeleme yanlış (`Message.content_search`). Mevcut kanal-içi aramayı da etkiliyor; bu paketin işi değil, ama sunucu geneli arama onu daha görünür kılıyor.
2. **Sunucu geneli arama sayfalanmıyor.** Uç keyset `cursor` döndürüyor, mobil UI ilk sayfayı gösteriyor (20 sonuç). "Daha fazla" tasarımda yok.
3. **Haftalık sayım hâlâ ham `Message` üzerinden.** Uzun vadede günlük rollup'tan türetilmeli (A0.5 notu).
4. **Kategori sürükle-bırak sıralaması yok** (kapsam dışı, tasarımın "sıradaki adımlar"ı).
5. **Filtre şeridi arama sırasında gizleniyor.** Tasarımda iki durumun birlikte nasıl davrandığı çizilmemiş; arama sonuçları iki bölümlü olduğu için şerit gizlendi.
6. **`use-mobile-workspace-filter` hâlâ testsiz** (Faz 2 gerekçesi geçerli: karar mantığı saf fonksiyonlarda ve testli).
7. **Anchored pencere canlı yamaları almaz.** Arama sonucuyla açılan geçmiş görünümü ayrı cache girdisidir; o an gelen düzenleme/silme/tepki oraya işlenmez. "Canlıya dön" ya da yeniden açış canlı akışa döner — bilinçli, §8.
8. **Ayrılma sonrası rota:** menüden ayrılınca ekran listedeki bir sonraki sunucuya geçer; sunucu kalmadıysa boş durum gelir. Ayarlar ekranından ayrılınca `onBack()` çalışır.
9. **Faz 4 uyarısı:** "⋯" sheet'i Faz 4'te 6c ile değişecek; §2.2'deki dört testID taşınmazsa Maestro akışı ve iki node sözleşme testi kırılır.

---

## 7. Ek — mobil "Sunucudan ayrıl" (kullanıcı kararı 1b)

**Uç:** `DELETE /api/v1/mobile/servers/[serverId]/members/me`, action `mobile:server:leave` (20/10dk, web ikizi `member:leave` ile aynı). `route-contract` kaydı + `BODYLESS_MUTATING_METHOD_PATHS` girişi yapıldı; M1 sayacı 38 → **39**.

**Kural tekrarı yok:** rota `leaveWorkspaceServer` çağırıyor — sahip reddi, üye sayacı düşümü (aynı transaction), izin cache temizliği, soket odasından ayırma ve `server:membership:removed` yayını zaten orada. İki istemci "kim ayrılabilir" sorusunda ayrışamaz.

**İstemci:** `leaveMobileServer` (gövdesiz DELETE) + `mutations.leaveServer`. Başarıda sunucunun workspace/üye/rol cache'leri **düşürülür** ve bootstrap yeniden çekilir (rail satırı kaybolmalı). Seçim, bootstrap yenilenmeden **önce** listedeki bir sonraki sunucuya taşınır — yoksa ekran artık 403 dönecek bir workspace okumasına bakar.

**UI:**

- "⋯" menüsünde son satır, tek kırmızı satır, chevron yok. **Sahipte hiç render edilmiyor** (servis sahibin ayrılmasını reddediyor; 400 döndürecek bir butonu göstermek yerine satır gizli).
- Onay: `DestructiveConfirmationSheet` (`mobile-server-leave-confirm`), gövde `serverMenuLeaveBody`.
- Sunucu ayarları ekranındaki **ölü "yakında" satırı canlandı** (`mobile-server-leave-open`): aynı mutasyon, aynı onay, başarıda `onBack()`.

**Testler:** rota mantığı 4 test (auth→limit→path sırası, gövdesizlik + kendi üyeliği, katı path şeması, sahip reddinin geçişi), istemci 3 test, menü satırı + sahip gizleme 1 bileşen testi.

---

## 8. Ek — mesaja atlama (kullanıcı kararı 2b)

**Uç:** `GET /api/v1/mobile/channels/[channelId]/messages?around=<messageId>`. Yeni rota değil, mevcut okumanın ikinci modu — ayrı action/bütçe açmadı.

**Servis:** `getChannelMessagesAround` (`message-service.ts`): çapayı doğrular (görünür değilse **404**, sessizce son sayfaya düşmez), sonra aynı Prisma cursor'ı ile iki sınırlı sorgu — geriye `limit/2`, ileriye `limit/2`. Yanıtın sayfa boyutu normal sayfayla aynı; transcript'in bellek tavanı "nasıl açıldığına" bağlı değil.

**Sözleşme:** `MobileChannelMessagesResponseSchema.hasNewer?: boolean` — yalnız `around` yanıtında true olabilir. Opsiyonel bırakıldı ki eski build'in SQLCipher'a yazdığı sayfa hydration'da hâlâ parse edilsin.

**Mobil:**

- `getMobileChannelMessagesQueryOptions(client, channelId, enabled, aroundMessageId)` — **tek** builder. Çapa yalnız ilk isteğe uygulanır; sonraki sayfalar normal `cursor` ile geriye gider.
- Çapalı okuma **kardeş cache girdisi**: `channelMessagesAround(channelId, messageId)`. Canlı anahtarı realtime bridge yamalıyor; ona ikinci bir transcript şekli öğretilmedi. Çapalıyken **SQLCipher kalıcılığı ve hydration kapalı** — çevrimdışı akış kanalın kuyruğunu tutmaya devam eder.
- `ChannelChat` rotası `messageId?` parametresi aldı. Arama sonucu: `onOpenChannel` (seçim/yazıyor/okundu sahibi) + `navigate("ChannelChat", { messageId })`.
- Ekran çapayı **bir kez** ortalar ve 1.6 sn vurgular (`anchoredMessageIdRef` koruması; sonraki liste güncellemeleri okuyucunun kaydırmasıyla yarışmaz).
- "Aşağı in" düğmesi geçmişteyken **"canlıya dön"** olur: çapayı düşürür, transcript zaten sıcak olan canlı cache girdisine döner (yeni istek yok).

**Testler:** rota mantığı 2 test (around cursor'ı ezer, çapasız okuma `hasNewer:false`), istemci yolu 1 test, sorgu katmanı 4 test (anahtar ayrımı, yalnız ilk istekte çapa, enabled kapıları, cursor semantiği), bağlantı 4 kaynak testi (navigasyon, tek seferlik kaydırma+vurgu, çıkış düğmesi, kalıcılığın kapatılması).

**Cihaz testine ek satırlar:**

| #   | Ekran               | Adım                                       | Beklenen                                                                                |
| --- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| 20  | "⋯" menüsü          | Sahip olmadığın bir sunucuda menüyü aç     | Son satır kırmızı "Sunucudan ayrıl"; sahibi olduğun sunucuda satır **yok**              |
| 21  | Ayrılma             | Satıra dokun, onayla                       | Sheet kapanır, sunucu raydan kalkar, ekran bir sonraki sunucuya geçer                   |
| 22  | Ayarlar › Tehlikeli | Sahip olmadığın sunucunun ayarlarını aç    | "Sunucudan ayrıl" **aktif** (yakında rozeti yok); onaylayınca geri dönülür              |
| 23  | Arama → mesaj       | Eski bir mesajı ara, sonuca dokun          | Kanal o mesajda açılır, mesaj kısaca vurgulanır, yukarı kaydırınca daha eskisi yüklenir |
| 24  | Geçmişten çıkış     | Aynı ekranda sağ alttaki düğmeye bas       | Canlı akışa döner (en yeni mesajlar), düğme normal davranışına geçer                    |
| 25  | Silinmiş mesaj      | Sonuç listesindeyken mesaj silinirse dokun | Kanal açılır, "mesaj bulunamadı" hatası; uygulama akışta kalır                          |
