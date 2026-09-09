# Ş8 — Ortak parçalar + kategori ve kanal pencereleri (Dalga 4)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §6 (ortak kabuk), §6.1, §6.2.
> Bağımlılık: **Ş0**, Ş4. Paralel: Ş9, Ş10. **Ş9, Ş10, Ş11–Ş13 bu şeridin parçalarını kullanır.**

---

## Görev

Üç işi tek şeritte bitir: katman yığını, dört paylaşılan parça, iki pencere.

---

## 1. `useLayerStack` (K11)

`apps/web/src/lib/servers/layer-stack.ts` + hook:

- Katmanlar: `popover (60)` · `settings (70)` · `modal (80)`.
- Aynı anda **tek** açılır/panel/pencere; yeni açılan öncekini kapatır.
- Ayarlar açıkken pencere açılırsa ayarlar **kapanmaz**, üstüne çizilir; pencere kapanınca ayarlara
  dönülür.
- `Esc` **en üstteki** katmanı kapatır.
- Focus tuzağı + kapanışta tetikleyiciye dönüş bu hook üzerinden standartlaşır.
- Saf mantık kısmı birim testli (yığın sırası, Esc davranışı).

## 2. Paylaşılan parçalar — `components/servers/shared/`

| Bileşen               | SPEC                               | Not                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ToggleRow`           | §6.4, §7.6, §8.2, §8.3, §8.5, §8.6 | `12px 14px`, `r14`, `surface-base`; anahtar 38×21 knob 15; `role="switch"` + `aria-checked`; `disabled` durumunda `aria-disabled` + neden metni                                                                                                                                           |
| `OptionChipGroup`     | §6.2, §7.7, §8.3, §8.7             | Çip `6px 10px` `r9`; başlıkta seçili değerin primary çipi; ok tuşlarıyla gezinir; tek seçim                                                                                                                                                                                               |
| `DiscoveryTagPicker`  | §7.5, §8.2                         | **Tek bileşen**, iki yerde kullanılır (PROMPT §3). `0/5` sayacı (5'te warning), seçili çipler `×` ile silinir, `Etiket yaz, Enter'a bas` alanı, `ÖNERİLEN ETİKETLER` + 5 grup (`31 r10` kod rozeti). Etiketler Ş0'ın `discovery-tag-groups.ts` dosyasından; slug kuralı `ServerTagSchema` |
| `PermissionGroupCard` | §8.5                               | Başlıkta `seçili/toplam` (tamamı seçiliyse primary); her satırda 38×21 anahtar; `yalnızca sahip` çipli satır sahip dışına **render edilmez**                                                                                                                                              |

- Mevcut `server-tags-editor.tsx` (115 satır) `DiscoveryTagPicker`'a **taşınır**; iki editör kalmaz.
- Hepsi `SERVER_METRICS`'ten ölçü okur, kendi sayısını yazmaz.

## 3. Pencere kabuğu (§6 ortak)

`components/servers/modals/server-modal-shell.tsx`:

- Kaplama `inset:0`, `z-index 80`, `padding 34`, `background: hsl(var(--background)/.72)`, ortalanmış.
- Kart `r22`, `surface-card`, `1px border`, `box-shadow: 0 48px 96px -40px`.
- Başlık bloğu `20px 22px 16px`: `38 r13` ikon kutusu, başlık `600 19px Outfit`,
  alt satır `13px` secondary, sağda `30 r10` kapatma.
- Ayak `14px 22px`, üst kenar `border/.5`, zemin `surface-secondary/.5`;
  birincil düğme h40 `r13`, ikincil çerçeveli.
- Pasif düğme: `surface-tertiary` zemin, `text-muted` metin, `cursor:not-allowed`, gölge yok.
- Genişlik `SERVER_METRICS.modalWidths`'ten gelir.
- Mevcut `ui/modal.tsx` sarılır; ikinci bir modal altyapısı yazılmaz.

## 4. Kategori oluştur — 560 (§6.1)

- `KATEGORİ ADI` + `Zorunlu` çipi + sağda `0/48` sayacı (40'ı geçince warning).
- Input `12px 14px`, `r13`; doluyken çerçeve `primary/.5`.
- İpucu: "En fazla 48 karakter. Kenar çubuğunda büyük harfle görünür."
- `KENAR ÇUBUĞUNDA` **canlı önizleme**: `surface-panel` kart içinde caret + büyük harfe çevrilmiş ad
  (boşken `YENİ KATEGORİ`) + `+` ikonu, altında kesikli çerçeveli
  "Henüz kanal yok — sonra ekleyebilirsin".
- Bilgi notu: "Kategori düzeyinde izin veya açıklama yok. İzinler kanal bazında ayarlanır."
- Ayak: `İptal` · `Kategori oluştur` (ad boşken pasif).
- Uç: mevcut `POST /servers/[serverId]/categories` (`CreateCategorySchema`).

## 5. Kanal oluştur — 660, dört adım (§6.2)

Her adım başlığı `19 r7 primary/.16` rakam kutusu + `600 10px Outfit .15em uppercase` etiket.

**1 · Kanal türü** — iki kart yan yana `9px 11px` `r13` `1.5px` çerçeve, ikon `27 r9`,
başlık `600 12.5px`, açıklama `10.5px` **tek satır** (ellipsis). Seçili: primary çerçeve +
`primary/.08` zemin + sağda `19px` primary tik.
`Yazı kanalı` — "Mesaj, dosya ve bağlantı paylaşımı." · `Sesli kanal` — "Anlık ses, video ve ekran paylaşımı."

**2 · Temel bilgiler** — `KANAL ADI` + `Zorunlu` + `0/48`; yazı kanalında `#` öneki ve ipucu
"Boşluklar yazı kanallarında tireye dönüşür."; ses kanalında önek yok, ipucu "Sesli kanallarda
boşluk ve büyük harf kullanılabilir." · `KONU / AÇIKLAMA` + `İsteğe bağlı` + `0/120` ·
`KATEGORİ` çipleri (`Kategorisiz` + sunucunun kategorileri).

**3 · Erişim** — başlıkta `Yalnızca yönetici` çipi (danger). Dört seçenek `11px 13px` `r14`
`1.5px` çerçeve, ikon `30 r10`, sağda 17px radyo; `WorkspaceChannelPermissionPreset` ile birebir:

| Seçenek             | Preset           | Açıklama                                   |
| ------------------- | ---------------- | ------------------------------------------ |
| Herkese açık        | `PUBLIC`         | Herkes görür ve kullanır.                  |
| Kilitli ama görünür | `LOCKED_VISIBLE` | Herkes görür, kullanmak için izin gerekir. |
| Gizli / özel        | `PRIVATE`        | Normal üyeler göremez.                     |
| Role bağlı          | `ROLE_GATED`     | Yalnızca seçilen roller görür ve kullanır. |

`Role bağlı` seçilince altında rol satırı: `Roller:` + rol çipleri + kesikli `+ Rol ekle`.
Bu adım **yalnız yönetici/sahip** için render edilir (00 §5).

**4 · Gelişmiş / Sesli kanal ayarları** — her ayar bir kart `12px 13px` `r14` `surface-base`
`1px border/.7`; başlıkta ikon + ad, sağda seçili değerin primary çipi, altında `OptionChipGroup`
ve açıklama.

- Yazı: `Yavaş mod` 12 seçenek (`CHANNEL_SLOW_MODE_DELAYS`).
- Ses: `Ses bitrate'i` 32/64/96/128 kbps (varsayılan **64**) · `Kullanıcı limiti` 0–10
  (varsayılan 0, çipte `10 kişi (varsayılan)`) · `RTC bölgesi` Otomatik · İstanbul · Frankfurt ·
  Amsterdam · Londra · New York · `Video kalitesi` `Otomatik — önerilen` / `Tam kalite`.
  Bölge listesi `availableRtcRegions` varsa ondan; yoksa SPEC listesi + `TODO(api):`.
- Mevcut `channel-advanced-settings.tsx` + `channel-form-model.ts` **buraya taşınır**, yeniden yazılmaz.

**Ayak canlı özeti:** ad boşken warning "Devam etmek için bir kanal adı gir."; doluyken yazı
kanalında `#slug · KATEGORİ`, ses kanalında `Sesli kanal KATEGORİ altında oluşturulacak.`

Uç: mevcut `POST /servers/[serverId]/channels` (`CreateChannelSchema`) + izin ayarı.

## 6. `workspace-modals.tsx`

- Yönlendiriciye iner: hangi pencere açık, hangisini çiz. Form gövdeleri yeni dosyalara taşınır.
- Mevcut store eylemleri (`categoryModal`, `channelModal`, …) **korunur**; `edit` kipi de çalışmaya
  devam eder (kanal/kategori düzenleme aynı pencereden).

---

## Sınırlar

- Davet/bildirim/etkinlik pencereleri Ş9'da, sunucu oluşturma Ş10'da.
- Yeni modal altyapısı, yeni z-index sabiti üretilmez.
- Yeni kanal ucu yazılmaz.

---

## Kabul kriterleri

- [ ] `useLayerStack` üç katmanı yönetiyor; ayarlar üstünde pencere açılıp kapanınca ayarlara dönülüyor; `Esc` en üstteki katmanı kapatıyor (testli).
- [ ] Dört paylaşılan parça SPEC ölçülerinde, a11y rolleriyle, `SERVER_METRICS`'ten besleniyor.
- [ ] `DiscoveryTagPicker` tek bileşen; eski `server-tags-editor.tsx` kalmadı.
- [ ] Kategori penceresi: canlı önizleme, `0/48` sayacı, %85 warning, pasif buton.
- [ ] Kanal penceresi 4 adım; tür kartları tek satır açıklamalı; `Erişim` başlığında
      `Yalnızca yönetici` çipi; üye rolünde 3. adım render edilmiyor.
- [ ] Ses ayarlarının dört grubu **tıklanabilir** ve seçim başlıktaki çipe yansıyor.
- [ ] Ayak özeti üç durumda da doğru; slug türetme testli.
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s8-ortak-parcalar.md`
