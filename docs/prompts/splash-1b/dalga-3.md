# Dalga 3 — Mobil yüzey, native açılış ve kapanış turu

Önce `00-ortak-baglam.md`, sonra Dalga 1 ve 2 raporlarını oku. Branch `uat`, commit yok.
Dalga sonunda: mobil açılış ekranı tasarımdaki hâliyle çizilir, dört durum mobilde de çalışır,
native açılış katmanı JS splash'e sıçramasız bağlanır ve SPEC §10'un altı kabul kriteri
üç yüzeyde tek tek doğrulanmış olur.

Ölçüler SPEC §6'dan; `ekranlar/03-mobil-390x844.png` karşılaştırma karesidir.

---

## Ş12 · Mobil splash ekranı

**Dosya:** yeni `apps/mobile/src/app/screens/splash/*`,
`apps/mobile/src/app/whispr-mobile-root.tsx`, `apps/mobile/src/design/mobile-font-gate.tsx`.

1. **Yer:** bugün ilk kareyi `MobileFontGate` yutuyor — fontlar gelene kadar `null` dönüyor
   (`MOBILE_FONT_GATE_DEADLINE_MS = 600`). Splash **font gate'in üstünde** yaşar:
   `WhisprMobileRoot` → `MobileSplashBoundary` → `MobileFontGate` → sağlayıcılar.
   Böylece splash, fontlar yüklenmeden de çizilebilir; hazır olduğunda aile
   Outfit/Figtree'ye geçer (Dalga 1 Ş6). Fallback yüzle çizilen splash **kırılmaz** —
   ölçüler font ailesine değil, sabit px değerlerine bağlıdır.
2. **Düzen (SPEC §6):** aurora tüm ekranda; cihaz köşesi doğal olarak gelir, `borderRadius:44`
   uygulanmaz (o referans kabuğunun çerçevesiydi).
   Ortada: 150px halka, `scale(1.75)` ile logo işareti, `Whispr` 34px (üst boşluk 16px),
   `Sesli sohbet ve topluluk` 13px `--text-muted` (üst boşluk 10px).
   Alt blok: `left/right:0; bottom:0; padding: 0 32px 42px`, dikey, ortalı, 14px aralık:
   1. üç nokta (6px) + `<adım>…` (`500 13px`, ikincil metin) 2) ipucu (ortalı, 11.5px)
   2. pill + sürüm satırı (yatay, 8px aralık).
      **Zorunlu sapma:** alt dolgu `max(42, güvenli alan alt kenarı)` olur — çentikli cihazda
      42px sabit kalırsa satır home indicator'ın altında kalır. Rapora yazılır.
3. **Çizim teknikleri** (mevcut bağımlılıklarla, yenisi eklenmez):
   - Aurora: `react-native-svg` `RadialGradient` ile iki elips
     (`32% 26% at 50% 34%` `--primary/.22`, `30% 24% at 62% 72%` `--success/.14`),
     `react-native-reanimated` ile `wdrift` karşılığı 16s döngü
     (`translate3d(3%,-2.5%) scale(1.06)` @50%).
   - Logo işareti: 52×52, köşe 13, `LinearGradient(145deg,#7c70ff,#5b62ff 46%,#2f6dff)` +
     üstünde radial highlight; 5 çubuk 3px genişlik, yükseklikler `17/25/34/24/18`,
     köşe 999, `rgba(255,255,255,.95)`, aralarında 3px.
     Animasyon 2.1s, gecikmeler `0/.13/.26/.39/.52s`, **merkezden** `scaleY(.5→1)` +
     `opacity(.68→1)`. Gölge `0 16px 34px rgba(67,96,255,.24)` — RN'de `shadowColor/Opacity/Radius`
     (+ Android `elevation`) ile en yakın karşılık; birebir eşleşmiyorsa rapora yazılır.
     Logo işareti **tasarımın tek yerinde hex kullanılan öğesidir** (SPEC §2 gradyanı sabit renk
     tanımlar, tokenlı değildir) — geri kalan her renk tema tokenından.
   - Nefes/ışıma: `wbreathe 3.6s` ve `wglow 3.6s` reanimated karşılıkları.
   - Üç nokta: `wdot 1.1s`, gecikme `0/.16/.32s`.
4. **Tema:** renkler `mobile-theme-compat`/`themes.ts` üzerinden okunur.
   **Dikkat:** mobilde `successSoft` **açık** tint, `successSoftDark` koyu ton — web'in tersi.
   Durum metni için tema kipine göre doğru varyant seçilir (açık temada koyu ton, koyu temada
   açık ton), isim benzerliğine güvenilmez. Seçim tek bir yardımcıda toplanır
   (`resolveMobileSplashStatusTone`) ki dört durumda tekrarlanmasın.
5. **Adım eşlemesi (K7):** `connecting` = mobil bootstrap isteği uçuşta
   (`apps/mobile/src/bootstrap/mobile-bootstrap.ts`), `session` = auth context `checking`ten
   çıkış + görünüm tercihleri, `servers` = sunucu/çalışma alanı sorgusu,
   `almostReady` = realtime sağlayıcı bağlandı. Adım listesi yerine **tek satır** (SPEC §6).
6. **Ortam ve sürüm:** `mobile-app-identity.ts`'ten (`getMobileAppVersion`,
   `getMobileAppReleaseChannel`) → `resolveSplashEnvironment` + `formatSplashVersionLine`.
   Bootstrap payload'ından **okunmaz** (bilinen tuzak: UAT build'i bir yüzeyde Beta der).
7. **Kapanış:** min 600 ms görünme, 180 ms opaklık geçişi (Dalga 1 sabitleri).
8. **Erişilebilirlik:** kök `accessibilityRole="progressbar"`/`accessibilityLiveRegion="polite"`
   (RN karşılığı), aktif adım metni okunur; logo `accessibilityElementsHidden`.
   `AccessibilityInfo.isReduceMotionEnabled()` true iken tüm animasyonlar durur, düzen aynı kalır.

**Kabul:** `pnpm --filter @wizards/mobile typecheck` yeşil;
`npx jest component-tests/mobile-splash.test.tsx` — dört adımın tek satırda doğru metni,
ipucunun dört metinden biri, pill/sürümün ortamla değişmesi, reduce-motion altında animasyon
kurulmaması, güvenli alan dolgusunun 42'nin altına düşmemesi.
RNTL 14 asenkron: `render` ve `fireEvent.*` **await** edilir.

---

## Ş13 · Mobil dört durum (K1, K10)

**Dosya:** `apps/mobile/src/app/screens/splash/*`,
`apps/mobile/src/about/android-apk-update-controller.ts` (yalnız tüketim).

1. Durum aktifken **alt blok** yerini durum paneline bırakır; üst yarı (aurora + logo +
   wordmark + tagline) korunur, logo animasyonu durur ve işaret `opacity:.9` olur (SPEC §7).
   Aurora tek radyala düşer (`wash` tablodan).
2. Panel sırası SPEC §7 ile aynı: 24px karo (köşe 8px) + 10px uppercase etiket + başlık +
   açıklama + eylem. Mobil ölçek: başlık 17px, açıklama 13px.
   **Zorunlu sapma:** düğme yüksekliği 32px yerine **44px** (dokunma hedefi alt sınırı;
   depoda `MIN_TAP_TARGET_PX` ile ölçülüyor). Yatay boşluk ve köşe SPEC'teki gibi (15px/10px).
   Rapora yazılır.
3. **Durum kaynakları:**
   - `slow` — 10 sn. `Yeniden başlat` mevcut yeniden yükleme yolunu çağırır.
   - `offline` — ağ dinleyicisi (`apps/mobile/src/network/`). Bağlantı gelince otomatik yeniden dener.
   - `updating` — **yalnız Android APK indirmesi**: `android-apk-update-controller.ts`'in
     `onProgress(readBytes)` + toplam boyutu `SplashUpdateProgress`e bağlanır ve
     `formatSplashUpdateProgress` satırı çizilir. `expo-updates` bayt ilerlemesi vermez;
     **iOS'ta bu durum hiç tetiklenmez** (K10).
   - `sessionExpired` — 401. `Giriş yap` mevcut giriş akışına gider.
4. Metinler Dalga 1 Ş5'in mobil kopya sözlüğünden; bileşende sabit dize yok.

**Kabul:** dört durum için bileşen testi; `updating`in iOS'ta üretilemediği;
`offline` → `online` geçişinde otomatik yeniden denemenin tetiklendiği;
öncelik sırasının web ile aynı motordan geldiği.

---

## Ş14 · Native açılış katmanı (K11)

**Dosya:** `apps/mobile/app.config.js`,
`apps/mobile/android/app/src/main/res/values/colors.xml`,
`apps/mobile/android/app/src/main/res/values/styles.xml`,
`apps/mobile/android/app/src/main/res/drawable/*`, iOS launch screen yapılandırması.

1. Native katmanın **zemini** `--background` çözülmüş değeri (`rgb(249,250,251)` açık,
   koyu tema karşılığı koyu) olur; ortadaki işaret 52pt logo. Aurora ve metin native'de
   çizilmez (statik varlık sınırı) — bu bilinen ve onaylı sadeleştirmedir (K11).
2. Android: `Theme.App.SplashScreen`'in `windowBackground` drawable'ı ve `colors.xml`
   splash zeminiyle eşlenir. Koyu/açık için `values-night` karşılığı verilir.
3. iOS: `app.config.js`'teki splash yapılandırması aynı zemin + logo ile hizalanır.
   `expo-splash-screen` eklentisi zaten yapılandırılmışsa oradan; değilse mevcut mekanizma
   neyse ona dokunulur, yeni eklenti **eklenmez** (yeni bağımlılık kararı kullanıcıya sorulur).
4. **Sıçrama testi:** native katmandan JS splash'e geçişte zemin rengi ve logo konumu
   değişmemeli. Ölçülemiyorsa (cihaz yok) rapora “koşulamadı” yazılır.

**Kabul:** `pnpm --filter @wizards/mobile typecheck` yeşil; Android kaynak dosyaları geçerli XML;
zemin değerleri tema tokenlarından türetilmiş (elle hex kopyalanmışsa nereden geldiği yorumda).

---

## Ş15 · Kabul kriteri turu ve kapanış

**Dosya:** yeni `docs/prompts/splash-1b/raporlar/dalga-3.md`, `.../SONUC.md`.

SPEC §10'un altı kriteri **üç yüzeyde tek tek** doğrulanır ve kanıtıyla yazılır:

| #   | Kriter                                                                 | Kanıt                                                                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Aurora pencere kökünde, ayırıcıdan geçiyor, kolonlar opak değil        | web/masaüstü: e2e ölçümü (Dalga 2 Ş11); mobil: bileşen ağacı testi                  |
| 2   | Logo sadece ikon, halkayla eş merkezli, çubuklar hareketli, tıklanamaz | e2e merkez farkı ≤ 0.5px + `interactive={false}` kanıtı; mobilde dokunma yutulmuyor |
| 3   | Pill + sürüm satırı **yedi karede** görünür ve PROD/UAT ile değişiyor  | e2e + mobil bileşen testi                                                           |
| 4   | 420px'te ipucu kırpılmıyor, pill/sürümle aynı satırda değil            | e2e `scrollWidth <= clientWidth`                                                    |
| 5   | Durum etiketleri `-soft`, kontrast ≥ 4.5:1                             | Dalga 1 Ş2 kontrast testi + e2e (light **ve** dark)                                 |
| 6   | Metinler SPEC ile birebir                                              | i18n değerlerinin SPEC'ten kopyalandığının doğrulaması                              |

Ayrıca kapanışta:

- Depoda `AppStartupScreen`, `startup.*`, eski `readiness` sabitleri için **sıfır** referans.
- `graphify update .` çalıştırılır (grafik güncel kalsın).
- Bilinen sapmalar tek listede toplanır ve **her biri gerekçelendirilir**:
  Tauri (Electron değil), mobil düğme 44px, mobil alt dolgu güvenli alan, native katmanda
  aurora/metin yok, logo gradyanının hex olması, mobil gölge yaklaşıklığı.
- Koşulamayan her komut “koşulamadı” olarak yazılır; yeşil sayılmaz.

---

## Dalga kapanışı

```bash
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/web test
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/types test
```

Mobil bileşen testleri `apps/mobile` içinden `npx jest component-tests/mobile-splash*.test.tsx`.

**Bu dalgada dokunulmayacaklar:** `apps/web/src/components/splash/**` (Dalga 2'de kapandı —
mobil kendi ağacını çizer, web bileşenini import etmez), `apps/desktop/src-tauri/**`,
mevcut Jakarta font kayıtları, `expo` bağımlılık listesi.
