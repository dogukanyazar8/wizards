# Ş7 — Ses kanalı görsel yenileme (Dalga 3)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §5 (tamamı).
> Bağımlılık: **Ş0**, Ş4. Paralel: Ş6. Karar: **K5** — kablolama korunur, yalnız sunum yenilenir.

---

## Görev

`voice-channel-view.tsx` ve `voice/room/voice-room-primitives.tsx`'in **sunum katmanını** SPEC §5'e
göre yeniden çiz. LiveKit bağlantısı, katılımcı eşleme, cihaz seçimi, ekran paylaşımı ve abonelik
mantığı **aynen kalır**.

**Dokunulmayacak mantık:** `lib/voice/{participant-view-model, video-quality, video-subscription,
screen-share, krisp-quality, media-capabilities, use-voice-audio-levels}.ts`. Bu dosyalar okunur,
değiştirilmez. Değişmesi gerekiyorsa **önce rapora yaz, sonra sor.**

---

## 1. Başlık (§5.1)

- Hoparlör ikonu 20 (success), ad, kategori çipi.
- Alt satır duruma göre:
  `N katılımcı · M dakikadır bağlı` / `K kamera açık · N katılımcı · M dk` /
  `<ad> ekran paylaşıyor · N katılımcı · M dk`.
- Sağda `Krisp aktif` çipi (success, `krisp-quality.ts`'ten gerçek durum),
  `<ms> · <kalite>` gecikme çipi (4 çubuklu gösterge), `1×22` ayraç, `Üyeler` düğmesi.
- Gecikme ve kalite değeri mevcut ses istatistiklerinden; yoksa `TODO(api):`.

## 2. Katılımcı ızgarası (§5.2)

- `padding: 18px 20px 4px`, `grid`, `gap 12`, kolon sayısı **2/3/4**, varsayılan 3
  (mevcut düzen tercihi varsa ondan okunur).
- Kart: `aspect-ratio: 16/11`, `r20`, `2px` çerçeve, `surface-card`.
- Konuşan: çerçeve `success/.6`, `box-shadow: 0 0 0 4px success/.14, 0 20px 40px -30px`.
- Avatar 62 (`600 20px Outfit`), konuşanda `inset:-6px` success halka.
- Ad `600 13px` + rol rozeti (`Sunucu` primary, `Yönetici` danger).
- Konuşurken 4 çubuklu canlı dalga (`.9s`, çubuk başına `.15s` gecikme); konuşmuyorsa
  `Sessiz dinliyor` / `Mikrofon kapalı` / `Hoparlör kapalı` metni.
- Sağ üstte durum rozeti `26 r9 danger/.16`; sol üstte `SEN` çipi (primary).
- **A11y:** konuşma halkası tek ipucu olamaz — ekran okuyucu için "konuşuyor" metni;
  `prefers-reduced-motion` altında dalga durur. Dalga **yalnız aktif konuşmacıda** animasyonlu.

## 3. Kamera açık varyantı (§5.2)

- Kart zemini çapraz şeritli yer tutucu
  (`repeating-linear-gradient(135deg, surface-secondary 0 18px, surface-tertiary/.55 18px 36px)`),
  ortada kamera ikonu + `Kamera görüntüsü`, sol altta ad + dalga çipi.
- Gerçek akış varsa `ParticipantCameraVideo` çizilir; **akış yokken boş `<video>` mount edilmez**
  (PROMPT §11).

## 4. Ekran paylaşımı (§5.3)

- Üstte tek büyük sahne: `flex:1`, `r20`, `2px primary/.55`, çapraz şeritli yer tutucu,
  ortada `Ekran görüntüsü yer tutucusu · 1920×1080`.
- Sol üstte paylaşan avatarı + `<ad> ekranını paylaşıyor` + `CANLI` çipi (danger).
- Sağ üstte `1080p · 30 fps` çipi (gerçek çözünürlük/fps varsa ondan) ve tam ekran düğmesi 30.
- Altta yatay katılımcı şeridi: kart genişliği 162, `r14`, konuşanda success çerçeve + glow.

## 5. Kontrol çubuğu (§5.4)

- `padding: 14px 20px 18px`, ortalanmış, `gap 7`.
- Düğmeler h44 `r15`, `1px` çerçeve: **Mikrofon · Hoparlör · Ekran paylaş · Kamera**.
  Kapalı mikrofon/hoparlör `danger`, açık ekran paylaşımı/kamera `primary` tonuna geçer.
- Ardından `44×44` ayarlar düğmesi (`VoiceSettingsModal`), `1×28` ayraç ve `Ayrıl` düğmesi
  (danger dolgu, `box-shadow: 0 12px 26px -16px danger`).
- Her düğme `aria-pressed` taşır; ikon-only düğmelerde `aria-label`.

## 6. Boş durum

- Kimse yokken `VoiceEmptyState` SPEC diline hizalanır (kart ızgarası yerine tek blok).

---

## Sınırlar

- LiveKit çağrıları, abonelik, codec/bitrate seçimi, cihaz akışı **değişmez**.
- Ses odası (DM/grup çağrısı) yüzeyi bu şeritte **kapsam dışı** — yalnız sunucu ses kanalı.
- Yeni ses hook'u yazılmaz.

---

## Kabul kriterleri

- [ ] Izgara, kart, konuşma halkası, dalga, rozetler, `SEN` çipi SPEC ölçülerinde.
- [ ] Kamera varyantı ve ekran paylaşımı sahnesi + şerit SPEC'teki gibi; akış yokken `<video>` yok.
- [ ] Kontrol çubuğu 4 düğme + ayarlar + `Ayrıl`; kapalı mikrofon/hoparlör danger tonunda.
- [ ] Başlık çipleri (Krisp, gecikme) gerçek veriden veya işaretli adapterden.
- [ ] `prefers-reduced-motion` altında dalga duruyor; "konuşuyor" metni ekran okuyucuda var.
- [ ] **Regresyon kapısı:** `video-quality.test.ts`, `video-subscription.test.ts`,
      `screen-share.test.ts`, `participant-view-model.test.ts`, `krisp-quality.test.ts` yeşil.
- [ ] `lib/voice/*` dosyalarında diff **yok** (varsa raporda gerekçeli ve onaylı).
- [ ] Yeni hex yok; typecheck/lint/test yeşil; parity spec'in ses bölümü açıldı.

## Rapor

`raporlar/s7-ses-kanali.md` — `lib/voice/*` dosyalarına dokunulup dokunulmadığı açıkça yazılır.
