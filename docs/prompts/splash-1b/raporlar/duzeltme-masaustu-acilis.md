# Düzeltme — masaüstü açılışında çift pencere ve çift açılış ekranı

Tarih: 2026-08-26 · Branch `uat` · commit yok.

## Bildirilen davranış

1. Açılış ekranı doğru geliyor, `Bağlanıyor` yanıyor.
2. `Oturum doğrulanıyor` göz kırpması gibi geçiyor, takip edilemiyor.
3. `Sunucular yükleniyor`a gelince ekran yenileniyor ve **büyük bir dış çerçeve**
   beliriyor (ekran görüntüsü 1).
4. Ardından ana pencere açılıyor ama ortadaki açılış ekranı **baştan** `Bağlanıyor`a
   dönüyor (ekran görüntüsü 2).
5. Dört adım yeniden ilerliyor, `Neredeyse hazır`da bekliyor, sonra uygulama açılıyor.

## Kök neden — üç ayrı hata

| #   | Neden                                                                                                                                                                                                                               | Görünen sonuç                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `/desktop/start` pencereyi **gezinmeden önce** ana ölçüye büyütüyordu (`promoteWhisprDesktopWindow` + 760 ms bekleme). Kabuk henüz yüklenmediği için 1920 × 1080'lik pencerede yalnız 630 × 420'lik kart ve saydam zemin kalıyordu. | Ekran görüntüsü 1'deki büyük dış çerçeve |
| 2   | Kabuk kendi açılış ekranını **sıfırdan** kuruyordu: `/desktop/start`ın ulaştığı adım hiçbir yere yazılmıyordu, kabuk `connecting`ten başlıyordu.                                                                                    | Ekran görüntüsü 2'deki geri dönüş        |
| 3   | Adımların ekranda kalma süresi yoktu; oturum çözümü ~50 ms sürünce onay işareti bir karede geçiyordu.                                                                                                                               | Takip edilemeyen 2. adım                 |

Ek olarak Rust tarafında `on_page_load` `PageLoadEvent::Started`, açılış yolu dışındaki
her tam sayfa yüklemesinde pencereyi büyütüyordu — aynı erken terfinin ikinci yolu.

## Çözüm — tek pencere, tek açılış ekranı, en sonda terfi

**Yeni:** `apps/web/src/lib/desktop/startup-window.ts` (+ testi, 7 test).
Açılışın iki rotası arasındaki sürekliliği taşıyan tek modül:

- `markDesktopStartupWindowPending()` — pencere küçük, terfi kabuğun işi. Yalnız Tauri
  çalışma zamanında yazar; tarayıcıda hiçbir şey işaretlemez (yoksa web kabuğu hiç
  gelmeyecek bir terfiyi beklerdi).
- `writeDesktopStartupStep()` / `readDesktopStartupStep()` — ulaşılan adım
  `sessionStorage`'da; **yalnız ileri** yazılır. Tam sayfa yüklemesi de sürekliliği bozmaz.
- `isShellOwnedDesktopDestination()` — hedef `app/(main)` rotalarından biri mi.
- `finishDesktopStartup()` — terfi + ölçek sınıfını kaldırma + devir kaydını silme.
  Eşzamanlı çağrılar tek terfiyi paylaşır; terfi başarısız olsa bile kayıt temizlenir,
  yoksa perde hiç kalkmazdı.

**`/desktop/start`** artık:

- pencereyi **büyütmüyor** ve açılış ekranını kapatmıyor,
- oturum çözülür çözülmez `Oturum doğrulanıyor`a geçip 220 ms bekliyor, sonra gidiyor,
- hedef kabuk rotası **değilse** (giriş ekranı, davet bağlantısı) gezinmeden önce
  terfi ediyor — orada "hazırım" diyecek bir kabuk yok,
- 760 ms'lik yapay bekleme kalktı; minimum görünme süresini artık kabuk yönetiyor.

**Kabuk** (`wizards-shell`):

- devredilen adımı `useSyncExternalStore` ile okuyup açılış ekranını **oradan** başlatıyor
  (sunucu anlık görüntüsü boş → hidrasyon uyuşmazlığı yok),
- pencere hâlâ açılış ölçüsündeyken açılış ekranı `window` varyantında çiziliyor
  (yuvarlak köşe + gölge payı korunur),
- hazır olduğunda **önce** terfi ediyor, terfi bitince perde 180 ms'de kapanıyor:
  `holdDismiss` bayrağı bunu garanti ediyor.

**`use-shell-readiness`**: `initialStep`, `holdDismiss` ve **220 ms'lik adım bekleme
süresi** eklendi. Bekleme ilerlemeyi uydurmaz — aşama gerçekten bitmiştir, yalnız bir
kare görünür kalır. Liste görsel olarak bitmeden perde kalkmıyor (`displayStep === step`).

**CSS**: küçük açılış penceresinde kabuk ve başlık çubuğu `visibility: hidden` —
kenar payı saydam kalmalı, yoksa kartın çevresinden kabuktan şeritler sızardı.
`display: none` seçilmedi: düzeni söker ve ölçen kancaları yanıltır.

**Rust** (`lib.rs`):

- `PageLoadEvent::Started`daki erken terfi kaldırıldı; terfi yalnız
  `promote_desktop_main_window` komutuyla olur.
- Yeni `spawn_desktop_startup_promotion_guard`: 30 sn sonra hâlâ terfi edilmemişse
  pencereyi ana ölçüye çıkarır. Webview çökerse pencere 648 × 474'te ve
  **yeniden boyutlandırılamaz** kalırdı; bu bekçi o kilidi açar, normal açılışta hiç iş yapmaz.

## Yeni akış

```
Tauri penceresi 648 × 474 (kabuk 630 × 420, gölge payı saydam)
  └ /desktop/start · Bağlanıyor → Oturum doğrulanıyor (220 ms)
      └ kabuk rotası mı?
          ├ evet → pencere KÜÇÜK kalır, adım devredilir, kabuğa gidilir
          │        kabuk: Sunucular yükleniyor → Neredeyse hazır
          │          └ hazır → terfi (perde arkasında) → 180 ms sönme → uygulama
          └ hayır → önce terfi, sonra giriş ekranı
```

Kullanıcı boyunca **tek pencere** ve **tek açılış ekranı** görür; adımlar bir kez, sırayla
ilerler ve dördü de bitmeden uygulama açılmaz.

## Kapılar

| Komut                                                    | Sonuç                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                        | ✅ 7318 test, 7315 pass, 0 fail, 3 eski skip                                |
| `pnpm --filter @wizards/web typecheck` / `lint`          | ✅ temiz                                                                    |
| `apps/desktop/src-tauri` → `cargo test`                  | ✅ 30 test, 0 fail                                                          |
| `apps/desktop/src-tauri` → `cargo clippy -- -D warnings` | ✅ temiz                                                                    |
| `startup-window.test.ts`                                 | ✅ 7 test, 0 fail                                                           |
| Tauri penceresinde elle doğrulama                        | ⛔ **koşulamadı** — bu oturumda masaüstü uygulaması derlenip çalıştırılmadı |

---

# İkinci tur — cihazdaki testin ortaya çıkardığı üç kalıntı

Birinci turdan sonra masaüstünde test edildi: açılış ekranı artık **tek** ve adımlar geri
dönmüyor. Kalan üç kusur ve kök nedenleri:

| #   | Görünen                                                                        | Kök neden                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Oturum doğrulanıyor` aşamasında kartın arkasında beyaz bir çerçeve beliriyor  | Rota geçişinde Next'in `(main)/loading.tsx` iskeleti çiziliyordu. Gizleme kuralı yalnız `.app-shell`'i kapsıyordu; iskelet `body`nin ayrı bir çocuğu.                              |
| 2   | `Sunucular yükleniyor` yeşile dönünce pencere birden uygulama boyutuna büyüyor | **`DesktopWindowChrome` mount olur olmaz `promoteWhisprDesktopWindow()` çağırıyordu.** Kabuk yüklendiği anda pencere büyüyordu; terfi kararı kabuğun hazır olmasına bağlı değildi. |
| 3   | `Neredeyse hazır` yeşil görünmeden uygulama açılıyor                           | Dördüncü adım yalnız "aktif" hâldeyken perde kalkıyordu; onay işareti hiç çizilmiyordu.                                                                                            |

## İkinci turun düzeltmeleri

- **`desktop-window-chrome.tsx`**: açılış penceresi beklerken (`isDesktopStartupWindowPending()`)
  terfi etmiyor. Açılışta terfi kabuğun işi; bu çağrı yalnız açılış dışı yollar
  (deep link, yeniden yükleme) için son çare olarak kalıyor.
- **`globals.css`**: gizleme kuralı `.app-shell` yerine **`body > *`**. Kabuk, başlık
  çubuğu, `loading.tsx` iskeleti ve portal kökleri — hepsi `body`nin çocuğu, hepsi gizli;
  yalnız `.whispr-splash` görünür. Kenar payı saydam kalıyor, arkada hiçbir çerçeve yok.
- **`SplashSteps` + `SplashScreen`**: yeni `completed` bayrağı. Dört aşama da bitince liste
  dördü birden onaylı çizilir ve üç nokta durur.
- **`use-shell-readiness`**: hazır olunduktan sonra perde `MIN_STEP_DWELL_MS` (220 ms) boyunca
  **dört onaylı** listeyle durur, sonra kapanır. Sıra artık: dördüncü onay görünür →
  terfi (perde arkasında) → 180 ms sönme → uygulama.

Yeni testler: `splash-screen.test.tsx`'e "tamamlandığında dört adımı da onaylı çizer"
(25 test, 0 fail); `startup-window.test.ts` 7 test.

---

# Üçüncü tur — terfi zamanlaması

Yeniden derlenip test edildi: ilk iki aşama kusursuz, arka planda çerçeve yok. Kalan kusur:
`Sunucular yükleniyor` onaylanınca kartın dışında **saydam bir uygulama çerçevesi** beliriyor,
`Neredeyse hazır` aşamasında bu çerçeve boş arkaplan rengiyle kartı içine alıyor.

## Kök neden

Terfi `readiness.isReady`e bağlıydı. `isReady`, dördüncü aşamanın **verisi** hazır olur olmaz
true olur (soket zaten bağlıysa `Sunucular yükleniyor` biter bitmez). Perde ise ondan sonra
hâlâ görünür kalıyordu: 220 ms'lik bekleme + dört onaylı listenin çizilmesi. Yani pencere,
kullanıcı hâlâ `Neredeyse hazır`ı okurken büyüyordu — ekran görüntüsündeki saydam çerçeve
tam olarak bu aradaki pencere.

İkinci sorun aynı kökten: terfi **pencere görünürken** yapılıyordu. Yeniden boyutlanma,
kökteki `zoom`un kalkması ve kabuğun ilk tam ölçü çizimi bir kaç kare boyunca izlenebiliyordu.

## Çözüm

- **Yeni `readiness.isSettled`**: veri hazır **ve** liste dördü onaylı hâliyle görüldü.
  Terfi artık buna bakıyor, `isReady`ye değil.
- **Terfi pencere gizliyken yapılıyor.** `finishDesktopStartup()` sırası:
  1. `hideWhisprDesktopWindow()` — yeni yardımcı,
  2. terfi (ana ölçü, min-size, ortala),
  3. açılış ölçeğini ve devir kaydını temizle,
  4. geri çağrı → perde sönmeye başlar,
  5. sönme kadar bekle (`SPLASH_FADE_OUT_MS + 80`), `showWhisprDesktopWindow()`.

  Pencere her koşulda yeniden gösterilir (`finally`): terfi başarısız olsa bile gizli kalan
  bir pencere uygulamayı kullanılamaz yapardı.

Kullanıcının gördüğü sıra: dört yeşil onay → pencere kısa süre kaybolur → uygulama tam
ölçüde, çizilmiş hâlde gelir. Arada hiçbir boş çerçeve yok.

Yeni test: `startup-window.test.ts` — geri çağrı devir temizlendikten **sonra**, pencere
gösterilmeden **önce** çalışıyor (8 test, 0 fail).

## Sürüm satırında build numarası neden yok

Yok değil — **boş**. `formatSplashVersionLine` (K8) parantezi ancak bir yayın numarası varsa
yazar, yoksa bloğu tümüyle düşürür (`Whispr 0.8.15 · Echo`); boş parantez tasarımda yok.
Numara `WHISPR_BUILD_NUMBER` ortam değişkeninden gelir (`next.config.ts` onu
`NEXT_PUBLIC_WHISPR_BUILD_NUMBER`e eşler) ve yerel `.env`'de tanımlı değil.
`.env.example`'da satırı hazır: doldurulduğu anda `Whispr 0.8.15 (1204) · Echo` çıkar.
PROD ve UAT dağıtımlarında da doldurulmalı.

---

# Dördüncü tur — kaydırma çubuğu

Yeniden derlenip test edildi: pencere artık büyümüyor, çerçeve yok. Kalan kusur:
`Oturum doğrulanıyor` aşamasında kartın sağında saliselik ince, dikey bir şerit beliriyor
ve kart yatayda gidip geliyor.

## Kök neden

O şerit **kaydırma çubuğu**. Açılış penceresinde kabuk `visibility: hidden` ile gizleniyor
ama `visibility` düzeni **söküp atmaz**: gizli kabuk hâlâ yer kaplar ve 432 × 316 CSS px'lik
görünüm alanına sığmaz. Belge kaydırılabilir hâle gelince tarayıcı çubuğu çiziyor; çubuk
belirip kaybolunca görünüm alanı ~10 px daralıp genişliyor ve `position: fixed` ile ortalanan
kart o kadar yatayda zıplıyor. Ekran görüntüsündeki şerit çubuğun kendisi, yatay oynama da
onun yan etkisi.

## Çözüm

Açılış penceresinde belge kaydırılmaz:

```css
html.whispr-splash-desktop-scale,
html.whispr-splash-desktop-scale body {
  overflow: hidden;
  scrollbar-width: none;
}
html.whispr-splash-desktop-scale body::-webkit-scrollbar {
  display: none;
}
```

`visibility: hidden` korundu — `display: none` kabuğun düzenini tümden söker ve ölçüm yapan
kancalara sıfır boyut verirdi; terfiden sonra yeniden ölçüm gerekir ama sıfırdan gelen
değerler önbelleğe girip kalabilir. Kaydırmayı kilitlemek hem çubuğu hem zıplamayı,
kabuğun ölçülerine dokunmadan kaldırıyor.

Logonun nefes alması ve çubuklarının hareketi tasarımın kendisidir (SPEC §2/§3.2); kart
artık yerinden oynamadığı için işaret de sabit duruyor.

## Doğrulanması gereken (masaüstünde)

1. Açılıştan uygulamaya kadar **tek** pencere ve **tek** açılış ekranı.
2. Adımlar bir kez ilerliyor; hiçbiri geri dönmüyor, her biri gözle takip edilebiliyor.
3. Pencere yalnız dört adım bittikten sonra büyüyor; büyüme perdenin arkasında.
4. Oturumsuz açılışta giriş ekranı tam ölçüde geliyor.
5. Ağ yokken 10 sn'de `Bağlantı hatası`, 20 sn'de soketsiz giriş çalışıyor.
