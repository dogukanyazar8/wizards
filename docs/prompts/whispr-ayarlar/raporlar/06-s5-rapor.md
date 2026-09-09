# 06 — Dalga 2 / Ş5 raporu: Ayarlar penceresi kabuğu

**Dal:** `uat` · **Commit:** yok (kural gereği) · **Paralel şerit:** Ş6 (satır motoru)

Bu şerit 1180 × 800 penceresinin **çerçevesini** indirdi: rota + yakalayıcı modal, örtü, sol
navigasyon, içerik başlığı, alt sekme şeridi, kayıt göstergesi, kirli şerit, arama görünümü,
iskelet ve tek indirgeyici. **Hiçbir ayar satırı çizilmedi**; içerik alanı Ş6 için boş bir yuva
olarak duruyor.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                       | Ne                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `app/settings/[section]/[tab]/page.tsx`                     | Gerçek rota — tam ekran pencere                                          |
| `app/settings/[section]/page.tsx`                           | Sekmesiz bölüm adresi → bölümün ilk sekmesi (308)                        |
| `app/(main)/@modal/(.)settings/[section]/[tab]/page.tsx`    | Yakalayıcı rota — kabuğun üstünde modal                                  |
| `app/(main)/@modal/default.tsx`                             | Yakalanmamış adreslerde boş yuva                                         |
| `components/settings/settings-window.tsx`                   | Pencere; adres sahibi, `Esc` merdiveni, focus tuzağı                     |
| `components/settings/settings-window-route.tsx`             | İki sunucu rotasının paylaştığı ince istemci sarmalayıcı (çıkış düğmesi) |
| `components/settings/settings-window-state.ts` + `.test.ts` | Tek indirgeyici + `Esc` merdiveni + kirli bayrağı                        |
| `components/settings/settings-nav.tsx` + `.test.tsx`        | 250 px sol navigasyon                                                    |
| `components/settings/settings-header.tsx`                   | İçerik başlığı                                                           |
| `components/settings/settings-tab-strip.tsx`                | Alt sekme şeridi                                                         |
| `components/settings/settings-save-indicator.tsx`           | Üç durumlu kayıt göstergesi                                              |
| `components/settings/settings-dirty-bar.tsx`                | Kirli şerit                                                              |
| `components/settings/settings-search-panel.tsx`             | Arama görünümü                                                           |
| `components/settings/settings-skeleton.tsx`                 | 4 blok iskelet                                                           |
| `components/settings/settings-chrome.test.tsx`              | Başlık · gösterge · şerit · iskelet · kirli · arama SSR testleri         |
| `components/settings/settings-window-contract.test.ts`      | Rota, örtü, kırılım ve 850 ms sözleşmesi                                 |

### Düzenlenen dosyalar

| Dosya                                                 | Ne değişti                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app/(main)/layout.tsx`                               | `@modal` yuvası eklendi (`modal` prop + `{modal}`)                                                              |
| `app/settings/layout.tsx`                             | `SettingsSidebar` + ızgara düzeni **kalktı**; yalnız oturum/dil/tema bağlamı kaldı                              |
| `app/settings/page.tsx`                               | `SettingsPanel` yerine göç kapısı: `migrateLegacySettingsQuery` + kalıcı yönlendirme                            |
| `components/settings/in-app-settings-overlay.tsx`     | Çizim ve durum **silindi**; artık yalnız rotaya `router.push` eden köprü                                        |
| `lib/settings/client.ts`                              | `SETTINGS_BOOTSTRAP_STALE_TIME_MS` + `SettingsWindowIdentity` + `toSettingsWindowIdentity`                      |
| `app/globals.css`                                     | Pencere kırılımları (4 `@media`) — sonuna eklendi                                                               |
| `eslint.config.mjs`                                   | Arbitrary px kuralı `src/app/settings/**`, `src/components/settings/**`, `src/lib/settings/**` kapsamına açıldı |
| `lib/locale/messages/{tr,en}.ts`                      | 1 yeni anahtar: `settings.dirtyCloseConfirm`                                                                    |
| `app/settings/reauth/[token]/reauth-confirmation.tsx` | `/settings#account-delete` → `/settings/account/data#account-delete`                                            |

### Silinen

- `app/settings/appearance/page.tsx` (Ş5 §1; Ş13 doğrulayacak)

---

## 2. Kabul listesi

| Madde                                                                        | Durum | Nerede                                                                                          |
| ---------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `/settings/notifications/quiet-hours` doğrudan açılıyor                      | ✅    | `app/settings/[section]/[tab]/page.tsx`; `resolveSettingsRoute` sekmeyi çözüyor                 |
| Uygulama içinden modal, adres yine `/settings/...`                           | ✅    | `@modal/(.)settings/…`; sözleşme testi `mode="modal"`/`mode="page"`                             |
| Eski `?section=&panel=` kalıcı yönleniyor, 19 değer eşlenmiş                 | ✅    | `app/settings/page.tsx`; test 19 panelin **çizilebilir** bir rotaya düştüğünü doğruluyor        |
| Geri tuşu sekme geçmişinde geziyor, sekme geçmişi şişirmiyor                 | ✅    | Sekme `router.replace`, bölüm `router.push` (sözleşme testi)                                    |
| Örtüye tıklamak kapatıyor, kartın içine tıklamak kapatmıyor                  | ✅    | Örtü ayrı katman; kart `pointer-events:auto`; kodda `stopPropagation` yok                       |
| `Esc` sırayla menü → riskli blok → pencere                                   | ✅    | `resolveSettingsEscape` + indirgeyici testi (4 iddia)                                           |
| Kapanışta focus tetikleyiciye dönüyor                                        | ✅    | `returnFocusRef`, modal kipinde effect temizliğinde                                             |
| Focus tuzağı; `Tab` dışarı çıkmıyor                                          | ✅    | `settings-window.tsx` — yalnız modal kipinde                                                    |
| Sol nav `role="tablist"`, `↑/↓` geziyor                                      | ✅    | `settings-nav.tsx`; testte tek `tabindex="0"`                                                   |
| `Masaüstü` yalnız Tauri'de listede                                           | ✅    | `useSyncExternalStore(isWhisprDesktopRuntime)`; nav testi iki yönü de kapatıyor                 |
| Web/Masaüstü segmenti çizilmiyor                                             | ✅    | Başlık testi `>Web<` ve `>Masaüstü<` yokluğunu iddia ediyor                                     |
| Hakkında'da sekme şeridi render edilmiyor                                    | ✅    | `SettingsTabStrip` tek sekmede `null`; test çıktının boş dize olduğunu doğruluyor               |
| Kayıt göstergesi üç durum + `aria-live` + yeniden dene                       | ✅    | `settings-save-indicator.tsx` + 3 test                                                          |
| Sabit 850 ms kodda yok                                                       | ✅    | Sözleşme testi: yorumlar düşürülüp kod taranıyor; penceredeki tek `setTimeout` arama debounce'u |
| Bölüm/sekme değişiminde kaydırma sıfırlanıyor, menü ve riskli blok kapanıyor | ✅    | `scrollTo({top:0})` effect'i + indirgeyici testleri                                             |
| Kirli şerit yalnız 8 profil anahtarında; `p1…p9` kirli yapmıyor              | ✅    | `isSettingsDirtyKey` + regresyon testi (9 ses satırı tek tek)                                   |
| Kırılım CSS'te                                                               | ✅    | 4 `@media` `globals.css`'te; testte `matchMedia` ve `breakpoints` bileşen kodunda **yok**       |
| Arbitrary px sınıfı yok                                                      | ✅    | eslint kapsamı açıldı + nav testi sınıf dizesini tarıyor                                        |

---

## 3. Kayda geçen kararlar ve sapmalar

**S1 — Yakalayıcı yuvanın yeri.** Prompt dosya listesi `app/@modal/(.)settings/…` diyor ama
düzenlenecek layout olarak `app/(main)/layout.tsx`'i sayıyor. İkisi birlikte olamaz: `app/@modal`
kök layout'un prop'udur. Yuva `app/(main)/@modal/…` altına kondu. `@modal` bir yol segmenti
olmadığı için `(.)` yine kök seviyeye bakar ve `/settings` yakalanır — davranış promptun
tarifiyle birebir aynı, yalnız dosya yolu bir grup içeri kaydı.

**S2 — 301 yerine 308.** Prompt "301" diyor; kod `permanentRedirect` (308) kullanıyor. Bu deponun
kendi yazılı sözleşmesi (`app/(main)/channels/page.tsx:8`): 308 HTTP yöntemini korur, 301'i bazı
istemciler `GET`'e düşürür. Kalıcılık iddiası ve arama motoru davranışı aynı. Next'in
`next.config` `redirects({permanent:true})` yolu da 308 üretir; 301 ancak elle `Response` kurarak
mümkün ve bu, kimlik doğrulamalı bir rotayı middleware'e taşımayı gerektirirdi.

**S3 — `app/settings/[section]/page.tsx` listede yok, eklendi.** Silinen
`app/settings/appearance/page.tsx` tek segmentlik bir adresti; iki segment bekleyen rota onu
yakalayamaz ve `/settings/appearance` 404 verirdi. Tek segmentlik her bölüm adresi artık bölümün
ilk sekmesine kalıcı olarak yönleniyor.

**S4 — Örtü katmanının taban `padding` değeri sözlükte yok.** Referans
(`Ayarlar-referans.dc.html:741`) `padding:26px` veriyor; `SETTINGS_METRICS.window` yalnız
`edgePaddingSmall: 16` taşıyor. `metrics.ts` bu şeritte **yazılmaz** dosyalar arasında, o yüzden
değer `settings-window.tsx` içinde `WINDOW_VIEWPORT_PADDING = 26` olarak, referans satırına atıfla
duruyor. `TODO(Ş13)` ile sözlüğe taşınmak üzere işaretlendi.

**S5 — Ölçüler CSS değişkeni olarak veriliyor.** Inline `style` bir sınıfı ezer; kırılımda
genişliği değiştirmek `!important` gerektirirdi. Sözlükten okunan değerler karta
`--settings-window-*` özel değişkenleri olarak yazılıyor, `globals.css` onları tüketiyor ve
kırılımlarda **`width`/`height`/`border-radius`'u** eziyor. Böylece sayı tek yerde (sözlük)
kalıyor ama kırılım CSS'te seçiliyor (tuzak #10). Sözleşme testi iki tarafın da ayrışmasını
kırıyor.

**S6 — Çalışma zamanı `useSyncExternalStore` ile okunuyor.** Tuzak #10 bu deseni **kırılımlar**
için yasaklıyor (SSR anlık görüntüsü 1280 varsayar). Burada ölçülen bir görünüm alanı değil, bir
yetenek; sunucu anlık görüntüsü `false` ve bu, web'in **doğru** ilk boyası. `useEffect` +
`setState` denendi ve React Compiler'ın `react-hooks/set-state-in-effect` kuralına takıldı.

**S7 — Son yama `useRef` yerine `useState`'te.** İçerik yuvası her render'da bir `runSave`
referansı alıyor; ref okuyan bir fonksiyonu render sırasında dışarı vermek
`react-hooks/refs` kuralını ihlal ediyor. Fazladan render maliyeti yok — kayıt zaten indirgeyiciyi
yazıyor.

**S8 — Yeni i18n anahtarı: `settings.dirtyCloseConfirm`.** "Pencereyi kapatmaya çalışmak onay
ister" kuralının metni ne SPEC'te ne referansta var. `window.confirm` deponun mevcut deseni
(`dm-group-settings-panel.tsx:232` aynı biçimde `t()` ile çağırıyor). TR/EN eklendi.

**S9 — `/settings#account-delete` bağlantısı düzeltildi.** `reauth-confirmation.tsx` silme akışını
`/settings` + hash ile geri getiriyordu; `/settings` artık yalnız göç kapısı ve `#` parçasını
taşımadan yönlendiriyor. Hedef `/settings/account/data#account-delete` oldu. Dosya listede yok ama
bırakılan hâli **çalışmayan** bir derin bağlantıydı.

**S10 — Eski `settings-panel.tsx` / `settings-sidebar.tsx` artık hiçbir yerden çağrılmıyor.**
Silinmedi (K1'e göre silme işi Ş13'ün). Bunun **ürün etkisi var ve kayda geçiyor**: Ş6–Ş10
inmeden Ayarlar penceresi boş bir çerçevedir. Şeridin tarifi bu (§"İş": "Bu şerit hiçbir ayar
satırı çizmez"), ama dalga tamamlanmadan `uat` çalıştırılırsa kullanıcı ayar satırı göremez.

**S11 — eslint kapsamı açılırken altı dosya dışarıda bırakıldı.** `settings-panel.tsx` (67) ve
`settings-sidebar.tsx` (13) K1 ile silinecek; `active-sessions-card` (11), `account-badges-card`
(7), `profile-avatar-field` (6), `account-data-controls` (2) özel blok olarak korunuyor ve kendi
şeritlerinde (Ş7 · Ş10) rem'e taşınacak. Bugün kurala sokmak o şeritleri kırmızıyla başlatırdı.

---

## 4. Bırakılan `TODO`

| Yer                   | Not                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `settings-window.tsx` | `TODO(Ş13)`: `WINDOW_VIEWPORT_PADDING` sözlüğe taşınsın                                                           |
| `settings-window.tsx` | `TODO(Ş7)`: kirli şeridin `Değişiklikleri kaydet` düğmesi profil kaydını çağırsın (`onSaveProfile` yuvası hazır)  |
| `settings-window.tsx` | `renderSection` yuvası boş; Ş6 satır motorunu bağlayacak. Yer tutucu `data-testid="settings-content-placeholder"` |

`TODO(api):` bırakılmadı — bu şerit hiçbir uç tüketmiyor.

---

## 5. Ş6 için sözleşme

`SettingsWindow` içeriği tek bir yuvadan alıyor:

```ts
renderSection?: (input: SettingsSectionRenderInput) => React.ReactNode

type SettingsSectionRenderInput = {
  onTouch: (rowKey: string) => void;                        // kirli bayrağı (8 anahtar süzer)
  openRisky: SettingsRiskyBlockKey | null;                  // aynı anda tek riskli blok
  openSelect: string | null;                                // aynı anda tek açılır menü
  runSave: (patch: () => Promise<unknown>) => Promise<void>; // tek kayıt yolu + yeniden deneme
  section: SettingsSectionDef;
  tab: SettingsTabDef;
  toggleRisky: (key: SettingsRiskyBlockKey) => void;
  toggleSelect: (rowKey: string) => void;
};
```

Merdiven **kabukta** tanımlı (tuzak #12): satır motoru `openSelect`/`openRisky`'yi okur ve
`toggleSelect`/`toggleRisky`'yi çağırır, kendi "biri açılırken diğeri kapanır" kuralını yazmaz.
Kayıt durumu da kabuğun: `runSave` dışında bir yerden `saving`/`saved` yazılmaz.

İçerik `<Suspense fallback={<SettingsSkeleton />}>` içinde çiziliyor; Ş6/Ş7–Ş10 `next/dynamic`
ile tembel bir bölüm koyduğunda iskelet kendiliğinden devreye girer.

---

## 6. Kapı çıktısı

**Üçü de yeşil.**

```
pnpm --filter @wizards/web typecheck   ✅ exit 0
pnpm --filter @wizards/web lint        ✅ 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✅ 5738 pass · 0 fail · 1 skipped (1333 suite, 50.7 sn)
```

Bu şeridin eklediği testler: **33** (indirgeyici 14 · nav 6 · kabuk parçaları 11 ·
kaynak sözleşmesi 16'nın 16'sı — toplam `settings` kapsamı 217/217).

### Paralel şeritten gelen geçici kırıklar (ikisi de kapandı)

1. `lib/home/metrics.ts`'in paralel düzenlenmesi `command-palette.tsx`'i 9 tip hatasıyla kırdı
   (`commandPalette.padding`, `inputGap`, `rowHeight`… kayboldu). Sahibi kendi içinde kapattı.
2. `components/settings/rows/setting-select.tsx:179` `react-hooks/set-state-in-effect` hatası
   veriyordu. `components/settings/rows/**` Ş6'nın kümesi
   (`07-dalga2-s6-satir-motoru.md` §"Sahiplenilen dosyalar"); "Ş6'nın dosyalarına DOKUNMA"
   kuralı gereği elle düzeltilmedi, Ş6 kapattı.

İkisi de bu şeridin diff'i dışındaydı; kapı komutları düzeltmelerden sonra baştan koşuldu.

**Not:** `.next/types` bayattı (silinen `appearance` sayfasına ve eski layout imzasına işaret
ediyordu). `npx next typegen` ile yenilendi; bu bir kaynak değişikliği değil, üretilmiş tip
dizininin tazelenmesidir.
