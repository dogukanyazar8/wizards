# Ş6 raporu — Satır motoru: grup, satır, 13 kontrol, açılır menü yönü

**Dalga 2 / Ş6** · dal `uat` · 2026-08-24 · commit **atılmadı**.

Ön koşul doğrulandı: `lib/settings/tree.ts` (170 satır · 13 tip · 20 blok · 3 riskli),
`lib/settings/metrics.ts` (`SETTINGS_METRICS` + `SPEC_DEVIATIONS` + `SETTINGS_DIRTY_PROFILE_KEYS`),
`lib/settings/navigation.ts` yerinde. Ş5 paralel koşuyor; onun dosyalarına dokunulmadı
(`client.ts`, `settings-window*.tsx`, `eslint.config.mjs`'nin kapsam bloğu — aşağıda not).

---

## 1. Ne yapıldı

### A · Ölçüm ve köprü (`lib/settings/`)

| Dosya                       | Satır | Ne                                                       |
| --------------------------- | ----- | -------------------------------------------------------- |
| `menu-placement.ts`         | 106   | Yön + yükseklik hesabı, kaydırma alanı ölçümü            |
| `menu-placement.test.ts`    | 216   | 14 test (235/236/237 sınırı dahil)                       |
| `use-setting-value.ts`      | 549   | Değer kutusu, kuyruk, geri alma, kirli bayrağı, merdiven |
| `use-setting-value.test.ts` | 379   | 25 test                                                  |

### B · Satır motoru (`components/settings/rows/`)

| Dosya                      | Satır | Test | Test satırı |
| -------------------------- | ----- | ---- | ----------- |
| `settings-group.tsx`       | 87    | 7    | 119         |
| `settings-row.tsx`         | 200   | 16   | 174         |
| `setting-toggle.tsx`       | 83    | 10   | 90          |
| `setting-select.tsx`       | 420   | 19   | 170         |
| `setting-segment.tsx`      | 119   | 6    | 74          |
| `setting-slider.tsx`       | 204   | 17   | 131         |
| `setting-input.tsx`        | 83    | 8    | 76          |
| `setting-textarea.tsx`     | 80    | 7    | 68          |
| `setting-actions.tsx`      | 126   | 10   | 106         |
| `setting-risky-block.tsx`  | 99    | 10   | 106         |
| `setting-sound-row.tsx`    | 269   | 10   | 102         |
| `setting-jump.tsx`         | 37    | 3    | 61          |
| `setting-nav.tsx`          | 83    | 5    | 50          |
| `setting-custom-block.tsx` | 146   | 11   | 132         |
| `render-settings-tab.tsx`  | 489   | 24   | 368         |

**Toplam:** 20 üretim dosyası (2 lib + 15 bileşen + 2 lib testi + 15 bileşen testi), **212 yeni test**.

### C · Sözlük (14 anahtar, iki dilde)

`settings.control.*` öneki açıldı — motorun kendi metinleri:

```
settings.control.locked                    Kilitli
settings.control.slider.decrease           Azalt
settings.control.slider.increase           Artır
settings.control.sound.level               Seviye
settings.control.sound.preview             Önizle
settings.control.sound.profileLabel        Ses profili
settings.control.sound.profile.whispr      Whispr
settings.control.sound.profile.classic     Klasik
settings.control.textarea.counter          {current} / {max}
settings.control.risky.close               Kapat
settings.control.risky.password            Parolayı değiştir
settings.control.risky.twoFactor           Kur
settings.control.risky.deleteAccount       Hesabı sil
settings.control.block.loading             Yükleniyor
```

Önek bilinçli: `settings-screen-copy.test.ts` `settings.(section|tab|group|row|option|action).`
altında **ölü anahtar** aramıyor ve `settings.block.` + `notif.` için 68'lik bir bekleyen sayacı
tutuyor. `settings.control.` ikisine de girmez; iki testin ikisi de yeşil kaldı.

Metinler referanstan birebir alındı (`Kilitli`, `Seviye`, `Önizle`, `Whispr`, `Klasik`,
`Parolayı değiştir`, `Hesabı sil`, `Kapat`, `Kur`); `Azalt` / `Artır` / `Ses profili` /
`Yükleniyor` referansta görünen metin değil, **erişilebilir ad** (referans `−` ve `+` düğmelerini
adsız bırakıyor — ekran okuyucuda "düğme, düğme" diye okunurdu).

---

## 2. Mimari kararlar ve dikişler

### 2.1 Taşıma yolu (`write`) sağlayıcıdan gelir — motor uç bilmez

`SettingsValueProvider` yerine iki bağlam (`SettingsValueContext` + `SettingsRowRuntimeContext`)
ve `write` **zorunlu** bir yapıcı argümanı:

```ts
new SettingsValueStore({ write: (patch: Record<string, SettingValue>) => Promise<void> });
```

170 satırın hangi ucun hangi alanını yazdığı bir eşleme; o eşlemeyi bu dosyaya koymak Ş7–Ş10'u
aynı dosyada çakıştırırdı (blok defterinin çözdüğü sorunun aynısı). Varsayılan bir `write`
**verilmedi**: kaydetmediği hâlde `Kaydedildi` diyen bir gösterge tuzak #14'ün tam kendisi olurdu.

### 2.2 Merdiven tek yerde, enjeksiyon noktasıyla (tuzak #12)

`useSettingsRowRuntimeState(overrides?)` merdiveni **bir** kez tanımlar: `openSelect` ve
`openRisky` birer `string | null`, yani teklik durumun kendisinde. Ş5'in
`settings-window-state.ts` reducer'ı bu ikisini `overrides` ile devralır (bölüm/sekme değişiminde
ikisini de kapatması gerekiyor). Devralınmadığında merdiven burada yaşar; **iki** uygulama hiç
olmuyor. Kontroller `open` + `onOpenChange` proplarıyla sürülür, kendi state'ini tutmaz.

### 2.3 `renderSettingsTab` imzası korundu

```ts
renderSettingsTab(section: SettingsSection, tab: SettingsTab): ReactNode
```

İçeride `<SettingsTabBody tab={...} />` döner; satır başına bir bileşen (`SettingsTreeRow`) çünkü
`useSettingValue` bir kanca ve 170 satırın değerini tek bileşende okumak kanca sırasını satır
listesinin uzunluğuna bağlamak olurdu.

### 2.4 Blok defteri boş yer tutucularla (Ş6 §7)

`SETTINGS_BLOCKS: Record<SettingsBlockKey, ComponentType<SettingsBlockProps>>` — 20 yuva, her
biri `data-block="<anahtar>"` + `data-block-placeholder="true"` taşıyan bir iskelet.
Ş7–Ş10 **yalnız kendi anahtarlarının satırını** değiştirir.

`fullWidth` ayrımı **ters** tutuldu: `SETTINGS_INLINE_BLOCKS = ["camera", "mic"]`. On sekiz bloğun
ölçü kaydında kendi satır/hücre dolgusu var (`rowPaddingX`, `cellPaddingX`, `columns`), yani kabı
kendileri döşüyor; K13'ün "satır motoruna sığmayan iki parça"sı (mikrofon ölçeri, kamera
önizlemesi) tek kontrol gibi davranıyor. On altı bloğu elle "tam genişlik" diye saymak, on altı
tahmin demekti.

---

## 3. Kayda geçen sapmalar ve güçlendirmeler

`metrics.ts` bu şeritte **okunur, yazılmaz** olduğu için `SPEC_DEVIATIONS`'a kayıt eklenmedi;
aşağıdaki üç madde rapora geçer.

1. **Menü yönü: referansın kuralı sertleştirildi.** Referans `r.bottom + 236 > limit` ise
   koşulsuz yukarı açıyor — üstteki boşluk alttakinden daha az olsa bile. `resolveMenuPlacement`
   eşiği geçen durumda referansla **birebir** aynı; iki yönün de eşiği geçmediği uç durumda
   **daha geniş** olanı seçiyor ve `maxHeight`'ı o boşluğa kısıyor. Kabul kriteri "ilk ve son
   seçenek kaydırma alanı içinde" ancak böyle ölçülebilir kalıyor.
2. **SPEC §4.4'ün `Değer` kontrol tipi üründe yok.** SPEC'in kontrol tablosu on satır sayıyor ve
   içinde "Değer (sağa yaslı `600 12px display` metin)" var; referans motorunda karşılığı `isVal`.
   `SettingsControlType` **13** tip taşıyor ve `value` bunların arasında değil — içerik otoritesi
   ağaç olduğu için `SettingValue` bileşeni **üretilmedi**. Bir tip için 170 satırda tek bir
   tüketici bile yok.
3. **Kilitli pilin tonu `primary`.** `SettingsTone` beş anlam tonu taşıyor (`success` · `warning`
   · `danger` · `muted` · `info`); referans `Kilitli` pilini `HH('primary','.14')` ile çiziyor.
   `SettingsRowBadgeTone = SettingsTone | "primary"` bileşen tarafında genişletildi — ağaç
   değişmedi, çünkü bu bir _anlam_ tonu değil.

---

## 4. Bırakılan `TODO(api):` — yok

Bu şerit hiçbir uç çağırmıyor. Sağlayıcı `write`'ı zorunlu tuttuğu için "olmayan uca yazıyormuş
gibi yapan" bir kod da yok. Dikişler:

| Dikiş                                                                                | Kim bağlar                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `SettingsValueStore({ write })`                                                      | Ş5 (kabuk) — kayıt göstergesi ve `retry` de oradan |
| `useSettingsRowRuntimeState({ openSelect, openRisky, ... })`                         | Ş5 reducer'ı                                       |
| `runtime.data` (`descriptionData` / `titleData` / `badgeData`)                       | Ş7–Ş10                                             |
| `runtime.riskyBodies` (3 gövde)                                                      | Ş7                                                 |
| `runtime.onAction(rowKey, actionIndex)` · `onNavigate` · `onJump` · `onSoundPreview` | Ş5 · Ş7–Ş10                                        |
| `SETTINGS_BLOCKS` 20 yuva                                                            | Ş7–Ş10                                             |
| `store.commitDirty()` / `resetDirty()` / `isDirty()`                                 | Ş5 (kirli şerit)                                   |
| `store.applyRemote(patch)`                                                           | Ş5 (`settings:updated` soketi)                     |

---

## 5. Kabul kriterleri

| Kriter                                                                          | Durum                     | Kanıt                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13 kontrol tipi de var; her biri kendi testine sahip                            | ✅                        | 15 bileşen dosyası + 15 test dosyası; `renderSettingsTab` testi 13 tipin çizildiğini ağaçtan sayıyor                                                  |
| Grup kabında `overflow:hidden` yok (kod taraması testi)                         | ✅                        | `settings-group.test.tsx` — kap `overflow-visible`, dizin taraması yorumları ayıklayıp yalnız `setting-custom-block` + `setting-input`'a izin veriyor |
| Menü yön hesabı 236 px eşiğinde yön değiştiriyor; sınır testleri (235/236/237)  | ✅                        | `menu-placement.test.ts` — üç sınır ayrı test                                                                                                         |
| Kaydırma sırasında açık menü kapanıyor                                          | ⚠️ kısmi                  | `close(false)` bağlantısı ve `{ capture: true, passive: true }` kaynak taramasıyla sabit; **DOM olayı koşturulamadı** (§7)                            |
| Tip-ahead çalışıyor (`Eu` → `Europe/Istanbul`)                                  | ✅                        | `resolveTypeAheadIndex` saf fonksiyon, 5 test (tek harf dolanması + TR yerel + `İ/i`)                                                                 |
| Kaydırıcı `←/→`, `Home`/`End`, `PageUp/Down`; `aria-valuetext` birim taşıyor    | ✅                        | `resolveSliderKeyValue` 6 test + `aria-valuetext="120 ms"`                                                                                            |
| Kilitli anahtar `aria-disabled` + açıklama taşıyor, tıklamaya cevap vermiyor    | ✅                        | `setting-toggle.test.tsx`; tıklama koruması kaynak taramasıyla (`if (locked) return;`)                                                                |
| Textarea sayacı `aria-live`; sınırı aşınca `aria-invalid`                       | ✅                        | `setting-textarea.test.tsx`                                                                                                                           |
| `@` öneki değere dahil değil (`pu` → `dogukan`)                                 | ✅                        | `setting-input.test.tsx` + `render-settings-tab.test.tsx`                                                                                             |
| Aynı anda tek açılır menü ve tek riskli blok                                    | ✅                        | `render-settings-tab.test.tsx` — tek `role="listbox"`, tek `aria-expanded="true"`                                                                     |
| Paylaşılan anahtar iki sekmede aynı değer; birinde değişince diğeri hizalanıyor | ✅                        | `render-settings-tab.test.tsx` — `nq1` kutuda değişiyor, iki sekme de yeni değeri çiziyor                                                             |
| Kaydırıcı sürüklemesi tek PATCH'e birleşiyor (istek sayacı testi)               | ✅                        | `use-setting-value.test.ts` — 40 `setValue`, 1 istek, `{ u3: 39 }`                                                                                    |
| Yazma hatası değeri geri alıyor ve kabuğa `error` bildiriyor                    | ✅                        | `use-setting-value.test.ts` — 3 test (geri alma, arada gelen değeri koruma, `retry`)                                                                  |
| `renderSettingsTab` 170 satırın hepsini hatasız çiziyor                         | ✅ yazıldığında; ❌ şimdi | 27 sekme taranıyor, sayaç **170** idi. Ş8'in `appIcons` bloğu deftere girdikten sonra Görünüm sekmesi render edilemiyor (§6.1/1) — motor değil, blok  |
| Tek kontrol ekseni: bir sekmedeki tüm kontrollerin sağ kenarı aynı              | ✅                        | 27 sekmenin her kontrol yuvası aynı sınıf sözleşmesini taşıyor ve sol kolondan **sonra** çiziliyor                                                    |
| `<720px` kontroller satırın altına iniyor (CSS, JS değil)                       | ✅                        | `min-[720px]:flex-row`; dosyada `matchMedia` / `innerWidth` / `useSyncExternalStore` yok                                                              |

---

## 6. Kapı

```
pnpm --filter @wizards/web typecheck   ✅  0 hata
pnpm --filter @wizards/web lint        ✅  10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ❌  2 kırmızı — ikisi de Ş6 dışı (§6.1)
```

Ş6'nın kendi kapsamı yeşil:

| Kapsam                                                                 | Sonuç                |
| ---------------------------------------------------------------------- | -------------------- |
| 15 bileşen testi + 2 lib testi (defter dışı)                           | **166/166**          |
| `src/lib/settings/*` + `src/components/settings/rows/*` (defter dahil) | 326/332              |
| `messages.test.ts` + `settings-screen-copy.test.ts` (yeni 14 anahtar)  | 20/20 → sonra §6.1/2 |

### 6.1 Tam takımın iki kırmızısı — ikisi de paralel şeritlerden

Ş7–Ş10 bu şerit koşarken blok defterini doldurdu (20 yuvanın 15'i sahibine geçti) ve
`setting-custom-block.test.tsx`'e "sahibi gelmiş yuva iskelet çizmiyor" testini ekledi. Doğru
hareket — defter tam bu iş için kuruldu. İki yan etki kaldı:

**1. `appIcons` bloğu SSR'de render edilemiyor.**

```
Element type is invalid: expected a string (for built-in components) or a
class/function (for composite components) but got: object.
```

Kaynağı `components/settings/blocks/app-icon-grid-block.tsx:4` →
`import Image from "next/image"`. `node --test` + `tsx` ortamında `next/image` bir bileşene
değil bir **nesneye** çözülüyor. Yirmi bloğun tek tek render'ı bunu kesinleştirdi: 19'u geçiyor,
yalnız `appIcons` patlıyor. Depoda `next/image` içeren üç bileşen var
(`desktop-window-chrome`, `settings-panel`, bu blok) ve **hiçbirinin** SSR testi yoktu; bu ilki.

Kırmızı veren testler Ş6'nın (`render-settings-tab.test.tsx` süpürmesi ve
`setting-custom-block.test.tsx`) ama **hata Ş6'nın kodunda değil**: motor defterden ne gelirse
çiziyor, defterde render edilemeyen bir bileşen var. Dosya Ş8'in (Görünüm) kümesinde, bu şeritte
`Okunur, yazılmaz`. Düzeltme oraya ait: ya düz `<img>`, ya testte `next/image` sahtesi.

**2. `settings-screen-copy.test.ts` bekleyen anahtar sayacı bayat.**

```
250 !== 224   (settings-screen-copy.test.ts:312)
```

Sayaç `notif.` + `settings.block.` önekli anahtarları sayıyor. Bugün 186 `settings.block.*`
anahtarı var; sayacı son bump'layan şeritten sonra 26 anahtar daha eklenmiş. **Ş6'nın 14
`settings.control.*` anahtarı bu süzgece hiç girmiyor** — ölçüldü: `control inside pending: 0`.
Sayacı sahibi olmadan bump'lamak, listenin varlık sebebini (Ş13'e sayılı ve adlı bir kayıt
bırakmak) ortadan kaldırırdı; anahtarları ekleyen şeride ait.

**Ş6 bu iki dosyaya dokunmadı ve dokunmayacak.** İkisi kapandığında tam takım yeşile döner —
Ş6 tarafında düzeltilecek bir şey kalmıyor.

`lint` bir kez kırmızı verdi ve düzeltildi:

```
setting-select.tsx:179  react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders
```

Menü açılışında etkin seçeneği efekt içinde sıfırlıyordu. React'in "prop değişince state'i
ayarla" kalıbına (render sırasında, `openSnapshot` karşılaştırmasıyla) taşındı; odaklama efektte
kaldı çünkü odak bir dış sistem işi, state değil. Yan fayda: menü ilk karede doğru satırı
vurgulu açıyor, bir tur sonra değil.

**`eslint.config.mjs` dokunulmadı.** `src/components/settings/**` ve `src/lib/settings/**`
arbitrary-px kapsamına Ş5 zaten eklemiş; `rows/**` için ikinci bir kayıt açıldı ve
gereksiz olduğu görülünce geri alındı. Motor bu kuralın altında yazıldı: 15 bileşende tek bir
`-[<sayı>px]` sınıfı yok, tüm ölçüler `pxToRem` / `pxToEm` / `hairline`.

---

## 7. Sınır: DOM'suz test ortamı

`apps/web` testleri `node --test` + `tsx` ile koşuyor; **jsdom yok** ve 66 bileşen testinin
tamamı `renderToStaticMarkup` üstünde. Bunun sonucu: tıklama, tuş vuruşu ve `scroll` olayı
koşturulamıyor.

Bu şerit buna iki şekilde cevap verdi:

1. **Kararı saf fonksiyona çıkararak.** `resolveMenuPlacement`, `resolveTypeAheadIndex`,
   `resolveSliderKeyValue`, `resolveSliderStep`, `splitSettingsGroup` ve `SettingsValueStore`
   birer saf birim; kuyruk birleşmesi, geri alma, tip-ahead dolanması ve 236 px sınırı **gerçek**
   testlerle doğrulanıyor, kaynak taramasıyla değil.
2. **Kalanı kaynak taramasıyla sabitleyerek.** Yalnız üç yerde: kilitli anahtarın tıklama
   koruması, `scroll` dinleyicisinin `passive` kurulması ve menünün kaydırmada
   _kapanması_ (yeniden konumlanmaması). Ev deseni bu (`hooks/use-poll.test.ts`).

Gerçek etkileşim kanıtı Ş13'ün tarayıcı/a11y koşusuna kalıyor. Ş13 için üç madde:

- Menü açıkken kaydırma → menü kapanıyor mu?
- 27 sekmenin her birinde son satırın menüsü yukarı açılıyor mu, ilk/son seçenek görünür mü?
- Kilitli anahtara tıklamak PATCH üretmiyor mu (ağ sekmesi)?

---

## 8. Ş7–Ş10 için el kitabı (kısa)

```tsx
// Bölüm sekmesi dosyası bundan uzun olmamalı:
export function AccountProfileTab() {
  return renderSettingsTab("account", "profile");
}
```

- **Satır markup'ı yazma.** Satır ağaçtan doğar. Sekme dosyanda `SettingsRow` / `SettingToggle`
  çağırıyorsan motoru atlamışsın demektir.
- **Kendi bloğunu defterin kendi satırına yaz** (`SETTINGS_BLOCKS.hero = ProfileHeroCard`).
  Başka anahtarın satırına dokunmak dört şeridi çakıştırır.
- **Blok propları:** `{ data, row }`. `row.key`, `row.block` ve `runtime.data` elinde.
- **Riskli gövde:** `runtime.riskyBodies["apw"]`. Aç/kapa, `aria-expanded`, `aria-controls` ve
  tehlike tonu motorda; sen yalnız gövdeyi ver.
- **Değer okumak/yazmak:** `useSettingValue<T>(key)`. Kirli profil alanları (`pn` `pu` `pz`
  `pbio` `pp` `ps` `pe` `px`) kendiliğinden kaydetmez, kirli bayrağı kurar.
- **Ses satırı üç anahtar okur:** `ns1`, `ns1_p` (profil), `ns1_v` (seviye).
- **`pp` menüsünün nokta tonları** motorda (`SELECT_OPTION_TONE_TOKENS`); yeni bir noktalı menü
  gerekirse orayı genişlet, satırı elle çizme.
- **Bloğun SSR'de render edilebilmesi şart.** `renderSettingsTab` süpürmesi 27 sekmenin hepsini
  `renderToStaticMarkup` ile çiziyor; deftere giren blok bu ortamda ayakta kalmalı. `next/image`,
  `next/dynamic` ve tarayıcı-only API'leri `node --test` altında çözülmüyor (§6.1/1 canlı örnek).
  Blok gerçekten bunlara ihtiyaç duyuyorsa testte sahtesini kur.
