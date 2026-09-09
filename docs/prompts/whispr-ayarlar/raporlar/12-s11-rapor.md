# Ş11 — Bildirimler paneli (400 px) + Bildirim ayarları penceresi (560 px)

**Dal:** `uat` · **Dalga:** 4 · **Paralel:** Ş12 (kullanıcı barı menüsü)
`channel-sidebar.tsx`e **dokunulmadı**.

---

## 1. Ne yapıldı

| Dosya                                                                      | Durum       | İş                                                                                                                                                      |
| -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/notifications/panel-state.ts`                            | yeni        | İki yüzeyin **tek** indirgeyicisi + saf seçiciler                                                                                                       |
| `apps/web/src/lib/notifications/panel-state.test.ts`                       | yeni        | 18 test                                                                                                                                                 |
| `apps/web/src/components/notifications/notification-panel.tsx`             | yeni        | 400 px panel: başlık · sekmeler · liste · sonsuz kaydırma · alt şerit                                                                                   |
| `apps/web/src/components/notifications/notification-panel.test.tsx`        | yeni        | 14 test                                                                                                                                                 |
| `apps/web/src/components/notifications/notification-panel-tabs.tsx`        | yeni        | `role="tablist"`, `←/→`, sayaç pilleri                                                                                                                  |
| `apps/web/src/components/notifications/notification-panel-tabs.test.tsx`   | yeni        | 7 test                                                                                                                                                  |
| `apps/web/src/components/notifications/notification-item.tsx`              | yeni        | Satır + tür ikonu + saat biçimleyici                                                                                                                    |
| `apps/web/src/components/notifications/notification-item.test.tsx`         | yeni        | 13 test                                                                                                                                                 |
| `apps/web/src/components/notifications/notification-prefs-dialog.tsx`      | yeni        | 560 px pencere: izin şeridi · üç düzey kartı · üç hızlı tercih · alt şerit                                                                              |
| `apps/web/src/components/notifications/notification-prefs-dialog.test.tsx` | yeni        | 20 test                                                                                                                                                 |
| `apps/web/src/components/notifications/notification-prefs-fixture.ts`      | yeni        | İki testin ortak `NotificationPrefs` fikstürü (tam nesne, `as` yok)                                                                                     |
| `apps/web/src/components/shared/notification-bell.tsx`                     | düzenlendi  | **Yalnız popover gövdesi**; düğme, `badgeVariant`, nokta ve `document.title` yerinde                                                                    |
| `apps/web/src/components/shared/notification-bell.test.tsx`                | yeni        | 7 test                                                                                                                                                  |
| `apps/web/src/components/shared/notification-bell-events.test.ts`          | **silindi** | Test ettiği iki yardımcı (`prependIncomingNotification`, `applyIncomingNotification`) düz liste önbelleğine aitti; liste sayfalı oldu, yardımcılar öldü |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`                         | düzenlendi  | **Tek anahtarın değeri**: `notif.prefs.quick.quietHours.body` interpolasyona çevrildi (§4.4). Anahtar kümesi değişmedi.                                 |

Yeni test: **79**.

---

## 2. Mimari kararlar

### 2.1 Sayaç tek önbellek girişinde

Dört sekme dört ayrı sonsuz listedir, sayaç **tektir**. `notificationsQueryKeys.counts`
zil noktasının, başlıktaki kırmızı sayının ve dört sekme pilinin ortak kaynağı:

- sayfa yanıtı (`NotificationPageDTO.counts`) `queryFn` içinde oraya yazılır,
- `POST /[id]/read` ve `PATCH /read-all` yanıtları oraya yazılır,
- `notification:read` ve `notification:new` yükleri oraya yazılır.

**İstemci hiçbir yerde artırmaz.** `mergeNotifCounts` yükte sayaç yoksa eldekini korur ve
çağıran `/unread-count`u yeniden okur; `current + 1` iki sekme açıkken kaçınılmaz olarak
ayrışırdı. `panel-state.test.ts` bunu kilitliyor.

### 2.2 Kırmızı `0` tek yerde reddediliyor

`hasVisibleNotifCount(count)` = `count > 0`. Beş çizim yeri (zil rozeti, zil noktası, başlık
sayacı, dört sekme pili) hep bunu soruyor. Her çağrı yerinde `count > 0` yazılsaydı biri
unutulur ve "0 okunmamış bildirimin var" diyen bir pil çıkardı. Negatif değer de gizleniyor.

### 2.3 Okundu bayrağı dört sekmenin önbelleğinde birden çevriliyor

Aynı bildirim `Tümü` ve `Bahsedilmeler` sayfalarında ayrı nesneler. Tek sekme çevrilseydi,
sekme değiştiren kullanıcı aynı satırı iki farklı durumda görürdü. `notification:read`
soketi de aynı yolu kullanıyor → **iki sekme açıkken birinde okunan diğerinde de okunmuş**.

### 2.4 Sonsuz kaydırmanın bağımlılıkları ilkel

`IntersectionObserver` efektinin bağımlılık listesi `[hasNextPage, isFetchingNextPage,
rowCount]`. `fetchNextPage` bir ref'te taşınıyor ve ref **efekt içinde** tazeleniyor (render
sırasında ref yazmak `react-hooks/refs`i ihlal ediyor). Prompt'un adlandırdığı tuzak
(`[listQuery]` → her render bir sayfa) için kaynak seviyesinde bir kapı testi var:
`notification-panel.test.tsx` → "gözlemci efektinin bağımlılıkları ilkel". Gerçek istek
sayacı DOM ister; bu depoda web testlerinin DOM'u yok, o ölçüm e2e'nin işi.

### 2.5 `router.push` yerine `next/link`

`Tüm bildirimleri gör` (`/mentions`), `Tüm bildirim ayarları`
(`/settings/notifications/surfaces`) ve `Saatleri düzenle`
(`/settings/notifications/quiet-hours`) gerçek `<a>` bağlantısı. İki kazanç:

1. Ayarlar penceresi bir **rotadır** (K2) — bağlantı yeni sekmede açılabilir, adresi
   kopyalanabilir; `router.push` çağıran bir düğme bunu yapamaz.
2. `useRouter()` `renderToStaticMarkup` altında `invariant expected app router to be mounted`
   ile patlıyor; üç bileşen de router'sız kaldığı için markup testleri kurulabildi.

Üçü de tıklandığında `onClose` ile paneli/pencereyi kapatıyor.

### 2.6 Tercih yazımı Ayarlar penceresiyle aynı önbellekten

560 px pencere `lib/settings/notification-prefs-client.ts`i (Ş1) kullanıyor ve yanıtı
`notificationPrefsQueryKeys.root`a yazıyor — Ayarlar penceresinin okuduğu **aynı** giriş.
Üç hızlı tercih ve düzey kartları bu yüzden 00 tuzak #4'ü otomatik karşılıyor; ikinci bir
durum kopyası yok. Düzey kartları Ayarlar › Genel'deki menüyle aynı `level` anahtarını yazıyor
(sapma #6); iki etiket kümesi de birebir korundu.

---

## 3. Kabul listesi

### Panel

| Madde                                                                                            | Durum                                                                  |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Zil paneli açıyor/kapatıyor; açıkken primary vurgu; okunmamış varsa 7 px danger nokta            | ✅                                                                     |
| Satıra tıklamak durumu **çeviriyor**; sayaç, 4 sekme pili ve zil noktası aynı anda güncelleniyor | ✅ (tek önbellek girişi, §2.1)                                         |
| `Tümünü okundu işaretle` hepsini okuyor; başlık `Hepsi okundu` göstergesine dönüyor              | ✅                                                                     |
| Kırmızı `0` pili hiçbir durumda görünmüyor                                                       | ✅ (3 test)                                                            |
| Sekme sayaçları yalnız okunmamışı sayıyor ve socket yükünden okunuyor                            | ✅                                                                     |
| İki sekme açıkken birinde okunan diğerinde de okunmuş görünüyor                                  | ✅ (§2.3)                                                              |
| Gün grubu etiketi i18n'den; kova sunucudan                                                       | ✅ (`today` dizesi markup'ta yok)                                      |
| Okunmamış durumu `aria-label`'da **metinle** de var                                              | ✅                                                                     |
| Sonsuz kaydırma çalışıyor ve her render bir sayfa çekmiyor                                       | ✅ kod + kaynak kapısı · ⚠️ istek sayacı ölçümü e2e'ye kaldı (DOM yok) |
| Sessiz saat satırı tercih kapalıyken yazılmıyor                                                  | ✅ (yüklenmemişken de yazılmıyor)                                      |
| `Tüm bildirimleri gör` `/mentions`'a gidiyor                                                     | ✅                                                                     |
| Dişli paneli kapatıp 560 px pencereyi açıyor                                                     | ✅ (tek geçiş, `openPrefs`)                                            |

### 560 px pencere

| Madde                                                                                | Durum                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İzin verilmişse şerit render edilmiyor; verilmemişse iki düğme çalışıyor             | ✅ (izin okunmadan da çizilmiyor)                                                                                                                              |
| `İzin iste` gerçek tarayıcı izni istiyor                                             | ✅ `requestDesktopPermission("notifications")` → `window.Notification.requestPermission()`                                                                     |
| `Yalnızca önemli` kartında `Önerilen` pili var                                       | ✅ (markup'ta tam bir kez)                                                                                                                                     |
| Düzey seçimi Ayarlar › Genel'deki menüyle aynı değeri yazıyor                        | ✅ (`level`, tek uç)                                                                                                                                           |
| Ayrıntıda sapma varken `Özel` pili çıkıyor                                           | ✅ `isCustomLevel` (Ş1)                                                                                                                                        |
| Üç hızlı tercih Ayarlar'daki karşılıklarıyla senkron                                 | ✅ (aynı önbellek girişi)                                                                                                                                      |
| `Tüm bildirim ayarları` → Yüzeyler, `Saatleri düzenle` → Sessiz saatler              | ✅                                                                                                                                                             |
| Kayıt göstergesi gerçek yanıt üzerine üç durumu gösteriyor; sabit gecikme yok        | ✅ `onMutate/onSuccess/onError`; `idle` hiçbir şey yazmıyor                                                                                                    |
| Örtüye tıklama ve `Esc` sırayla modal → panel kapatıyor; focus tetikleyiciye dönüyor | ✅ örtü kartın kardeşi, focus tuzağı + geri verme                                                                                                              |
| Açık ve koyu temada `screens/01-*.png` / `02-*.png` ile karşılaştırma                | ⚠️ **statik** karşılaştırma yapıldı (kare + referansın inline `style`'ı); çalışan uygulamada iki temada göz kontrolü yapılamadı — bu ortamda dev sunucu/DB yok |

---

## 4. Kayda geçen sapmalar

### 4.1 Beşinci tür ikonu (`R` · `--info`) ürüne konmadı

SPEC §1 beş ikon istiyor: bahsetme `@`, **rol `R`**, thread `T`, etkinlik `E`, sistem `S`.
Ürünün sözleşmesinde (`NotifKind`, Ş0) dört değer var ve rol bahsetmesi kişisel bahsetmeyle
aynı `mention` kovasına düşüyor (`panel-query.ts`). Beşinciyi çizebilmek için sunucunun satır
başına "bu bir rol bahsetmesiydi" demesi gerekirdi; o alan Ş2'nin dosyasında.

Uydurma bir istemci sezgisi (başlıkta `@rol` aramak gibi) rol adını içeren **her** bahsetmeyi
yanlış boyardı. Dört kova, dört harf. `--info` token'ı hazır duruyor (`globals.css:37`);
Ş2/Ş13 `AppNotification`a bir ayırt edici alan eklerse ikon tablosu tek satırda büyür.

### 4.2 Sözlükte karşılığı olmayan on ölçü/opaklık bileşende sabit

`SETTINGS_METRICS.panel` / `.prefsDialog` bu değerleri taşımıyor; sözlüğün sahibi olmayan bir
şerit ona kayıt ekleyemez. Hepsi referansın inline `style`'ından, yorumla birlikte:

| Sabit                            | Değer       | Nerede                          | Referans                      |
| -------------------------------- | ----------- | ------------------------------- | ----------------------------- |
| `ICON_SURFACE_ALPHA`             | `.14`       | `notification-item.tsx`         | `soft()`                      |
| `TITLE_TIME_GAP`                 | `8`         | `notification-item.tsx`         | başlık↔saat `gap:8px`         |
| `SOFT_SURFACE_ALPHA`             | `.14`       | `notification-panel.tsx`        | boş durum ikon zemini         |
| `EMPTY_BORDER_ALPHA`             | `.3`        | `notification-panel.tsx`        | boş durum çerçevesi           |
| `VIEWPORT_MARGIN`                | `12`        | `notification-panel.tsx`        | (ürün kararı, §4.3)           |
| `SECTION_RULE_ALPHA`             | `.5`        | `notification-prefs-dialog.tsx` | bölüm başlığı hairline        |
| `PILL_SURFACE_ALPHA`             | `.16`       | `notification-prefs-dialog.tsx` | `Özel` / `Önerilen`           |
| `LEVEL_IDLE_SURFACE_ALPHA`       | `.4`        | `notification-prefs-dialog.tsx` | seçilmemiş kart               |
| `OUTLINE_BUTTON_BORDER_ALPHA`    | `.8`        | `notification-prefs-dialog.tsx` | çerçeveli düğme               |
| `TITLE_PILL_GAP` · `SAVE_WEIGHT` | `8` · `500` | `notification-prefs-dialog.tsx` | başlık↔pil, `font:500 11.5px` |

**Ş13'e devir:** ya bu on kayıt `lib/settings/metrics.ts`e taşınır ve `parity.test.ts` onları da
referansta arar, ya da sözlüğün kapsamı bilerek "sayı/yarıçap/boşluk" ile sınırlı sayılır.

### 4.3 SPEC §10'un `<520px` alt sayfası uygulanmadı

`SETTINGS_METRICS.panel.sheetBreakpoint = 520` **tüketicisiz** kaldı. Gerekçe üç katlı:

1. Ş11'in kabul listesinde alt sayfa yok; §A.1 yalnız 400 px popover'ı tarif ediyor.
2. Kırılım CSS'te seçilmeli (00 tuzak #10) — satır içi ölçü bir Tailwind sınıf değişkenini
   ezer, JavaScript kırılımı ilk boyayı yanlış yapar. Doğru yer `globals.css` ve orası bu
   şeridin dosyası değil.
3. Panel yine de dar ekranda ekranın içinde kalıyor:
   `width: min(400px, 100vw − 24px)`, `max-height: min(640px, 100dvh − 62px)`.

### 4.4 `notif.prefs.quick.quietHours.body` interpolasyona çevrildi

Ş0 anahtarı **sabit metinle** bırakmıştı (`Her gün 23:00 – 08:00 arasında sessiz.`), prompt
§10 ise "alt metindeki saat aralığı gerçek tercihten interpolasyonla" diyor. İki dosyada birer
satır değişti:

```
tr: "Her gün {start} – {end} arasında sessiz."
en: "Silent every day between {start} and {end}."
```

Anahtar **eklenmedi/silinmedi**; `settings-screen-copy.test.ts`in `pending.length === 296`
sayacı ve `messages.test.ts`in anahtar kümesi denetimi yeşil kaldı. Sözlük dosyaları hiçbir
şeridin "sahiplenilen dosya" listesinde değil; başka bir anahtara dokunulmadı, Ş12'nin
`notif.menu.*` bloğuna girilmedi.

### 4.5 Tasarım gereği kaybolan davranışlar

Popover gövdesi yeniden yazıldı; eski gövdenin şu davranışları yeni tasarımda **yok**:

| Kaybolan                                            | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                  | Devir                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Satıra tıklayınca `actionUrl`e gitmek               | SPEC §1 ve §6: satır tıklaması okundu durumunu **çevirir**. Panel bir kayıt defteri; hedefe gitme yolu `Tüm bildirimleri gör` → `/mentions` (K10)                                                                                                                                                                                                                                                                        | —                                                    |
| Satır içi `Kabul et` / `Reddet` (arkadaşlık isteği) | Tasarımın satırında eylem düğmesi yok                                                                                                                                                                                                                                                                                                                                                                                    | Arkadaşlar ekranı bu işi zaten yapıyor               |
| `Tümünü temizle` düğmesi                            | Tasarımın alt şeridinde iki öğe var: sessiz saat metni + `Tüm bildirimleri gör`                                                                                                                                                                                                                                                                                                                                          | `deleteAllNotifications` **tüketicisiz** kaldı → Ş13 |
| Popover'ın kendini kapatan zamanlayıcısı            | Tasarımda yok; sonsuz kaydıran bir listeyi zamanlayıcıyla kapatmak kaydırmanın ortasında paneli yok eder. Kaynağı `UserSettings.notificationAutoClose` + `notificationPopupTimeoutSeconds` (eski kolonlar); yeni tercih `panel.autoClose` / `panel.durationSec` (K3, `UserNotificationSettings`) ve o satırlar Bildirimler › Panel'de **açılır uyarı kartını** anlatıyor (`np1`: "Aynı anda üst üste duran uyarı kartı") | İki eski kolon **tüketicisiz** kaldı → Ş13           |
| `NotificationBell`'in `open` prop'u                 | İndirgeyici iki yüzeyi birden yönetiyor; dışarıdan tek boole ile sürülemez. Üründe hiçbir çağrı yeri geçmiyordu (`app-screen-top-bar.tsx` yalnız `badgeVariant`/`className`/`style` veriyor)                                                                                                                                                                                                                             | `onOpenChange` **korundu**                           |

### 4.6 Tüketicisiz kalan eski istemci fonksiyonları

`lib/notifications/client.ts` içindeki `fetchNotifications`, `fetchUnreadCount`,
`markNotificationRead`, `deleteAllNotifications` ve `notificationsQueryKeys.list` artık
hiçbir yerden çağrılmıyor. `GET /api/v1/notifications`in `?tab` taşımayan **dizi dalı** da
öksüz kaldı (route-logic'in kendi yorumu bunu "Ş11 paneli bağladığında ölür" diye
yazmıştı). Silme kararı Ş13'ün ölü kod taramasına ait; bu şerit uçları bozmadı.

---

## 5. `TODO(api):` ve devirler

1. **`notification:new` satırı taşımıyor.** Yük `NotificationSocketPayload` (ham satır), panelin
   okuduğu şey `AppNotification`. Açık panel bu yüzden yeni bildirimde listeyi
   `invalidateQueries` ile tazeliyor — yükten satır **üretmiyor**, çünkü kova kararı
   (`resolveNotifPanelBucket`) ve gün kovası sunucuda. Yayımcıların tamamı
   `withNotificationCounts` ile beslendiğinde `counts` alanı zorunluya çevrilebilir (Ş2'nin
   kendi notu) ve o zaman ikinci istek de düşer.
2. **`openDesktopSystemSettings` web'de `false` döner** — `lib/desktop/permissions.ts` içinde
   zaten `TODO(api):` ile kayıtlı (platformun izin panelini açan kabuk komutu yok). Düğme
   tasarımda olduğu için çiziliyor; masaüstünde gerçekten çalışıyor.
3. **İzin iki önbellekte.** Pencere `["notifications","permission"]` anahtarını, Ayarlar
   penceresinin `na5` satırı `notificationPermissionStore` kutusunu okuyor. İkisi aynı tarayıcı
   durumunun aynası; pencere izin isteyince **ikisini birden** uyarıyor. Ş13 tek kutuya
   indirebilir.
4. **Ölçü sözlüğü:** §4.2'deki on kayıt.
5. **`sheetBreakpoint`:** §4.3.

---

## 6. Kapı

```
pnpm --filter @wizards/web typecheck   ✅ 0 hata
pnpm --filter @wizards/web lint        ✅ 0 hata (10/10 config testi yeşil)
pnpm --filter @wizards/web test        ⚠️ 1 kırmızı — Ş11'in değil
```

Sahiplenilen dosyaların hepsi ayrıca tek tek lint'ten geçti (`eslint src/components/notifications
src/components/shared/notification-bell* src/lib/notifications` → 0).

### Tek kırmızı: `settings-screen-copy.test.ts` › "ağaç önekleri altında ölü anahtar yok"

```
actual: [ 'settings.group.about.about.3.title' ]
expected: []
```

**Ş11'in dosyalarıyla ilgisi yok.** Anahtarı `components/settings/sections/about/about-page.tsx`
(Ş10) çalışma zamanında `titleData` ile kullanıyor, ama `lib/settings/tree.ts` (Ş6) o grubun
`titleKey`ini taşımıyor; testin ölü anahtar taraması bu yüzden yakalıyor. Bu şerit
`settings.*` altında **hiçbir anahtar eklemedi/silmedi** ve `tree.ts`e dokunmadı.

Kapatmanın iki yolu var, ikisi de başka şeridin dosyasında:

- `tree.ts` Hakkında bölümünün üçüncü grubuna `titleKey: "settings.group.about.about.3.title"`
  ekler (ağaç 58 grup sayımını korur, `about-page.tsx` `titleData` ile sürümü interpole etmeye
  devam eder); **veya**
- `settings-screen-copy.test.ts`in `OUTSIDE_TREE_ROW_KEYS` listesine anahtar yazılır.

Karar Ş6/Ş10'un; Ş13'ün temizlik şeridine bildirildi.

Not: aynı koşuda `settings-screen-copy.test.ts`in `pending.length === 296` maddesi ve
`lib/settings/parity.test.ts`in tamamı **yeşil** — §4.4'teki metin değişikliği anahtar kümesini
ve ölçü paritesini bozmadı.

---

## 7. Commit

**Atılmadı.** Çalışma ağacı `uat` üzerinde, uncommitted.
