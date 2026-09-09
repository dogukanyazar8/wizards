# Ş8 raporu — Ses ve Video (3 sekme · 26 satır) + Görünüm (5 sekme · 29 satır)

**Dalga 3 / Ş8** · dal `uat` · 2026-08-24 · commit **atılmadı**.

Ön koşul doğrulandı: Dalga 2 çıktıları yerinde (`lib/settings/tree.ts`, `metrics.ts`, satır
motoru, `setting-custom-block.tsx` defteri, `settings-window.tsx`). Paralel şeritler (Ş7 · Ş9 ·
Ş10) aynı çalışma kopyasında koşuyor; kapı çıktısındaki onlara ait hatalar §7'de ayrı sayıldı.

---

## 1. Ne yapıldı

### A · Silinen üç panel (K13)

| Dosya                                                 | Satır | Nereye gitti                                                                          |
| ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| `components/voice/voice-preferences-panel.tsx`        | 1197  | `sections/av/audio-tab.tsx` + `hooks/use-mic-level.ts` + `hooks/use-audio-devices.ts` |
| `components/voice/camera-preferences-panel.tsx`       | 782   | `sections/av/camera-tab.tsx` + `hooks/use-camera-preview.ts`                          |
| `components/voice/screen-share-preferences-panel.tsx` | 404   | `sections/av/screen-share-tab.tsx`                                                    |

**2383 satır silindi.** Üçü de hiçbir yerden import edilmiyor; bunu bir test `src` ağacını
gezerek doğruluyor (`av-settings-bridge.test.tsx` → "K13 — üç tercih paneli silindi").

İki çağrı yeri vardı ve ikisi de yeniden bağlandı:

- `components/voice/voice-settings-modal.tsx` (ses odasındaki dişli) artık **aynı** `Ses`
  sekmesini çiziyor. İkinci bir ses ayarı yüzeyi tutmak, odadan mikrofon değiştiren kullanıcıya
  Ayarlar penceresinde eski cihazı gösteren iki ayrı liste demekti.
- `components/settings/settings-panel.tsx` (K1 ile Ş13'te silinecek ölü dosya) üç dinamik
  import'unu yeni sekmelere çevirdi. `mode="desktop"` varyantının karşılığı yok; oraya
  `TODO(Ş10)` bırakıldı (masaüstü kısayolları ve overlay tercihleri `Masaüstü` bölümünün işi).

### B · Üç hook (panellerden çıkarılan mantık)

| Dosya                         | Satır      | Ne                                                                                                                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/use-audio-devices.ts`  | +91        | `useMediaPermission(name)` eklendi (mikrofon **ve** kamera); `useAudioDevices` artık `microphonePermission` + `recheckMicrophonePermission` döndürüyor |
| `hooks/use-mic-level.ts`      | 262 (yeni) | `MicLevelSession` (saf sınıf) + `useMicLevel` + `toMicLevelDbfs` + `countLitMicSegments`                                                               |
| `hooks/use-camera-preview.ts` | 232 (yeni) | `CameraPreviewSession` (saf sınıf) + `useCameraPreview` + kısıt/dönüşüm yardımcıları                                                                   |

**Neden sınıf + ince hook:** depoda jsdom yok, testler `renderToStaticMarkup` ile SSR çiziyor.
"Sekme değişince mikrofon ışığı yanık kalmıyor" bir görünüm iddiası değil bir kaynak iddiası ve
onu ancak React'ten bağımsız bir oturum nesnesine sorabiliyoruz — `useEffect` temizliğinin ne
yaptığını iddia etmek yerine `track.stop()`'un çağrıldığını **ölçüyoruz**.

### C · Altı özel blok

| Dosya                              | Anahtar             | Not                                                             |
| ---------------------------------- | ------------------- | --------------------------------------------------------------- |
| `blocks/mic-level-meter-block.tsx` | `mic` (`i3`)        | 96 px etiket + 14 segment + tek düğme; segment sayısı sözlükten |
| `blocks/camera-preview-block.tsx`  | `camera` (`k2`)     | 220 px 16:9 çerçeve, aynala/döndür, gizlilik notu               |
| `blocks/simple-theme-block.tsx`    | `themes` (`t1`)     | 4 kart + paylaşılan `useThemeSelection`                         |
| `blocks/theme-grid-block.tsx`      | `themeGrid` (`t2`)  | 23 tema, 3 kolon, ilk boyada iskelet                            |
| `blocks/message-preview-block.tsx` | `msgPreview` (`m5`) | font/boyut/kompakt anında                                       |
| `blocks/app-icon-grid-block.tsx`   | `appIcons` (`n1`)   | 7 kutu, gerçek PNG'ler                                          |

`rows/setting-custom-block.tsx` kayıt defterinde **yalnız bu altı anahtarın satırı** değişti;
kalan on dört yuva Ş6'nın yer tutucusunda duruyor.

### D · Sekmeler

`sections/av/`: `audio-tab.tsx` · `camera-tab.tsx` · `screen-share-tab.tsx` +
`av-settings-bridge.tsx` (taşıma yolu) · `av-device-select.tsx` · `av-tab-body.tsx` ·
`av-test-tone.ts`.

`sections/appearance/`: `theme-tab.tsx` · `text-tab.tsx` · `media-tab.tsx` · `layout-tab.tsx` ·
`accessibility-tab.tsx` + `appearance-settings-bridge.tsx`.

### E · Yardımcı katman

- `lib/voice/clean-audio-profile.ts` (yeni) — `Temiz ses profili` ↔ beş filtre ilişkisinin **tek**
  tanımı.
- `lib/settings/text-scale.ts` (yeni) — `Yazı boyutu` çarpanı.
- `lib/appearance.ts` — `displayNameKey` alanı (27 kayıt) + eşleme tablosu + tasarım sırası +
  `countAdvancedThemesByMode()`.
- `lib/locale/messages/{tr,en}.ts` — **81** yeni `settings.block.*` anahtarı.

---

## 2. Bağlayıcı kuralların karşılığı

### K13 — kaynak sızıntısı yasak

Üç kural, üçü de ölçülüyor (`use-mic-level.test.ts`, `use-camera-preview.test.ts`):

1. **Test bitince stream kapanır.** `stop()` sırayla zamanlayıcı → analiz düğümü → track
   kapatır. Ters sıra, kapanmış bir düğümden okuyan bir tick bırakırdı.
2. **Sökülme kapatır.** `useEffect` temizliği `dispose()` çağırıyor; sekme değişimi bileşeni
   söktüğü için mikrofon ışığı da sönüyor. Cihaz kimliği değişirse oturum ayrıca kapanıyor —
   açık bir testin ortasında cihaz değiştirmek eskisini açık bırakırdı.
3. **Yarış kapatılıyor.** `start()` uçarken gelen `stop()` bir kuşak sayacıyla yakalanıyor; geç
   gelen stream sahipsiz kalmadan durduruluyor. Sekme değişimi tam da bu ana denk gelir.

Kamera ayrıca `visibilitychange` dinliyor: sekme arkaya düşünce önizleme duruyor (mobildeki
`AppState` korumasının web karşılığı).

### Cihaz listeleri ve izinler gerçek

- Liste `navigator.mediaDevices.enumerateDevices()` + `devicechange` dinleyicisinden.
- İzin `navigator.permissions.query({ name })` + `change` olayından; Firefox'un reddi
  `unsupported` sayılıyor ki "bilinmiyor" ile "engellendi" ayrışsın.
- `av-device-select.test.tsx` tasarımın örnek adlarının (`MacBook Pro Mikrofonu`, `AirPods Pro`,
  `FaceTime HD Kamera`, `Studio Display`) **üç sekmenin hiçbirinde** çizilmediğini tarıyor.

### K6 — 23 temanın kimliği ve rengi aynen kaldı

- `WizardsThemeDefinition` bir alan kazandı: `displayNameKey`. `label` (İngilizce) ve `preview`
  **hiç değişmedi**; hiçbir kullanıcının teması değişmiyor.
- Eşleme `lib/appearance.ts` içinde 27 satırlık bir tabloyla, **her kayıt için ayrı gerekçeyle**
  yazıldı (renk ailesi: `theme-forest-dark` → Orman, `theme-purple-teal` → Kobalt çünkü
  gradyanın orta durağı `#3f6cc9`, `theme-khaki-dark` → Kömür çünkü nötr koyu adların kalanı…).
- `Koyu`/`Açık` etiketi kaydın kendi `mode` alanından okunuyor. Sayım **14 koyu + 9 açık**
  (sapma #1) ve blok bir sayaç yazmıyor — testi bunu kaynak taramasıyla sabitliyor.
- Izgara sırası tasarımın karesiyle aynı (`ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER`): sıra bir
  sunum kararı, küme değişmedi.

### Sapma #4 — tek anahtar

`v7`/`x1` ve `v8`/`x5` ağaçtaki `stateKey` ile aynı kutuya bağlı (`reduceMotion`, `enableTTS`).
İkinci bir durum kurulmadı; `appearance-settings-bridge.test.tsx` bunu
`resolveSettingStateKey("v7") === resolveSettingStateKey("x1")` ile ölçüyor ve bağımsız
satırların (`x2`, `v5`) bağlanmadığını da doğruluyor.

### Sapma #5 — ses işleme satırları kirli bayrağı kurmaz

`p1…p9`'un sekizi de `isDirtyProfileKey()` testinden `false` dönüyor; regresyon testi ağaçtan
`^p\d$` ile satırları **sayarak** kuruyor, elle listelemiyor.

### Uygulama simgesi gerçekten favicon'u değiştiriyor

Blok `useAppStore.setAppIconId` yazıyor; `AppIconProvider` (`app/layout.tsx`) `link[rel="icon"]`,
`shortcut icon`, `apple-touch-icon` ve `msapplication-TileImage` etiketlerini yeniden yazıyor
(altyapı zaten vardı, `MutationObserver` ile de korunuyor). Blok **kendi** `<link>` yazıcısını
kurmuyor — iki yazıcı birbirinin üstüne yazardı; test bunu kaynak taramasıyla sabitliyor.

### `Yazı boyutu` ölçek adımının üstüne biniyor

`lib/settings/text-scale.ts` çarpanı köke `data-text-scale` olarak yazıyor ve nihai kök font
boyutu **iki yazıcıda da** `adım × çarpan` formülünden çıkıyor. `hooks/use-ui-scale.ts`
(`applyUiScale`) çarpanı kökten okuyacak şekilde üç satır değişti; aksi hâlde ilk `resize`
kullanıcının seçimini sessizce silerdi. Test: ×1 adımında %115 seçildikten sonra motor ×1.5
adımını yazınca font boyutu 18,4 px değil **27,6 px** oluyor.

### `Temiz ses profili` ilişkisi tek yerde

`lib/voice/clean-audio-profile.ts`. Profil **saklanmıyor**, türetiliyor: "beş filtre önerilen
kümede mi?". Bu yüzden kullanıcı bir filtreye dokunduğunda profil kendiliğinden kapanıyor ve
"kapat" diye ayrı bir yol yok — `applyCleanAudioProfile(prefs, false)` hiçbir şey yazmıyor.

---

## 3. Alınan kararlar (rapora geçen)

**3.1 Üç satır motordan geçmiyor: `i1` · `u1` · `k1`.**
Ağaç bu üç satıra dört örnek cihaz adı yazıyor (referansın verisi) ve motor seçenekleri
`row.options`'tan okuyor. Üründe seçenekler canlı `enumerateDevices()` sonucu olmak zorunda.
Alternatif "ağaca dinamik seçenek alanı eklemek"ti; o da ağacı **ve** satır motorunu (ikisi de bu
şeritte yazılmaz) değiştirirdi. Satır kabuğu (`SettingsRow`) aynı kaldı, tek kontrol ekseni
bozulmadı.

**3.2 İki satır daha kendi kontrolünü veriyor: `k4` ve `e7`.**
Referans `k4`'e sabit bir `Engellendi` pili ve `danger` tonu yazıyor. Üründe pil gerçek izin ve
dört durumu var; sabit pil, izni verilmiş kullanıcıya "engellendin" demek olurdu. `e7`'nin
`Test paylaşımı başlat` düğmesi bir ses oturumu gerektiriyor ve oturum yokken **kapalı** —
hiçbir şey yapmayan bir düğme çizmektense.

**3.3 `SectionTabBody` bölümden bağımsız.** Dosya `sections/av/av-tab-body.tsx` altında ama
Görünüm › Erişilebilirlik de aynı kapıyı kullanıyor: `x7` açıkken `x1` ve `x2` **dinamik olarak**
kilitleniyor, motorun kilit kümesi ise ağaçtan türeyen statik bir küme. İkinci bir kopya, iki
gövdenin sessizce ayrışması demekti.

**3.4 AV tercihleri sunucuya gitmiyor.** Ses, kamera ve ekran paylaşımı **cihaz** tercihleri;
`useVoiceStore` (persist) tutuyor. Sunucuya gönderilseler bir kullanıcının iki bilgisayarı aynı
mikrofonu paylaşmak zorunda kalırdı.

**3.5 Görünüm satırları üç hedefe dağılıyor.** Sunucu (`PatchSettingsSchema`'nın bugün kabul
ettiği dört alan), uygulama kutusu (kabuk ölçüleri) ve belge (font değişkeni, yazı boyutu,
hareket/kontrast nitelikleri). Şemada olmayan alan **gönderilmiyor** — 400 dönen bir istek,
kaydetmediği hâlde `Kaydedildi` diyen bir göstergeden farksızdı.

**3.6 `u2` için varlık dosyası eklenmedi.** 0,4 saniyelik bir sinüs için mp3 indirmek, testi
"ses dosyası yüklenebiliyor mu" testine çevirirdi. Ton `AudioContext` ile üretiliyor, mümkünse
seçili çıkışa yönlendiriliyor (`AudioContext.setSinkId`) ve bağlam **her durumda** kapatılıyor.

**3.7 Uygulama simgesi etiketleri yeni anahtarlarda.** Mevcut `settings.appearance.icons.wave*`
anahtarları betimleyici adlar taşıyor (`Gece sinyali`, `Klasik mavi`); tasarım `Whispr, Wave 5…0`
diyor. Paylaşılan anahtarı değiştirmek yerine `settings.block.appIcons.*` açıldı; eskiler ölmekte
olan panel için Ş13'e kadar duruyor.

---

## 4. Bırakılan `TODO(api):`

| Yer                              | Satırlar                                | Ne eksik                                                                                                                                                                        |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `av-settings-bridge.tsx`         | `i4` · `u3` · `e4` · `e5`               | `voice-store` alanı yok (kendimi duy, ana çıkış seviyesi, kendi penceresini çıkarma, kaynak değiştirme). Kutuda tutuluyor, pencere kapanınca kayboluyor                         |
| `appearance-settings-bridge.tsx` | `m2` `m4` `v1`…`v6` `v8` `x3` `x6` `x7` | `UserSettings` bunların çoğunu **taşıyor** ama `PatchSettingsSchema` kabul etmiyor; şemayı genişletmek bu şeridin dosyası değil (`app/api/v1/users/me/settings/route-logic.ts`) |
| `camera-tab.tsx`                 | `k4` düğme 1                            | Sistem izin panelini yalnız masaüstü köprüsü açabilir; köprü Ş10'un (`lib/desktop/permissions.ts`). Web'de düğme kapalı                                                         |
| `settings-panel.tsx`             | masaüstü ses kartı                      | `VoicePreferencesPanel mode="desktop"` içeriği `Masaüstü` bölümüne taşınıyor (Ş10 · K7)                                                                                         |

---

## 5. Kabul kriterleri

| Kriter                                                                    | Durum    | Kanıt                                                                                                                                |
| ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Üç panel silindi; hiçbir yerden import edilmiyor                          | ✅       | `av-settings-bridge.test.tsx` — dosya yokluğu + `src` ağacı taraması                                                                 |
| Cihaz listeleri gerçek `enumerateDevices()`; `devicechange` dinleniyor    | ✅       | `use-audio-devices.ts` / `use-camera-devices.ts`; `av-device-select.test.tsx` örnek adları tarıyor                                   |
| Mikrofon testi bitince stream kapanıyor; sekme değişince açık kalmıyor    | ✅       | `use-mic-level.test.ts` — 3 test (stop · dispose · yarış)                                                                            |
| Kamera önizlemesi kapanınca track duruyor                                 | ✅       | `use-camera-preview.test.ts` — 3 test                                                                                                |
| `Temiz ses profili` ilişkisi tek yerde; filtre değişince profil kapanıyor | ✅       | `clean-audio-profile.test.ts` (6) + `av-settings-bridge.test.tsx`                                                                    |
| Ses işleme satırları kirli bayrağı kurmuyor                               | ✅       | `av-settings-bridge.test.tsx` — sapma #5 regresyonu                                                                                  |
| Kamera/mikrofon izni gerçek `navigator.permissions`'tan                   | ✅       | `useMediaPermission`; SSR'da pil `Bilinmiyor`, sabit `Engellendi` yok                                                                |
| 4 basit + 23 tema; hiçbir kimlik değişmedi                                | ✅       | `theme-grid-block.test.tsx` · `simple-theme-block.test.tsx`                                                                          |
| Türkçe ad eşlemesi `lib/appearance.ts` içinde gerekçeli                   | ✅       | 27 satırlık tablo + kayıt başına neden                                                                                               |
| `Koyu`/`Açık` gerçek temadan; sayım 14/9                                  | ✅       | `countAdvancedThemesByMode()` → `{dark:14, light:9}`; markup'ta 14/9 `data-theme-mode`                                               |
| Tema ızgarası iskeletle geliyor                                           | ✅       | `data-block-skeleton="themeGrid"`, iskelette `role="radio"` yok                                                                      |
| Metin önizlemesi font, boyut ve kompaktı anında yansıtıyor                | ✅       | `message-preview-block.test.tsx` — 4 font, 3 boyut, iki yoğunluk                                                                     |
| `Hareketi azalt` iki sekmede aynı değer                                   | ✅       | `appearance-settings-bridge.test.tsx` — sapma #4                                                                                     |
| Uygulama simgesi favicon'u gerçekten değiştiriyor                         | ✅       | `setAppIconId` → `AppIconProvider`; blok kendi yazıcısını kurmuyor                                                                   |
| `Yazı boyutu` ölçek adımının üstüne biniyor                               | ✅       | `text-scale.test.ts` — resize sonrası çarpan korunuyor                                                                               |
| `Sistem tercihlerini takip et` açıkken satırlar kilitli, sistem kazanıyor | ✅       | `resolveSystemAccessibilityOverrides` + `SystemOwnedToggle` (`Kilitli` pili)                                                         |
| Açık ve koyu temada `screens/06-gorunum-tema.png` ile karşılaştırma       | ⚠️ kısmi | Kare **okundu** ve ızgara sırası/etiket/geometri ona göre düzeltildi; tarayıcıda iki temada görsel karşılaştırma **yapılamadı** (§7) |

---

## 6. Kapı

```
pnpm --filter @wizards/web typecheck   ✅  0 hata
pnpm --filter @wizards/web lint        ✅  10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ⚠️  6081 test · 6077 geçti · 1 kırmızı (Ş10)
pnpm --filter @wizards/db db:generate   ✅  (Ş10'un `desktopShortcuts` kolonu için koşuldu)
```

**Ş8'in dosyalarında sıfır hata.** Tek kırmızı test parallel şeridin:

```
lib/locale/settings-screen-copy.test.ts
  ✖ ağaç önekleri altında ölü anahtar yok
    + settings.group.about.about.3.title
    + settings.option.g9.1 … g9.5
    + settings.row.g9.title · g9.description
```

`g9` Hakkında bölümünün güncelleme kanalı satırı (Ş10); sözlüğe girmiş ama `tree.ts`'e henüz
girmemiş. Şerit kendi kapısında kapatacak.

Kapı sırasında iki kez daha kırmızı görüldü ve ikisi de paralel şeritler tarafından kendi
akışlarında kapatıldı (`blocks/active-sessions-block.tsx` ve `sections/account/account-section.tsx`
`react-hooks/set-state-in-effect`, `sections/desktop/desktop-section.tsx`
`react-hooks/immutability`). `db:generate` bu şeritte koşuldu çünkü Ş10'un yeni Prisma kolonu
istemcide yoktu ve typecheck iki hata veriyordu; üretilen istemci ortak, ikisi de kapandı.

### Yeni testler (94)

| Dosya                                                     | Test |
| --------------------------------------------------------- | ---- |
| `lib/voice/clean-audio-profile.test.ts`                   | 6    |
| `hooks/use-mic-level.test.ts`                             | 8    |
| `hooks/use-camera-preview.test.ts`                        | 8    |
| `lib/settings/text-scale.test.ts`                         | 8    |
| `blocks/mic-level-meter-block.test.tsx`                   | 4    |
| `blocks/camera-preview-block.test.tsx`                    | 5    |
| `blocks/simple-theme-block.test.tsx`                      | 3    |
| `blocks/theme-grid-block.test.tsx`                        | 5    |
| `blocks/message-preview-block.test.tsx`                   | 5    |
| `blocks/app-icon-grid-block.test.tsx`                     | 4    |
| `sections/av/av-settings-bridge.test.tsx`                 | 10   |
| `sections/av/av-device-select.test.tsx`                   | 7    |
| `sections/av/av-test-tone.test.ts`                        | 4    |
| `sections/appearance/appearance-settings-bridge.test.tsx` | 11   |
| `sections/appearance/appearance-tabs.test.tsx`            | 6    |

### Değiştirilen mevcut testler (2)

1. `lib/locale/settings-screen-copy.test.ts` — "tüketicisini bekleyen anahtarlar" sayacı.
   Ş8 `settings.block.*` altına **81** anahtar ekledi; sayaç bu şerit sırasında iki kez
   güncellendi (68 → 149, sonra paralel şeritlerin eklemeleriyle 250 → **296**). Sayaç
   "tüketicisi yok" demiyor, "ağaçtan üretilmiyor" diyor; blok metinleri satırlara değil
   blokların içine ait. **Paketin dört şeridinin buluştuğu tek satır burası** ve çakışma
   kasıtlı: sessizce büyüyen bir sözlük Ş13'e ölçülemeyen bir borç bırakırdı.
2. `lib/voice/screen-share-audio-wiring.test.ts` — "ilk paylaşımdan önce açılabiliyor" testi
   silinen panelin kaynağını okuyordu; artık ağacın `e2` satırını ve köprünün
   `setScreenShareAudioEnabled` yazmasını okuyor. İddia aynı, adres değişti.

---

## 7. Yapılamayanlar ve devredilenler

1. **`renderSection` bağlandı — Ş13.** _(Bu madde kapandı; kayıt için bırakıldı.)_
   Ş8 raporu yazıldığında pencere `renderSection` yuvasını kimseye bağlamıyordu ve altı bölümün
   hiçbiri tarayıcıda açılmıyordu. Ş13 `components/settings/settings-sections.tsx` defterini
   yazdı, `settings-window-route.tsx`'e taktı ve merdiveni (`settings-ladder.tsx`) bölüm
   köprülerine indirdi — Ş8'in iki köprüsü de `useSettingsLadderOverrides()` okuyor.
   `Ses ve Video` ile `Görünüm` için `renderXSection` kökü yoktu (Ş8 yalnız sekme bileşenleri
   dışa verdi); defter o ikisini sekme dağıtıcısıyla çözüyor.

   **Ş8 takibi:** defterin testi yoktu. `settings-sections.test.tsx` eklendi — 27 sekmenin hepsi
   bir düğüm döndürüyor, çizilebilen beş bölüm yer tutucu değil gerçek içerik basıyor ve Ş8'in
   iki bölümü ağaçtaki **her** satırını çiziyor. Dağıtıcının bir sekmeyi sessizce düşürmesi
   ancak böyle yakalanır. `Bildirimler` markup katmanının dışında: `useRouter()` çağırıyor ve
   app router bağlamı yalnız Next çalışma zamanında var.

2. **Tarayıcıda iki temalı görsel karşılaştırma yapılamadı.** Pencere ancak oturum açmış bir
   kabuk içinde açılıyor; bu şeritte dev sunucu + tohumlu veritabanı koşturulmadı. Referans
   karesi okundu ve üç düzeltmeye yol açtı (ızgara sırası, `Koyu`/`Açık` etiket konumu, basit
   tema kartının 62 px önizleme + tik düzeni). Piksel karşılaştırması Ş13'ün parity işi.
3. **`components/voice/microphone-test-panel.tsx` öksüz kaldı.** Tek tüketicisi silinen
   `VoicePreferencesPanel`'di. Sahiplenilen dosya listesinde olmadığı için **silinmedi**;
   Ş13'ün ölü kod taramasına bırakıldı.
4. **`settings-panel.tsx`'in masaüstü ses kartı boşaldı.** İçeriği Ş10'un `Masaüstü` bölümüne
   gidiyor; dosya zaten K1 ile silinecek.
5. **`x2` / `x3` / `reduceMotion` nitelikleri CSS'e bağlı değil.** Köke yazılıyor
   (`data-high-contrast`, `data-strong-focus`, `data-reduce-motion`) ama `globals.css` bunları
   okumuyor — stil tarafı bu şeridin dosyası değil. Nitelik sözleşmesi testte sabit; kuralları
   Ş13'ün erişilebilirlik geçişi yazacak.

---

## 8. Takip düzeltmesi — kullanıcı barı menüsü kırpılıyordu

**Belirti:** kullanıcı barındaki dişlinin açtığı 308 px hızlı menü açılıyor ama görünmüyor /
arkada kalıyor gibi duruyor.

**Kök neden — kırpma, yığın değil.** Menü kullanıcı barının içinde `position:absolute` olarak
duruyordu. Gezinme paneli sütunu (`wizards-shell.tsx`) `overflow:hidden` taşıyor ve genişliği
`var(--nav-panel-width)` = `HOME_METRICS.panel.width` = **280 px**. Menü **308 px**: sütun menüyü
kırpıyor, kırpılan kutu üçüncü sütunun kenarında kesiliyor ve "arkada kalmış" gibi görünüyordu.
`z-index` bu sorunu **çözmez** — yığın sırası bir kırpma kutusunu delmez; menünün `zIndex: 36`
değeri zaten yerindeydi ve hiçbir işe yaramıyordu.

Ş12 bunu bilerek almıştı: kendi notu "burada çapa kullanıcı barının kendisi, çünkü bu şerit
kabuğun yerleşimine dokunmuyor" diyor. SPEC §3 ise kutuyu kabuğun `left: 82px · bottom: 14px`
koordinatına, yani **kabuk düzleminde** konumluyor.

**Düzeltme.** Menü `document.body`'ye portallanıyor ve `position: fixed` ile konumlanıyor:

| Dosya                                              | Değişiklik                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lib/shell/user-bar-menu-placement.ts` (yeni)      | Saf yerleşim hesabı: çapa dikdörtgeni + görünüm alanı + kök font boyutu → `left · bottom · width · maxHeight` |
| `lib/shell/user-bar-menu-placement.test.ts` (yeni) | 11 test                                                                                                       |
| `components/shell/channel-sidebar.tsx`             | `createPortal`, açılışta ölçüm, portal-farkında dış tıklama, görünüm alanı değişiminde kapanma                |

Dört kural hesapta:

1. **Sol kenar çapayı izler, görünüm alanına kıstırılır.** Dar ekranda menü sağdan taşmaz; 320 px
   genişlikte genişliğin kendisi kısılır (taşma yerine daralma).
2. **Menü kullanıcı barını örtmez** — alt kenarı çapanın üstünde, 9 px boşlukla.
3. **Yükseklik kalan boşluğa kısılır.** Kısılmayan bir menü uzun cihaz listesinde ekranın
   üstünden taşar ve ilk bölüm (`Durum`) erişilemez olurdu.
4. **Birim sözleşmesi.** `getBoundingClientRect()` ve `innerWidth` fiziksel pikseldir, tasarım
   ölçüleri (308 · 14 · 9) tasarım pikselidir. Hesap girişte tasarım ölçülerini kök font
   boyutuyla fiziksel piksele çeviriyor ve çıktıyı `px` olarak veriyor. İlk yazımda ölçülen
   koordinat `pxToRem()` ile yazılmıştı: ×1 ölçekte doğru, ×1.5 adımında menü ölçüldüğü yerden
   kayardı. Regresyon testi iki adımı yan yana ölçüyor.

İki davranış değişikliği daha:

- **Dış tıklama artık portalı da "içeri" sayıyor.** Sayılmasaydı menüye yapılan ilk tıklama
  menüyü kapatırdı — portal kullanıcı barının DOM alt ağacında değil.
- **Görünüm alanı değişince menü kapanır** (`resize` · yakalama fazında `scroll`). Sabit
  koordinat açılışta ölçülüyor; yeniden konumlamak menüyü parmağın altında zıplatırdı (satır
  motorunun açılır menüsü de aynı kuralı izliyor). Kapanma ayrıca bir sızıntıyı da kapatıyor:
  portal `document.body`'de olduğu için, kırılım değişip kullanıcı barının kabı gizlendiğinde
  menü **kendiliğinden** gizlenmezdi.

**Doğrulanamayan:** tarayıcıda görsel teyit yapılamadı. Dev sunucu (`localhost:3000`) ayakta ama
oturum kapalı ve giriş bilgisi girilmedi. Yapılanlar: yapısal kök neden analizi (280 < 308 +
`overflow:hidden`), 11 birim testi, `typecheck` ve `lint` temiz. Görsel teyit için oturum açık
bir tarayıcı gerekiyor.

**Not — ilgisiz artık:** `apps/web/.tmp-s13/` (iki `.mts` betiği) izlenmeyen olarak duruyor ve
`lint` iki `no-console` uyarısı veriyor. Ş13'ün geçici dosyaları; silmek o şeridin kararı.

---

## 9. Takip kapısı

```
pnpm --filter @wizards/web typecheck   ✅  0 hata
pnpm --filter @wizards/web lint        ✅  0 hata (2 uyarı: `.tmp-s13/` artığı)
dokunulan alanların testleri            ✅  1111 test · 1109 geçti · 0 kırmızı
```

Alt küme `components/settings/**`, `components/shell/**`, `lib/settings/**`, `lib/shell/**`,
`lib/locale/**`, `lib/voice/**` ve `hooks/**` altındaki her testi kapsıyor — bu turda dokunulan
her dosya bu kümede.

**Kapatılan üçüncü kırmızı (Ş10 borcu).** `settings-screen-copy.test.ts` →
"ağaç önekleri altında ölü anahtar yok" `settings.group.about.about.3.title` için kırmızı
veriyordu. Anahtar **ölü değil**: `Yenilikler · {version}` başlığı sürüm numarası taşıdığı için
ağaçta `titleKey` değil `titleData` olarak duruyor ve `collectSettingsCopyKeys()` onu göremiyor;
tüketicisi `about-page.tsx`. Ş10'un `g9` için zaten açtığı `OUTSIDE_TREE_ROW_KEYS` kapısına
gerekçesiyle eklendi — testin varsayımı ("bu altı önek tamamen ağaçtan üretilir") düzeltildi,
kapsamı daraltılmadı.

### Bu turda eklenen testler (14)

| Dosya                                            | Test | Ne ölçüyor                                                                                       |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| `lib/shell/user-bar-menu-placement.test.ts`      | 11   | Yerleşim: SPEC koordinatı · barı örtmeme · dar ekran · yükseklik kısma · ölçek adımı · SSR       |
| `components/settings/settings-sections.test.tsx` | 3    | Defter: 27 sekme karşılıklı · beş bölüm yer tutucu değil · Ş8'in iki bölümü her satırını çiziyor |
