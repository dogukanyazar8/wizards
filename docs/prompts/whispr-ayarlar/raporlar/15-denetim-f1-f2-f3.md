# 15 — Denetim düzeltmeleri · F1 · F2 · F3

Paket kapandıktan sonra yapılan derin denetimde üç engelleyici bulgu çıktı. Bu rapor ne
bulunduğunu, nasıl düzeltildiğini ve bir daha aynı sınıf hatanın nasıl yakalanacağını yazar.

Ortak kök neden tek cümleyle: **her şerit kendi parçasını test etti, montajlanmış pencereyi
kimse test etmedi.** Üç bulgunun üçü de birim testleri yeşilken üründe ölüydü.

---

## F1 — Üç pencere sözleşmesi ürüne hiç bağlanmadı

### Bulgu

`SettingsSectionRenderInput` altı alan taşıyordu; `renderSettingsSection`
(`settings-sections.tsx`) bunlardan **dördünü** geçiriyordu. Yerde kalan ikisi:

| Ölü sözleşme               | Ürün etkisi                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runSave`                  | Tüm kod tabanında yalnız bir **yorumda** geçiyordu. Başlıktaki kayıt göstergesi `idle`da donuyordu — 170 satırın hiçbirinde `Kaydediliyor → Kaydedildi` görünmüyordu                                         |
| `onTouch`                  | `state.dirty`'yi kuran tek eylemdi (`settings-window-state.ts:185`). Aşağı inmediği için kirli bayrağı hiç `true` olmuyor, **kirli şerit hiç çıkmıyordu** — `Sıfırla` / `Değişiklikleri kaydet` erişilemezdi |
| `useSettingsDirtyRegistry` | `settings-ladder.tsx`'te tanımlıydı, hiçbir bölüm tüketmiyordu                                                                                                                                               |

Bu, Ş13'ün `renderSection` dikişinde yakaladığı hatanın aynısıydı (_"Ş7–Ş10 dördü de yuvayı
bağlamadı"_) — ama bu üçü yakalanmamıştı.

### Düzeltme

İki alan da **kaldırıldı**; yerlerine kutunun kendi raporu geldi
(`settings-ladder.tsx` §`useReportSettingsStore`). Yön tersine döndü: kabuk kutuyu okumaz,
kutu kabuğa yazar.

- `SettingsStoreReport` üç kanal taşır: `onStatus` · `onDirtyKeys` · `onRetry`.
- `useReportSettingsStore(store)` kutunun `subscribe`ına bağlanır, durum ve kirli anahtar
  listesi **değiştiğinde** rapor eder (her dokunuşta kabuğu yeniden çizmemek için).
- Aynı çağrı kirli şeridin `commit` / `discard` kaydını da yapar — kaydı ayrı bir çağrıya
  bırakmak "kutuyu bildirdim ama düğmeleri bağlamadım" hâlini mümkün kılardı.
- Sökülürken `onStatus("idle")` + `onDirtyKeys([])`: bölüm değişince önceki bölümün
  `Kaydedildi`si başlıkta asılı kalmaz.

Kutu kuran **beş** bölüm kökünün hepsi bağlandı: Hesabım · Görünüm · Ses ve Video ·
Bildirimler · Masaüstü.

### Yan bulgu — kirli şerit yanlış anda temizleniyordu

```ts
void runSave(commit).then(() => dispatch({ type: "resetDirty" }));
```

`runSave` hatayı yakalayıp **çözüldüğü** için `.then` her hâlde koşuyordu: yazma düşse bile
kullanıcının kaydedilmemiş değişikliği temiz gösteriliyordu. Artık bayrağı kutu düşürüyor
(`commitDirty` kirli kümeyi boşaltır, rapor boş listeyi yollar); kabuk koşulsuz `resetDirty`
çağırmıyor.

### Yeni kutu metodu

`SettingsValueStore.commitDirtyAndFlush()` — `commitDirty` yamayı yalnız kuyruğa koyup 250 ms'lik
birleştirme penceresini bekliyordu; şeridin yeşil düğmesi sonucu bilmek zorunda. `flushPending`
zamanlayıcıyı atlar ve hatayı yutmaz.

---

## F2 — 21 kontrol "Kaydedildi" der, yenilemede kaybolurdu

### Bulgu

`writeAppearancePatch` 12+ satır için sessizce `break` ediyordu; `av-settings-bridge` dört satır
için aynısını yapıyordu. Zincir:

```
write() hata atmadan çözülür → send() → settle(patch, "saved") → statuses.set(key, "saved")
```

Değer yalnız modül seviyesi kutuda yaşıyordu, sayfa yenilenince ölüyordu.

**Kök neden tek dosyaydı:** `PatchSettingsSchema` yalnız `idleTimeoutMinutes` kazanmıştı.
Kolonların **on dokuzu `UserSettings`'te zaten vardı** — sekizi paketten önce, on biri Ş0'ın
migration'ıyla. UI vardı, kolon vardı, aradaki tel yoktu.

Ayrıca iki gelenek çelişiyordu: Hesabım bölümü bunu **doğru** yapıyordu
(`throw new Error("SETTINGS_WRITE_UNSUPPORTED:...")` → kutu geri alır, `error` gösterir);
Görünüm ve Ses/Video sessizce "kaydettim" diyordu — hem de tuzak #14'ü kendi yorumunda anarak.

### Düzeltme

**Sunucu tarafı** (`app/api/v1/users/me/settings/`):

- `PatchSettingsSchema` 19 alan kazandı; sınırlar tasarımın kaydırıcı aralıkları
  (`uiTextScale` %85–130, `messageSizePx` 12–22, `mainContentWidth` %70–100,
  `serverIconSize` 36–56).
- `LayoutSettingsRecord` ve iki Prisma `select` bloğu aynı alanlarla genişledi.
- Yeni migration `20260825090000_settings_message_size_px`: `messageSizePx Int DEFAULT 15`.
  Genuinely eksik olan **tek** kolon buydu. Mobilin dört adımlı `messageBodySize`'ı ile
  karıştırılmadı — biri string adım, diğeri gerçek piksel; aynı kolona sıkıştırmak iki
  platformdan birini yalancı yapardı.

**Görünüm köprüsü:**

- `APPEARANCE_SERVER_ROWS` 4 girişten **23**'e çıktı.
- `APPEARANCE_ROWS_WITHOUT_BACKING` **silindi** — artık boş bir liste.
- `default:` dalı `throw`a çevrildi.
- `readAppearanceServerValues` eklendi ve köprü `fetchLayoutSettings` ile hidrasyon yapıyor:
  değer yenilemeden sonra da doğru geliyor. `applyRemote` uçuşta olan anahtarı atlar, yani
  kullanıcının az önceki dokunuşu geri alınmaz.

**Ses ve Video köprüsü:**

- `voice-store`'a dört alan eklendi (persist + rehydrate + partialize):
  `selfMonitorEnabled` (`i4`), `masterOutputVolume` (`u3`),
  `screenShareExcludeSelfWindow` (`e4`), `screenShareAllowSourceSwitch` (`e5`).
- Bunlar bilerek sunucuya gitmez — cihaz tercihleridir. Ama "cihazda" demek "bellekte" demek
  değildi; F2'den önce dördü de pencere kapanınca ölüyordu.
- `AV_ROWS_WITHOUT_BACKING` silindi, `default:` dalı `throw`a çevrildi.

---

## F3 — e2e hiç koşulmamıştı

### Bulgu

İki spec yazılmıştı (`settings-window.spec.ts` 13 senaryo, `notification-panel.spec.ts` 6
senaryo) ve `governance.test.ts` ikisini de "ürün-kritik" listesine almıştı — ama
`E2E_TEST_PASSWORD` kaynakta bilerek olmadığı için `pnpm e2e` hiç çalışmamıştı.

`settings-window.spec.ts:43` `expectSaved()` yardımcısı `data-save-state="saved"` bekliyor.
**Koşsaydı F1'i doğrudan yakalardı.**

### Yan bulgu — e2e veritabanı göç görmemişti

İlk `e2e:seed` denemesi şununla düştü:

```
The column `level of relation UserNotificationSettings` does not exist in the current database.
```

`whispr_e2e` veritabanına paketin **üç** migration'ı da hiç uygulanmamıştı. Bu tek başına
e2e'nin hiç koşmadığının kanıtı.

### Düzeltme

Yerel e2e ortamı ayağa kaldırıldı ve testler gerçekten koşturuldu:

```bash
pnpm --filter @wizards/db db:migrate:deploy
pnpm --filter @wizards/web e2e:seed
npx playwright test --project=chromium e2e/specs/settings/
```

Gereken değişkenler (`E2E_TEST_MODE`, `E2E_DATABASE_URL`, `E2E_BASE_URL`, `REDIS_URL`,
`E2E_TEST_PASSWORD`) yerel kabukta üretildi; parola kaynağa **yazılmadı** — `check-e2e-env`'in
kuralı korundu.

### Sonuç: 11 geçti · 8 düştü · 1 atlandı (3.1 dk)

`notification-panel.spec.ts`'in altı senaryosunun **hepsi** geçti.

**F1 ve F2'nin kanıtı geçen testte:** `settings-window.spec.ts:85`
_"anahtar çevrilince kayıt göstergesi ilerliyor ve değer yenilemeden sonra duruyor"_ —
`expectSaved()` `data-save-state="saved"` bekliyor (F1) ve `page.reload()` sonrası değerin
durduğunu doğruluyor (F2). Bu test düzeltmelerden **önce** geçemezdi.
`settings-window.spec.ts:221` _"uygulama simgesi favicon'u değiştiriyor"_ (`n1`) de geçti —
F2'de yeni bağlanan satırlardan biri.

**Düşen sekiz senaryo, F3'ün ortaya çıkardığı yeni bulgular.** Hiçbiri bu düzeltmelerin
dokunduğu dosyalarda değil; e2e ilk kez koştuğu için bugüne kadar görünmüyorlardı:

| Spec satırı | Senaryo                                  | Gözlenen                                                                               |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| :135        | arama sonucu doğru sekmeye götürüyor     | `settings-search-hit` hiç çizilmiyor                                                   |
| :151        | Esc kapatıyor, focus dişliye dönüyor     | `document.activeElement` `null` kalıyor                                                |
| :167        | Esc merdiveninin ilk basamağı açık menü  | merdiven ilk basamakta durmuyor                                                        |
| :181        | geri tuşu önceki sekmeye dönüyor         | adres `/messages`'a düşüyor — sekme geçişleri `replace` olduğu için geçmişte kayıt yok |
| :201        | dil ve tema tercihleri kaydediliyor      | `User.locale` `en` kalıyor (`l1` yazma yolu)                                           |
| :237        | ses cihazı ve Hakkında katkıcıları       | `Doğukan Yazar` katkıcı satırı çizilmiyor (`Contributor` tablosunda 8 satır **var**)   |
| :252 · :283 | 2FA satır içinde kuruluyor / kapatılıyor | parola ve kod alanları bulunamıyor                                                     |

Bunlar bu turda **düzeltilmedi** — kapsam F1/F2/F3'tü ve F3 "e2e'yi koştur" demekti. Sekizi de
ayrı birer iş kalemi; :181 (geri tuşu) K2'nin kabul kriterine, :151/:167 Ş13'ün a11y tablosuna,
:201 F2'nin hesap tarafındaki kalanına doğrudan dokunuyor.

---

## Bir daha yakalanması için

`settings-window-contract.test.ts`'e dört iddia eklendi (`Ayarlar kabuğu — kutu raporu (F1)`):

1. Kutu kuran **beş** bölüm kökünün her biri `useReportSettingsStore` çağırıyor — liste
   eskirse `new SettingsValueStore(` iddiası önce düşer, sessizce geçmez.
2. Kabuk raporu sağlıyor ve üç kanalın hepsini indirgeyiciye bağlıyor.
3. Ölü `runSave` / `onTouch` alanları bölüm sözleşmesinde **yok**.
4. Rapor sökülürken kabuğu boşa çeviriyor.

Bunlar davranış değil **dikişin varlığını** ölçer; kaybolan tam olarak oydu. Bileşen testleri
prop'ları elle verdiği için dikişi göremiyorlar ve göremeyecekler.

`APPEARANCE_SERVER_ROWS` eşlemesi de `PatchSettingsSchema` ile birebir kilitlendi
(`appearance-settings-bridge.test.tsx`), ve iki köprünün `default:` dalı için birer
"sessizce yutmuyor, düşüyor" testi yazıldı.

---

---

# İkinci tur — düşen 8 senaryo · F4 · F5

## Düşen 8 senaryonun teşhisi

Beşi **ürün hatası**, üçü **spec hatası** çıktı.

### Ü1 — açılır menü kendini kapatıyordu (`:167`, gizli genel hata)

`setting-select` açıldığında listeye odak veriyor (`listRef.current?.focus()`). Odak, kaydırma
alanının dibine yakın bir satırda listeyi görünür yapmak için kabı **kaydırıyor**; kaydırma da
aynı bileşenin `scroll` dinleyicisine düşüp menüyü **aynı karede** kapatıyordu.

Hata seçici görünüyordu ama kural geneldi: `i1` (Ses'in **ilk** satırı) zaten görünür olduğu için
açılıyor, `nq4` (Sessiz saatler'in **son** satırı) hiç açılmıyordu. Sayfanın dibindeki her açılır
menü tıklamaya cevapsızdı.

Düzeltme: `focus({ preventScroll: true })`. Menünün yeri zaten `measure()` ile ölçülüyor;
kaydırma o ölçümü de geçersiz kılardı.

### Ü2 — menü kapanınca odak sahipsiz kalıyordu (`:151`)

`closeUserPopups` yalnız state temizliyordu. Menü ögesi DOM'dan düşünce odak `<body>`ye
savruluyor, Ayarlar penceresi de açılışta `document.activeElement`i "geri dönülecek yer" olarak
yakaladığı için `Esc` ile kapandığında dönecek bir yer bulamıyordu.

Düzeltme: menü kapanırken odak **eşzamanlı** olarak dişliye döner. Pencereyi açan tıklama önce
burayı, sonra rota geçişini işlettiği için pencere mount olduğunda odak zaten dişlide oluyor.

### Ü3 — geri tuşu Ayarlar'dan atıyordu (`:181`)

Sekme değişimi `router.replace` kullanıyordu; geçmişte kayıt olmadığı için geri tuşu kullanıcıyı
`/messages`'a savuruyordu. K2'nin kabul kriteri ("geri tuşu sekmeler arasında geziyor") düşüyordu.

Düzeltme: `router.push`. Sözleşme testi de tersine çevrildi — artık `router.replace`'in
**bulunmadığını** doğruluyor.

### Ü4 — katkıcı listesinde geliştirici yoktu (`:237`)

`Contributor` tablosu yalnız katkıcıları taşıyor; geliştirici adı `buildInfo.developerName` ile
ayrı geliyordu ve **hiçbir yerde çizilmiyordu**. İki kat yanlıştı: tasarımın ilk satırı
(`Doğukan Yazar · Geliştirici`) eksikti ve `resolveContributorRole`'ün `developer` dalı hiç
çalışmayan ölü koddu.

Düzeltme: ad listenin başına ekleniyor; tabloya bir gün eklenirse iki kez çizilmiyor.

### Ü5 — yok (bkz. S2)

## Spec hataları

| #   | Senaryo             | Hata                                                                                                                                                                                 |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | `:135` arama        | Sorgu Türkçe (`sessiz saat`), arayüz İngilizce. Arama indeksi arayüzün **gerçek** dilinden kuruluyor (`buildSettingsSearchIndex(t)`); `alice` `en` ile tohumlanıyor. → `quiet hours` |
| S2  | `:201` dil          | `LOCALE_BY_INDEX = ["tr", "en"]` — Türkçe **ilk** seçenek. Test index 1'e (İngilizce) tıklıyordu; `alice` zaten `en` olduğu için tıklama yazma üretmiyordu. → index 0                |
| S3  | `:252` · `:283` 2FA | Alanlar gerçek `<label>` taşıyor, `placeholder` değil (a11y tercihi) ve düğme metni tasarımdan geliyor (`Doğrula ve aç`, `Enable 2FA` değil). → dilden bağımsız `testid`             |

S2'yi kovalarken iki yanlış alarm da elendi: dil **zaten** kalıcı (`persistUserLocale` hem
`User.locale` hem `UserSettings.locale` yazıyor) ve tema **zaten** kalıcı
(`updateThemePreferenceAction`). İkisini `PatchSettingsSchema`'ya eklemek aynı kolona ikinci bir
yazıcı koymak olurdu; eklenen alanlar geri alındı.

---

## F4 — pencere içi kod bölme

Rota seviyesi bölme pencereyi ana paketten zaten ayırıyordu, ama pencerenin **kendi** parçası
altı bölümü, yirmi özel bloğu, yirmi üç temalık ızgarayı, QR üreticisini ve masaüstü
tanılamasını tek yığında taşıyordu: `Bildirimler`i açan kullanıcı hiç görmeyeceği tema ızgarasını
da indiriyordu (PROMPT §8).

Dört bölüm kökü ve sekiz Ses/Görünüm sekmesi `next/dynamic` ile kendi parçasına indi; gelene
kadar `SettingsSkeleton` çiziliyor. `ssr: false` **kullanılmadı** — pencere bir rota ve ilk
boyanın sunucuda çizilmesi doğru davranış.

**Test bedeli:** Next çalışma zamanı olmayan SSR testinde tembel parça çözülmüyor. `Ses ve Video`
ile `Görünüm`ün "her satır çiziliyor mu" iddiası bileşenlere **doğrudan** soruluyor; defterin
bütünlüğü bir katman yukarıda ("her sekme bir düğüm döndürüyor mu") ölçülmeye devam ediyor.
İkisi birlikte eski regresyonu kapatır: biri eksik dalı, diğeri eksik satırı yakalar.

## F5 — `measureScrollArea` dar `overflow` tespiti

Yalnız `auto` aranıyordu. `scroll` ile kurulmuş bir kap (kaydırma çubuğunu her zaman göstermek
isteyen düzenlerin varsayılanı) ve tarayıcıya özgü `overlay` sınır sayılmıyor, menü kabın kendisi
kırpıyorken görünüm alanına göre ölçülüp yanlış yöne açılıyordu.

Düzeltme: `CLIPPING_OVERFLOW_VALUES = { auto, scroll, overlay }`. `hidden` bilerek listede yok —
kırpar ama kaydırmaz, `scrollHeight` farkı da olmadığı için eşiği zaten geçmez. Sihirli `> 4`
sayısı `SCROLLABLE_OVERFLOW_TOLERANCE_PX` oldu ve gerekçesi yazıldı (alt piksel yuvarlaması).

İki yeni test: `scroll`/`overlay` sınır sayılıyor, `hidden` sayılmıyor.

---

## Kalan bulgular

| #   | Madde                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Ş1 raporundaki B3/B4 borçları (Ş0 kolon varsayılanlarının otoriteyle hizalanması, `soundNotificationProfile` düzeltme SQL'i) hâlâ açık |
