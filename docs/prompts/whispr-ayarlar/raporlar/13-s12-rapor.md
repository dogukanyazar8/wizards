# Ş12 — Kullanıcı barı menüsü (308 px) + Rahatsız Etmeyin

**Dal:** `uat` · **Commit:** yok (paket kuralı) · **Tarih:** 2026-08-24

Kabuğun `quick` popover'ı `UserBarMenu` ile değişti. Diff `channel-sidebar.tsx` içinde yalnız o
dala dokunuyor: avatar, durum satırı, mikrofon ve kulaklık butonları **değişmedi** (dişli
düğmesine yalnız `ref` eklendi, görünümü aynı).

---

## 1. Dosyalar

**Yeni**

| Dosya                                                                     | İş                                    |
| ------------------------------------------------------------------------- | ------------------------------------- |
| `apps/web/src/lib/presence/dnd.ts` + `.test.ts`                           | K8 süre sözleşmesi (saf)              |
| `apps/web/src/components/shell/user-bar-menu.tsx` + `.test.tsx`           | 308 px kutu, beş satır, `⌘,` kısayolu |
| `apps/web/src/components/shell/user-bar-dnd-card.tsx` + `.test.tsx`       | Rahatsız Etmeyin kartı + 4 süre çipi  |
| `apps/web/src/components/shell/user-bar-device-row.tsx` + `.test.tsx`     | Giriş / çıkış cihazı satırı + listesi |
| `apps/web/src/components/shell/user-bar-input-meter.tsx` + `.test.tsx`    | 14 segmentli giriş seviyesi ölçeri    |
| `apps/web/src/hooks/use-presence-idle-timeout-preference.ts` + `.test.ts` | K9 taşıması (sunucu kolonu + göç)     |

**Düzenlenen**

| Dosya                                                                              | Değişiklik                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `components/shell/channel-sidebar.tsx`                                             | Yalnız `quick` dalı; K9 satırının state'i söküldü, DND yazma yolu eklendi |
| `hooks/use-presence-activity.ts`                                                   | Tercih yeni dosyaya taşındı, buradan yeniden dışa veriliyor               |
| `lib/account/actions.ts`                                                           | `updatePresenceDndAction` eklendi (aşağıda gerekçesi)                     |
| `app/api/v1/users/me/settings/route-logic.ts` · `route.ts` · `route-logic.test.ts` | `idleTimeoutMinutes` okuma/yazma                                          |
| `lib/locale/messages/tr.ts` · `en.ts`                                              | 22 yeni `settings.userMenu.*` anahtarı (iki dil)                          |

---

## 2. K8 — Rahatsız Etmeyin nasıl kuruldu

Sözleşme `lib/presence/dnd.ts` içinde ve **saf**: saat okumaz, `now` parametredir.

```
buildDndPatch(duration, current, now)  → { status:"DND", statusExpiresAt, statusFocusMinutes, statusRestoreTo }
clearDndPatch(restoreTo)               → { status, statusExpiresAt:null }
planDndWrite({duration, now, row})     → sunucudaki tek karar noktası
selectDndDuration(row)                 → hangi çip seçili çizilir
```

- **Anahtar `status = DND` yazar.** Süre çipi `statusExpiresAt` + `statusFocusMinutes` +
  `statusRestoreTo` kurar. `Ben açana kadar` → `statusExpiresAt: null`.
- **`statusRestoreTo` ezilmiyor.** `isDndActive` ölçütü `statusExpiresAt` değil `status`:
  `Ben açana kadar` seçiliyken bitiş anı yoktur ama mod açıktır. Süreye bakan bir kontrol o dalı
  "kapalı" sayar ve bir sonraki çip dokunuşunda hedefe `DND` yazardı. Test: _"süresiz DND açıkken
  de ezmez"_.
- **İkinci geri sayım yok.** Kod taraması: Ş12'nin altı dosyasında `setTimeout` / `setInterval` /
  `requestAnimationFrame` / `Date.now()` **sıfır**; tek `new Date()` `buildDndPatch`'in varsayılan
  parametresidir. Süreyi mevcut makine kapatıyor — sunucuda `sweepExpiredFocus` +
  `resolveFocusState`, istemcide `FocusControlsProvider`.
- **Seçili çip ayrı state değil**, odak katmanından türer:
  `selectDndDuration({ status, statusExpiresAt: focus?.expiresAt, statusFocusMinutes: focus?.totalMinutes })`.
  İyimser seçim `pendingDnd = { baseline, value }` ile taşınır ve sunucu `baseline`'dan başka bir
  şey söylediği an **render sırasında** düşer (efekt değil; efektle yapmak zincirleme render
  demekti ve React Compiler kuralı da onu reddediyor).
- Kullanıcı barındaki nokta mevcut `statusOverride` / `onStatusChange` yolundan hizalanıyor;
  menüye ait ikinci bir presence kaynağı yok.

### Sapma S12-1 — `updatePresenceStatusAction` genişletilmedi, **kardeşi** eklendi

Prompt §2 "`updatePresenceStatusAction` genişletilir" diyor. Bunun yerine aynı dosyaya
`updatePresenceDndAction(duration)` eklendi. Gerekçe: durum listesi **tek** kolon yazar, DND
**dört** kolon yazar ve hedefi sunucuda çözmek zorundadır (istemci `statusRestoreTo`'yu bilmez).
İkisini tek imzada birleştirmek durum satırının yazma yolunu da değiştirirdi; "durum satırı aynen
kalır" kuralı tam olarak bunu yasaklıyor. Eski eylem **byte olarak aynı** kaldı.

### Sapma S12-2 — 8 saat, Ana Sayfa'nın odak ucundan geçemez

`HomeFocusUpdateSchema` `minutes`'ı 5–240 ile sınırlıyor ve süresiz pencere dalı yok; tasarımın
`8 saat` (480) ve `Ben açana kadar` (null) çipleri o uca sığmıyor. Ana Sayfa sözleşmesini
genişletmek yerine (bu şeridin dosyası değil) yeni sunucu eylemi kendi planlayıcısını çağırıyor.
**İkisi aynı dört kolonu yazıyor** ve aynı sweep tarafından kapatılıyor — okuma yolu tek.

---

## 3. K9 — "Boşta sayılma süresi" taşındı

- Kontrol menüden **çıktı**; Gizlilik › Görünürlük'te (Ş7'nin `withIdleTimeoutRow` satırı) kalıyor.
- Hook `hooks/use-presence-idle-timeout-preference.ts` dosyasına taşındı ve artık
  `UserSettings.idleTimeoutMinutes` kolonunu okuyup yazıyor. Okuma `settingsQueryKeys.layout`
  üzerinden gidiyor — bu sorguyu `SoundEffectsProvider` zaten açılışta açıyor, yani **yeni istek
  doğmuyor**.
- Göç: `wizards.presence.idleTimeoutMinutes` yerel anahtarı bir kez sunucuya PATCH ediliyor,
  **yazma başarılıysa** siliniyor. Başarısızsa anahtar duruyor ve sonraki açılış yeniden deniyor.
- Uç genişledi: `PATCH /api/v1/users/me/settings` `idleTimeoutMinutes` alıyor (5/10/15/30/60),
  `GET` döndürüyor. İstemci ve sunucu listelerinin aynı kaldığı testle bağlandı
  (`IDLE_TIMEOUT_MINUTE_OPTIONS` ↔ `PRESENCE_IDLE_TIMEOUT_OPTIONS`).

### Prompt'un kodda karşılığı olmayan iki varsayımı

1. `hooks/use-presence-idle-timeout-preference.ts` **yoktu** — hook `use-presence-activity.ts`
   içindeydi. Dosya prompt'un adlandırdığı yerde açıldı; eski dosya yalnız yeniden dışa veriyor,
   böylece Ş7'nin `@/hooks/use-presence-activity` içe aktarması kırılmadı.
2. "Ş0'da eklendi" denen kolon **şemada vardı ama hiçbir uçta yoktu**
   (`grep -rn idleTimeout src/lib src/app` → sıfır). Uç bu şeritte açıldı.

---

## 4. Cihazlar ve ölçer

- Liste `enumerateDevices()` sonucundan (`useAudioDevices`, Ş8); etiket normalizasyonu ses
  ayarlarıyla **aynı** yerden (`buildAudioDeviceOptions`). Tasarımdaki cihaz adları örnek veri
  olarak kaldı, ürüne sabitlenmedi.
- Liste satırın **altında**, akışın içinde açılıyor — portal yok, `position` hilesi yok; menü
  308 px kutudan taşmıyor. Aynı anda tek liste açık (`openDeviceList` tek state).
- `role="listbox"` + `option`, `↑/↓`, `Enter`, `Esc`, tip-ahead.
- `setSinkId` olmayan tarayıcıda çıkış satırı **çizilir ama açılmaz** ve nedenini kendi değerinde
  söyler (mevcut `voice.devices.outputUnsupported` metni; yeni metin üretilmedi).
- Ölçer `useMicLevel` (Ş8) üzerinden gerçek mikrofon seviyesinden. `Test et` kapanınca **ve menü
  kapanınca** stream duruyor: `useMicLevel` sökülme temizliğinde `dispose()` çağırıyor, menü
  kapandığında bileşen sökülüyor. Test `stop()` sırasını ölçüyor (`monitor` → `track`).

---

## 5. `⌘,` / `Ctrl+,`

- `isSettingsShortcut` komut paletinin `⌘K` eşleyicisiyle aynı sözleşmede: yazarken susar,
  `Alt`/`Shift` ile eşleşmez, `metaKey`/`ctrlKey` ayrımı yapmaz.
- Dinleyici **menünün değil kullanıcı barının** ömrüne bağlı (menü kapalıyken de çalışmalı) ve
  modül seviyesinde **tek**: `UserProfileFooter` aynı anda birden çok yüzeyde canlı olabiliyor,
  her biri kendi dinleyicisini kursa tek basış pencereyi birkaç kez açmaya çalışırdı.
- İpucu metni platformdan okunuyor (`useSyncExternalStore`, üst çubuğun `⌘K` çipiyle aynı desen);
  sunucu anlık görüntüsü `Ctrl ,`, sabit `⌘` gömülü değil.

---

## 6. Açık uç — `Bildirim ayarları` (Ş11 ile el sıkışma)

560 px pencere Ş11'in dosyasında (`components/notifications/notification-prefs-dialog.tsx`) ve o
pencerenin dışarıdan açılacak bir kapısı **yok**: `NotificationBell` kendi reducer'ında
`surface: "panel" | "prefs"` tutuyor. Ş11 paralel koştuğu ve `components/notifications/**`
dokunulmaz olduğu için bağ bir olayla kuruldu:

```ts
// components/shell/user-bar-menu.tsx
export const NOTIFICATION_PREFS_OPEN_EVENT = "whispr:open-notification-prefs";
requestNotificationPrefs(): boolean   // iptal edilirse (preventDefault) true
```

Menü olayı yayınlıyor; bir dinleyici iptal ederse iş bitti sayılıyor, **etmezse Ayarlar penceresi
açılıyor** — düğme hiçbir durumda ölü değil.

**TODO(Ş11 veya Ş13):** `NotificationBell` bu olayı dinleyip `dispatch({ type: "open-prefs" })`
yapmalı ve `event.preventDefault()` çağırmalı. O satır eklenene kadar menüdeki `Bildirim ayarları`
560 px pencereyi değil Ayarlar penceresini açar.

---

## 7. Diğer sapmalar

| #     | Sapma                                                                                                                                      | Gerekçe                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S12-3 | Kutu SPEC'in `left:82px · bottom:14px` kabuk koordinatına değil, **kullanıcı barına** çapalandı (`bottom: calc(100% + 0.55rem); left: 0`). | Mutlak koordinat kabuğun yerleşimine dokunmayı gerektirirdi; bu şeridin kuralı tam tersi. Ölçü (308), yarıçap (20), gölge ve içerik tasarımın ölçüsünde.                                            |
| S12-4 | Genişlik `min(19.25rem, calc(100vw - 1.25rem))`.                                                                                           | Mobil çekmecede kullanıcı barı tam genişlikte; sabit 308 px görünüm alanını taşırdı.                                                                                                                |
| S12-5 | `z-index` 40 → **36** (SPEC §3). Durum listesi `z-50` kaldı; ikisi hiçbir zaman birlikte açılmıyor.                                        | —                                                                                                                                                                                                   |
| S12-6 | `UserProfileFooter` sorgu istemcisini `useContext(QueryClientContext)` ile **tolere ederek** okuyor.                                       | Bileşen sağlayıcısı olmayan yüzeylerde de çiziliyor (`app-nav-panel.test.tsx`); zorunlu `useQueryClient` o testleri kırardı ve eksik istemci burada hata değil, "tazelenecek önbellek yok" bilgisi. |
| S12-7 | `Esc` focus'u dişliye yalnız **quick menü açıkken** döndürüyor.                                                                            | Durum listesinin kendi tetikleyicisi var; onun davranışı bu şeritte değişmiyor.                                                                                                                     |

---

## 8. Ölçüm — çip satırı ve tema

Kabul listesindeki "4 süre çipi tek satırda" ve "açık/koyu tema karşılaştırması" için menü
gerçek token'larla headless Chromium'da ölçüldü (üretim yolu değil, ölçüm koşumu; geçici dosyalar
silindi):

| Ölçüm                | Değer                                                       |
| -------------------- | ----------------------------------------------------------- |
| Kutu genişliği       | **308 px** (yarıçap 20)                                     |
| Çip satırı           | **1 satır** (`chipRowLines: 1`), sarma yok                  |
| Dört çipin kapladığı | 269 px / 276 px iç genişlik                                 |
| Çip iç boşluğu       | 9,92 px (`min(0.625rem, 3.6%)`)                             |
| Kırpılan çip         | yok (`chipClipped: [false,false,false,false]`)              |
| Ölçer segmenti       | 14                                                          |
| Anahtar zemini       | açık: `--danger` (239,67,90) · kapalı: `--surface-tertiary` |
| Alt satır            | `Bildirimler durdu · 1 saat` / `Bildirimler normal geliyor` |

**Uyarı:** ölçüm `file://` bağlamında koştuğu için Figtree/Outfit yüklenmedi, metin genişlikleri
sistem yazı tipiyle çıktı. 269/276 payı ince; gerçek Figtree genellikle daha dar olduğu için pay
büyür, ama bu bir tahmin — ilk tarayıcı koşumunda çip satırına bakılmalı.

**Yapılamayan:** `screens/03-kullanici-menusu.png` ile piksel karşılaştırması. Bu oturumda tarayıcı
paneli kare üretemiyor (compositing kapalı), yerel dev sunucusu ölçüm sırasında düştü ve kabuğa
girmek kimlik bilgisi girmeyi gerektiriyor. Yapı, ölçü ve renkler yukarıdaki ölçümle doğrulandı;
görsel karşılaştırma Ş13'e devrediliyor.

---

## 9. Kabul listesi

| #   | Madde                                                                      | Durum                                                                                       |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Diff yalnız `quick` dalına dokunuyor                                       | ✅ `git diff` 11 hunk: içe aktarmalar, footer state/handler, dişliye `ref`, popover gövdesi |
| 2   | `data-testid="user-quick-menu"` korunmuş, kabuk testleri yeşil             | ✅ `app-nav-panel.test.tsx` 28/28                                                           |
| 3   | Menü sırası DND → cihazlar → Ayarlar → Bildirim ayarları → Çıkış           | ✅ test                                                                                     |
| 4   | 4 çip tek satırda, sarma yok                                               | ✅ test + ölçüm                                                                             |
| 5   | Anahtar `status = DND` yazıyor, nokta danger'a dönüyor                     | ✅ `updatePresenceDndAction` + mevcut `statusOverride`                                      |
| 6   | Süre `statusExpiresAt` kuruyor; `Ben açana kadar` → `null`                 | ✅ test                                                                                     |
| 7   | Açıkken süre değiştirmek `statusRestoreTo`'yu ezmiyor                      | ✅ test (süreli **ve** süresiz dal)                                                         |
| 8   | Süre bitince eski duruma dönüyor, ikinci geri sayım yok                    | ✅ kod taraması + mevcut sweep                                                              |
| 9   | Cihaz listeleri gerçek `enumerateDevices()`'ten, seçilide tik              | ✅ test                                                                                     |
| 10  | Tek liste açık, menü 308 px'i taşmıyor                                     | ✅ tek state + akış içi liste + ölçüm                                                       |
| 11  | Ölçer gerçek seviyeden, `Test et` kapanınca stream duruyor                 | ✅ `useMicLevel` + `stop()` sıra testi                                                      |
| 12  | `⌘,` / `Ctrl+,` gerçekten çalışıyor, ipucu platforma göre                  | ✅ tek global dinleyici + `useSyncExternalStore`                                            |
| 13  | `Bildirim ayarları` 560 px pencereyi açıyor                                | ⚠️ köprü hazır, Ş11'in dinleyicisi bekleniyor (§6)                                          |
| 14  | Çıkış akışı sırayı koruyor                                                 | ✅ `handleLogout` değişmedi: `leaveChannel` → `socket.disconnect` → `logoutAction`          |
| 15  | `Boşta sayılma süresi` menüde yok, Gizlilik'te var, yerel anahtar göç etti | ✅                                                                                          |
| 16  | `Esc` menüyü kapatıyor, focus dişliye dönüyor                              | ✅                                                                                          |
| 17  | Açık/koyu temada referans kare karşılaştırması                             | ⚠️ yapılamadı (§8)                                                                          |

---

## 10. Kapı

```
pnpm --filter @wizards/web typecheck   → 0 hata
pnpm --filter @wizards/web lint        → 0 hata
pnpm --filter @wizards/web test        → 6238 test · 6234 geçti · 1 kırmızı
```

Ş12'nin kendi testleri: **69/69 yeşil**.

**Kırmızı bu şeride ait değil.** `lib/locale/settings-screen-copy.test.ts` ›
_"ağaç önekleri altında ölü anahtar yok"_ → `settings.group.about.about.3.title`. Kaynağı Ş10'un
Hakkında yüzeyi ve o şeridin raporunda zaten kayıtlı (11-s10 §4: `splitSettingsGroup` `titleData`'yı
sözlükten çözmüyor). Testin taradığı önek kümesi
`settings.(section|tab|group|row|option|action)` — bu şeridin eklediği `settings.userMenu.*`
anahtarlarıyla kesişmiyor.

Ş11 paralel koşuyor; koşum sırasında `notification-bell-events.test.ts` bir ara tip hatası verdi,
Ş11 kendi düzeltmesini yapınca temizlendi.

**Commit atılmadı.**
