# Dalga 3 · Ş8 — Ses ve Video (3 sekme · 26 satır) + Görünüm (5 sekme · 29 satır)

**Ön koşul:** Dalga 2 kapısı yeşil. **Paralel:** Ş7, Ş9, Ş10.

Referans kare: `screens/06-gorunum-tema.png`. Otorite `.dc.html` `SET[1]` ve `SET[2]` dalları.

Bu şerit **üç panel dosyasını siler** (K13) ve mantıklarını hook'a çıkarır.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/sections/av/*.tsx` (3 sekme)
- `apps/web/src/components/settings/sections/appearance/*.tsx` (5 sekme)
- `apps/web/src/components/settings/blocks/mic-level-meter-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/camera-preview-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/simple-theme-block.tsx` · `theme-grid-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/message-preview-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/app-icon-grid-block.tsx` (yeni)
- `apps/web/src/hooks/use-audio-devices.ts` · `use-mic-level.ts` · `use-camera-preview.ts` (yeni — panellerden çıkarılan mantık)
- `apps/web/src/lib/appearance.ts` (**düzenlenir** — Türkçe tema adları, K6)
- **Silinir:** `components/voice/voice-preferences-panel.tsx`, `camera-preferences-panel.tsx`,
  `screen-share-preferences-panel.tsx` ve `settings-panel.tsx` içindeki dinamik importları

**Okunur, yazılmaz:** `lib/settings/tree.ts`, satır motoru, `components/theme/theme-picker.tsx`,
`lib/voice/*`, `public/app-icons/`.

---

## A. Ses ve Video (K13)

### 1. Panel taşıması

`VoicePreferencesPanel` / `CameraPreferencesPanel` / `ScreenSharePreferencesPanel` **silinir**.
İçlerindeki iş üç hook'a çıkar:

| Hook                 | Sorumluluk                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `useAudioDevices()`  | `navigator.mediaDevices.enumerateDevices()` + `devicechange` dinleyicisi + izin durumu; giriş ve çıkış listeleri |
| `useMicLevel()`      | `AudioContext` + `AnalyserNode` ile dBFS; **test bittiğinde stream kapanır**                                     |
| `useCameraPreview()` | önizleme stream'i, aynala / döndür, `AppState` benzeri görünürlük koruması                                       |

Cihaz listeleri **gerçek** `enumerateDevices()` sonucundan gelir; tasarımdaki
`MacBook Pro Mikrofonu` gibi adlar örnek veridir, sabitlenmez.

Kaynak sızıntısı yasak: her hook `useEffect` temizliğinde track'leri durdurur. Sekme değişince
mikrofon ışığı yanık kalmamalı — bunun testi zorunlu.

### 2. Ses sekmesi

**Giriş:** cihaz menüsü · **mikrofon seviye ölçeri bloğu** (`i3`, `cst`) + `Mikrofonu test et` ·
`Kendimi duy` · `Giriş modu` (Ses etkinliği / Bas-konuş) · `Bas-konuş bırakma gecikmesi`
(0–500 ms).

**Çıkış:** cihaz menüsü · `Ana çıkış ses seviyesi` (0–100 %) · `Test sesi çal`.

**Ses işleme** (not: `Temiz ses profili kapatıldığında filtreleri tek tek ayarlayabilirsin.`):
`Temiz ses profili` + 5 filtre anahtarı + `Gürültü filtresi` menüsü (Katmanlı / Yalnız Krisp /
Yalnız tarayıcı) + durum satırı `Etkin · katmanlı filtre çalışıyor` + `Varsayılanlara dön`.

`Temiz ses profili` açıkken 5 filtre anahtarı **kilitli değil ama yönetilir**: profil açık
olduğunda önerilen kümeye eşitlenir; kullanıcı birini değiştirirse profil kendiliğinden kapanır.
Bu ilişki tek yerde (`lib/voice/clean-audio-profile.ts`) tanımlanır.

**Bu sekmedeki hiçbir satır kirli bayrağı kurmaz** (sapma #5) — `p1…p9` anahtarları profil
alanı değildir.

### 3. Kamera sekmesi

Cihaz menüsü · **220 px 16:9 önizleme çerçevesi** (`Önizleme kapalı`) yanında
`Önizlemeyi başlat` + aynala / sola / sağa döndür düğmeleri + notu
`Önizleme yalnızca bu pencerede görünür, kimseye gönderilmez.` · `Arka plan bulanıklığı` ·
`Kamera izni` (`Engellendi`, danger, iki düğme).

İzin durumu `navigator.permissions.query({ name: "camera" })` + masaüstünde Tauri köprüsünden;
sabit değer yazılmaz.

### 4. Ekran paylaşımı sekmesi

Kalite segmenti (720p60 / 1080p60 / 1440p60) · yüzey sesi anahtarı · dinleme sesi kaydırıcısı ·
kendi penceresini çıkarma · kaynak değiştirme · `Aktif paylaşım · Şu anda paylaşım yok` +
`Test paylaşımı başlat` / `Varsayılanlara dön`.

Aktif paylaşım satırı **gerçek** LiveKit durumundan okunur.

---

## B. Görünüm

### 5. Tema sekmesi (K6)

**Basit temalar** — 4 kolonlu kart: Light · Ash · Dark · Onyx; 62 px gradyan önizleme,
seçilide 2 px `H(primary)` kenar + tik.

**Tüm temalar** (`23 tema · açık ve koyu`) — 3 kolon; 18 px swatch, ad ve `Koyu`/`Açık` etiketi.

Tema **kimlikleri değişmez**; `lib/appearance.ts` her kayda `displayNameKey` alanı kazanır ve
Türkçe adlar tasarımın listesinden atanır (Gece Mavisi · Kömür · Mürekkep · Orman · Bordo ·
Mor Alacakaranlık · Bakır · Okyanus · Zeytin · Gece Yarısı · Grafit · Kobalt · Kiraz · Kar ·
Kum · Sisli Cam · Adaçayı · Şafak · Buz · Lavanta · Kağıt · Deniz Köpüğü · Gül).

Eşleme tablosu `lib/appearance.ts` içinde **yorumla gerekçelendirilir**; hangi `theme-*`
kimliğinin hangi Türkçe adı aldığı tek tek yazılır.

`Koyu` / `Açık` etiketi **gerçek temadan** okunur — tasarımın 13/10 sayımı değil, koddaki 14/9
geçerli (sapma #1). Blok bunu bir sayaç olarak yazmaz, yalnız etiketler.

Tema ızgarası ağır bölüm → ilk açılışta iskelet.

### 6. Metin sekmesi

`Mesaj fontu` menüsü (Open Sans / Inter / Raleway / Outfit) · `Mesaj boyutu` (12–22 px) ·
`Arayüz yoğunluğu` (Rahat / Kompakt) · `Kompakt mesaj görünümü`.

**Canlı önizleme bloğu:** iki örnek mesaj (Selin Aksoy 09:41 · Mert Kaya 09:44); font, boyut ve
kompakt seçimi **anında** yansır. Örnek metinler referanstakinin birebir aynısı, i18n anahtarından.

Font adı bileşene gömülmez — `lib/message-fonts.ts` kimliği üzerinden CSS değişkeni yazılır.

### 7. Medya sekmesi

**Satır içi içerik:** görseller ve videolar · bağlantı önizlemeleri · embed içerikleri ·
reaksiyonlar.
**Hareket:** `Animasyonlu emojiler` · `Sticker animasyonu` menüsü (Her zaman / Etkileşim
sırasında / Asla) · `Hareketi azalt` · `Text-to-speech`.

`Hareketi azalt` ve `Text-to-speech` **Erişilebilirlik sekmesiyle aynı anahtarı** yazar
(sapma #4) — iki bağımsız durum kurulmaz.

### 8. Düzen sekmesi

Sunucu rayı (60–92) · sunucu ikonu (36–56) · kanal paneli (200–300) · ana içerik genişliği
(%70–100) kaydırıcıları · `Üye panelini varsayılan olarak göster` · `Düzeni sıfırla`.

**Uygulama simgesi** (not: `Web'de favicon, masaüstünde uygulama ve tepsi simgesi birlikte
değişir.`) — 7 kutu (Whispr, Wave 5…0), seçilide 2 px primary kenar.
Görseller `public/app-icons/` altından; sabit renk üretilmez, kutu tonları sözlükten.

Simge seçimi **gerçekten** favicon'u değiştirir (`<link rel="icon">` güncellenir) ve masaüstünde
Tauri köprüsüne yazılır; yazılıp uygulanmayan tercih bırakılmaz.

### 9. Erişilebilirlik sekmesi

**Görünürlük:** `Yüksek kontrast` · `Odak göstergelerini güçlendir` · `Yazı boyutu` (%85–130).
**Yardımcı teknolojiler:** `Hareketi azalt` · `Text-to-speech` · `Ekran okuyucu için açıklayıcı
durum metinleri` · `Sistem erişilebilirlik tercihlerini takip et`.

`Yazı boyutu` kök font boyutunu **ölçek adımının üstüne** çarpan olarak biner; ölçek adımının
yerine geçmez (SPEC-ANA-SAYFA §8 ile çakışmaz).

`Sistem erişilebilirlik tercihlerini takip et` açıkken `prefers-reduced-motion` ve
`prefers-contrast` kullanıcı seçimini **ezer** ve ilgili satırlar `disabled` görünür.

---

## Kabul

- [ ] Üç panel dosyası **silindi**; hiçbir yerden import edilmiyor.
- [ ] Cihaz listeleri gerçek `enumerateDevices()` sonucundan; `devicechange` dinleniyor.
- [ ] Mikrofon testi bitince stream kapanıyor; sekme değişince mikrofon açık kalmıyor.
- [ ] Kamera önizlemesi kapanınca track duruyor.
- [ ] `Temiz ses profili` ilişkisi tek yerde; filtre değişince profil kendiliğinden kapanıyor.
- [ ] Ses işleme satırları kirli bayrağı **kurmuyor** (sapma #5 regresyon testi).
- [ ] Kamera ve mikrofon izni gerçek `navigator.permissions`'tan; sabit değer yok.
- [ ] 4 basit + 23 tema listeleniyor; **hiçbir tema kimliği değişmedi**.
- [ ] Türkçe ad eşlemesi `lib/appearance.ts` içinde yorumla gerekçeli.
- [ ] `Koyu`/`Açık` etiketi gerçek temadan; sayım 14/9.
- [ ] Tema ızgarası iskeletle geliyor.
- [ ] Metin önizlemesi font, boyut ve kompakt seçimini **anında** yansıtıyor.
- [ ] `Hareketi azalt` Medya ve Erişilebilirlik'te **aynı** değeri gösteriyor; birinde değişince
      diğeri hizalanıyor (sapma #4 testi).
- [ ] Uygulama simgesi seçimi favicon'u gerçekten değiştiriyor.
- [ ] `Yazı boyutu` ölçek adımının üstüne biniyor, yerine geçmiyor.
- [ ] `Sistem tercihlerini takip et` açıkken ilgili satırlar `disabled` ve sistem değeri kazanıyor.
- [ ] Açık ve koyu temada `screens/06-gorunum-tema.png` ile karşılaştırma yapıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/09-s8-rapor.md`
