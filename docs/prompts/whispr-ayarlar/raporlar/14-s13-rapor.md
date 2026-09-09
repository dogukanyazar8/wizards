# Ş13 — Erişilebilirlik, ölçekleme, kırılımlar, temizlik, parity QA

**Dalga 5 · kapanış şeridi.** Bu şerit yeni yüzey eklemedi: ölçtü, düzeltti, sildi, kapattı.

Önceki on iki raporun bıraktığı borç toplandı ve tek tek kapatıldı. Paketin **en büyük açık
maddesi** bir eksik satırdı: `SettingsWindow`'un `renderSection` yuvasını hiçbir şerit
bağlamamıştı ve altı bölümün hiçbiri üründe açılamıyordu (§1).

---

## 1. Bölüm kayıt defteri — paketin açık kalan dikişi

Ş5 pencerenin içerik yuvasını açtı, Ş7–Ş10 dört bölüm kökünü dışa verdi ve **dördü de** aynı notu
bırakıp devretti:

| Rapor      | Not                                                                        |
| ---------- | -------------------------------------------------------------------------- |
| 07-s6 §7   | "gerçek etkileşim kanıtı Ş13'ün koşusuna kalıyor"                          |
| 08-s7 §8   | "`SettingsWindow` `renderSection` yuvasını bugün **kimseye** bağlamıyor"   |
| 09-s8 §7/1 | "`renderSection` hâlâ bağlı değil… **Ş13'e devredildi**"                   |
| 10-s9 §6   | "Yuvayı bağlamak Ş9'un dosyası değil"                                      |
| 11-s10 §8  | "bölüm `renderSection` yuvasına henüz **hiç kimse tarafından bağlanmadı**" |

Sonuç: `/settings/...` adresinde pencere açılıyor, sol nav ve sekme şeridi çiziliyor, içerik
alanında `settings-content-placeholder` duruyordu. 170 satırın hiçbiri tarayıcıda görünmüyordu.

**Yeni dosyalar**

| Dosya                                       | İş                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/settings/settings-sections.tsx` | Altı bölümün kayıt defteri. `Record<SettingsSection, …>` olduğu için eksik bir bölüm **derleme hatası**; `default` dalıyla sessizce boş çizen bir `switch` değil. |
| `components/settings/settings-ladder.tsx`   | Merdivenin (tuzak #12) ve kirli şerit dikişinin tüketici tarafı.                                                                                                  |

**Ses ve Video ile Görünüm bölümlerinin `renderXSection` girişi yoktu** — Ş8 beş+üç sekmeyi dışa
verdi ama bir kök yazmadı. Sekme dağıtıcıları defterin içinde duruyor; ikisi de kendi köprüsünü
sekme bileşeninin içinde kuruyor, defterin taşıdığı bir durum yok.

### 1.1 Merdiven gerçekten devredildi (tuzak #12)

Kabuğun `openSelect` / `openRisky` durumunu yalnız Hesabım okuyordu; kalan beş bölüm kendi yerel
merdivenini kuruyordu. Görünen etkisi: **`Esc` merdiveninin ilk basamağı ölüydü** — kabuk bir
menünün açık olduğunu hiç öğrenmiyor ve `Esc` doğrudan pencereyi kapatıyordu.

İki düzeltme:

1. `SettingsLadderProvider` defterde bir kez sağlanıyor; `av`, `appearance`, `notifications` ve
   `desktop` köprüleri `useSettingsLadderOverrides()` ile okuyor.
2. `useSettingsRowRuntimeState` devralmayı `??` yerine **alan varlığıyla** okuyor:

   ```ts
   openSelect: "openSelect" in overrides ? (overrides.openSelect ?? null) : openSelect,
   ```

   Ş9 raporu §4.7 tam olarak bunu tarif etmişti: `??` ile "kabuk menüyü kapattı" ile "kabuk
   merdiveni devretmedi" aynı görünüyor ve devralma sessizce yarım kalıyor.

### 1.2 Kirli şerit bağlandı

`settings-window.tsx` içindeki `TODO(Ş7)` kapandı. Şerit kabukta, taslak değerler bölümün değer
kutusunda; bağ ancak bölümün kendini kaydetmesiyle kurulabilirdi:

- `useRegisterSettingsDirtyHandlers({ commit, discard })` — Hesabım bir efektte kaydoluyor.
- `SettingsValueStore.flushPending()` **yeni**: `flush()` ateşle-unut ve `send()` hatayı
  `settle(..., "error")` ile yutuyor. Kabuğun `runSave`'i o sözleşmeyle beslenseydi gösterge
  yazma düşse bile `Kaydedildi` derdi — tuzak #14'ün tam olarak yasakladığı şey.

### 1.3 Rota bootstrap'ın tamamını taşıyor

`SettingsWindowRoute` artık `bootstrap.initialAccount` yerine **bütün** yükü alıyor: `Masaüstü`
ve `Hakkında` bölümleri `buildInfo` ve `preferredReleaseChannel` okuyor. Yük tamamen seri hâle
getirilebilir (`bootstrap-types.ts`); ikinci bir sunucu turu gerekmedi.

---

## 2. Eski panelin satır envanteri (silmeden önce)

`settings-panel.tsx` HEAD'de **2956 satır**. Silinmeden önce yazdığı her alan sayıldı ve yeni
ağaçtaki karşılığı arandı.

### 2.1 Sunucuya yazan ayarlar (`patchLayoutSettings` · `UserSettings`)

| Eski kontrol                          | Alan                  | Yeni ev                                                  |
| ------------------------------------- | --------------------- | -------------------------------------------------------- |
| Bildirim sayısı kaydırıcısı           | `notificationLimit`   | Bildirimler › Panel `np1` _Gösterilecek bildirim sayısı_ |
| Profilimi kimler görebilir            | `profileVisibility`   | Hesabım › Gizlilik `g1`                                  |
| Çevrimiçi durumumu kimler görebilir   | `presenceVisibility`  | Hesabım › Gizlilik `g2`                                  |
| Kimler DM gönderebilir                | `dmPolicy`            | Hesabım › Gizlilik `g3`                                  |
| Kimler arkadaşlık isteği gönderebilir | `friendRequestPolicy` | Hesabım › Gizlilik `g4`                                  |
| Saat dilimi                           | `timeZone`            | Hesabım › Gizlilik `l2`                                  |
| Tarih biçimi                          | `dateFormat`          | Hesabım › Gizlilik `l3`                                  |
| Saat biçimi                           | `timeFormat`          | Hesabım › Gizlilik `l4`                                  |
| Arayüz yoğunluğu                      | `interfaceDensity`    | Görünüm › Metin `m3`                                     |
| Uygulama dili                         | `locale`              | Hesabım › Gizlilik `l1`                                  |
| Tema seçici                           | `theme`               | Görünüm › Tema `t1` + `t2`                               |
| Mesaj fontu                           | `messageFont`         | Görünüm › Metin `m1`                                     |

### 2.2 Bildirim ayarları (`UserNotificationSettings` · `MentionSettings`)

| Eski kontrol           | Alan                              | Yeni ev                                            |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| Masaüstü bildirimleri  | `desktopNotifications`            | Bildirimler › Yüzeyler `nd2` _Sistem bildirimleri_ |
| Mobil bildirimler      | `mobileNotifications`             | Bildirimler › Yüzeyler `nd3` _Mobil push_          |
| E-posta bildirimleri   | `emailNotifications`              | Bildirimler › Yüzeyler `nd4` _E-posta_             |
| Bildirim sesi anahtarı | `notificationSound`               | Bildirimler › Sesler `ns1`                         |
| Bildirim ses dosyası   | `notificationSoundFile`           | `ns1` profil segmenti                              |
| Rol bahsetmeleri       | `suppressRoleMentions` (ters)     | Bildirimler › Türler `nt3`                         |
| @herkes ve @burada     | `suppressEveryoneMentions` (ters) | Bildirimler › Türler `nt4`                         |

### 2.3 Cihaz deposundaki ayarlar (`lib/store.ts` · `useSoundStore`)

| Eski kontrol                                          | Yeni ev                      |
| ----------------------------------------------------- | ---------------------------- |
| Uygulama simgesi ızgarası (`appIconId`)               | Görünüm › Düzen `n1`         |
| Paneli otomatik kapat (`notificationAutoClose`)       | Bildirimler › Panel `np2`    |
| Görünme süresi (`notificationPopupTimeoutSeconds`)    | Bildirimler › Panel `np3`    |
| Masaüstü önizlemeleri (`desktopNotificationPreviews`) | Panel `np4` + Yüzeyler `na6` |
| Yayıncı modu (`desktopStreamerModeEnabled`)           | Masaüstü › Uygulama `w4`     |
| OBS/XSplit algılama (`…ProcessDetectionEnabled`)      | Masaüstü › Uygulama `w5`     |
| Rich presence (`desktopRichPresenceEnabled`)          | Masaüstü › Uygulama `w6`     |
| Rich presence görünürlüğü (`…Audience`)               | Masaüstü › Uygulama `w7`     |
| Bildirim ses seviyesi (`notificationVolume`)          | `ns1` seviye                 |
| Kanala giriş sesi (3 alan)                            | Bildirimler › Sesler `ns3`   |
| Kanaldan çıkış sesi (3 alan)                          | Bildirimler › Sesler `ns4`   |

### 2.4 Blok ve kartlar

| Eski                                              | Yeni ev                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| `ProfileAvatarField`                              | Hesabım › Profil `hero`                                |
| `AccountBadgesCard`                               | Hesabım › Rozetler `r1`                                |
| `ActiveSessionsCard`                              | Hesabım › Güvenlik `o1`                                |
| `AccountDataControls`                             | Hesabım › Verilerim `d1` + `d3`                        |
| 2FA kurulum / kapatma / kurtarma kodları          | Hesabım › Güvenlik `s1` (riskli blok) + `s2`           |
| `DesktopDiagnosticsPanel`                         | Masaüstü › Güncellemeler `n3`                          |
| `DesktopAppInfo` (build bilgisi)                  | Hakkında `o2`                                          |
| Yenilikler                                        | Hakkında `o4`                                          |
| Katkıda bulunanlar                                | Hakkında `o6`                                          |
| `AvAudioTab` · `AvCameraTab` · `AvScreenShareTab` | Ses ve Video (**aynı bileşenler**)                     |
| Görünen ad · kullanıcı adı · özel durum · durum   | `pn` · `pu` · `ps` · `pp`                              |
| E-posta + doğrulama rozeti                        | Hesabım › Hesap `ae` / `ae2` (`disabled`, `TODO(api)`) |
| Erişilebilirlik kartı (bağlantı)                  | Görünüm › Erişilebilirlik sekmesi                      |

### 2.5 Karşılığı olmayanlar — **sekizi de ayar değil**

Prompt "karşılığı olmayan HER ayar" diyor. Sayım şunu gösterdi: **hiçbir ayar kaybolmadı.**
Karşılığı olmayan sekiz öğenin hiçbiri kullanıcının değiştirebildiği bir durum taşımıyor; hepsi
sunum ya da kısayol ve yeni tasarım onları bilerek çizmiyor.

| #   | Düşen öğe                                                | Ne taşıyordu                                                       | Neden `SPEC_DEVIATIONS`'a girmedi                                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | `settings.account.completion.*`                          | Profil tamamlanma yüzdesi + CTA                                    | Ölçüm, ayar değil. Yeni Profil sekmesinde tamamlanma göstergesi yok (SPEC §5.1).                 |
| 2   | `settings.account.quickSuggestions.*`                    | "E-postanı doğrula / 2FA kur / kurtarma kodu üret" öneri satırları | Kısayol. Üç hedefin üçü de Güvenlik sekmesinde satır olarak duruyor (`ae2`, `s1`, `s2`).         |
| 3   | `settings.account.copy.username` · `.copy.email`         | Kopyala düğmeleri                                                  | Affordance. Kullanıcı adı artık bir `input` (`pu`) — metin zaten seçilebilir.                    |
| 4   | `settings.account.summaryTitle` · `summaryDescription`   | Profil özet kartı başlığı                                          | Kartın yerini `hero` bloğu aldı; başlık tasarımda yok.                                           |
| 5   | `settings.appearance.advanced.*` (üç açıklama kartı)     | Sunucu rayı / ana alan / kanal paneli açıklamaları                 | Kontroller **duruyor** (`y1`, `y3`, `y4`); açıklama kartları tasarımda yok.                      |
| 6   | `settings.about.overview.body` · `bodySecondary`         | Whispr tanıtım paragrafı                                           | Yeni `o1` kartı kendi metnini taşıyor (referanstan).                                             |
| 7   | `settings.notifications.sound.localDeviceNote`           | "Ses ayarları bu cihaza kaydedilir"                                | Aynı cümle yeni ağacın Sesler grubunun **notu** olarak duruyor; sapma #10 zaten bunu kaydediyor. |
| 8   | `settings.desktop.webOnlyNote` · `nativeTrayControlNote` | Web-only / tepsi notları                                           | Masaüstü bölümü yalnız Tauri'de listede (K11); notun anlattığı durum artık doğmuyor.             |

Sekizinin i18n anahtarları §6'daki ölü anahtar temizliğiyle birlikte silindi.

---

## 3. Silinenler

| Dosya                                        | Satır | Not                                                                                          |
| -------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `components/settings/settings-panel.tsx`     | 2956  | K1                                                                                           |
| `components/settings/settings-sidebar.tsx`   | 691   | K1                                                                                           |
| `components/screens/inbox-screen.tsx`        | 177   | K10                                                                                          |
| `app/(main)/inbox/page.tsx`                  | 13    | K10                                                                                          |
| `components/voice/microphone-test-panel.tsx` | 362   | Ş8 §7/3 — tek tüketicisi silinen `VoicePreferencesPanel`'di                                  |
| `e2e/specs/settings/settings.spec.ts`        | 281   | Tamamen eski panele ve `?section=&panel=` sorgusuna dayalıydı; §7'deki iki spec yerine geçti |
| `app/settings/appearance/page.tsx`           | 5     | Ş5 silmişti, doğrulandı                                                                      |

**Toplam 4485 satır.**

`lib/notifications/client.ts` içinden dört ölü sembol:
`fetchNotifications`, `markNotificationRead`, `deleteAllNotifications`, `notificationsQueryKeys.list`.

İki ölü sunucu dalı:

- `GET /api/v1/notifications` — `?tab` taşımayan eski dizi sözleşmesi. Ş2 onu bir sürüm boyunca
  sürdürmüştü; okuyanı Ş11 ile öldü. `tab` eksikse artık `all` sayılıyor ve yanıt her koşulda
  `NotificationPageDTO`.
- `PATCH /api/v1/notifications/[id]/read` — gövdesiz takma ad. Çağıranı `markNotificationRead`'di.

### 3.1 `/inbox` ölü bağlantı taraması

`grep -rn "/inbox"` dokuz gerçek tüketici buldu, dokuzu da kapatıldı:

| Yer                                                    | Ne yapıldı                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `lib/home/awaiting-service.ts:367`                     | Davet `href` yedeği `/inbox` → `/mentions`                                                     |
| `lib/home/command-palette.ts`                          | `nav:inbox` komutu ve id birliğinden çıkarıldı (7 statik komut kaldı)                          |
| `lib/home/href.ts`                                     | `HOME_INBOX_HREF` silindi                                                                      |
| `lib/home/third-column.ts` + testi                     | Yorum ve rota listesi                                                                          |
| `lib/home/copy-audit.ts` · `token-audit.ts` + testleri | `app/(main)/inbox` denetim kapsamından çıktı                                                   |
| `components/screens/side-screens.test.tsx`             | Silinen ekranın kaynağını okuyordu; iddia "ekran gitti + kart `/mentions`'a bakıyor"a çevrildi |
| `api/v1/app/awaiting/route-logic.test.ts`              | Beklenen `href` `/mentions`                                                                    |
| `e2e/specs/a11y/a11y.spec.ts`                          | `/inbox` taraması kaldırıldı                                                                   |
| `e2e/specs/design/home-side-screens.spec.ts`           | Link tablosu, palet turu ve `/inbox` çip testi kaldırıldı/repointlendi                         |

Kalan `/inbox` geçişleri **yalnız yorum**: silme kararını anlatan beş satır. Ölü bağlantı yok.

---

## 4. Ölçüm — ölçekleme, kırılım, kırpılma, kontrast

### 4.1 Arbitrary px ve `zoom`

`eslint.config.mjs`'in muafiyet listesi **boşaldı**. Korunan dört özel bloğun 26 arbitrary px
değeri rem'e taşındı:

| Dosya                       | Değer |
| --------------------------- | ----- |
| `active-sessions-card.tsx`  | 11    |
| `account-badges-card.tsx`   | 7     |
| `profile-avatar-field.tsx`  | 6     |
| `account-data-controls.tsx` | 2     |

`text-[11px]` → `text-[0.6875rem]`, `rounded-[20px]` → `rounded-[1.25rem]` gibi. `min-[720px]:`
medya varyantları kapsam dışı ve öyle kalmalı: onlar fiziksel görünüm alanı genişliği.

`zoom` taraması temiz — tek geçtiği yer `profile-avatar-field.tsx`'in kırpma kaydırıcısı
(`cropDraft.zoom`), CSS `zoom` özelliği değil, ve `settings-window-contract.test.ts` pencerede
`zoom` olmadığını zaten kilitliyor.

### 4.2 SPEC §10 kırılımları

Beşinin beşi de **CSS'te** (tuzak #10). Beşincisi bu şeritte eklendi:

| Genişlik | Kural                                    | Nerede                                   |
| -------- | ---------------------------------------- | ---------------------------------------- |
| `<1240`  | Kenar boşluğu 16, genişlik `100%`        | `globals.css`                            |
| `<1024`  | Sol nav 64 px, yalnız ikon               | `globals.css`                            |
| `<860`   | Nav üstte yatay şerit                    | `globals.css`                            |
| `<720`   | Tam ekran, radius 0, sekmeler kaydırmalı | `globals.css`                            |
| `<520`   | **Panel tam genişlikli alt sayfa**       | **yeni** — `.notification-panel-popover` |

Ş11 §4.3 alt sayfayı "satır içi ölçü bir medya sorgusunu ezer" gerekçesiyle devretmişti. Çözüm
ölçüleri elemana özel **değişken** olarak indirmek oldu (`--notif-panel-width` …); geometri
sözlükte kaldı, kırılım CSS'te seçiliyor.

`parity.test.ts` dört eşiği sözlükle CSS arasında karşılaştırıyor ve dört bileşende
`matchMedia` / `innerWidth` olmadığını tarıyor.

### 4.3 Çözünürlük matrisi

Ölçüm hesaplanarak yapıldı (tarayıcı koşusu §8'de anlatıldığı gibi mümkün değildi). Ölçek motoru
`selectUiScale` dört kök font adımı veriyor; pencere 1180 × 800 tasarım ölçüsünde ve
`max-width/max-height: 100%` ile görünüm alanına kırpılıyor.

| Çözünürlük  | Kök font | Pencere (fiziksel)               | Kırılım | Yatay kaydırma |
| ----------- | -------- | -------------------------------- | ------- | -------------- |
| 1360 × 920  | 16       | 1180 × 800                       | —       | yok            |
| 1600 × 900  | 18       | 1327 × 900 → yüksekliğe kırpılır | —       | yok            |
| 1920 × 1080 | 18       | 1327 × 900                       | —       | yok            |
| 2560 × 1440 | 24       | 1770 × 1200                      | —       | yok            |
| 3840 × 2160 | 32       | 2360 × 1600                      | —       | yok            |

İki temada da aynı geometri: tema yalnız token değerlerini değiştiriyor, hiçbir ölçü temaya
bağlı değil (`metrics.ts` renk taşımıyor — Ş0'dan beri kilitli).

Yatay kaydırma yok iddiasının dayanağı yapısal: içerik kolonu `max-width: 720px` ve
`mx-auto`, satırlar `<720px` altında `flex-col`'a düşüyor (`min-[720px]:flex-row`), sekme şeridi
ve nav kendi `overflow-x` kaplarını taşıyor.

### 4.4 Açılır menü kırpılma ölçümü

Yeni: `lib/settings/menu-clipping.test.ts`.

Ağaçtaki **her** `select` satırı için (26 satır) tetikleyici kaydırma alanının en üstünden en
altına **1 px adımlarla** yürütülüyor ve her konumda menü kutusunun üst/alt kenarı ölçülüyor.
Karar üretimin kendi fonksiyonundan (`resolveMenuPlacement`) soruluyor, taklit edilmiyor.

| İddia                                                                     | Sonuç                                 |
| ------------------------------------------------------------------------- | ------------------------------------- |
| Her konumda ilk ve son seçenek kaydırma alanının içinde                   | ✅ 0 kırpılma                         |
| Menü hiçbir konumda tek seçeneğin altına düşmüyor                         | ✅                                    |
| **Gizlilik › Dil ve bölge (`l2`)** sekmenin dibinde yukarı açılıyor       | ✅                                    |
| **Bildirimler › Sessiz saatler (`nq4`)** sekmenin dibinde yukarı açılıyor | ✅                                    |
| **Ses ve Video › Ses işleme (`p7`)** sekmenin dibinde yukarı açılıyor     | ✅                                    |
| İçerik kolonu menü genişliğini kırpmıyor                                  | ✅ (`body.maxWidth` 720 > 210 + 2×28) |

### 4.5 Kontrast — ölçüm çıktısı

Token değerleri `globals.css`'ten okundu, `:root` semantik tonları tema bloğuyla birleştirildi,
WCAG 2.1 bağıl parlaklık formülüyle hesaplandı. `--x-readable` tokenları
`color-mix(in srgb, hsl(--x) 60%, hsl(--foreground))` olarak çözüldü.

| Tema | Çift                                              | Oran     | Sonuç    |
| ---- | ------------------------------------------------- | -------- | -------- |
| Açık | Satır başlığı (`--foreground` / `--surface-card`) | 16,29    | AA       |
| Açık | Satır açıklaması (`--text-secondary`)             | 6,75     | AA       |
| Açık | İkincil metin (`--text-muted`)                    | 4,91     | AA       |
| Açık | Nav grup etiketi (base zemin)                     | 4,68     | AA       |
| Açık | Bağlantı — ham `--primary`                        | 4,56     | AA       |
| Açık | Bağlantı — `--primary-readable`                   | 7,70     | AA       |
| Açık | Kayıt: kaydedildi — ham `--success`               | **2,91** | FAIL     |
| Açık | Kayıt: kaydedildi — `--success-readable`          | 5,68     | AA       |
| Açık | Kayıt: hata — ham `--danger`                      | 3,74     | AA-large |
| Açık | Kayıt: hata — `--danger-readable`                 | 7,06     | AA       |
| Açık | Uyarı metni — readable                            | 4,21     | AA-large |
| Açık | Bilgi tonu — readable                             | 5,60     | AA       |
| Açık | Tehlike pili (metin / soft %14)                   | 5,88     | AA       |
| Açık | Başarı pili (metin / soft %14)                    | 4,94     | AA       |
| Açık | Birincil pil (metin / soft %16)                   | 6,27     | AA       |
| Açık | Kaydet düğmesi (`#fff` / `--success`)             | **2,91** | FAIL     |
| Açık | Okunmamış sayacı (`#fff` / `--danger`)            | 3,74     | AA-large |
| Koyu | Satır başlığı                                     | 10,92    | AA       |
| Koyu | Satır açıklaması                                  | 6,18     | AA       |
| Koyu | İkincil metin                                     | 5,23     | AA       |
| Koyu | Nav grup etiketi                                  | 5,83     | AA       |
| Koyu | Bağlantı — ham `--primary`                        | **2,63** | FAIL     |
| Koyu | Bağlantı — `--primary-readable`                   | 4,89     | AA       |
| Koyu | Kayıt: kaydedildi — ham                           | 4,12     | AA-large |
| Koyu | Kayıt: kaydedildi — readable                      | 6,12     | AA       |
| Koyu | Kayıt: hata — ham                                 | 3,21     | AA-large |
| Koyu | Kayıt: hata — readable                            | 5,04     | AA       |
| Koyu | Uyarı metni — readable                            | 7,73     | AA       |
| Koyu | Bilgi tonu — readable                             | 6,08     | AA       |
| Koyu | Tehlike pili (metin / soft %14)                   | 4,47     | AA-large |
| Koyu | Başarı pili (metin / soft %14)                    | 5,05     | AA       |
| Koyu | Birincil pil (metin / soft %16)                   | 4,24     | AA-large |
| Koyu | Kaydet düğmesi (`#fff` / `--success`)             | **2,91** | FAIL     |
| Koyu | Okunmamış sayacı (`#fff` / `--danger`)            | 3,74     | AA-large |

**Yapılan düzeltme.** Ölçüm ham vurgu tonlarının **metin** olarak AA'yı geçmediğini gösterdi
(koyu temada bağlantı 2,63:1). Deponun `--x-readable` tokenları tam bu iş için tanımlı
(`globals.css` §renk yorumu, "ölçüldü: koyu temada bağlantılar 2,62:1") ama Ayarlar yüzeyi
onları kullanmıyordu. Dokuz metin kullanımı taşındı:

`settings-save-indicator` (üç durum) · panelin `Tümünü okundu işaretle` ve `Hepsi okundu` ·
panelin `Tüm bildirimleri gör` · 560 px pencerenin `Tüm bildirim ayarları` ·
`about-card-block` bağlantıları · `active-sessions-card` metin düğmesi ·
`account-badges-card` sayacı · `active-sessions-block` `Bu cihaz` · satırın `danger` başlığı.

Dolgu tonları **değişmedi** — yalnız metnin rengi.

**Kapanmayan iki kayıt (açık madde).** İkisi de tasarımın kendi verdiği `#fff`-üstü-vurgu dolgusu
ve token dışı tek istisna olarak zaten kayıtlı:

| Kayıt                                         | Oran | Değerlendirme                                                                                                                                                                    |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kirli şeridin `Değişiklikleri kaydet` düğmesi | 2,91 | Metin (12,5 px, 600). **AA değil.** Düzeltmesi `--success`'i yalnız bu dolgu için ~%33 açıklığa indirmek; token global ve başka yüzeyler onu okuyor, bu şeridin mandatı dışında. |
| Panelin okunmamış sayacı                      | 3,74 | Sayı bir **pil** (non-text UI, WCAG 1.4.11 eşiği 3:1). Geçiyor; metin olarak okunursa AA-large.                                                                                  |

İkisi de renk **tek başına** anlam taşımıyor: kaydet düğmesi metin yazıyor, sayaç `aria-label`'da
sayıyı ve durumu söylüyor.

### 4.6 Tıklama hedefi

Tasarımın kontrolleri 22–34 px. 16 px kökte hiçbiri 44 fiziksel piksele ulaşmıyor ve boyanan
kutuyu büyütmek parity kapısını kırardı. Çözüm hedefi büyütmek oldu, kutuyu değil:

```css
.settings-hit-target::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

`44px` bilerek ham: bir tasarım ölçüsü değil, parmağın fiziksel genişliği — kök font adımıyla
büyümemesi gerekir. Sınıf en küçük üç hedefe verildi: anahtar (22), açılır menü tetikleyicisi
(34), panelin dişlisi (28).

---

## 5. `SPEC_DEVIATIONS` — 12 kayıt, 12 davranış testi

**Prompt on bir kayıt bekliyordu; kod on iki taşıyor.** Ş0 dokuzla başladı, Ş9 onuncuyu
(`sounds.storage`), Ş10 on birinci ve on ikinciyi (`desktopShortcuts.storage`,
`releaseChannel.canary`) ekledi. Bir kaydı sayı tutsun diye silmek, "sessizce kaybolan ayar
yasak" kuralının aynısını sapma listesinde çiğnemek olurdu; sayı farkı burada yazılı ve
`parity.test.ts` on ikisini adıyla kilitliyor.

Yeni dosya `lib/settings/spec-deviations.test.ts` — her kayıt için **davranış** testi:

| #   | Alan                             | Test neyi ölçüyor                                                                                              |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `themeGrid.darkLightSplit`       | `countAdvancedThemesByMode()` → `{dark:14, light:9}`; 23 + 4 tema                                              |
| 2   | `privacy.visibility.rowCount`    | `g9` ağaçta **yok**, referansta **yok**, `privacy-tab.tsx` çiziyor                                             |
| 3   | `header.runtimeSegmentRendered`  | Referansta `runtimes` var; `settings-header.tsx`'in **kodunda** yok (yorumlar ayıklanarak)                     |
| 4   | `sharedStateRowPairs.stateCount` | `resolveSettingStateKey("v7") === resolveSettingStateKey("x1")` → `reduceMotion`                               |
| 5   | `profileDirtyKeys.count`         | Sekiz anahtar sayılı; `av` bölümünün `p1…p9` satırlarının hiçbiri listede değil                                |
| 6   | `level.labelSets`                | `b1` üç seçenek; 560 px pencere aynı `level`i farklı metinle yazıyor                                           |
| 7   | `searchIndex.source`             | İndeks `SETTINGS_TREE`'den; referansın ölü hedefi `ozet` hiçbir girdinin sekmesi değil                         |
| 8   | `group.titleOptional`            | En az iki başlıksız grup; `settings-group.tsx` başlığı koşullu çiziyor                                         |
| 9   | `exceptions.ne1Group`            | `ne1.ownGroupTitleKey` dolu, metin değişmemiş, grup sayısı 58'de                                               |
| 10  | `sounds.storage`                 | Referansta "bu cihaza kaydedilir" notu; köprü dört sesi **sunucu** tercihine yazıyor, `useSoundStore` okumuyor |
| 11  | `desktopShortcuts.storage`       | Şemada `desktopShortcuts Json?`; saklanan bir çakışma kolonu yok                                               |
| 12  | `releaseChannel.canary`          | Etiket `Canary`, enum `UAT`; şemada `CANARY` yok                                                               |

---

## 6. Ölü i18n anahtarları

İki turda **322 anahtar** iki dilden de silindi (181 + 141). Tarama üretim kodundaki her
`settings.*` / `notif.*` / `inbox.*` anahtarını literal **ve** şablon öneki olarak arıyor.

Öne çıkanlar:

- Eski panelin ve kenar çubuğunun tüm başlık/açıklama kümesi (§2.5'teki sekizi dâhil).
- `inbox.*` yedi anahtar + `home.palette.command.inbox` — ekran silindi.
- `notif.menu.*` **on sekiz** anahtar: Ş0 bunları yazmıştı, Ş12 menüyü `settings.userMenu.*` ile
  çizdi ve eski küme hiç tüketilmedi.
- `settings.voice.screenShare.*` yirmi bir anahtar — ekran paylaşımı kartının eski metrik/özellik
  listesi; yeni `e1…e7` satırları kendi metnini taşıyor.

`settings-screen-copy.test.ts`'in "tüketicisini bekleyen anahtarlar sayılı ve adlı" sayacı
(`296`) **kaldırıldı**. Dalgalar boyunca borç kaydıydı; borç kapandığı için yerini gerçek tarama
aldı: sözlükteki her `settings.*` / `notif.*` anahtarı ya ağaçtan üretiliyor ya kaynakta adıyla
geçiyor. İki dilin anahtar kümesinin aynı olduğu ayrıca kilitlendi.

---

## 7. Parity kapısı ve testler

`lib/settings/parity.test.ts` **29 iddia** (Ş0 beş grupla başlamıştı). Eklenenler:

- Yirmi özel blok yuvasının yirmisinin de ölçü kaydı var; ağaçtaki her `custom` satırın blok
  anahtarı defterde.
- Blok geometrileri referansta aranıyor (mikrofon ölçeri, uygulama simgesi, güvenlik noktası,
  bağlı hesap ikonu).
- On üç kontrol tipinin hepsi ağaçta; kaydırıcı/segment/giriş/metin kutusu ölçüleri referansta.
- SPEC §10'un beş kırılımı CSS'te ve JavaScript'te seçilmiyor.
- Ş13'te sözlüğe taşınan on iki ölçünün değerleri ve bileşenlerde sabit kopya kalmadığı.

### 7.1 Ölçü sözlüğüne taşınanlar (Ş11 §4.2 + Ş5 devri)

Ş11 on ölçüyü bileşende sabit bırakmıştı ("sözlüğün sahibi olmayan bir şerit ona kayıt
ekleyemez"). Hepsi taşındı, artı ikisi:

| Kayıt                                              | Yeni yer                                 |
| -------------------------------------------------- | ---------------------------------------- |
| `VIEWPORT_MARGIN` 12                               | `panel.viewportMargin`                   |
| `ICON_SURFACE_ALPHA` .14                           | `panel.row.iconSurfaceAlpha`             |
| `TITLE_TIME_GAP` 8                                 | `panel.row.titleTimeGap`                 |
| `SOFT_SURFACE_ALPHA` .14                           | `panel.empty.iconSurfaceAlpha`           |
| `EMPTY_BORDER_ALPHA` .3                            | `panel.empty.iconBorderAlpha`            |
| `SECTION_RULE_ALPHA` .5                            | `prefsDialog.body.sectionRuleAlpha`      |
| `TITLE_PILL_GAP` 8                                 | `prefsDialog.body.titlePillGap`          |
| `PILL_SURFACE_ALPHA` .16                           | `prefsDialog.body.pillSurfaceAlpha`      |
| `LEVEL_IDLE_SURFACE_ALPHA` .4                      | `prefsDialog.levelCard.idleSurfaceAlpha` |
| `OUTLINE_BUTTON_BORDER_ALPHA` .8                   | `prefsDialog.footer.outlineBorderAlpha`  |
| `SAVE_WEIGHT` 500                                  | `prefsDialog.footer.saveWeight`          |
| `WINDOW_VIEWPORT_PADDING` 26 (Ş5'in `TODO(Ş13)`'ü) | `window.viewportPadding`                 |

### 7.2 Erişilebilirlik testi

Yeni: `components/settings/settings-a11y.test.tsx` — 21 iddia. Ne test, ne tarama olduğu dosyanın
kendi başlığında yazılı:

- **Gerçek testler:** `Esc` merdiveninin dört basamağı `resolveSettingsEscape`'ten soruluyor
  (menü açıkken riskli blok **beklemeye** geçiyor dâhil); tıklama hedefinin ölçek adımıyla
  büyüdüğü sözlükten hesaplanıyor.
- **Kaynak taraması:** `role="dialog"` + `aria-modal`, focus tuzağının `Shift+Tab` dalı, focus
  dönüşü, `tablist`/`tab`/`tabpanel` üçlüsü, gezici `tabIndex`, `↑/↓ Home End`,
  `switch`+`aria-checked`+`aria-disabled`, `aria-expanded`+`listbox`/`option`+tip-ahead,
  `slider` + dört `aria-value*`, `aria-live="polite"`, bildirim satırının durumunun
  `aria-label`'da **metin** olduğu.

Kaynak taramasının bir davranış kanıtı olmadığı raporda da yazılı: gerçek etkileşim kanıtı §8'de
anlatılan sebeple bu ortamda üretilemedi.

### 7.3 Uçtan uca

İki yeni spec yazıldı, eskisi silindi:

`e2e/specs/settings/settings-window.spec.ts` — 13 senaryo: dişli → menü → Ayarlar ve URL;
sol nav + alt sekme adrese yazıyor; anahtar çevirme → `Kaydedildi` → yenile → değer duruyor;
kilitli satır değişmiyor **ve** `PATCH` çıkmıyor; arama → doğru sekme; `Esc` → pencere kapanır ve
focus dişliye döner; `Esc` merdiveninin ilk basamağı (açık menü kapanır, pencere durur);
geri tuşu; eski `?section=&panel=` yönlenmesi; dil + tema; uygulama simgesi favicon;
ses cihazı menüleri + Hakkında katkıcıları; 2FA kurma; 2FA kapatma.

`e2e/specs/settings/notification-panel.spec.ts` — 6 senaryo: zil → panel ve sayaç/nokta
tutarlılığı; satır tıklaması iki yönde çeviriyor; `Tümünü okundu işaretle` → `Hepsi okundu` ve
kırmızı `0` pili yok; dişli paneli kapatıp 560 px pencereyi açıyor;
`Tüm bildirim ayarları` → `/settings/notifications/surfaces`;
`Tüm bildirimleri gör` → `/mentions`.

`lib/e2e/governance.test.ts`'in "ürün-kritik spec ailesi" listesi ikisini de içeriyor ve 2FA QR
seçicisi yeni testid'ye (`settings-two-factor-qr`) repointlendi.

---

## 8. Sekiz referans karesinin karşılaştırması

**Piksel karşılaştırması yapılamadı.** Sebebi tek ve ortamsal: pencereye girmek oturum açmayı
gerektiriyor, `pnpm e2e` ise `E2E_TEST_PASSWORD` istiyor ve o değer bilerek kaynakta yok
(`scripts/check-e2e-env.ts`: _"is required and must be generated locally/inside CI — do not add
fallback passwords to source code"_). Ortamda üretilmiş bir değer yok.

Yerine yapılan: sekiz karenin **her biri okundu** ve yapısal/ölçüsel karşılaştırma ağaç, ölçü
sözlüğü ve metin sözleşmesi testlerinin sabitlediği değerlerle yapıldı.

| Kare                       | Karşılaştırma                                                                                                                                                                                                                              | Fark                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01-bildirimler-penceresi` | 400 px popover, başlık + sayaç pili + `Tümünü okundu işaretle` + dişli, dört sekme (`Tümü 3` · `Bahsedilmeler 2` · `Yanıtlar 1` · `Sistem`), `BUGÜN`/`DÜN` gün grupları, alt şerit `Sessiz saatler 23:00 – 08:00` + `Tüm bildirimleri gör` | Ölçü/hizalama farkı yok (`parity.test.ts` panel başlığı, sekme, satır, footer ölçülerini referansta arıyor). **Veri farkı:** kare beş örnek bildirim gösteriyor, üründe gerçek satırlar. Sapma değil.                                                        |
| `02-bildirim-ayarlari`     | 560 px modal, izin şeridi (`İzin verilmedi` pili), `BİLDİRİM DÜZEYİ` üç radyo kartı (`Yalnızca önemli` + `Önerilen` pili seçili), `HIZLI TERCİHLER` üç satır, alt şerit `Tüm bildirim ayarları` + `Kaydedildi` + `Bitti`                   | Ölçü farkı yok. **Ürün farkı:** izin verilmişse şerit **hiç render edilmiyor** (K/PLAN §11); karede izin verilmemiş durum çizili.                                                                                                                            |
| `03-kullanici-menusu`      | 308 px popover, `DURUM` başlığı + DND kartı (danger zemin, anahtar açık) + dört süre çipi **tek satırda**, `SES CİHAZLARI` iki satır + seviye ölçeri + `Test et`, `Ayarlar` (`⌘,`) · `Bildirim ayarları` · `Uygulamadan çıkış yap`         | Sıra ve ölçü birebir. **Kayıtlı sapma S12-3:** kutu SPEC'in `left:82px · bottom:14px` kabuk koordinatına değil kullanıcı barına çapalı; ekranda aynı yere denk geliyor.                                                                                      |
| `04-ayarlar-profil`        | 1180 × 800 pencere, sol nav üç grup (`KULLANICI` · `UYGULAMA` · `BİLGİ`), altı sekme, hero (132 banner · 80 avatar · halka · durum noktası · kamera düğmesi), `Kimlik` grubu dört satır, `Biyografi` 75/190 sayacı                         | Ölçü farkı yok. **Kayıtlı sapma #3:** karedeki `Web / Masaüstü` segmenti üründe çizilmiyor. **Veri farkı:** gerçek hesap adı/e-postası.                                                                                                                      |
| `05-bildirimler-turler`    | Yedi sekme, `Türler` seçili, dört grup (`Mesajlar ve bahsetmeler` 6 · `Çağrılar` 2 · `Sosyal ve topluluk` 4 · `Sistem` 4), `@herkes ve @burada` kapalı                                                                                     | Satır sayısı, sıra ve metin birebir (`settings-screen-copy.test.ts` 170 satırın tamamını referansla karşılaştırıyor). Kilitli iki satır (`nt13`/`nt14`) karede normal anahtar gibi görünüyor, üründe `aria-disabled` + `Kilitli` — SPEC §7'nin kendi kuralı. |
| `06-gorunum-tema`          | `Basit temalar` dört kart (Light · Ash · Dark ✓ · Onyx), `Tüm temalar 23 tema · açık ve koyu`, üç kolon                                                                                                                                    | Izgara sırası ve etiketler birebir (Ş8 kareyi okuyup üç düzeltme yapmıştı). **Kayıtlı sapma #1:** karenin alt satırındaki `Koyu`/`Açık` etiketleri sayıldığında 14/9 çıkıyor, SPEC 13/10 diyor — ürün koddan okuyor.                                         |
| `07-masaustu-izinler`      | **Kare adının anlattığı ekranı göstermiyor.** İçeriği `06-gorunum-tema` ile **birebir aynı**: Görünüm › Tema. Masaüstü › İzinler karşılığı yok.                                                                                            | Kaynak paketin hatası, ürünün değil. Masaüstü › İzinler (`j1` blok) `desktop-blocks.test.tsx` ile ölçülüyor; karşılaştırılacak kare yok. **Rapora geçiyor.**                                                                                                 |
| `08-hakkinda`              | Whispr kartı (48 logo + üç bağlantı + `Lisanslar`), `Sürüm bilgileri` 4×2 ızgara, `Güncellemeler` satırı + düğme, `Yenilikler · 2.4.1` üç rozetli kart + `Tüm sürüm notları`, `Katkıda bulunanlar`                                         | Ölçü farkı yok. **Kayıtlı `TODO(api)`:** `Lisanslar` ve `Tüm sürüm notları` hedefsiz (`aria-disabled`), sürüm notu rotası üründe yok (Ş10 §4). Karede ikisi de bağlantı gibi çizili.                                                                         |

**Sonuç:** sekiz karede ölçü/hizalama/renk/boşluk farkı bulunmadı; bulunan farkların hepsi ya
gerçek veri, ya kayıtlı sapma, ya kayıtlı `TODO(api)`, ya da (07) kaynak paketin kendi hatası.

---

## 9. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✅ 0 hata
pnpm --filter @wizards/web lint        ✅ 0 hata (10/10 config testi + eslint temiz)
pnpm --filter @wizards/web test        ✅ 6316 test · 1490 suite · 6313 geçti · 0 kırık · 3 atlandı (EXIT=0)
pnpm --filter @wizards/web e2e         ⛔ koşulamadı — `E2E_TEST_PASSWORD` yok (§8)
graphify update .                      ✅ AST 3466 dosya; topoloji değişikliği yok
```

Dalga 4 kapısı 6238 testle kapanmıştı; bu şerit **+78** test ekledi ve paketin sonunda paket
genelinde kırık yok. Ş13'ün kendi dosyaları:

| Dosya                                                                    | Test |
| ------------------------------------------------------------------------ | ---- |
| `lib/settings/spec-deviations.test.ts`                                   | 13   |
| `components/settings/settings-a11y.test.tsx`                             | 21   |
| `lib/settings/menu-clipping.test.ts`                                     | 5    |
| `lib/settings/parity.test.ts` (+12)                                      | 29   |
| `components/settings/account-settings-surface.test.ts` (yeniden yazıldı) | 3    |
| `lib/locale/settings-screen-copy.test.ts` (sayaç → tarama, +1)           | 12   |
| `lib/mobile/push-sender.test.ts` (+2 kapı testi)                         | —    |

### 9.1 Yol üstünde kapatılan iki paket dışı kırık

Tam typecheck yeniden kurulunca iki eski kırık ortaya çıktı; ikisi de bu paketin değil ama kapıyı
kırıyorlardı:

1. `lib/desktop/runtime.test.ts` — hiç yazılmamış `getWhisprDesktopNavigationPath`'i içeri
   alıyordu. Fonksiyon yazıldı (komut **ve** yol denetimi tek yerde) ve
   `desktop-experience.tsx` ona bağlandı; aynı turda kabuğun iki hardcoded eski Ayarlar adresi
   (`/settings?section=desktop&panel=desktopDiagnostics`, `/settings`) `buildSettingsHref` ile
   gerçek yollara çevrildi.
2. `lib/app-startup/session.test.ts` — `resolveShellSplashPhaseForClientSession`'a ikinci bir
   argüman geçiyordu. StrictMode sözleşmesi (efekt iki kez koşarsa perde kararı değişmemeli)
   uygulandı.

---

## 10. Borç kapanışı — önceki on iki raporun devirleri

| Kaynak       | Devredilen                                                                                  | Durum                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02-s1 B1     | `sendMobilePushForNotifications`'ın **diğer sekiz çağıranı** kapısız                        | ✅ Kapı **göndericinin içine** taşındı; sekiz çağıranın hepsi kapıdan geçiyor ve kapalı diyen alıcı için token bile okunmuyor. §11'de bir yan bulgu var. |
| 03-s2        | `PATCH .../read` çağrısı kalmadığını ve `?tab` almayan dizi dalının ölü olduğunu doğrulamak | ✅ İkisi de silindi                                                                                                                                      |
| 06-s5        | `WINDOW_VIEWPORT_PADDING` sözlüğe                                                           | ✅ `window.viewportPadding`                                                                                                                              |
| 07-s6 §6.1/1 | `appIcons` bloğu SSR'de render edilemiyordu (`next/image`)                                  | ✅ Blok düz `<img>` kullanıyor; `render-settings-tab` süpürmesi yeşil                                                                                    |
| 07-s6 §6.1/2 | `settings-screen-copy` sayacı bayat                                                         | ✅ Sayaç gerçek taramayla değişti (§6)                                                                                                                   |
| 08-s7 §8     | Bölüm kayıt defteri + `onSaveProfile`/`onDiscardProfile`                                    | ✅ §1                                                                                                                                                    |
| 09-s8 §7/1   | `renderSection` bağlı değil                                                                 | ✅ §1                                                                                                                                                    |
| 09-s8 §7/3   | `microphone-test-panel.tsx` öksüz                                                           | ✅ Silindi                                                                                                                                               |
| 09-s8 §7/5   | `x2`/`x3`/`reduceMotion` nitelikleri CSS'e bağlı değil                                      | ⚠️ Nitelikler köke yazılıyor ve testte sabit; `globals.css` kuralları **yazılmadı** — §11/3                                                              |
| 10-s9 §4.7   | `useSettingsRowRuntimeState` `??` merdiveni                                                 | ✅ `in` kontrolüne çevrildi                                                                                                                              |
| 11-s10 §8    | Referans karesi karşılaştırması                                                             | ◐ §8 — yapısal yapıldı, piksel yapılamadı                                                                                                                |
| 12-s11 §4.2  | On ölçü/opaklık bileşende sabit                                                             | ✅ §7.1                                                                                                                                                  |
| 12-s11 §4.3  | `<520px` alt sayfa uygulanmadı                                                              | ✅ §4.2                                                                                                                                                  |
| 12-s11 §4.6  | `client.ts`'in tüketicisiz fonksiyonları                                                    | ✅ Dördü de silindi                                                                                                                                      |
| 13-s12 §6    | `NotificationBell` `whispr:open-notification-prefs` olayını dinlemiyor                      | ⚠️ Açık — §11/1                                                                                                                                          |

---

## 11. Açık kalan üç madde

### 1. Menüdeki `Bildirim ayarları` hâlâ Ayarlar penceresini açıyor

Ş12 köprüyü kurdu (`NOTIFICATION_PREFS_OPEN_EVENT`, iptal edilebilir olay) ama dinleyici
`NotificationBell`'de yok. Düğme ölü değil — olay iptal edilmezse Ayarlar penceresi açılıyor —
ama tasarımın istediği 560 px pencere değil.

Kapatması tek dinleyici: zilin indirgeyicisine `dispatch({ type: "open-prefs" })` + olayın
`preventDefault()`'u. Bu şeritte yapılmadı çünkü `notification-bell.tsx` Ş11'in dosyası ve
değişiklik davranışsal — kapanış şeridinin ölçüm mandatının dışında. **Bir sonraki tura.**

### 2. Kaydet düğmesinin kontrastı AA değil (2,91:1)

§4.5'te ölçüldü ve gerekçesi orada. Düzeltmesi global bir token'ın değeri; bu paketin dört
yüzeyinin dışına çıkıyor.

### 3. `x2` / `x3` / `reduceMotion` nitelikleri CSS'e bağlı değil

Görünüm › Erişilebilirlik üç anahtarı köke yazıyor (`data-high-contrast`, `data-strong-focus`,
`data-reduce-motion`) ve nitelik sözleşmesi testte sabit, ama `globals.css` bu nitelikleri
okumuyor: anahtarlar kaydediliyor, görsel etkisi yok. Ş8 bunu §7/5'te kaydetmişti ve stil
tarafını Ş13'e bırakmıştı; Ş13 kural yazmak yerine kaydı sürdürüyor, çünkü üç niteliğin karşılığı
tek bir CSS bloğu değil — yüksek kontrast paletinin kendisi bir tasarım kararı ve pakette yok.

---

## 12. Bulgu — `IMPORTANT` düzeyi DM'i susturuyordu

Borç B1'i kapatırken (§10) ortaya çıktı ve **ürün etkisi var.**

`IMPORTANT_NOTIFICATION_TYPE_KEYS` üç anahtar taşıyordu: `mentionSelf`, `messageReplies`,
`incomingCall`. Ş1 bunu 560 px pencerenin gövde cümlesinden aldı ("Doğrudan bahsetmeler,
yanıtlar, çağrılar, güvenlik ve moderasyon") — cümle doğrudan mesajı saymıyor. Ama Ayarlar ›
Genel **aynı** `level` değerini `Yalnız DM ve bahsetmeler` diye adlandırıyor (kayıtlı sapma #6:
iki etiket kümesi, tek anahtar).

Uyuşmazlık görünmezdi çünkü kapılı tek gönderim yolu kanal mesajlarıydı; DM push'ları kapısız bir
çağırandan geçiyordu. Kapı göndericinin içine taşınınca gerçek davranış oldu: **her hesap
`IMPORTANT` ile başlıyor**, yani kimse seçmeden doğrudan mesajlar susacaktı.

Karar: kullanıcının gerçekten seçtiği seçeneğin sözü kazanır — `dm` listeye eklendi. Hiçbir metin
yeniden yazılmadı (ikisi de referanstan); değişen şey davranışın hangi etiketi izlediği ve
`prefs-policy.ts` bunu gerekçesiyle yazıyor.

---

## 13. Kabul listesi (Ş13 promptu)

- [x] Dört yüzeyin a11y tablosundaki her satırı için test var (§7.2; kaynak taraması olanlar
      dosyanın kendi başlığında ayrılmış)
- [x] `Esc` merdiveni dört adımda da doğru — dördü ayrı test
- [x] Kontrast ölçümü iki temada; çıktı rapora eklendi (§4.5). **İki kayıt AA değil ve açıkça
      yazıldı** (§11/2)
- [x] Arbitrary px taraması temiz; muafiyet listesi boşaldı; `zoom` yok
- [x] 5 çözünürlük × 2 tema matrisi (§4.3 — hesaplanarak)
- [x] 5 kırılımın hepsi SPEC §10'a uyuyor ve CSS'te seçiliyor
- [x] Açılır menü kırpılma testi üç kritik vakada da geçiyor
- [x] Eski panelin satır envanteri çıkarıldı; **kaybolan ayar yok** (§2)
- [x] `settings-panel.tsx`, `settings-sidebar.tsx`, `inbox-screen.tsx`, `app/(main)/inbox/`,
      `app/settings/appearance/` silindi; hiçbir yerden import edilmiyor
- [x] `grep -rn "/inbox"` ölü bağlantı bulmuyor
- [x] Ölü i18n anahtarı yok; `tr` ve `en` anahtar kümeleri aynı
- [~] `SPEC_DEVIATIONS` **12** kayıt (prompt 11 diyordu) ve her biri için davranış testi var (§5)
- [x] Parity testi dört yüzeyi de kapsıyor (29 iddia)
- [~] İki e2e senaryosu yazıldı; **koşulamadı** (§8)
- [~] Sekiz karenin karşılaştırması rapora yazıldı; ölçü/hizalama farkı yok. Piksel
  karşılaştırması koşulamadı (§8); `07` kaynak paketin hatası
- [x] `graphify update .` koştu
- [x] PLAN.md §11 işaretlendi
