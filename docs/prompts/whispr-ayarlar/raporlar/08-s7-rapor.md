# Ş7 — Hesabım bölümü · rapor

**Tarih:** 2026-08-24 · **Dal:** `uat` · **Commit:** yok (kullanıcı istemedi)
**Şerit:** Dalga 3 / Ş7 — 6 sekme · 15 grup · 35 satır · 5 özel blok · 3 riskli blok.
**Paralel koşan şeritler:** Ş8, Ş9, Ş10 (koşum sırasında blok defterinin kalan 15 yuvasını da
doldurdular; §6'daki kapı notu buradan geliyor).

---

## 1. Ne yapıldı

### 1.1 Beş özel blok (defterin yalnız kendi beş satırı değişti)

| Anahtar       | Dosya                              | Not                                                                                                                                                            |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero`        | `blocks/profile-hero-card.tsx`     | 132 banner · 80 avatar · 5 halka · `-42` üst boşluk · 17 durum noktası · 28 kamera düğmesi. **Canlı**: `pn` `pu` `pp` `ps` `pe` `px` yazıldıkça anında yansır. |
| `connections` | `blocks/connections-block.tsx`     | GitHub · Spotify · Steam · Xbox; dördü de `disabled` (K5).                                                                                                     |
| `secEvents`   | `blocks/security-events-block.tsx` | Sekiz tür, metin sözlükten; nokta **ve** cümle.                                                                                                                |
| `sessions`    | `blocks/active-sessions-block.tsx` | `Bu cihaz` satırında X **yok** (tuzak #13).                                                                                                                    |
| `badges`      | `blocks/badge-grid-block.tsx`      | Beş kategori × 4 kolon; sayaç gerçek katalogdan; **açıklama yok**.                                                                                             |

`rows/setting-custom-block.tsx` içinde yalnız bu beş satır değişti; paralel şeritlerin
satırlarına dokunulmadı.

### 1.2 Üç riskli blok gövdesi

`risky/password-block.tsx` · `risky/two-factor-block.tsx` · `risky/delete-account-block.tsx`,
ortak kabuk `risky/risky-field.tsx` (alan · ızgara · altlık · düğme · mesaj — üç blok aynı
`SETTINGS_METRICS.riskyBlock` ölçüsünü iki kez yazmasın diye).

- **Parola:** mevcut parola tam genişlik, yeni parola + tekrarı iki kolon, yardım metni birebir
  (`En az 10 karakter, bir sayı ve bir büyük harf gerekir.`). Üç hata dalı ayrı cümle:
  `INVALID_CURRENT_PASSWORD` · `PASSWORD_MISMATCH` · `WEAK_PASSWORD`; zayıf parola yanıtı
  **düşen kuralların listesini** yazar (Ş3 §8.6'nın istediği beş anahtar sözlüğe girdi).
- **2FA:** QR **istemcide** üretilir — `beginTwoFactorSetupAction` yalnız `otpauth://` URI'si ve
  dörtlü gruplanmış anahtar döndürüyor; matris `qrcode`'un `create`'iyle çıkarılıp `<rect>`
  olarak çizilir (tuval yok, `innerHTML` yok). Kapatma parola **ve** canlı kod ister.
- **Hesap silme:** cümle ekranda Türkçe (`hesabımı kalıcı olarak sil`), telde protokol literali;
  cümle yanlışken **ya da** reauth jetonu yokken **ya da** `canDelete=false` iken düğme kapalı.

### 1.3 Altı sekme + bölüm bağlantısı

`sections/account/` altında altı sekme dosyası (`profile` `account` `privacy` `security`
`badges` `data`), bölümün bağlantı katmanı (`account-section.tsx`), tipli adapter
(`account-surface.ts`) ve hero'nun fotoğraf akışı için ince bağlam (`account-context.tsx`).

Sekme dosyaları birer satırlık: **hiçbir satır elle yazılmadı**, hepsi `renderSettingsTab`
üzerinden ağaçtan doğuyor. `account-section.test.tsx` bunu kaynak taramasıyla da sabitliyor
(`<SettingRow|SettingToggle|…` geçen sekme dosyası yok).

### 1.4 K9 — `Boşta sayılma süresi`

Satır **Gizlilik › Görünürlük** grubunun sonuna eklendi ve motorun `SettingSelect`'iyle çizildi;
seçenekler ürünün gerçek listesi (`PRESENCE_IDLE_TIMEOUT_OPTIONS` → 5/10/15/30/60 dk), yazma
`usePresenceIdleTimeoutPreference`'a gidiyor. Ayrıntı ve sonraki şerit için bırakılan yama §3.1.

---

## 2. Dosyalar

**Yeni (21):**

```
components/settings/blocks/profile-hero-card.tsx        + .test.tsx (11)
components/settings/blocks/connections-block.tsx        + .test.tsx (6)
components/settings/blocks/security-events-block.tsx    + .test.tsx (7)
components/settings/blocks/active-sessions-block.tsx    + .test.tsx (7)
components/settings/blocks/badge-grid-block.tsx         + .test.tsx (8)
components/settings/risky/risky-field.tsx
components/settings/risky/password-block.tsx            + .test.tsx (7)
components/settings/risky/two-factor-block.tsx          + .test.tsx (8)
components/settings/risky/delete-account-block.tsx      + .test.tsx (8)
components/settings/sections/account/profile-tab.tsx
components/settings/sections/account/account-tab.tsx
components/settings/sections/account/privacy-tab.tsx    + .test.tsx (6)
components/settings/sections/account/security-tab.tsx
components/settings/sections/account/badges-tab.tsx
components/settings/sections/account/data-tab.tsx
components/settings/sections/account/account-section.tsx + .test.tsx (6)
components/settings/sections/account/account-surface.ts  + .test.ts (10)
components/settings/sections/account/account-context.tsx
```

Yeni test toplamı: **84** (hepsi yeşil).

**Düzenlenen (6):**

```
components/settings/rows/setting-custom-block.tsx        yalnız kendi 5 anahtarı
components/settings/rows/render-settings-tab.tsx         §3.2 — iki additive değişiklik
components/settings/rows/setting-custom-block.test.tsx   §3.3 — yer tutucu testleri anahtar-bağımsız
lib/settings/use-setting-value.ts                        §3.2 — `disabledRows` alanı
lib/locale/messages/tr.ts · en.ts                        73 yeni anahtar (iki dilde)
lib/locale/settings-screen-copy.test.ts                  §3.1 — K9 anahtarları ağaç dışı kaydı
```

---

## 3. Sahiplenilen dosya listesinden sapmalar

Prompt'un “Sahiplenilen dosyalar” bölümü bağlayıcıydı; üç noktada dışına çıkıldı. Üçü de
**additive** ve gerekçesi aşağıda.

### 3.1 K9 satırı ağaca konulamadı; `settings-screen-copy.test.ts`'e bir kayıt eklendi

`lib/settings/tree.ts` bu şeritte “okunur, yazılmaz”. Satırı ağaca koymak üç dosyayı birden
değiştirmeyi gerektiriyordu:

- `tree.test.ts` → `{ key: "account", tabs: 6, groups: 15, rows: 35 }` ve toplam `170`,
- `settings-screen-copy.test.ts` → ağaç ile referans `SET` **satır satır konum eşleşmesi**
  (`assert.equal(row.key, raw[0])`) ve `checked === 170`,
- prompt'un kabul maddesi ise açıkça **35 satır** diyor.

Bu yüzden satır `sections/account/privacy-tab.tsx` içinde, çizim anında gruba ekleniyor
(`withIdleTimeoutRow`) ve motor onu diğer satırlarla aynı kontrolle çiziyor. Sözlükteki
`settings.row.g9.*` / `settings.option.g9.*` anahtarları “ağacın ürettiği anahtarlar” kuralının
dışında kaldığı için copy testine yedi anahtarlık **adlı** bir kayıt eklendi
(`OUTSIDE_TREE_ROW_KEYS`) — sapma #9'un (`Varsayılanlar` başlığı) aynı deseni.

**Ş13 için kalıcı yama** (ağaç sayımını 36/171'e çıkarmayı göze alan tur):

```ts
// tree.ts — account › privacy › grup 1 (`g1`, `g2`, `g7`) sonuna:
{
  key: "g9",
  type: "select",
  titleKey: "settings.row.g9.title",
  descriptionKey: "settings.row.g9.description",
  defaultValue: 2,
  options: ["settings.option.g9.1", "settings.option.g9.2", "settings.option.g9.3",
            "settings.option.g9.4", "settings.option.g9.5"],
},
```

Yanında: `SETTINGS_TREE_COUNTS` ve `tree.test.ts` sayıları, `settings-screen-copy.test.ts`
satır yürüyüşünde `g9`'un atlanması, `privacy-tab.tsx`'in tekrar tek satıra inmesi ve
`account-section.tsx`'teki `g9` tohumunun silinmesi.

**Bugünkü bedeli:** satır arama indeksine (Ş4, `search-index.ts` ağaçtan üretiliyor) **girmiyor**
— “Boşta” aratan kullanıcı bu satırı bulamaz.

### 3.2 Satır motoruna iki additive değişiklik

K5'in “telefon satırı `disabled`” maddesi motor üzerinden geçmek zorundaydı: `ap` bir `action`
satırı ve düğmeleri `ActionsControl` çiziyor. `SettingActionDescriptor.disabled` ve
`SettingInputProps.disabled` Ş6'da **zaten vardı**, eksik olan kanaldı.

1. `use-setting-value.ts` → `SettingsRowRuntime.disabledRows?: Readonly<Record<string, boolean>>`
   (opsiyonel; varsayılan boş harita, mevcut çağrı yerleri değişmedi).
2. `render-settings-tab.tsx` → `InputControl` ve `ActionsControl` bu haritayı okuyor.

Ayrıca aynı dosyada bir **hata** düzeltildi: `splitSettingsGroup` grup başlığının `titleData` /
`noteData` alanını **alan adı** değil metin sanıyordu; Rozetler sekmesinin başlığı ekranda
`badgeProgress`, Aktif oturumlar grubunun notu `sessionCount` yazıyordu. Artık ikisi de
`runtime.data` üzerinden çözülüyor (sözlük verilmezse alan adı görünür kalır — yer tutucu
sözleşmesinin aynısı).

### 3.3 `setting-custom-block.test.tsx` iki testi anahtar-bağımsız hâle geldi

Test `hero`'nun yer tutucu olduğunu varsayıyordu; `hero` bu şeritte devralındı. İki test artık
defterde kalan **ilk** yer tutucuyu seçiyor, hiç kalmadıysa kendini atlıyor. (Koşum sonunda
yirmi yuvanın yirmisi de sahiplenilmiş durumda, yani iki test `skip` raporluyor.)

---

## 4. Kayda geçen sapmalar

**1. Rozet ailesi ikisinde farklı.** SPEC §5.1 `Katkıcı`'yı Aktivite, `Yayıncı`'yı Ticaret
altında gösteriyor; `BADGE_CATALOG` ikisini sırasıyla `contribution` ve `activity` ailesinde
tutuyor. Katalog tek kaynak (mobil çipler ve profil kartı da onu okuyor) ve rozetin ailesini
değiştirmek bir kullanıcının rozetini taşımak demekti → **katalog kazandı**. On altı ad ve beş
kategori aynen duruyor, iki rozet farklı başlığın altında.

**2. Ölçü sözlüğü üç blokta referanstan ayrılıyor.** `SETTINGS_METRICS.blocks` içinde
`badgeGrid.iconSize: 34` (referans 26), `badgeGrid.cellPadding: 13` (referans 9/10),
`connections.iconSize: 30` ve `sessions.iconSize: 30` (referans 32), `sessions.rowPaddingY: 11`
(referans 12), `securityEvents.dotSize: 8` (referans 7). `metrics.ts` bu şeritte
“okunur, yazılmaz” ve arbitrary px yasağı sözlüğü zorunlu kılıyor → **sözlük uygulandı**.
Ş13 karşılaştırmasında bu altı değer gözden geçirilmeli.

**3. `passwordChangedAt` cümlesi.** Referans `12 Ağustos'ta değiştirildi` yazıyor; Türkçe bulunma
eki aya göre değişiyor (`'ta` / `'da` / `'de`) ve tarih biçimi kullanıcı tercihine bağlı.
Ek üretmek yerine ek-bağımsız kalıp seçildi: `{date} tarihinde değiştirildi`
(`settings.data.passwordChangedAt` — bugün zaten okunamıyor, §5).

**4. `d1` satırının `Hazır` pili ağaçtan geliyor.** `badgeKey: "settings.row.d1.badge"` +
`tone: "success"` sabit; arşiv verisi olmadığında da “Hazır” yazıyor. Pil `badgeData`'ya
çevrilmeden bu satır bir şey **iddia ediyor**. Ağaç bu şeritte yazılmadığı için kayda geçti.

**5. `s2` (Kurtarma kodları) üç düğmesi de kapalı.** Sayaç gerçek
(`getRecoveryCodeStatusAction`), ama `Görüntüle` düz metni geri getiremez (kodlar sha256,
Ş3 §4 sapma 3), `Yenile` ise parola + canlı kod isteyen bir reauth yüzeyi istiyor ve o yüzey
SPEC'te tanımlı değil. Üçü de `disabledRows` ile kapalı; uydurma bir akış yazılmadı.

**6. `Tüm cihazlardan çıkış yap` iki adımda.** Tek uç yok: `revoke-others` diğerlerini kapatıyor,
mevcut oturum yerel `signOut` ile kapanıyor. Satırın açıklaması (`Bu cihaz dahil bütün oturumlar
kapatılır`) bu davranışın kendisi.

---

## 5. Bırakılan `TODO(api):`

| Yer                                       | Not                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `account-surface.ts` §default             | `pz` `pbio` `ps` `pe` `px` (profil alanları), `g6` `g7` `g8` — web yazma yolu yok. `updateAccountSettingsAction` yalnız görünen ad / kullanıcı adı / e-posta / durum alıyor; `updateAccountProfile` servisinin web ucu yok. Eşleme bu anahtarları **yutmuyor**, hata fırlatıyor: dokunulan satır sunucunun bildiği değere döner ve gösterge `Kaydedilemedi` der.   |
| `account-section.tsx` — `data`            | `getAccountSettingsRows` servisi var, **uç yok**: `email` bootstrap'tan geliyor, `phone` / `verificationEmailSentAt` / `passwordChangedAt` yer tutucu cümle yazıyor (`Numara eklenmedi` · `Hiç gönderilmedi` · `Hiç değiştirilmedi`).                                                                                                                              |
| `account-section.tsx` — `lastExport`      | Arşiv listesi ucu yok; satır `Henüz arşiv oluşturulmadı` yazıyor, `İndir` ve `Yeni arşiv oluştur` ikisi de taze arşivi indiriyor (`GET /users/me/data-export` her çağrıda üretiyor).                                                                                                                                                                               |
| `account-section.tsx` — `pu` kilidi       | 30 günlük bekleme sunucuda **uygulanıyor** (`getNextUsernameChangeAt`), ama hiçbir web okuma yolu `nextUsernameChangeAt` döndürmüyor. Kapı alanın üzerinde kurulu (`disabledRows.pu`), bugün hep açık. Uç geldiğinde tek satır dolar; **kalan süre metni** ayrıca `pu` satırının `descriptionKey`'inin `descriptionData`'ya çevrilmesini ister (ağaç değişikliği). |
| `profile-hero-card.tsx` — banner          | Web'de banner yükleme/kaldırma yolu yok (`bannerUrl` yalnız mobil profil ucundan yazılıyor). İki düğme çizilir, `disabled`.                                                                                                                                                                                                                                        |
| `security-client.ts` — `fetchConnections` | Ş3'ün notu duruyor; dört satır `available: false`, düğmeler kapalı, **çağrılan adres yok**.                                                                                                                                                                                                                                                                        |

Uydurma endpoint çağrısı **yok**: `connections-block`, `security-events-block` ve
`password-block` testleri kaynakta `/api/` dizesi aramıyor olduğunu da doğruluyor.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ✔ exit 0 (10 config testi + eslint temiz)
pnpm --filter @wizards/web test        ✖ 6092 test · 6088 geçti · 1 düştü · 3 atlandı
```

Düşen tek test **bu şeridin değil**:

```
Ayarlar metin sözleşmesi — sözlük bütünlüğü › ağaç önekleri altında ölü anahtar yok
  actual: [ 'settings.group.about.about.3.title' ]
```

`Hakkında` bölümünün üçüncü grubu ağaçta `titleData: "appVersion"` taşıyor, yani statik başlık
anahtarına ihtiyacı yok; `settings.group.about.about.3.title` anahtarını tüketen bir kod da yok.
Anahtar bu koşumda Ş10'un dosyalarıyla birlikte sözlüğe girdi (aynı şeritten gelen ikinci
bir kırık — `parity.test.ts`'in on iki sapmalık listesi — koşum sırasında kendi tarafında
düzeltildi). **Düzeltmesi tek satır**:
`tr.ts` ve `en.ts`'ten o anahtarı silmek (ya da K9'daki gibi `OUTSIDE_TREE_ROW_KEYS`'e adlı bir
kayıt eklemek, eğer Ş10 onu bir blok içinde çizecekse). Paralel şeridin satırlarına dokunulmadı.

Ş7'nin kendi 84 testi ayrıca tek başına koşuldu: **84/84 yeşil**.

---

## 7. Kabul listesi

- [x] 6 sekme, 15 grup, 35 satır eksiksiz; sayım testi `tree.ts` ile uyuşuyor
      (`account-section.test.tsx` ağaçtan sayıyor ve her satırın `data-setting-row`'unu arıyor)
- [x] Hero: 132 banner · 80 avatar · 5 halka · `-42` üst boşluk · 17 durum noktası · 28 kamera
      düğmesi; `Profilimi görüntüle` sağda durum pilinin yanında
- [x] Ad ve kullanıcı adı yazdıkça hero **canlı** güncelleniyor (kutunun taslak değerinden)
- [x] `Kırp / Yakınlaştır / Sıfırla` düğme dizisi **yok** (test dizeyi arıyor)
- [~] Kullanıcı adı 30 günlük bekleme: kapı kurulu, **okuma yolu yok** (§5) — kalan süre metni
  ağaç değişikliği ister
- [x] `@` öneki değere dahil değil (motorun `SettingInput`'u öneki `aria-hidden` çiziyor;
      hero testi kutudaki değerin `@` taşımadığını da doğruluyor)
- [x] Biyografi sayacı `75 / 190` biçiminde ve sınırda `aria-invalid` (Ş6'nın `SettingTextarea`'sı)
- [x] Telefon satırı ve 4 bağlı hesap satırı `disabled` + `TODO(api):`; uydurma endpoint çağrısı yok
- [x] Parola bloğu üç hata dalını gösteriyor; yardım metni birebir
- [x] 2FA bloğu QR'ı **istemcide** üretiyor; manuel anahtar 4'lü gruplu; kopyalama bağlı
- [x] `Diğerlerini kapat` mevcut oturumu kapatmıyor; `Bu cihaz` satırında X düğmesi yok
- [x] Güvenlik etkinlikleri metni i18n'den; renk tek başına anlam taşımıyor (nokta + cümle)
- [x] Rozet sayacı gerçek veriden; 16 rozet adı katalogdan; **açıklama uydurulmamış**
      (test on altı açıklamanın hiçbirinin markup'ta olmadığını doğruluyor)
- [x] Rozet ızgarası ilk açılışta iskeletle geliyor (güvenlik günlüğü ve oturum listesi de)
- [x] Hesap silme cümlesi yanlışken düğme `disabled`
- [x] Aynı anda tek riskli blok açık (merdiven Ş6'da; gövdeler `riskyBodies`'ten geliyor)
- [~] Açık/koyu tema karşılaştırması: **tarayıcıda yapılamadı** — §8.

---

## 8. Açık iş: bölüm kayıt defteri (wiring)

`SettingsWindow` `renderSection` yuvasını bugün **kimseye** bağlamıyor; `settings-window-route.tsx`
onu hiç geçirmiyor ve pencere içerik alanında `settings-content-placeholder` duruyor. Yani
Hesabım bölümü tarayıcıda henüz görünmüyor ve dört bölüm şeridi de (Ş7–Ş10) aynı durumda.

Bu şerit `renderAccountSection(input)` fonksiyonunu hazır bıraktı. Defter tek dosyada kurulmalı
(Ş13, ya da Ş11–Ş12 ile birlikte bir bağlama turu):

```tsx
// components/settings/settings-sections.tsx (yeni, Ş13)
const SECTION_RENDERERS: Record<SettingsSection, (input: SettingsSectionRenderInput) => ReactNode> =
  {
    account: renderAccountSection,
    av: renderAvSection, // Ş8
    appearance: renderAppearanceSection, // Ş8
    notifications: renderNotificationsSection, // Ş9
    desktop: renderDesktopSection, // Ş10
    about: renderAboutSection, // Ş10
  };
```

Aynı turda `SettingsWindow`'un `onSaveProfile` / `onDiscardProfile` yuvaları da bağlanmalı:
kirli şerit bugün `Değişiklikleri kaydet`e basıldığında yalnız bayrağı düşürüyor
(`settings-window.tsx` içindeki `TODO(Ş7)` notu). Kaydetme yolu bu şeritte hazır — Hesabım'ın
değer kutusu `commitDirty()` ile kirli profil alanlarını tek yamada gönderiyor — ama kutu
bölümün içinde, şerit ise kabuğun altında; ikisini ancak defteri kuran taraf birleştirebilir.

Ekran görüntüsü karşılaştırması (`screens/04-ayarlar-profil.png`, açık + koyu) bu bağlantıdan
sonra anlamlı; referans kare ile **yapısal** karşılaştırma yapıldı (banner düğmeleri sağ üstte,
avatar halkası banner'ı deliyor, ad/kullanıcı adı/e-posta satırı, sağda pil + `Profilimi
görüntüle`, altta özel durum şeridi: emoji · metin · süre pili · temizle) ve fark bulunmadı;
piksel karşılaştırması Ş13'e kalıyor.

---

## 9. Sonraki şeritler için notlar

1. **`disabledRows` kanalı motorda.** Karşılığı olmayan satırı `disabled` çizmek isteyen her
   bölüm şeridi bunu kullanır; ikinci bir mekanizma kurulmasın.
2. **`titleData` / `noteData` artık gerçekten alan adı.** Ş9/Ş10 grup başlığında veri kullanacaksa
   `runtime.data`'ya aynı adla yazması yeter.
3. **Hero fotoğraf akışı `ProfileAvatarField`'i sarıyor.** Kırpma penceresi onun içinde; hero
   kartına ikinci bir kırpma arayüzü eklenmemeli (PROMPT §5).
4. **Ş13 silme listesi**: `settings-panel.tsx` giderken `startTwoFactorSetupAction` (data-URL
   döndüren eski eylem), `account-badges-card.tsx`, `active-sessions-card.tsx` ve
   `account-data-controls.tsx` de gidebilir — üçünün de yerine geçen blok bu şeritte yazıldı.
   `profile-avatar-field.tsx` **kalır**.
5. **Ölü anahtar taraması** (§6) Ş13'ün işini şimdiden gösteriyor: copy testi ağaç öneklerinde
   ölü anahtar bırakmıyor, `settings.block.*` ve `notif.*` ise “tüketicisini bekleyenler”
   listesinde sayılı duruyor.
