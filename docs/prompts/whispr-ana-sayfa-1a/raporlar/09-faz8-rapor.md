# Faz 8 raporu — Parity kapısı, performans ölçümü ve paket kabulü

Tarih: 2026-08-20 · Branch: `uat` · Commit: yok (uncommitted)

Bu faz yeni özellik yazmadı. Ölçtü, kanıtladı, kapattı.

**Beş kusur bulundu ve düzeltildi:** bir güvenlik sızıntısı (görünmez kullanıcı canlı odada
listeleniyordu), bir a11y ihlali (ayarlar uyarısı AA'yı geçmiyordu), bir gerçek test gerilemesi
(Faz 7'nin yerel sabitlemesi `auth-regression`'ı kırmıştı) ve kapıyı rastgele kıran iki kırılgan
tasarım testi. **Üç madde ölçüldü, listeye yazıldı ve kararınızı bekliyor** (§8.1).

Aşağıdaki her sayı ölçüldü — tahmin yok. Ölçülemeyen tek kalem (`e2e:visual`) "ortam yok" diye
işaretlendi, sahte sonuç yazılmadı.

---

## 1. Yapıldı

- **Parity matrisi açıldı.** `home-parity.spec.ts` içindeki 11 `test.skip` kaldırıldı; 12
  kombinasyonun hepsi koşuyor ve yeşil.
- **Tema ekseninin yalanı kapatıldı** (Faz 4 §6.1). `applyParityTheme` yalnız `localStorage`
  yazıyordu; oturum açık kullanıcıda `ThemeSessionSync` hesabın kayıtlı temasını uygulayıp bunu
  eziyordu. Artık kaynak (`User.theme`) da ayarlanıyor **ve uygulanan tema ekranda doğrulanıyor** —
  eksen bir daha sessizce yalan söyleyemez.
- **44px tıklama hedefi çelişkisi sayıya döküldü** (Faz 4 §6.2). Kontrol artık her kombinasyonda
  koşuyor; tasarımın bilinçli küçük yüzeyleri **kapalı bir istisna listesinde**, listede olmayan
  yeni bir küçük hedef testi kırıyor. Ölçülen boyutlar §3.3'te.
- **Küçük kırılımlara tema ekseni eklendi** (§1.1): 1280 · 1100 · 900 · 720, iki tema → 8 koşu.
- **Güvenlik açığı bulundu ve kapatıldı.** Görünmez kullanıcı canlı oda katılımcısı olarak
  listeleniyordu (§4.1). `live-service.ts` artık redaksiyonun gizlediği katılımcıyı roster'dan ve
  sayımdan düşürüyor; roster'ın tamamı gizliyse oda hiç çizilmiyor.
- **Beş elle güvenlik testi otomatikleştirildi.** `e2e/specs/api/home-security.spec.ts` — iki gerçek
  hesapla (alice/bob) koşuyor, kullanıcı doğrulaması beklemiyor.
- **Üç kırık test onarıldı**: biri Faz 7'nin yerel sabitlemesinden doğan gerçek gerileme
  (`auth-regression`), ikisi kapının kendi kırılganlığı (`home-command-palette`, `home-side-screens`).
- **Bir a11y ihlali kapatıldı** (Faz 5 §6.3'ten devir): ayarlar ekranındaki "yüklemeler kapalı"
  uyarısı `text-amber-600` yerine `--warning-readable` token'ını kullanıyor.

---

## 2. Dokunulan dosyalar

| Dosya                                                       | Yeni / Değişti | Neden                                                                   |
| ----------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `apps/web/e2e/specs/design/home-parity.spec.ts`             | Değişti        | 12 kombinasyon açıldı, tema doğrulaması + tıklama hedefi ölçümü eklendi |
| `apps/web/e2e/specs/design/home-responsive.spec.ts`         | Değişti        | §1.1 kırılımlarına tema ekseni                                          |
| `apps/web/e2e/helpers/design-parity.ts`                     | Değişti        | `collectUndersizedTapTargets`, tema init betiği sertleştirildi          |
| `apps/web/e2e/helpers/db.ts`                                | Değişti        | `setE2EUserTheme`, görünmez presence ve `VoiceState` fikstürleri        |
| `apps/web/e2e/specs/api/home-security.spec.ts`              | **Yeni**       | §4'ün beş elle testi                                                    |
| `apps/web/e2e/specs/api/auth-regression.spec.ts`            | Değişti        | Yerel sabitlemesi sonrası dile bağımlı iddia gevşetildi                 |
| `apps/web/e2e/specs/design/home-command-palette.spec.ts`    | Değişti        | Rota geçişinde çift ağaç → `visibleTestId`                              |
| `apps/web/e2e/specs/design/home-side-screens.spec.ts`       | Değişti        | Palet süzmesi beklenmeden tıklanıyordu                                  |
| `apps/web/src/lib/home/live-service.ts`                     | Değişti        | **Güvenlik**: gizlenen katılımcı roster'dan ve sayımdan düşer           |
| `apps/web/src/lib/home/service.ts`                          | Değişti        | `readHomePresenceState` — presence + gizli küme tek okumada             |
| `apps/web/src/lib/home/home-test-doubles.ts`                | Değişti        | `fakePresenceStateReader`                                               |
| `apps/web/src/app/api/v1/voice/live/route-logic.ts`         | Değişti        | Yeni okuyucuya bağlandı                                                 |
| `apps/web/src/app/api/v1/voice/live/route-logic.test.ts`    | Değişti        | 2 yeni test (gizli katılımcı, tamamı gizli oda)                         |
| `apps/web/src/components/home/home-primitives.tsx`          | Değişti        | `HomeHeaderLink`'e ölçüm için `data-testid`                             |
| `apps/web/src/components/settings/profile-avatar-field.tsx` | Değişti        | Uyarı kutusu amber literalinden `--warning` token'ına                   |

---

## 3. Görsel parity — 6 × 2 matris (§1)

### 3.1 Matris sonucu

12 kombinasyonun **hepsi yeşil**. Her koşuda beş kontrol: yatay taşma yok · dikey taşma yok
(Arkadaşlar şeridi kabuk içinde bitiyor) · ellipsis'siz kırpılmış metin yok · kök font beklenen
değerde · uygulanan tema istenen tema.

| #   | Görünüm alanı | Beklenen adım | Kök font | `theme-light` | `theme-dark` |
| --- | ------------- | ------------- | -------- | ------------- | ------------ |
| 1   | 1360×920      | ×1            | 16px     | ✅            | ✅           |
| 2   | 1600×900      | ×1            | 16px     | ✅            | ✅           |
| 3   | 1920×1080     | ×1.15         | 18px     | ✅            | ✅           |
| 4   | 2560×1440     | ×1.5          | 24px     | ✅            | ✅           |
| 5   | 3840×2160     | ×2            | 32px     | ✅            | ✅           |
| 6   | 5120×1440     | ×1.5          | 24px     | ✅            | ✅           |

5120×1440'ta adım **yükseklikten** seçiliyor (1440/920 = 1.56 → ×1.5), dikey taşma yok — SPEC §8.1
kuralı ekranda doğrulandı.

### 3.1.1 Ek boyutlar (§1.1)

| Genişlik | Beklenen kolon | `theme-light` | `theme-dark` |
| -------- | -------------- | ------------- | ------------ |
| 1280     | 2              | ✅            | ✅           |
| 1100     | 2              | ✅            | ✅           |
| 900      | 1              | ✅            | ✅           |
| 720      | 1              | ✅            | ✅           |

Ayrıca 1440×960'ta dört kolon kalıyor ve iki eksende de kaydırma yok.

### 3.2 Referans karşılaştırması — sapma listesi

`design/1a-komuta-merkezi.html` ile üretim ekranı **aynı tarayıcıda, aynı 1360×920 görünüm
alanında, koyu temada** ölçüldü (göz kararı değil, `getBoundingClientRect` + `getComputedStyle`).

**Eşleşenler:** ray 74 · panel 272 · ızgara boşluğu 13 · ızgara dolgusu `8px 30px 18px` ·
kart yarıçapı 20 · kök font 16.

**Sapmalar (5 madde):**

| #   | Ölçü               | Referans                                      | Üretim                                        | Neden                                                                                                                               |
| --- | ------------------ | --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kabuk yüksekliği   | 918 (kabuk 920, 1px kenar)                    | 896                                           | `.app-shell` `padding:12px` — kabuk çerçevesi görünür kalsın diye                                                                   |
| 2   | Ana alan genişliği | 1012                                          | 990                                           | Aynı 12px iç boşluk (2×12 = 24; referansın kendi 1px kenarlarıyla net 22)                                                           |
| 3   | Izgara kolonları   | `226.95 226.95 226.97 232.11`                 | `222.75 ×4`                                   | #2'nin sonucu + üretimde dört kolon eşit `1fr`                                                                                      |
| 4   | Kart genişlikleri  | 466.9 / 472.1 / 466.9 / 227 / 232.1 / 952     | 458.5 / 458.5 / 458.5 / 222.8 / 222.8 / 930   | #2 ve #3'ün sonucu                                                                                                                  |
| 5   | Kart yükseklikleri | 301.9 / 301.9 / 370.1 / 370.1 / 370.1 / 103.4 | 223.8 / 223.8 / 321.5 / 321.5 / 321.5 / 203.8 | İçerik güdümlü: tohum veride satır sayısı farklı; Arkadaşlar şeridi **daha uzun** çünkü çevrimiçi arkadaş yok → boş durum çiziliyor |

1–4 tek bir kökten geliyor: uygulamanın **global kabuk çerçevesi** 12px iç boşluk veriyor,
referans ise kabuğu görünüm alanına yapıştırıyor. Bu bu paketin ekranı değil, uygulamanın
tamamının çerçevesi — **§8'de karar bekliyor**. 5 numara veri farkı, sapma değil.

### 3.3 Tıklama hedefleri — ölçülen (44px çelişkisi)

Faz 4 §6.2'nin çelişkisi artık sayıyla duruyor. Ölçülen değerler (CSS px):

| Yüzey                                 | ×1 (1360/1600)                          | ×1.15 (1920)                      | ×1.5 (2560/5120)             | ×2 (3840)                                  |
| ------------------------------------- | --------------------------------------- | --------------------------------- | ---------------------------- | ------------------------------------------ |
| `home-presence-chip-*` (4 çip)        | 91.4×27.5 / 121.4×27.5                  | 151.7×**30.9**                    | 202.6×**41.3**               | ≥44 ✅                                     |
| `home-presence-focus-toggle`          | 42×**23**                               | 47.3×**25.9**                     | 63×**34.5**                  | ≥44 ✅                                     |
| `home-header-link` (`Tümünü gör` vb.) | 50.3×**14** · 65.2×**12** · 71.5×**12** | 56.6×15.8 · 73.3×13.5 · 80.5×13.5 | 75.4×21 · 97.8×18 · 107.3×18 | 100.5×**28** · 130.4×**24** · 143.1×**24** |
| `home-command-search`                 | 280×**39.7**                            | ≥44 ✅                            | ≥44 ✅                       | ≥44 ✅                                     |
| `notification-bell-button`            | **40×40**                               | ≥44 ✅                            | ≥44 ✅                       | ≥44 ✅                                     |

- **×2 adımında tek kalan** `home-header-link` (24–28px yükseklik). Diğer her yüzey 3840'ta 44px'i
  geçiyor.
- `home-friend-card` listede yok: tohum veride çevrimiçi arkadaş olmadığı için kart çizilmiyor.
  Faz 4'ün ölçtüğü 42px değeri bu koşuda **doğrulanamadı**.
- Karar §8'de.

---

## 4. Fonksiyonel kabul (§2)

### 4.1 PROMPT "Ortak" kriterleri

- [x] Yeni hex araması temiz; token denetim testi yeşil (`token-audit.test.ts`, `pnpm test` içinde).
- [x] Tipografi token üzerinden; sabit font adı yok (`layout-fonts.test.ts` + token denetimi).
- [x] Tema anahtarı çalışıyor, hiçbir parça tek temaya sabitlenmiş değil — **27 temanın hepsinde**
      Ana Sayfa açıldı, **27 farklı gövde zemini** ölçüldü, taşma/kırpma **0**. (32 sayısı için §4.2.)
- [x] Dört çözünürlükte kaydırma yok, metin kırpılmıyor; 4K'da kök font 32px (×2), yani gövde
      metni fiziksel olarak taban çözünürlükteki kadar okunur.
- [x] 5120×1440'ta ölçek yükseklikten seçiliyor, dikey taşma yok.
- [x] Sunucu rayı ve kullanıcı barı tek bileşenden geliyor: `ServerRail` `wizards-shell` üzerinden
      her ekranda aynı; `UserProfileFooter` `channel-sidebar.tsx`'ten `app-nav-panel.tsx`'e
      **import ediliyor**, ikinci kopya yok.
- [x] Placeholder/lorem yok (`copy-audit.ts` testi).
- [x] Tip kontrolü, lint ve testler geçiyor; yeni bileşenlerin render testleri var.

### 4.2 Tema turu — 32 mi, 27 mi?

`00-ortak-baglam.md` §"32 tema sınıfı" diyor. Ölçülen:

- `globals.css` **32** `.theme-*` sınıfı tanımlıyor.
- `appearance.ts` `WIZARDS_THEMES` **27** tema yayınlıyor — seçicide görünen, `User.theme`'e
  yazılabilen küme bu.
- Aradaki **5** sınıf (`theme-dawn`, `theme-graphite`, `theme-midnight`, `theme-mist`,
  `theme-studio`) `LEGACY_THEME_ALIASES` üzerinden `theme-light`/`theme-dark`'a normalize ediliyor;
  `normalizeWizardsThemeId` onları asla köke yazmıyor. Yani **ürün üzerinden erişilemezler**.

Tur bu yüzden 27 tema üzerinde koşuldu: her biri için `User.theme` yazıldı, oturum yenilendi,
Ana Sayfa açıldı. Sonuç: 27/27 doğru sınıf uygulandı, 27 farklı zemin, **0 taşma, 0 kırpma**.

> Turda bulunan tuzak: `User.theme`'i yazmak **açık oturumu güncellemiyor** — tema JWT'de
> taşınıyor. İlk tur bu yüzden 27 kez `theme-dark` ölçtü ve yeniden koşuldu. Ürün akışında sorun
> yok (tema seçici server action + `session.update()` kullanıyor); bu yalnız ölçüm notudur.

### 4.3 Bu paketin ek kriterleri

- [x] **Ölü link yok.** Ana Sayfa'daki yedi hedefin hepsi gerçek bir ekrana varıyor (e2e).
- [x] **⌘K çalışıyor.** Açılış/kapanış, ok tuşları, süzme, komut çalıştırma, `Esc` sözleşmesi ve
      "hiçbir sonuç dış bağlantı değil" iddiası e2e'de yeşil.
- [x] **Odak modu gerçek zamanla doğrulandı** — §4.4.

### 4.4 Odak modu — gerçek zamanlı doğrulama

Ürün akışının yolladığı gövdeyle (`{focus:{enabled:true,minutes:5}}`), 5 dakikalık gerçek pencere:

| An                       | `User` satırı                                | `app/summary`                              |
| ------------------------ | -------------------------------------------- | ------------------------------------------ |
| Açılıştan önce           | `ONLINE` · restoreTo `-`                     | —                                          |
| Açılış                   | `DND` · restoreTo **`ONLINE`** · 5 dk        | `DND` / 5 dk kaldı                         |
| +20s … +120s             | `DND` (değişmiyor)                           | `DND` / 5 → 4 → 3                          |
| +5 dk 30 sn (süre doldu) | **`ONLINE`** · restoreTo `-` · expiresAt `-` | **`focus: null`** · **`presence: ONLINE`** |

Geri sayım gerçek zamanla azalıyor, DND canlı sokete rağmen kalıcı, `statusRestoreTo` **odaktan
önceki** durumu tutuyor ve süre dolunca pencere **kendiliğinden kapanıyor, presence eski değerine
dönüyor**. İki ayrı 5 dakikalık gerçek pencereyle koşuldu (biri tarayıcı açıkken, biri yalnız
oturum çerezleriyle); ikisi de aynı sonucu verdi. Odak süresi ürün akışında 25 dk sabit
(Faz 5 §6.8); ölçüm şemanın izin verdiği **en kısa** süreyle (5 dk) yapıldı, ürün kodu
değiştirilmedi.

> Sözleşme kenarı: `presence` ve `focus` **aynı** gövdede gönderilirse `statusRestoreTo` o isteğin
> kendi yazdığı durumu yakalıyor (ör. `DND`), yani "eski değer" kayboluyor. Ürün istemcisi bu iki
> alanı asla birlikte göndermiyor (`focus-machine.ts`), ama şema izin veriyor. → §6.
>
> Ölçüm notu: `/api/e2e/auth/session` her çağrıda `User.status`'ü `ONLINE` yazıyor ve açık bir odak
> penceresinin DND'sini eziyor. E2E'ye özel yol (`E2E_TEST_MODE` kapılı), ürün oturum açışı bunu
> yapmıyor — sonraki fazlar yanlış okumasın diye yazıldı.

---

## 5. Performans ölçümü (§3)

Hepsi üretim derlemesine (`node dist/server.js`, 3100) karşı, gerçek Chromium ile ölçüldü.

| Ölçüm                         | Ölçülen                                                                     | Bütçe                            | Durum                                              |
| ----------------------------- | --------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| Ana Sayfa açılışında istek    | **6 Ana Sayfa ucu** + 5 kabuk ucu = **11**, tepe eşzamanlılık **11**        | ≤ 6 paralel                      | Ana Sayfa'nın kendi bütçesi ✅; toplam ölçüm §6'da |
| `app/summary` p95             | **11,7 ms** (p50 10,7 · min 9,9 · maks 11,7 · n=20 ısıtılmış)               | < 120 ms                         | ✅                                                 |
| İlk anlamlı boya (FCP)        | **1012 ms**                                                                 | raporda sayı                     | ölçüldü                                            |
| LCP                           | **1012 ms**                                                                 | —                                | ölçüldü                                            |
| CLS (font yüklenmesi dahil)   | **0,065**                                                                   | < 0,1                            | ✅                                                 |
| Ölçek adımı değişmeden render | **0 DOM mutasyonu** (1400→1900 genişlik, yükseklik 920, kök font 16 sabit)  | yalnız adım değişince            | ✅                                                 |
| Ölçek adımı değişince render  | **8 mutasyon** (1920×1080, kök font 16 → 18)                                | —                                | ✅                                                 |
| 10 dk açık bırakma            | interval **2 → 2**, heap 79,5 MB → **23,9 MB**, 10 dakikada toplam 47 istek | sızıntı yok, interval birikmiyor | ✅                                                 |
| Sekmeyi 5 dk gizle            | gizliyken **5 istek**, dönüşte ilk 10 sn'de **0 istek**                     | yağmur yok                       | ✅                                                 |
| `/home` bundle                | **36 chunk**, **3 117 412 B** ham JS (ilk yükleme)                          | raporda sayı                     | ölçüldü                                            |
| Palet ayrı chunk mı           | ⌘K açılışında **1 yeni chunk**                                              | ayrı chunk                       | ✅                                                 |
| Takvim ayrı chunk mı          | `/events` içinde görünüm değişince **0 yeni chunk**                         | ayrı chunk                       | ⚠️ sonuçsuz (§8.4)                                 |

> `/home` rota boyutu `next build` çıktısından **okunamadı**: bu araç zincirinde (Turbopack)
> rota tablosu boyut kolonu basmıyor. Sayı bu yüzden gerçek tarayıcıda ölçüldü — `/home` ilk
> yüklemesinde inen `_next/static` JS dosyalarının sayısı ve toplam ham baytı.

### 5.1 Uç başına SQL sorgusu — `limit` 4 ve 7

Süreç içinde ölçüldü (`pg.Client.prototype.query` yamalandı, `BEGIN/COMMIT` elendi), yani sayılar
arka plan gürültüsü taşımıyor. Her uç önce iki kez ısıtıldı.

| Uç                         | `limit`=4                          | `limit`=7   | `limit`'ten bağımsız mı |
| -------------------------- | ---------------------------------- | ----------- | ----------------------- |
| `app/summary`              | **5**                              | (limit yok) | —                       |
| `app/recent`               | **7**                              | **7**       | ✅                      |
| `app/awaiting`             | **7**                              | **7**       | ✅                      |
| `voice/live`               | **4**                              | **4**       | ✅                      |
| `events/upcoming`          | **4**                              | **4**       | ✅                      |
| `events/calendar` (31 gün) | **2**                              | —           | —                       |
| `mentions`                 | **3**                              | **3**       | ✅                      |
| `search/command`           | q=`""` → **4** · q=`"gen"` → **6** | —           | —                       |

Okuma notu: bu sayılar **uçtan uca**, yani her satırın ilk iki sorgusu izin/görünürlük servisinin
(`ServerMember` + `authorizationRevision`) okumaları. Faz 3 §4.1'in "kendi sorgusu" sütunuyla
karşılaştırırken bu iki sorgu çıkarılmalı. Bütçenin asıl iddiası — **`limit` büyüyünce sorgu sayısı
artmıyor** — altı uçta da doğrulandı.

---

## 6. Güvenlik doğrulaması (§4)

### 6.1 Uç tablosu

`00-ortak-baglam.md` §5.1'in altı maddesi, on uç için:

| Uç                        | 401 | Yetki            | Redaksiyon                 | Rate limit                    | Zod              | Dar DTO |
| ------------------------- | --- | ---------------- | -------------------------- | ----------------------------- | ---------------- | ------- |
| `GET app/summary`         | ✅  | ✅ görünür kanal | ✅                         | `app:summary` 120/60s         | ✅ yanıt şeması  | ✅      |
| `GET app/recent`          | ✅  | ✅               | ✅                         | `app:recent` 120/60s          | ✅ sorgu + yanıt | ✅      |
| `GET app/awaiting`        | ✅  | ✅               | ✅                         | `app:awaiting` 120/60s        | ✅               | ✅      |
| `GET voice/live`          | ✅  | ✅               | ✅ **bu fazda düzeltildi** | `voice:live:list` 60/60s      | ✅               | ✅      |
| `GET events/upcoming`     | ✅  | ✅ üyelik        | ✅                         | `events:upcoming` 120/60s     | ✅               | ✅      |
| `GET events/calendar`     | ✅  | ✅ üyelik        | ✅                         | `events:calendar` 60/60s      | ✅               | ✅      |
| `GET events/list`         | ✅  | ✅ üyelik        | ✅                         | `events:list` 120/60s         | ✅               | ✅      |
| `GET mentions`            | ✅  | ✅ görünür kanal | ✅                         | `mentions:list` 120/60s       | ✅               | ✅      |
| `GET search/command`      | ✅  | ✅ görünür kanal | ✅                         | `search:command` 60/60s       | ✅               | ✅      |
| `PATCH users/me/presence` | ✅  | kendi satırı     | ✅                         | `user:presence:update` 30/60s | ✅ gövde + yanıt | ✅      |

Her uç `runHomeRoute` üzerinden geçiyor: `requireApiUserId()` → `enforceApiRateLimit` → zod.
Yanıtlar da zod şemasıyla `parse` ediliyor, yani "dar DTO" şemayla zorlanıyor, gözle değil.
`Notification.actionUrl` ve `metadata` `toRelativeAppHref` kapısından geçiyor (§6.2 madde 4).

### 6.2 Beş elle test — otomatikleştirildi, hepsi koşuldu

İki test hesabı zaten var (alice/bob/charlie tohum veride). Kullanıcı doğrulaması beklemeye gerek
kalmadı; beşi de `e2e/specs/api/home-security.spec.ts` içinde koşuyor.

| #   | Test                                                                                      | İlk sonuç                                              | Son sonuç                                                                                             |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | **Görünmez kullanıcı**: bob "Görünmez" + sesli odada; alice'in Ana Sayfası                | ❌ **bob canlı oda katılımcısı olarak listeleniyordu** | ✅ düzeltildi — roster'da yok, sayımda yok, arkadaş satırında `OFFLINE` ve oda `null`                 |
| 2   | **Yetkisiz kanal**: alice'in `VIEW_CHANNEL` alınmış özel kanaldaki mesaj + bahsedilme     | ✅                                                     | ✅ `app/recent`, `mentions`, `search/command` üçünde de kanal adı, kanal kimliği ve mesaj kimliği yok |
| 3   | **Sunucudan çıkarılma**: alice üyeyken oda + etkinlik görünüyor, atılınca kayboluyor      | ✅                                                     | ✅                                                                                                    |
| 4   | **Açık yönlendirme**: `actionUrl` = `https://evil…`, `//evil…`, `javascript:…`, `/\evil…` | ✅                                                     | ✅ hiçbir `href` dışarı çıkmıyor, ham `actionUrl` yanıtta hiç geçmiyor                                |
| 5   | **Rate limit**: `search/command`'a ardışık istek                                          | ✅                                                     | ✅ 429 dönüyor, gövde iç hata sızdırmıyor, istemci döngüye girmiyor                                   |

**1 numaralı bulgunun kökü:** `live-service.ts` presence'ı redakte ediyordu ama katılımcı
listesini süzmüyordu — görünmez kullanıcı "OFFLINE nokta" ile ama **adıyla** odada duruyordu ve
`participantCount`'a sayılıyordu. `friends/queries.ts` aynı kümeyi (`hiddenUserIds`) kullanarak
arkadaşın odasını zaten düşürüyordu; canlı oda kartı bu kuralı uygulamıyordu. Düzeltme:
`readHomePresenceState` presence ile birlikte gizli kümeyi de döndürüyor (ek Redis turu **yok**,
aynı iki okuma), `live-service` gizli katılımcıyı roster'dan ve sayımdan düşürüyor, roster'ın
tamamı gizliyse oda hiç çizilmiyor. İki birim testi bunu sabitliyor.

---

## 7. Kapı çıktıları (§5)

| Komut                                         | Sonuç                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm typecheck`                              | ✅ exit 0 — 5/5 paket                                                                   |
| `pnpm lint`                                   | ✅ exit 0 — 5/5 paket, 0 hata                                                           |
| `pnpm test`                                   | ✅ **3271 test / 734 suite, 0 fail** (Faz 7: 3269/734)                                  |
| `pnpm --filter @wizards/db test`              | ✅ **32 test / 5 suite, 0 fail**                                                        |
| `pnpm --filter @wizards/web e2e:smoke`        | ✅ **16 passed**                                                                        |
| `pnpm --filter @wizards/web e2e:api`          | ✅ **36 passed** (30 mevcut + 6 yeni güvenlik)                                          |
| `pnpm --filter @wizards/web e2e:a11y`         | ✅ **13 passed** (düzeltmeden önce 12 passed / 1 failed — §7.1)                         |
| `pnpm --filter @wizards/web e2e:visual`       | ⛔ **ortam yok** — §7.2                                                                 |
| `playwright test e2e/specs/design`            | ✅ **45 passed / 2 skipped / 0 failed** (Faz 7: 30 passed / 13 skipped)                 |
| `pnpm build`                                  | ✅ exit 0                                                                               |
| `node scripts/quality/count-arbitrary-px.mjs` | ✅ **1190 değer / 120 dosya** — Faz 0 tabanı 1208 → **−18** (negatif px, taban dışı: 2) |
| `graphify update .`                           | ✅ 27 844 düğüm · 65 830 kenar · 1213 topluluk                                          |

### 7.1 `e2e:a11y` — bir gerçek ihlal, kapatıldı

İlk koşuda tek test düştü:

```
[serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (.border-amber-400\/25)
```

Ayarlar ekranındaki "yüklemeler kapalı" uyarısı — Faz 5 §6.3'ün "ayarlar / a11y borcu" diye
devrettiği madde. `text-amber-600` koyu temada AA'yı geçmiyordu. Depoda bu iş için zaten bir
token vardı (`--warning` / `--warning-readable`, `home-up-next-card` ve `app-screen-top-bar`
kullanıyor); uyarı kutusu ona çekildi, yeni renk uydurulmadı. İkinci koşu **13/13 yeşil**.

### 7.2 `e2e:visual` — ortam yok, sahte sonuç yazılmadı

Dört görsel test de `A snapshot doesn't exist at …\visual.spec.ts-snapshots\<ad>-chromium-win32.png`
ile düştü. Depodaki baseline'lar **linux** koşucusu için üretilmiş; bu makinede (win32) karşılığı
yok. Bu bir gerileme değil, **platform baseline eksikliği**: Faz 1'den beri açık duran
"linux görsel baseline'ları bayat / CI" borcunun aynısı. Yerelde win32 baseline üretmek CI'nin
linux baseline'larıyla çakışacağı için **yapılmadı**.

Playwright eksik baseline'ı görünce dört `*-chromium-win32.png` dosyasını kendiliğinden yazdı;
bunlar **gözden geçirilmemiş** çıktı oldukları için silindi. `visual.spec.ts-snapshots/` altında
yalnız dört linux baseline duruyor.

Faz 7 global bir token değiştirdi (`--text-muted` açık temada 52% → 46%), yani linux
baseline'ları da **bayat**; ilk CI koşusunda dördü de yenilenmek zorunda. Bu Faz 8'in
kapatamayacağı bir madde: baseline'lar CI koşucusunda üretilmeli.

### 7.2.1 Kanıt dosyaları

`raporlar/kanit/` altına yazıldı:

| Yol                                                                 | İçerik                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `faz8-parity/home-<ad>-<en>x<boy>-<tema>.png`                       | 12 parity kombinasyonunun ekran görüntüsü              |
| `faz8-parity/home-responsive-<genişlik>-<tema>.png`                 | §1.1'in 8 kırılım koşusu                               |
| `faz8-olcum/<kombinasyon>.json`                                     | Kombinasyon başına ölçülen küçük tıklama hedefleri     |
| `faz8-olcum/perf-results.json`                                      | §5'in ham çıktısı (istek sayısı, boya, CLS, p95, soak) |
| `faz8-olcum/odak-suresi-dolumu.txt`                                 | §4.4'ün 5 dakikalık gerçek pencere kaydı               |
| `faz8-tema/theme-<ad>.png`                                          | 27 temanın Ana Sayfa görüntüsü                         |
| `faz8-tema/reference-1360x920.png` · `production-1360x920-dark.png` | §3.2'nin yan yana kaynağı                              |
| `faz8-tema/compare.json`                                            | §3.2'nin ölçüm vektörü                                 |

Toplam ~7 MB PNG. Commit'e girmesini istemezseniz `faz8-parity` ve `faz8-tema` klasörleri
silinebilir; rapordaki sayıların hepsi metinde yazılı.

### 7.2.2 Ortam geri verildi

Koşu bitince: 3100'deki üretim sunucusu kapatıldı · `apps/web/next-env.d.ts` `git checkout` ile
geri alındı (üretim derlemesi `.next/dev/types` yolunu `.next/types`e çeviriyor) · e2e bayrakları
olmadan `pnpm build` koşuldu · dev sunucusu **3000'de geri başlatıldı** ve doğrulandı
(`/api/v1/app/version` → 200). Geçici ölçüm betikleri (`tmp-faz8-*.mjs`) silindi; depoda kalmadı.

### 7.3 Kapının nasıl koşulduğu — dürüst not

Faz 4–7 ile aynı düzen: dev sunucusu (3000) durduruldu → e2e bayraklarıyla `pnpm build` →
`node dist/server.js` **3100**'de → `PLAYWRIGHT_SKIP_WEB_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3100`
ile playwright. `apps/web/.env` **değiştirilmedi**; `E2E_TEST_PASSWORD` yalnız koşunun ortam
değişkeniydi ve scratchpad'de tutuldu. E2E veritabanı `wizards_e2e`, migration durumu doğrulandı
(36 migration uygulanmış, yeni tablo/kolonlar yerinde).

Koşu sırasında üç şey yalan söyledi, üçü de bulundu:

1. **Tema ekseni** (§1) — 12 kombinasyonun 6'sı yanlış temayı ölçecekti.
2. **Tema turu** — `User.theme` yazmak açık oturumu güncellemiyor; ilk tur 27 kez aynı temayı ölçtü.
3. **Kombinasyon başına ölçüm dosyası** — Playwright kırılan testten sonra worker sürecini
   yeniliyor; modül seviyesindeki toplayıcı dizi sıfırlanıyordu. Ölçüm kombinasyon başına ayrı
   dosyaya yazılıyor.

---

## 8. Açık kalan / devreden

### 8.1 Bu fazın bulup **karar bekleyen** üç maddesi

1. **Kabuk 12px iç boşluğu ↔ referans** (§3.2 madde 1–4). Uygulamanın global çerçevesi
   (`.app-shell` `padding:12px`) kabuğu 1360×920'den 1336×896'ya indiriyor; referans kabuğu
   görünüm alanına yapıştırıyor. Sonuç: ana alan 1012 yerine 990, kartlar ~4–8px dar.
   Değiştirmek **bütün ekranları** etkiler (kanallar, DM, ayarlar). → **karar bekliyor**.
2. **44px tıklama hedefi ↔ tasarım** (§3.3). Ölçüler elde: ×1'de durum çipi 27,5 · toggle 23 ·
   başlık bağlantısı 12–14 · zil 40×40 · arama 39,7. ×2'de yalnız başlık bağlantısı (24–28) altta
   kalıyor. İki yol var: (a) tasarımın ölçülerini büyütmek, (b) SPEC §8.2.5'i "işaretçi hedefleri
   için 44px, metin bağlantıları için hariç" diye daraltmak. → **karar bekliyor**.
3. **Bildirim zili `/channels` yüzeyinde yok.** Ölçüldü: `/home`, `/mentions`, `/inbox`,
   `/events` → zil var; `/channels/@me` → **yok**. Faz 2 zili kullanıcı ayağından kaldırdı, Faz 4
   yerine Ana Sayfa üst çubuğunu koydu; mesajlaşma yüzeyinde bildirime erişim kalmadı. Bu yüzden
   `mobile-responsive.spec.ts` iki testi hâlâ `test.skip`, `attachments.spec.ts` üç satırı hâlâ
   yorumda ve `TODO(faz4)` işareti artık yanlış hedefi gösteriyor. → **Mesajlar paketi**, karar
   bekliyor.

### 8.2 Bu fazda kapanan devirler

- Parity matrisinin `test.skip`'i (Faz 0'dan beri açıktı) → **kapandı**.
- Tema ekseninin çalışmaması (Faz 4 §6.1) → **kapandı**.
- 44px kontrolünün hiç koşmaması (Faz 4 §6.2) → **ölçüldü ve kapıya bağlandı**; karar §8.1'de.
- Ayarlar ekranının uploadthing uyarısının AA'yı geçmemesi (Faz 5 §6.3) → **kapandı**.
- `TODO(api):` işaretleri → **0** (kaynak ağacında hiç yok).

### 8.3 Kapanmayan, başka pakete devreden

| Madde                                                                         | Kaynak                  | Devir                         |
| ----------------------------------------------------------------------------- | ----------------------- | ----------------------------- |
| Linux görsel baseline'ları / win32 karşılığı yok                              | Faz 1 §6.8              | **CI**                        |
| `Message.replyToId` indekssiz, yoğun hesapta plan doğrulanmadı                | Faz 3 §6.3              | **performans paketi**         |
| `events/upcoming.totalCount` sınırsız `count`                                 | Faz 3 §6.4              | **performans paketi**         |
| `app-nav-panel` sunucu satırındaki çevrimiçi sayısı (`TODO(sunucular)`)       | Faz 2 §6.1              | **Sunucular paketi**          |
| Rayın alt "katıl / içe aktar" butonu                                          | Faz 2 §6.5              | **Sunucular paketi**          |
| Sunucu daveti satırının gerçek aktörü                                         | Faz 3 §6.6              | **sunucular/bildirim paketi** |
| Arkadaşlar şeridi 100 arkadaşta doyuyor                                       | Faz 4 §6.4              | **arkadaşlar paketi**         |
| `kind: 'game'` ürüne çıkmıyor                                                 | Faz 4 §6.6              | **karar bekliyor**            |
| Oda açıklaması arkadaş sayısını değil toplam katılımcıyı sayıyor              | Faz 4 §6.8              | **karar bekliyor**            |
| Palet "son ziyaretler" sıralaması gerçek değil                                | Faz 5 §6.7              | **arama paketi**              |
| Odak süresi sabit 25 dk                                                       | Faz 5 §6.8              | **karar bekliyor**            |
| `awaiting.newCount` 24 saatlik yaklaşım                                       | Faz 3 §6.2 / Faz 6 §6.5 | **ayrı iş**                   |
| Takvim gün panelinde `Hatırlat` yok                                           | Faz 6 §6.4              | **karar bekliyor**            |
| Bahsedilmelerin ikinci sayfası e2e'de doğrulanmadı                            | Faz 6 §6.2              | **fikstür genişletmesi**      |
| `Mesajlar` çipinde eski DM bahsedilmeleri yok                                 | Faz 6 §6.3              | **kabul edilen sınır**        |
| Uygulamanın geri kalanı tek biçimli çoğul kullanıyor (40+ anahtar)            | Faz 7 §6.3              | **ayrı iş**                   |
| `--text-muted` açık temada `--surface-tertiary` üzerinde 3,93                 | Faz 7 §6.1              | **ayrı denetim**              |
| `e2e/setup/global-setup.ts` migration koşmuyor                                | Faz 6 §6.1              | **CI / araç borcu**           |
| `e2e/specs/design` yerelde yalnız üretim derlemesiyle koşuyor                 | Faz 4 §6.3              | **CI / araç borcu**           |
| Tohum veride çevrimiçi arkadaş yok → 2 test `skip`, arkadaş kartı ölçülemiyor | Faz 7 §6.6              | **fikstür genişletmesi**      |
| Canlı `kind: 'call'` odasına katılma uçtan uca denenmedi                      | Faz 5 §6.1–2            | **realtime paketi**           |
| `mention_created_at` backfill'inin UAT maliyeti ölçülmedi                     | Faz 3 §6.7              | **dağıtım öncesi**            |

### 8.3.1 Faz 1'in görsel taramasından devreden tek madde

Faz 1 §4'ün 48 kombinasyonluk regresyon taraması dokuz bulgu üretti; **sekizi Faz 1'de kapandı**
(kanal ayağı ×1.15 kırpması, DM filtre şeridi maskesi, durum butonunun 44px hedefi, beş vendor
fontunun Türkçe eksiği, üç kayıt maddesi). Başka pakete devreden **tek** madde:

- **Admin konsolunda ölçek motoru bilerek kapalı.** Ölçüldü: `useUiScale` admin ağacına takılınca
  ×2'de `aside` genişliği 250px'te kalıyor (px), iç boşluk 16 → 32px'e çıkıyor (rem) ve nav
  satırının kullanılabilir genişliği 225 → **201px'e daralıyor**. Yani ölçek admin'i büyütmüyor,
  daraltıyor. Doğru sıra: admin'in arbitrary px'i (yalnız `admin-primitives.tsx` 39 değer) rem'e
  göçtükten sonra ölçeği açmak. Karar `use-ui-scale.test.ts` içinde gerekçesiyle sabit.
  → **admin paketi**.

Ayrıca Faz 1 §6.1'in uyarısı bu fazda uygulandı: giriş/kayıt ekranının tipografisi Faz 1'de
**bilerek** değişti (`--font-sans` → Figtree), o yüzden "giriş ekranı değişmedi" varsayımı parity
kapısında kullanılmadı.

### 8.4 Bu fazda bulunan, küçük ama yazılı kalanlar

- **Ana Sayfa açılışında 11 istek.** Altısı Ana Sayfa'nın kendi kartları (`app/summary`,
  `app/recent`, `app/awaiting`, `voice/live`, `events/upcoming`, `friends`) — bütçe bu altısı için
  ve tutuyor. Kalan beşi kabuğun her oturumda açtığı uçlar (`app/version`, `dm`,
  `notifications/unread-count`, `servers`, `users/me/settings`). Bütçe metni "Ana Sayfa uç sayısı"
  diyor; kabuk uçlarını da sayarsanız 11. → **tanım netleştirmesi**, kod değişikliği önerilmiyor.
- **Takvim chunk ölçümü sonuçsuz.** `/events` rotası tam yüklendikten sonra görünüm değiştirince
  yeni chunk inmiyor; yani takvim chunk'ı ya rota ile birlikte ön yükleniyor ya da rotaya
  gömülü. `dynamic()` kaynakta var (`events-screen.tsx`), palet tarafında bölünme **kanıtlandı**
  (1 yeni chunk). → **ölçüm borcu**.
- **`presence` + `focus` aynı gövdede** gönderilirse `statusRestoreTo` yanlış hedefi yakalıyor
  (§4.4). Ürün istemcisi bunu yapmıyor; mobil/API istemcisi yapabilir. → **sözleşme notu**.

---

## 9. Mesajlar paketine devreden sözleşmeler

1. **Kabuk API'si.** `wizards-shell.tsx` ray + panel + ana alan üçlüsünü tek yerden çiziyor;
   `ServerRail` (74) ve `UserProfileFooter` paylaşımlı. Mesajlar ekranı bu kabuğa oturur, kendi
   rayını çizmez. `app-nav-panel.tsx` yalnız nav rotalarında görünür — Mesajlar 2. sütunu DM
   listesine döndürdüğünde Faz 2 §6.6'nın açık ucu kapanır.
2. **Ölçek motoru.** `lib/home/scale.ts` — adım tablosu (×1 / ×1.15 / ×1.5 / ×2), taban 1360×920,
   `fit = min(width/1360, height/920)`, adım **yükseklikten de** sınırlanır. Tek gözlenebilir
   çıktı kök font boyutu (16/18/24/32). `data-ui-scale="off"` kill-switch'i duruyor.
   Yeni ekran kendi eşiğini **yazmaz**, bu tablodan okur.
3. **Ölçü sözlüğü.** `lib/home/metrics.ts` — `HOME_METRICS` (ray 74, panel 272, ızgara boşluğu 13,
   kabuk yarıçapı 26, kart yarıçapı 20 …), `HOME_TYPE_SCALE`, `pxToRem` / `pxToEm` / `hairline`.
   Arbitrary px sayacı (`count-arbitrary-px.mjs`, taban 1208) ve eslint kuralı bu sözlüğü zorluyor:
   Ana Sayfa yüzeylerinde yeni `px` literali lint hatası.
4. **i18n düzeni.** `lib/locale/messages/{tr,en}.ts` tek kaynak; `shell.appNav.*` ve `home.*`
   ağaçları yerinde, çoğul mekanizması (`{count, plural, …}`) çalışıyor ama uygulamanın geri
   kalanı henüz tek biçimli çoğul kullanıyor. Mesajlar ekranı yeni anahtarlarını çoğul
   mekanizmasıyla yazmalı; `copy-audit.ts` placeholder/lorem'i kapıda tutuyor.

---

## 10. Kullanıcı doğrulama listesi (§6)

Bunları siz kendi makinenizde işaretleyeceksiniz. Sunucu: `pnpm --filter @wizards/web dev` → 3000.

1. `/` adresine git → Ana Sayfa açılıyor.
2. Açık ve koyu temada ekranı gez → renk sapması yok.
3. Pencereyi 1920 · 2560 · 3840 genişliğe getir → kompozisyon aynı, her şey birlikte büyüyor
   (kök font sırasıyla 18 · 24 · 32 px olmalı; DevTools'ta `html` elementinin `font-size`'ına bak).
4. Ultra geniş ekranda (5120×1440 varsa) dikey taşma yok, kök font 24px.
5. `Durumun` kartından `Meşgul` seç → ray/ayak/arkadaş görünümü anında güncelleniyor.
6. `Rahatsız etmeyin` aç → üst çubukta odak pill'i çıkıyor, çubuk ilerliyor.
7. Odak süresi dolunca durum eski hâline dönüyor (25 dk bekle; sabırsızsanız §4.4'teki 5 dk'lık
   ölçüm zaten koşuldu).
8. Canlı bir odaya `Katıl` → buton `Ayrıl` oluyor, kart kenarı yeşile dönüyor.
9. Bir arkadaşlık isteğini `Kabul et` → satır kayboluyor, sayaç düşüyor.
10. `Hatırlat` → `Hatırlatılacak` oluyor, sayfayı yenileyince öyle kalıyor.
11. `⌘K` / `Ctrl+K` → palet açılıyor, sunucu/kanal/kişi bulunuyor, komut çalışıyor.
12. Nav satırlarının hepsi gerçek ekrana gidiyor (Ana Sayfa · Mesajlar · Bahsedilmeler ·
    Etkinlikler · Keşfet).
13. `Takvim` butonu takvim görünümünü açıyor, ay ızgarasında ok tuşlarıyla geziliyor.
14. Pencereyi 900px'e daralt → tek kolon, drawer çalışıyor, `Esc` drawer'ı kapatıyor.
15. Klavyeyle tüm ekran geziliyor, `Esc` dört overlay'i de kapatıyor ve focus tetikleyiciye dönüyor.

Ek olarak §8.1'deki üç kararı okuyup cevaplamanız gerekiyor.

---

## 11. Sorulan / sorulacak kararlar

| Konu                                           | Durum                        | Cevap / gerekçe                                                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Görünmez kullanıcının canlı odadan düşürülmesi | **Karar verildi, uygulandı** | `00-ortak-baglam.md` §5.1.3 ve `09-faz8` §4.1 açıkça istiyor; `friends/queries.ts` aynı kuralı zaten uyguluyordu. Sayım da düşürüldü, çünkü sayı "orada biri var" demenin başka bir yolu.                  |
| `presence` + `focus` birleşik gövdesi          | **Karar bekliyor**           | Ürün istemcisi göndermiyor; şema izin veriyor. Kapatmak isterseniz ya şema ikisini ayırır ya `planPresenceUpdate` restore hedefini `row.status`'ten alır.                                                  |
| Kabuk 12px iç boşluğu                          | **Karar bekliyor**           | §8.1 madde 1. Değişiklik bütün ekranları etkiler, bu paketin yüzeyi değil.                                                                                                                                 |
| 44px tıklama hedefi                            | **Karar bekliyor**           | §8.1 madde 2. Ölçüler elde; ürün kararı.                                                                                                                                                                   |
| Bildirim zili `/channels` yüzeyinde yok        | **Karar bekliyor**           | §8.1 madde 3. Mesajlar paketinin üst çubuğu geldiğinde kapanır.                                                                                                                                            |
| Ayarlar uyarısının token'a çekilmesi           | **Karar verildi, uygulandı** | Kapıyı (`e2e:a11y`) kıran tek ihlaldi; `--warning-readable` zaten bu iş için var, yeni renk uydurulmadı.                                                                                                   |
| `auth-regression` testinin dile bağımlılığı    | **Karar verildi, uygulandı** | Faz 7 Playwright yerelini Türkçe'ye sabitledi; testin sözleşmesi "doğrulama bölgesi çıkıyor, e-posta sızmıyor", dil değil. İki dili de kabul ediyor.                                                       |
| İki tasarım testinin kırılganlığı              | **Karar verildi, uygulandı** | Rota geçişinde iki `home-command-center` bir an birlikte duruyor (deponun kendi `visibleTestId` kalıbı); palet süzmesi sunucuya gidiyor, eski ilk satıra tıklanıyordu. İkisi de kapıyı rastgele kırıyordu. |
