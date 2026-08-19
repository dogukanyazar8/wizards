# Faz 5 raporu — 6d + 6e: Sunucu profili + etkinlik yönetimi + paket kapanışı

Branch `uat`. Commit yok, her şey uncommitted. Paketin son fazı.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                        | Satır |
| ---------------------------------------------------------------------------- | ----- |
| `apps/mobile/src/app/screens/server-profile/server-profile-screen.tsx`       | 1157  |
| `apps/mobile/src/app/screens/server-profile/server-profile-screen.styles.ts` | 549   |
| `apps/mobile/src/app/screens/server-profile/server-events-screen.tsx`        | 316   |
| `apps/mobile/src/app/screens/server-profile/server-event-form-screen.tsx`    | 398   |
| `apps/mobile/src/app/screens/server-profile/server-events-screen.styles.ts`  | 186   |
| `apps/mobile/component-tests/mobile-servers-6d-6e.test.tsx`                  | 687   |
| `apps/mobile/component-tests/mobile-server-events.test.tsx`                  | 419   |

### Silinen dosyalar

| Dosya                                                                       | Satır   | Yerine                                                   |
| --------------------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| `apps/mobile/src/app/screens/about/about-community-invite-screen.tsx`       | **832** | `server-profile/server-profile-screen.tsx`               |
| `apps/mobile/src/app/screens/about/about-community-invite-screen.styles.ts` | **285** | `server-profile/server-profile-screen.styles.ts`         |
| `apps/mobile/component-tests/mobile-about-community-2g.test.tsx`            | 389     | `mobile-servers-6d-6e.test.tsx` (davet kaynağı blokları) |
| `apps/mobile/component-tests/mobile-server-profile-join.test.tsx`           | 255     | aynı dosya (sunucu kaynağı + katılma blokları)           |

Toplam silinen: **1761 satır**. Eski gövde kod tabanında hiç kalmadı (`grep about-community-invite-screen` → sıfır).

### Değişen dosyalar

> Δ = `git diff --numstat`. Faz 1-4 de uncommitted olduğu için ortak dosyalarda sayı kümülatif;
> "Ne" sütunu yalnız bu fazın işini anlatır. Faz 3-5'in yeni dosyaları henüz izlenmiyor (untracked),
> onlarda Δ yok.

| Dosya                                                         | Δ               | Ne                                                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/app/mobile-sunucular-model.ts`               | 632/−1 (küm.)   | **§B/§C/§D saf katmanı:** `MOBILE_SERVER_PROFILE_CHANNEL_PREVIEW_LIMIT`, `formatMobileChannelActivityLabel`, `formatMobileServerCreatedDate`, `splitMobileServerEvents`, `parse/formatMobileEventDateTimeInput` |
| `apps/mobile/scripts/mobile-sunucular-model.test.ts`          | 501/0 (küm.)    | +8 test / 4 suite (aktivite etiketi, uzun tarih, etkinlik ayrımı, tarih girişi round-trip + reddi)                                                                                                              |
| `apps/mobile/src/locale/mobile-copy.ts`                       | 211/−20 (küm.)  | 38 yeni etkinlik anahtarı × 2 dil; **8 ölü `community*` anahtarı silindi**                                                                                                                                      |
| `apps/mobile/src/design/mobile-line-icon-definitions.ts`      | 39/0 (küm.)     | `link` (6d alt çubuk "Bağlantı" zinciri)                                                                                                                                                                        |
| `apps/mobile/src/app/screens/about/about-screen-shells.tsx`   | 9/−2            | İki rota tek gövdeye; `MobileCommunityInviteScreen` artık alias                                                                                                                                                 |
| `apps/mobile/src/app/screens/about/about-icons.tsx`           | 1/−37           | 2g'ye özel `AboutLinkIcon`/`AboutHashIcon`/`AboutSpeakerIcon` silindi (çağıranı kalmadı)                                                                                                                        |
| `apps/mobile/src/app/screens/mobile-screen-containers.tsx`    | 95/−13          | `useServerProfileScreenHandlers` (iki rota tek kablo), `ServerEvents`/`ServerEventForm` container'ları, ayarlara `onOpenEvents`                                                                                 |
| `apps/mobile/src/navigation/mobile-navigator.tsx`             | 8/0             | İki yeni `RootStack.Screen`                                                                                                                                                                                     |
| `apps/mobile/src/app/screens/workspace-server-menu-sheet.tsx` | (Faz 4 dosyası) | `initialLayer?: "menu" \| "notifications"` — 6d'nin zil butonu aynı panelin ikinci katmanına iner                                                                                                               |
| `apps/mobile/src/workspace/mobile-server-settings-screen.tsx` | 188/−4 (küm.)   | `mobile-server-events-row` (yalnız `canManageServer`) — yöneticinin ilk etkinliği açabilmesi için                                                                                                               |

---

## 2. Bağlayıcı kararlar

1. **`ServerProfile` ve `CommunityInvite` tek bileşendir.** Ayrım tek prop'ta: `source: {kind:"server",serverId} | {kind:"invite",slug}`. Fetch'in altındaki her şey kaynak-kör. İkinci bir profil gövdesi açılamaz.
2. **Dört tercih alanı profil okumasından gelir, yazım tek fonksiyondan.** Ekran `starred`/`muted`/`notificationLevel`/`inviteAddress` için ikinci uç çağırmaz; yazım `useMobileServerUserSettings` → `runMobileServerUserSettingsUpdate`. Testle kilitli (GET sayımı = 1 profil okuması).
3. **Sahiplik profilin kendi `admins` listesinden türetilir** (`role === "owner"`), workspace payload'ından değil. Sahip çözülemiyorsa ayrılma satırı **gizlenir** (fail-closed) — 400 dönecek buton gösterilmez.
4. **Workspace okuması yalnız `canManageInvites` için ve yalnız üyeye açılır** (`joined` değilse `serverId: ""` → sorgu disabled). Üye olmayan o rotayı hiç çağırmaz.
5. **Alt aksiyon çubuğu tek ve sabittir** (A0.8): `Sunucuyu aç` + zil + zincir. Scroll'a bağlı değişmez, 6e'nin ayrıl butonu **çizilmedi**.
6. **Kategori başlıkları `textTransform: "uppercase"` ile büyütülür**, JS ile değil. `"Sesli".toUpperCase()` varsayılan locale'de `SESLI` üretir — Türkçe noktalı İ kaybolur.
7. **Etkinlik listesi `status` ile ayrılır, saatle değil.** `SCHEDULED`/`ACTIVE` → yaklaşan, `COMPLETED`/`CANCELLED` → geçmiş. Cihaz saati backend'in kararına itiraz edemez.
8. **Etkinlik formunun tek yerel kuralı tarih biçimidir** (`GG.AA.YYYY SS:DD`, cihaz saat dilimi). Geri kalan doğrulama Faz 1 şemasının; istemci ikinci bir kural yazmaz. Okunamayan girdi **reddedilir**, yakın bir tarihe yuvarlanmaz (`31.02.2026` → hata).
9. **Bileşen testlerinde `QueryClient` `afterEach`'te `clear()` edilir.** `useMobileWorkspaceQuery` kendi 1 günlük `gcTime`'ını taşıyor; toplanmamış sorgu gerçek bir timer bırakıyor ve worker çıkamıyor.

---

## 3. Tasarımdan / prompt'tan sapmalar

| Sapma                                                                           | Gerekçe                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6e'nin ayrıl butonu çizilmedi**                                               | Kullanıcı kararı A0.8. Ayrılma 6c menüsünde ve sunucu ayarlarında var; üçüncü yol açılmadı. Bilinçli sapma.                                                                                                                                                                                          |
| **`UAT` ortam çipi render edilmiyor**                                           | §B2 "kaynağı yoksa render edilme" diyor. Kod tabanında sunucu başına ortam etiketi taşıyan **hiçbir alan yok**; `tags`'ten türetmek §B2'nin kendi yasağı. `theme.serverProfile.statusChipEnv` token'ı iki temada da duruyor, alan geldiğinde tek satır. Bugün sadece "● n çevrimiçi" çipi çiziliyor. |
| Doğrulama rozeti madalya değil, **dolu daire + beyaz tik**                      | `MobileLineIcon` fill modunda yalnız `path` kabul ediyor (Faz 3 §3.3'ün `dots-horizontal` kararı); madalya konturu için ikinci bir ikon modu açmak yerine `verifiedBadge.fill/check/size` token'ları daire + `check` ikonuna bağlandı.                                                               |
| `link` (zincir) ikonu kite eklendi                                              | Kitte zincir yoktu; `external-link` kutu-ok, `copy` iki dikdörtgen. Yol handoff'tan alındı — Faz 3 `dots-horizontal`, Faz 4 `arrow-up-tray` kararının aynısı.                                                                                                                                        |
| Banner "paylaş" **sistem paylaşımı**, alt çubuk "bağlantı" **panoya kopyalama** | İki yüzey aynı işi yapmasın diye. §B1 "paylaş", §B7 "bağlantı" diyor; ikisini de `Share.share` yapmak aynı butonu iki kez çizmek olurdu.                                                                                                                                                             |
| Arkadaşlar satırının chevron'u **sunucu üyeleri** ekranına gider                | §F "ortak arkadaş listesini yeniden tasarlama, mevcut yüzeye bağla" diyor; kod tabanında ortak-arkadaş ekranı yok, en yakın mevcut yüzey `ServerMembers`. Üye olmayanda satır dokunulamaz (`disabled`).                                                                                              |
| Yönetici satırı popover değil, **`UserProfile` rotası** açıyor                  | §C4 "mevcut profil kartı bileşeni — yenisini yazma". Profil kartı popover'ı `useOpenMobileProfileCard` üzerinden bir overlay kaydı ister; rota zaten aynı kimliği gösteriyor ve yeni yüzey açmıyor.                                                                                                  |
| Kanal satırları **dokunulamaz**                                                 | Tasarım profil listesinde kanal satırına hedef vermiyor; 00 §2.6 tasarımda olmayan davranışı yasaklıyor. §C2'nin "dokunulabilir" cümlesi soluk/kilitli varyantın reddine dair, hedefe dair değil.                                                                                                    |
| `KANALLAR {toplam}` başlığının **altında** ayrıca kategori başlıkları var       | §B6 bölüm başlığını, §C2 kategori başlıklarını şart koşuyor; ikisi aynı ekranın iki kaydırma hâli. Tek kategorili sunucuda üst üste iki başlık görünür — sözleşmenin ikisini de karşılayan tek düzen bu. Kategorisiz kanallar başlıksız karta düşer.                                                 |
| Ön izleme sınırı **5 kanal**                                                    | Handoff sayı vermiyor, 6d ekran görüntüsünde 4-5 satır var. Sabit `MOBILE_SERVER_PROFILE_CHANNEL_PREVIEW_LIMIT` olarak modelde, ekranda değil.                                                                                                                                                       |
| Etkinlik listesine **sunucu ayarlarından** ikinci giriş                         | §D1 "yönetici girişi" istiyor. 6d kartı yalnız yaklaşan etkinlik **varken** çiziliyor; o kart tek giriş olsaydı ilk etkinlik telefondan hiç oluşturulamazdı. Satır web ayar overlay'inin "Etkinlikler" sekmesinin ikizi ve yalnız `canManageServer`.                                                 |
| Etkinlik formunda **tarih seçici yok**, metin alanı var                         | §F "takvim entegrasyonu yazma"; kitte tarih seçici yok, yenisini yazmak fazın kapsamı dışında yeni bir yüzey olurdu. Biçim ipucu alanın placeholder'ında.                                                                                                                                            |
| Etkinlik formu **`imageUrl` taşımıyor**                                         | §F1 yasağı (Faz 1 §6.2 borcu).                                                                                                                                                                                                                                                                       |

---

## 4. Kapı çıktıları (gerçek çıktı)

```bash
pnpm --filter @wizards/types test
```

```
ℹ tests 213
ℹ pass 213
ℹ fail 0
```

```bash
pnpm --filter @wizards/web test
```

```
ℹ tests 2144
ℹ suites 484
ℹ pass 2144
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
ℹ tests 1736
ℹ suites 306
ℹ pass 1736
ℹ fail 0
```

`apps/mobile` dizininden:

```bash
npx jest
```

```
Test Suites: 132 passed, 132 total
Tests:       1233 passed, 1233 total
```

```bash
graphify update .
```

```
[graphify watch] No code-graph topology changes detected; outputs left untouched.
Code graph updated.
```

> Aynı komut ardışık koşularda **iki kez** `[WinError 5] Erişim engellendi: graphify-out\.graph.tmp.json -> graphify-out\graph.json` verdi (Faz 1 §6.7'nin duran borcu: arka planda bir `graphify watch` dosyayı tutuyor). Yukarıdaki yeşil çıktı üçüncü denemenin; graf güncel.

### Taban çizgisi karşılaştırması (A0.7)

| Ölçü       | Faz 4 sonu | Faz 5 sonu | Δ                    |
| ---------- | ---------- | ---------- | -------------------- |
| types      | 213        | **213**    | =                    |
| web        | 2144       | **2144**   | =                    |
| mobil node | 1729       | **1736**   | +7                   |
| jest süit  | 132        | **132**    | = (−2 eski, +2 yeni) |
| jest test  | 1214       | **1233**   | +19                  |

Hiçbir sayı düşmedi.

---

## 5. Yirmi kabul kriteri — madde madde

| #   | Kriter                                                                      | Durum                   | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | A0 uyumu (yedi alt madde)                                                   | ✅                      | (a) dört tercih ikinci uçtan çekilmiyor — "opens the 6c menu and writes a preference through the single settings endpoint" testi profil GET sayısını 1'de kilitliyor; (b) yazım `runMobileServerUserSettingsUpdate` (aynı test PATCH gövdesini `{starred:true}` olarak iddia ediyor); (c) profil "⋯" mevcut `WorkspaceServerMenuSheet`'i açıyor, "lands the bell on the notification layer of the same panel" iki katmanın tek panelde kaldığını gösteriyor; (d) `groupMobileProfileChannelsByCategory` yeniden sıralanmadı — ekran grupları geldiği sırayla basıyor; (e) profilde etiket editörü yok, çipler salt okunur + keşfe gidiyor; (f) sahipte ayrılma satırı yok ("never renders the leave row for the owner but does for a member"); (g) alt çubuk tek ve sabit |
| 14  | Kategori başlıklarında `+` yok                                              | ✅ (Faz 3'te kapandı)   | `mobile-workspace-section-create` kodda sıfır; bu faz o yüzeye dokunmadı, 132 süit yeşil                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | Uzun ad testi (390px, iki satır, `…`)                                       | ✅                      | Bu fazda **beşinci yüzey** eklendi: "clamps a long name to two lines" (`numberOfLines=2`, `ellipsizeMode="tail"`); 6e yapışkan başlık tek satır (`numberOfLines=1`, 6f'in `sticky` bağlamı)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 16  | Başlıkta en fazla iki ikon butonu                                           | ✅ (Faz 3/4'te kapandı) | Bu fazda regresyon yok. **Not:** profil banner'ında üç kontrol var (geri + paylaş + "⋯") — kriter 16 Sunucular ekranının başlığı için, 6d banner'ı §B1'de üçünü de birebir çiziyor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17  | Filtre şeridi (süzme, canlı rozet, kullanıcı+sunucu kalıcılık)              | ✅ (Faz 3'te kapandı)   | Bu fazda dokunulmadı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 18  | Kapalı kategori (chevron + soluk başlık + nokta), boş kategoriler listede   | ✅ (Faz 3'te kapandı)   | Bu fazda dokunulmadı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 19  | 6d/6e birebir, hepsi gerçek API'den, veri yoksa blok gizli                  | ✅                      | Rozet/adres kopyalama/4'lü istatistik/arkadaşlar/etkinlik kartı/kategorili kanal listesi/yöneticiler/hakkında — hepsi `ServerPublicProfile` alanlarından. "hides the friends row, the event card, the tags and the description when there is no data" beş bloğun birden gizlendiğini iddia ediyor; boş kart bırakılmıyor. `weeklyMessageCount === null` tek istisna: hücre `—` ile kalıyor (§B3 böyle diyor)                                                                                                                                                                                                                                                                                                                                                              |
| 20  | Alt çubuk sabit; üye olmayanda `Sunucuya katıl`                             | ✅                      | "keeps one bar with open, notifications and link for a member" + "switches the primary action to join and hides the bell for a non-member". "Özel kanallar kilitli" maddesi §C2 notu gereği düştü; soluk/kilitli varyant **yazılmadı**, private çip tam opak satırda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| +   | Tek gövde iki rotayı besliyor; eski gövde silindi                           | ✅                      | "reads the invite preview when the source is a slug and draws the same blocks" — davet kaynağı `PREVIEW_PATH` okuyor, profil rotasını hiç çağırmıyor; 832+285 satırlık eski gövde ve stilleri silindi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| +   | Etkinlik CRUD + ilgi uçtan uca; 15 dk eşiği iki istemcide aynı fonksiyondan | ✅                      | Liste/form/iptal/ilgi 11 testle kapalı; eşik `resolveMobileEventAction` → Faz 1'in `resolveServerScheduledEventAction`'ı. "connects a starting event to its channel instead of toggling interest" 5 dk kalan etkinlikte `Katıl`, 6 saat kalanda `Hatırlat`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| +   | Tüm dokunma hedefleri ≥ 44px; sheet'ler sürüklenerek kapanıyor              | ⚠️ kısmi kanıt          | Kanal/yönetici satırı 10+10+28/32 = 48-52; birincil buton 50; çubuk ikon butonları 50×50; banner butonları 36 + `bannerActions` dolgusu; 34px'lik yapışkan başlık kontrolleri `hitSlop={8}` ile genişletildi. Sürükleme `BottomSheet`'in kendi `Gesture.Pan`'i (kendi testinde). **Gerçek ölçüm cihaz testine bırakıldı** (§7-13)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| +   | Tüm geçici mesajlar Bölüm 3 toast bileşeninden                              | ✅                      | Kopyalama/katılma/ilgi/iptal/kaydetme/tercih hatası — hepsi `useToast`. Yeni geçici mesaj kalıbı yok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 6. `UAT` ortam çipi — nasıl ele alındı

`theme.serverProfile.statusChipEnv` (açık + koyu) Faz 2'de eklenmişti. Faz 5'te **kaynağı arandı ve bulunamadı**:

- `Server` tablosunda ortam/rozet kolonu yok; `features String[]` yetenek bayrağı (`VERIFIED` orada) ve doğrulama rozetini besliyor.
- `ServerPublicProfile` şemasında da karşılığı yok (Faz 1 §F tam liste).
- `tags` üzerinden türetmek §B2'nin açık yasağı.

**Karar:** çip render edilmiyor, token duruyor. Kimlik bloğunda yalnız "● n çevrimiçi" çipi var. Alan geldiğinde ekleme tek koşullu blok.

---

## 7. Cihaz test listesi (kullanıcı yapar)

| #   | Hesap / Ekran                          | Adım                                                                | Beklenen                                                                                                                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Üye · Sunucu profili                   | "⋯" menüsünden "Sunucu bilgisi"                                     | Banner + logo taşması, ad, `whispr.gg/…`, açıklama, etiketler, 4'lü istatistik                                                           |
| 2   | Aynı                                   | Yavaşça aşağı kaydır                                                | Banner butonları solarken beyaz kompakt başlık **sürekli** beliriyor, zıplama yok; status bar beyazdan koyuya dönüyor                    |
| 3   | Aynı                                   | Adrese dokun                                                        | "Bağlantı kopyalandı" toast'ı; panoda `whispr.gg/…`                                                                                      |
| 4   | Uzun adlı sunucu                       | 6a başlık, 6b kart, 6c kimlik, 6d ad, 6e yapışkan başlık            | Beşi de 6f tablosuna uyuyor: ilk dördü iki satır + `…`, yapışkan başlık tek satır + `…`                                                  |
| 5   | Aynı                                   | Açıklaması 3 satırdan uzun sunucu                                   | "Devamı" görünüyor; dokununca tam metin açılıyor, kapanmıyor                                                                             |
| 6   | Aynı                                   | Bir etikete dokun                                                   | Keşfet açılıyor (arama terimi etiket)                                                                                                    |
| 7   | Aynı                                   | Kanal bölümü                                                        | `KANALLAR n` + kategori başlıkları; metin kanalında `31 Tem` gibi tarih, sesli kanalda katılımcı avatarları / `n kişi` / `Boş`           |
| 8   | Aynı                                   | 5'ten fazla kanallı sunucu                                          | "Kalan n kanalı gör" var; dokununca kalanlar geliyor ve buton kayboluyor (tek yönlü)                                                     |
| 9   | Rolüyle özel kanal gören üye           | Kanal listesi                                                       | Özel kanal satırı **tam opak**, sağında kilitli "Özel" çipi                                                                              |
| 10  | Aynı                                   | YÖNETİCİLER bölümü                                                  | Çevrimiçi olanda yeşil nokta; altta "Çevrimiçi" / "2 saat önce"; sağda `SAHİP`/`YÖNETİCİ` çipi; satıra dokununca kullanıcı profili       |
| 11  | Aynı                                   | HAKKINDA                                                            | "Oluşturulma" tam tarih; "Katılımın" göreli süre; "Erişim" doğru etiket                                                                  |
| 12  | Üye olmayan hesap · davet linki        | Linki aç                                                            | Birincil buton "Sunucuya katıl", zil butonu **yok**, "⋯" **yok**, "Katılımın" satırı yok; katıldıktan sonra buton "Sunucuyu aç"a dönüyor |
| 13  | Üye                                    | Alt çubuk zil butonu                                                | Aynı panel doğrudan **bildirim seviyesi katmanında** açılıyor; geri düğmesi menü katmanına dönüyor                                       |
| 14  | Üye                                    | Alt çubuk zincir butonu                                             | Bağlantı panoya kopyalanıyor + toast                                                                                                     |
| 15  | Üye                                    | Banner'daki paylaş butonu                                           | Sistem paylaşım sayfası                                                                                                                  |
| 16  | Sahip                                  | "⋯" menüsü                                                          | "Sunucudan ayrıl" satırı **hiç yok**                                                                                                     |
| 17  | Üye (sahip değil)                      | "⋯" › Sunucudan ayrıl › onayla                                      | Sunucudan çıkılıyor, ekran geri dönüyor, rayda sunucu yok                                                                                |
| 18  | Üye                                    | Menüden "Yıldızla", sonra profili kapat                             | Rail sıralaması güncelleniyor; profil yeniden açıldığında yıldız hâlâ dolu                                                               |
| 19  | Uçak modu                              | Menüden "Sessize al"                                                | Kart bir an yanıyor, geri dönüyor + "Tercih kaydedilemedi" toast'ı                                                                       |
| 20  | Yönetici · Sunucu ayarları             | "Etkinlikler" satırı                                                | Etkinlik listesi açılıyor; yetkisiz hesapta satır **yok**                                                                                |
| 21  | Yönetici · Etkinlikler                 | "Etkinlik oluştur" → ad + `12.03.2026 18:00` + sesli kanal → Kaydet | "Etkinlik kaydedildi", liste güncelleniyor, profilde yaklaşan etkinlik kartı beliriyor                                                   |
| 22  | Aynı                                   | Tarihe `12 Mart` yaz                                                | "Tarih GG.AA.YYYY SS:DD biçiminde olmalı"; istek gitmiyor                                                                                |
| 23  | Aynı                                   | Bitişi başlangıçtan önce ver                                        | "Bitiş başlangıçtan sonra olmalı"                                                                                                        |
| 24  | Aynı                                   | Tür = Harici seç                                                    | Kanal seçici gidiyor, "Harici konum" alanı geliyor                                                                                       |
| 25  | Aynı                                   | Bir etkinliği "Etkinliği iptal et" → onayla                         | Satır listede kalıyor, "İptal edildi" çipiyle; aksiyon butonları gidiyor                                                                 |
| 26  | Üye (yetkisiz) · Etkinlikler           | Aynı liste                                                          | "Etkinlik oluştur", "Düzenle", "İptal et" **yok**; "Hatırlat" var                                                                        |
| 27  | İki etkinlik: 20 dk ve 10 dk sonrası   | Profil kartı ve liste                                               | 20 dk → `Hatırlat` (dokununca "Hatırlatılacak"), 10 dk → `Katıl` (dokununca etkinliğin sesli kanalına bağlanıyor)                        |
| 28  | Koyu tema                              | 6a-6e beş ekran + iki etkinlik ekranı                               | Banner gradyanı iki temada aynı; kartlar, çipler, rol rozetleri, danger pill okunur                                                      |
| 29  | Küçük ekran (≤360px) + büyük yazı tipi | Profil                                                              | İstatistik hücreleri taşmıyor, ad ve etiketler sarıyor, alt çubuk sabit                                                                  |
| 30  | Kategori daralt/aç + filtre seçimi     | Uygulamayı kapat-aç                                                 | Seçimler korunuyor (Faz 3 kalıcılığı)                                                                                                    |
| 31  | Dil (English)                          | Profil + etkinlikler                                                | "Open server / Join server / Members / Channels / In voice / This week / ADMINS / ABOUT / Events / Create event / Reminder on"           |

---

## 8. Devredilen borç

1. **`UAT` ortam çipi kaynaksız** (§6). Token hazır, alan yok.
2. **Ortak arkadaş listesi ekranı yok.** Arkadaşlar satırı `ServerMembers`'a gidiyor; gerçek "ortak arkadaşlar" yüzeyi ayrı iş.
3. **Yönetici satırı popover yerine rota açıyor.** Profil kartı popover'ını bu ekrana bağlamak overlay kaydı ister.
4. **Etkinlik formunda tarih seçici yok** — metin alanı + biçim doğrulaması. Kitte seçici olmadığı için kapsam dışı bırakıldı.
5. **Etkinlik için soket olayı yok** (Faz 1 §6.6). Profil ve liste invalidation ile tazeleniyor; ikinci cihaz kendiliğinden güncellenmez.
6. **`ScheduledEvent.imageUrl` hâlâ kullanılmıyor** (Faz 1 §6.2).
7. **`accessLevel: "approval"` üreten kolon yok** (Faz 1 §6.3). 6e üç etiketi de biliyor, servis ikisini üretiyor.
8. **Jest worker sızıntısı kod tabanında duruyor ve Faz 5'e ait değil.** `npx jest` tam süiti "A worker process has failed to exit gracefully" uyarısı veriyor. Kök neden `useMobileWorkspaceQuery`'nin 1 günlük `gcTime`'ı: toplanmayan sorgu gerçek bir `setTimeout` bırakıyor. Doğrulandı — `npx jest component-tests/mobile-server-management.test.tsx` (bu fazın dokunmadığı, önceden var olan süit) tek başına "Jest did not exit" diyor. Faz 5'in iki yeni süiti `QueryClient.clear()` ile temiz çıkıyor; aynı kalıp diğer süitlere de uygulanmalı. Süit sayısı, test sayısı ve exit code etkilenmiyor.
9. **`graphify update .` Windows dosya kilidine takılıyor** (Faz 1 §6.7 duruyor): arka plandaki `graphify watch` `graph.json`'ı tutuyor, komut 2-3 denemede bir geçiyor.
10. **Faz 3-4'ün duran borçları** (tsvector `english`, sunucu geneli arama sayfalanmıyor, haftalık sayım ham `Message` üzerinden, kategori sürükle-bırak yok, sahibe "önce sahipliği devret" uyarısı yok, `mutedUntil` yazılmıyor) bu fazda kapanmadı.
11. **Çözüldü (2026-08-18):** Faz 4 §8.8'de belirtilen `.railway-config-pull-29632/` çalışma ağacından kaldırıldı.

---

## 9. Paket kapanışı

Beş fazın tamamı `uat` üzerinde **uncommitted**. Faz 1 (veri katmanı) → Faz 2 (mobil temel katman) → Faz 3 (6a/6b/6f) → Faz 4 (6c) → Faz 5 (6d/6e + etkinlik + göç) sırasıyla indi; her fazın kapısı yeşil, taban çizgileri hiçbir adımda düşmedi.

Commit izni bekleniyor.
