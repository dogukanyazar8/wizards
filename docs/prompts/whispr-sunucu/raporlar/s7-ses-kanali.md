# Ş7 — Ses kanalı görsel yenileme (Dalga 3)

> Şerit dosyası: `08-dalga3-s7-ses-kanali.md`
> Okunanlar: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §5 (tamamı), `design/Sunucu.dc.html`.
> Bağımlılık: Ş0 · Ş4. Karar: **K5**. Dal: `uat`. Tarih: 2026-08-26.
> **Sıra dışı not:** şerit Dalga 3'ün değil, Ş14'ten **sonra** koştu (bkz. `s14-kapanis.md` §0).

---

## 0. Şerit dosyasının ilk sorusu: `lib/voice/*`'a dokunuldu mu?

**Hayır.** Yedi dosyanın hiçbirinde bu şeridin açtığı bir satır yok:

```
lib/voice/participant-view-model.ts   lib/voice/video-quality.ts
lib/voice/video-subscription.ts       lib/voice/screen-share.ts
lib/voice/krisp-quality.ts            lib/voice/media-capabilities.ts
lib/voice/use-voice-audio-levels.ts
```

`git status apps/web/src/lib/voice/` yalnız **önceki** şeritlerin bıraktığı iki satırı
gösteriyor (`screen-share-audio-wiring.test.ts` düzenlenmiş, `clean-audio-profile.*` eklenmiş);
ikisi de Ş7'den önce vardı.

**Regresyon kapısı yeşil** (41 test):

```
video-quality.test.ts · video-subscription.test.ts · screen-share.test.ts
participant-view-model.test.ts · krisp-quality.test.ts     41 pass · 0 fail
```

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                   | Satır | İş                                                                    |
| ------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| `components/voice/server/server-voice-surface.tsx`      | 1140  | §5.1–§5.4 + §6 — yedi saf sunum bileşeni                              |
| `lib/servers/voice-presentation.ts`                     | 181   | §5'in saf kararları: alt satır · kart durumu · kolon · gecikme · sıra |
| `lib/servers/voice-presentation.test.ts`                | 197   | 17 test                                                               |
| `components/voice/server/server-voice-surface.test.tsx` | 491   | 32 test                                                               |

### 1.2 Ağır düzenlenen

| Dosya                                     | Değişiklik                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/voice/voice-channel-view.tsx` | 891 → 581 satır. Sunum tamamen yeni yüzeylere devredildi; `VoiceParticipantsSidebar` + `VoiceInviteMemberGroup` **silindi** (§4.2 sağ panelin işi, Ş5) |
| `app/globals.css`                         | `@keyframes wbar` + `.voice-wave-bar` + `prefers-reduced-motion` bloğu                                                                                 |
| `lib/home/token-audit.ts`                 | `SERVER_TOKEN_AUDIT_SCOPE`a `components/voice/server` ve `lib/servers/voice-presentation.ts`                                                           |
| `e2e/specs/design/server-parity.spec.ts`  | **Ş7 satırı açıldı** — ses rotasında dört çözünürlük × iki tema + kontrol çubuğu davranış testi                                                        |

---

## 2. Neden yeni dosya, neden `voice-room-primitives.tsx` değil

Şerit dosyası "`voice-channel-view.tsx` ve `voice/room/voice-room-primitives.tsx`'in sunum
katmanını yeniden çiz" diyor. Ama aynı dosyanın **Sınırlar** bölümü "ses odası (DM/grup
çağrısı) yüzeyi bu şeritte kapsam dışı" diyor — ve `voice-room-primitives.tsx`in üç ana
bileşenini (`VoiceParticipantTile`, `VoiceControlBar`, `ScreenShareStage`)
**`components/dm/dm-call-view.tsx` de kullanıyor**.

İki cümle aynı anda tutulamıyor: paylaşılan bileşeni SPEC-SUNUCU'ya göre yeniden çizmek,
dokunulmaması söylenen yüzeyi de yeniden çizmek olurdu. Seçim, **Sınırlar** lehine yapıldı:
sunucu kanalı kendi dilini `components/voice/server/` altında taşıyor, DM çağrısı eski
bileşenleri bit bit aynı kullanmaya devam ediyor. İki yüzey aynı **veriyi** paylaşıyor
(`VoiceParticipantViewModel`, `VoiceScreenShareViewModel`), aynı pikselleri değil.

Test bunu kilitliyor: `voice-channel-view.tsx` içinde `<VoiceParticipantTile`,
`<VoiceControlBar` ve `<VoiceEmptyState` **geçmiyor**.

---

## 3. §5 madde madde

### 3.1 Başlık (§5.1)

Hoparlör ikonu 20 success · ad · kategori çipi · alt satır · Krisp çipi · gecikme çipi ·
`1×22` ayraç · `Üyeler` düğmesi. Ölçüler `SERVER_METRICS.{voiceHeader,textHeader}`ten
(başlık çerçevesi metin kanalıyla ortak — SPEC ikisine de `14px 20px` veriyor).

Alt satırın üç biçimi `selectVoiceSubtitle`de ve **sıra** bir karar: ekran paylaşımı >
kamera > düz. Biri ekranını paylaşırken kamera sayısını yazmak, odadaki en önemli olayı
gizlerdi.

`Krisp aktif` çipi `krisp-quality.ts`ten gelen **gerçek** durumdan. Gecikme çipinin sözcüğü de
gerçek: LiveKit'in `ConnectionQuality`si. Sayısı (`32 ms`) yok — bkz. TODO(api) 1.

### 3.2 Katılımcı ızgarası (§5.2)

`18px 20px 4px` boşluk, `gap 12`, kolon 2/3/4. Kart `16/11`, `r20`, `2px` çerçeve.
Konuşanda çerçeve `success/.6` + `0 0 0 4px success/.14` glow + `0 20px 40px -30px` gölge;
avatar 62, konuşanda `inset:-6px` success halka. Ad `600 13` + rol rozeti
(`Sunucu` primary / `Yönetici` danger, üyelik seviyesinden). Sağ üstte `26 r9 danger/.16`
durum rozeti, sol üstte `SEN` çipi.

Konuşurken dört çubuklu dalga (`@keyframes wbar`, `.9s`, çubuk başına `.15s`); konuşmuyorsa
`Sessiz dinliyor` / `Mikrofon kapalı` / `Hoparlör kapalı`. Sıra `selectVoiceTileStatus`ta ve
bir **önem** sırası: hoparlörü kapalı biri mikrofonunu açsa da kimseyi duymuyor.

**A11y (§12).** Halka tek ipucu değil: her kart `sr-only` bir cümle taşıyor
(`{ad} konuşuyor` / `… mikrofonu kapalı` / `… hoparlörü kapalı` / `… sessiz dinliyor`).
`prefers-reduced-motion` altında dalga **durur** ama kaybolmaz (çubuk tam boyda kalır) —
kaybolsaydı görsel ipucu da yok olurdu. Dalga sınıfı **yalnız konuşan** karta takılıyor,
susan kart bir animasyon karesi bile harcamıyor (PROMPT §11).

### 3.3 Kamera varyantı (§5.2)

Kart zemini çapraz şeritli yer tutucu
(`repeating-linear-gradient(135deg, surface-secondary 0 18px, surface-tertiary/.55 18px 36px)`),
ortada kamera ikonu + `Kamera görüntüsü`, sol altta ad + dalga çipi.

**Akış yokken boş `<video>` mount edilmiyor** (PROMPT §11): `cameraSlot` `null` iken yalnız
yer tutucu çiziliyor. Gerçek akış varsa `ParticipantCameraVideo` (mevcut ilkel, dokunulmadı).

### 3.4 Ekran paylaşımı (§5.3)

Tek büyük sahne `flex:1`, `r20`, `2px primary/.55`, çapraz şeritli yer tutucu, ortada
`Ekran görüntüsü yer tutucusu · 1920×1080`. Sol üstte paylaşan avatarı +
`<ad> ekranını paylaşıyor` + `CANLI` çipi (danger). Sağ üstte `1080p · 30 fps` çipi ve tam
ekran düğmesi 30. Altta yatay şerit: kart 162, `r14`, konuşanda success çerçeve + glow.

Video yüzeyi mevcut `ScreenShareVideo` ilkeli (dokunulmadı).

### 3.5 Kontrol çubuğu (§5.4)

`14px 20px 18px`, ortalanmış, `gap 7`. Dört düğme h44 `r15` `1px` çerçeve; kapalı
mikrofon/hoparlör `danger`, açık paylaşım/kamera `primary`. `44×44` ayarlar düğmesi
(`VoiceSettingsModal` — mevcut pencere), `1×28` ayraç, `Ayrıl` danger dolgu +
`0 12px 26px -16px danger` gölge.

Her düğme `aria-pressed` taşıyor; ayarlar ve `Ayrıl` `aria-label`lı.

### 3.6 Boş durum (§6)

Kart ızgarası yerine tek blok: kesikli çerçeveli hoparlör kutusu + başlık + açıklama.

---

## 4. SPEC'ten sapmalar

| #      | Sapma                                                                                                                    | Gerekçe                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | **`voice-room-primitives.tsx` yeniden çizilmedi; sunucu kanalı kendi bileşenlerini aldı.**                               | §2. Şerit dosyasının iki cümlesi çelişiyordu; **Sınırlar** ("DM/grup çağrısı kapsam dışı") kazandı                                                                                                                                                                         |
| **S2** | **Gecikme çipi sayı yazmıyor, yalnız kaliteyi yazıyor** (`iyi` / `orta` / `zayıf`).                                      | **TODO(api) 1** — odanın RTT'sini veren alan yok (Ş4 TODO 1) ve `ConnectionQuality` bir sınıf, milisaniye değil. Sözcük **gerçek** veriden; sayı uydurulmadı. Kalite `unknown` iken çip hiç çizilmiyor                                                                     |
| **S3** | **`Krisp` çipinin "kontrol ediliyor" ara durumu yok.**                                                                   | §5.1 iki durum veriyor. Ara durumda çip **kapalı** yazıyor ve durum netleşince kendiliğinden düzeliyor; üçüncü bir ton uydurmak tasarımın vermediği bir ayrım olurdu                                                                                                       |
| **S4** | **Kolon sayısı "Tweaks"ten değil, katılımcı sayısından türüyor.**                                                        | Üründe "Tweaks" diye bir yüzey yok. `selectVoiceGridColumns` sözlüğün verdiği 2/3/4 aralığını **asla** aşmıyor: ≤2 kişi 2 kolon, ≤9 kişi 3, sonrası 4. Tek kişiye tek kolon verilmedi — `16/11` kart tek kolona yayılınca ekranın yarısını kaplardı                        |
| **S5** | **Katılımcı başına ses düzeyi kontrolü kartta **hover/odakta** beliriyor.**                                              | §5.2 kartın durağan hâlinde böyle bir kontrol çizmiyor; silmek ise sessiz bir yetenek kaybı olurdu (kablolama `voice-store`da ve K5 gereği duruyor). Kartın **durağan** kompozisyonu SPEC'teki gibi kalıyor, yetenek klavyeyle de erişilebilir                             |
| **S6** | **Ekran paylaşımının kalite seçici · paylaşımı durdur · ses anahtarı · ses düzeyi kontrolleri sahnenin meta satırında.** | §5.3 iki kontrol çiziyor (çözünürlük çipi + tam ekran). Dördü de **mevcut** yetenek; silmek sessiz kayıp olurdu. `extraControls` yuvasına konuldu, sahnenin kendi kompozisyonu değişmedi                                                                                   |
| **S7** | **`1080p · 30 fps` çipi seçilen kalite ön ayarından, ölçülen yayından değil.**                                           | Gerçek yayın çözünürlüğünü veren bir alan yok. Değer `SCREEN_SHARE_QUALITY_OPTIONS` + `getScreenShareQualityPreset` (ikisi de `screen-share.ts`, dokunulmadı) üzerinden; yani çip "seçilen kalite" diyor, "ölçülen kalite" demiyor                                         |
| **S8** | **Ses kanalı içindeki katılımcı kenar çubuğu silindi.**                                                                  | §5'te böyle bir sütun **yok**; §4.2 (`Bu kanalda` / `Kanalda değil` / `Davet et → Gönderildi`) sağ panelin işi ve Ş5 onu yazdı. İki liste, iki gerçek üretirdi. Davet **gönderimi** panele ait; davet **hatası** hâlâ burada gösteriliyor (kod → cümle eşlemesi değişmedi) |
| **S9** | **`4 katılımcı · 12 dakikadır bağlı` süresi istemcide ölçülüyor.**                                                       | Sağlayıcı bir "bağlandı" damgası taşımıyor ve K5 gereği `lib/voice/*` değişmedi. Damga sunum katmanında; alan dakika olduğu için saat 30 saniyede bir tazeleniyor. Oda düşerse süre yazılmıyor                                                                             |

Renk sapması **yok**: yeni hex, yeni `rgb()`, yeni tema sınıfı üretilmedi
(`lib/servers/token-audit.test.ts` kapsamı `components/voice/server`i içeriyor).

---

## 5. TODO(api)

| #   | Ne eksik                                                                        | Bugün ne oluyor                                                                                                                       | Kimde                   |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | **Odanın RTT'si** — `getStats().roundTripTime` deponun hiçbir yerinde okunmuyor | Gecikme çipi yalnız kaliteyi yazıyor; `latency.ms` `null`. Sayı geldiği gün tek değişecek şey prop'un dolması                         | Ş4 açtı, açık           |
| 2   | **Gerçek yayın çözünürlüğü/fps'i**                                              | `1080p · 30 fps` seçilen ön ayardan (sapma S7)                                                                                        | Açık                    |
| 3   | **Ses kanalında zaman aşımı uygulanmıyor** (Ş2 TODO 1)                          | Zaman aşımlı üye metin gönderemiyor ama sesli kanalda mikrofonunu açabiliyor. Sunum katmanı bunu düzeltemez; kapı ses katılım yolunda | Açık — sunucu tarafı    |
| 4   | **Sunucu genelinde konuşma/susturulma durumu** (Ş4 TODO 2)                      | Bağlı olunmayan kanalın kartı çizilemiyor; bu şerit yalnız **bağlı** odanın ızgarasını çiziyor                                        | Açık — soket sözleşmesi |

---

## 6. Doğrulama çıktısı

```
pnpm --filter @wizards/types test      529 pass · 0 fail
pnpm --filter @wizards/db test         146 pass · 0 fail
pnpm --filter @wizards/web typecheck   exit 0
pnpm --filter @wizards/web lint        exit 0
pnpm --filter @wizards/web test        7141 pass · 0 fail · 3 skipped
```

Şeridin kendi testleri: `server-voice-surface.test.tsx` **32**,
`voice-presentation.test.ts` **17**. K5 regresyon kapısı **41** (§0).

Parity matrisinin **Ş7 satırı açıldı** (`server-voice-channel`), artı bir davranış testi
("kontrol çubuğu kapalı mikrofonu danger tonuna çevirir").

### Koşulamayan

- `e2e:a11y` ve `server-parity.spec.ts` — e2e ortamı yok (`E2E_TEST_PASSWORD` üretilmemiş,
  e2e veritabanı ayakta değil). Kod yazıldı, tarayıcıda sürülmedi.
- **Canlı LiveKit odası.** Ses yüzeyi gerçek bir SFU bağlantısı istiyor; kartların, dalganın
  ve sahnenin tarayıcıda görülmesi bu ortamda mümkün değil. Sunum katmanı SSR testleriyle
  kapsandı, kablolama K5 regresyon kapısıyla.

---

## 7. Kabul kriterleri

- [x] Izgara, kart, konuşma halkası, dalga, rozetler, `SEN` çipi SPEC ölçülerinde.
- [x] Kamera varyantı ve ekran paylaşımı sahnesi + şerit SPEC'teki gibi; akış yokken `<video>` yok.
- [x] Kontrol çubuğu 4 düğme + ayarlar + `Ayrıl`; kapalı mikrofon/hoparlör danger tonunda.
- [x] Başlık çipleri gerçek veriden: Krisp `krisp-quality.ts`ten, gecikmenin **sözcüğü**
      `ConnectionQuality`den; **sayısı** işaretli `TODO(api)` (sapma S2).
- [x] `prefers-reduced-motion` altında dalga duruyor; "konuşuyor" metni ekran okuyucuda var.
- [x] **Regresyon kapısı:** beş test dosyası yeşil (41 test).
- [x] `lib/voice/*` dosyalarında diff **yok** (§0).
- [x] Yeni hex yok; typecheck/lint/test yeşil; parity spec'in ses bölümü açıldı
      (koşusu e2e ortamına bağlı).

---

## 8. Sonraki şerit için notlar

1. **İki ses yüzeyi var ve bilerek ayrı.** `components/voice/server/` sunucu kanalının,
   `components/voice/room/` DM/grup çağrısının. Birine dokunan diğerini değiştirmez — ve
   değiştirmemeli.
2. **`lib/voice/*` hâlâ dokunulmadı.** Bir sonraki şerit oraya yazacaksa K5'in dört kayıtlı
   tuzağını (codec/bitrate, çerçeveleme, abonelik, SVC) yeniden doğrulamak zorunda.
3. **Dalga `globals.css`teki `wbar`'dan geliyor.** Süre ve gecikme sözlükten satır içi
   değişkenle (`--wbar-duration`, `--wbar-delay`); bileşen kendi süresini yazmıyor.
4. **Gecikme çipi iki parçalı** (`ms` + `tier`). RTT alanı geldiğinde `ms` doldurulur, çip
   kendiliğinden `32 ms · iyi` yazar; başka bir değişiklik gerekmez.
5. **Kolon sayısı katılımcı sayısından türüyor.** Bir "Tweaks" yüzeyi açılırsa
   `selectVoiceGridColumns` tercihi okuyacak tek yerdir.
