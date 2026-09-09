# Ş8 — Ortak parçalar + kategori ve kanal pencereleri (Dalga 4)

> Dal: `uat` · Kaynak: `design_handoff/design_handoff_sunucu/` (otorite: `Sunucu.dc.html` inline
> `style` > `Sunucu-referans.html` > `SPEC-SUNUCU.md` > `PROMPT.md`)
> Bağımlılık: Ş0 (sözlük + sözleşme) · Paralel koşanlar: Ş9, Ş10

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                      | Satır | İş                                                                                                |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `lib/servers/layer-stack.ts`                               | 99    | K11'in **saf** yığın mantığı: `popover 60 / settings 70 / modal 80`, açma/kapama kuralları, `Esc` |
| `lib/servers/layer-stack.test.ts`                          | 137   | 14 test — yığın sırası, ayarların üstündeki pencere, `Esc`                                        |
| `lib/servers/use-layer-stack.ts`                           | 157   | Kanca: modül düzeyinde tek yığın (`useSyncExternalStore`) + **tek** `Esc` dinleyicisi             |
| `lib/servers/modal-form-model.ts`                          | 54    | Saf kararlar: sayaç eşiği, kategori önizlemesi, kanal slug'ı, ayak özeti                          |
| `lib/servers/modal-form-model.test.ts`                     | 75    | 12 test — %85 eşiği, `tr-TR` büyük/küçük harf, üç özet dalı                                       |
| `components/servers/shared/toggle-row.tsx`                 | 206   | `ToggleRow` + tek `ServerToggleSwitch` (iki boy)                                                  |
| `components/servers/shared/option-chip-group.tsx`          | 358   | `OptionChipGroup` (Ş10 `advanced` varyantını ekledi)                                              |
| `components/servers/shared/discovery-tag-picker.tsx`       | 414   | `DiscoveryTagPicker` — **tek** bileşen, iki varyant                                               |
| `components/servers/shared/permission-group-card.tsx`      | 215   | `PermissionGroupCard` (§8.5)                                                                      |
| `components/servers/shared/typography.ts`                  | 16    | `DISPLAY_FONT` · `DISPLAY_TRACKING` (`--w-display` / `--w-track` karşılıkları)                    |
| `components/servers/shared/shared-parts.test.tsx`          | 275   | 17 test — dört parçanın ölçü, a11y ve yetki kapısı                                                |
| `components/servers/modals/create-category-modal.tsx`      | 361   | Kategori penceresi (560) + kabuksuz `…View`                                                       |
| `components/servers/modals/create-category-modal.test.tsx` | 77    | 8 test — sayaç, canlı önizleme, SPEC metinleri                                                    |
| `components/servers/modals/create-channel-modal.tsx`       | 1036  | Kanal penceresi (660, dört adım) + kabuksuz `…View`                                               |
| `components/servers/modals/create-channel-modal.test.tsx`  | 230   | 17 test — dört adım, yetki kapısı, adım numaraları                                                |

### Taşınan dosyalar (yeniden yazılmadı)

| Eski                                                  | Yeni                                                      | Not                                                     |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `components/shell/channel-form-model.ts`              | `components/servers/modals/channel-form-model.ts`         | `git mv`, **içerik aynen**                              |
| `components/shell/channel-form-model.test.ts`         | `components/servers/modals/channel-form-model.test.ts`    | `git mv`, aynen                                         |
| `components/shell/channel-advanced-settings.tsx`      | `components/servers/modals/channel-advanced-settings.tsx` | `git mv` + **yalnız sunum** yenilendi (aşağıda)         |
| `components/shell/channel-advanced-settings.test.tsx` | `components/servers/modals/…`                             | `git mv` + çip diline uyarlandı, 2 test eklendi         |
| `components/servers/server-tags-editor.tsx`           | —                                                         | **Silindi**; `DiscoveryTagPicker`'a taşındı (PROMPT §3) |

`channel-advanced-settings.tsx`'te korunan davranış: prop sözleşmesi
(`availableRtcRegions · channelType · onChange · value`), `userLimit` aralık denetimi,
`rtcRegion` beyaz listesi ve listede olmayan bölgenin **görünür** kalması. Değişen tek şey
`<details>` + dört `<select>` yerine SPEC §6.2'nin dört kartı.

### Ağır düzenlenen

| Dosya                                                    | Ne oldu                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/shell/workspace-modals.tsx`                  | 1112 → **746**. Kategori ve kanal gövdeleri yeni dosyalara taşındı; mağaza eylemleri (`categoryModal`, `channelModal`, `edit` kipi) **korundu** |
| `components/shell/server-settings-overlay.tsx`           | `ServerTagsEditor` → `DiscoveryTagPicker`; kaplama `z-[95]` → `useLayerStack` (K11)                                                             |
| `components/servers/modals/server-modal-shell.tsx`       | Ş9 yazmıştı; katman yığınına bağlandı, `--w-track` → `DISPLAY_TRACKING`, kapatma ikonu sözlüğe                                                  |
| `components/servers/modals/modal-focus-contract.test.ts` | İki pencerem listeye girdi + **yeni** K11 katman sözleşmesi bloğu (2 test)                                                                      |
| `lib/servers/metrics.ts`                                 | Aşağıdaki sözlük değişikliği                                                                                                                    |
| `lib/servers/parity.test.ts`                             | 4 yeni blok (paylaşılan parçalar) + kategori önizlemesi + taşınan anahtarların referansları                                                     |
| `lib/locale/messages/{tr,en}.ts`                         | **+92** anahtar (`server.*`), iki dilde eşit                                                                                                    |
| `eslint.config.mjs`                                      | `components/servers/{modals,shared}/**` ve `lib/servers/**` arbitrary-px kuralına alındı                                                        |
| `e2e/specs/smoke/server.spec.ts`                         | "channel advanced settings persist…" testi çip diline yeniden yazıldı                                                                           |

### Sözlük (`SERVER_METRICS`) değişikliği

**Eklenen gruplar**

- `toggleRow` — §7.6'nın satırı kanonik hâle geldi; **iki** anahtar boyu (`40×22 knob 16` ve
  §8.5'in `38×21 knob 15`). Knob'un açık hâldeki yeri `width − knobSize − knobInset` ile
  **türetilir**, sözlüğe ikinci kez yazılmaz.
- `discoveryTagPicker` — `shared` / `settings` / `create`. Ortak ölçüler bir kez; iki yüzeyin
  gerçekten ayrıştığı yerler (kart zemini/yarıçapı, başlık dili, rozet `31 ↔ 29`) ayrı.

**Taşınan (silinip yeni gruba giren) anahtarlar**

- `createServer.{togglesGap, toggleRow*, toggle*, switch*}` → `toggleRow.*`
- `createServer.{tag*, suggestion*}` → `discoveryTagPicker.{shared,create}`
- `settingsSections.discovery*` (kart ölçüleri) → `discoveryTagPicker.settings`
  (`discoveryCardMarginTop` bölüm yerleşimi olduğu için kaldı)
- `settingsSections.{visibilitySwitch*, rolesMentionSwitch*, rolesPermissionSwitch*}` → silindi,
  hepsi `toggleRow.{switch*, compactSwitch*}` (aynı sayı üç yerde yazılıydı)

**Eklenen tekil ölçüler** (hepsi referansın inline `style`'ından):
`modal.{iconBoxGlyphSize 19, closeGlyphSize 15, noteIconSize 15, noteIconMarginTop 1,
requiredBadgeBackgroundAlpha .14}` · `categoryModal.{previewCaretSize 12, previewAddGlyphSize 12}` ·
`channelWizard.{nameLabelMarginTop 11, topicInputPaddingY 11, topicInputFontSize 13.5,
adminChipBackgroundAlpha .12, kindIconGlyphSize 16, kindCheckGlyphSize 12, accessIconGlyphSize 16,
accessRadioCheckGlyphSize 11, settingIconGlyphSize 15}` ·
`settingsSections.{contentCardBorderAlpha .6, contentHeadGap 9, contentTitleLineHeight 1.2,
contentValueChipBackgroundAlpha .14, rolesGroupBorderAlpha .6, rolesOwnerChipBackgroundAlpha .12}`

---

## 2. SPEC'ten sapmalar

### S1 — `ToggleRow`'un anahtarı 38×21 değil, 40×22

Şerit dosyası §2'nin tablosu `ToggleRow` için "anahtar 38×21 knob 15" diyor. Referans HTML
bunu doğrulamıyor: `12px 14px` `r14` `surface-base` satırının anahtarı **`40×22` knob `16`**
(`Sunucu.dc.html`, §7.6'nın üç satırı). `38×21` yalnız §8.5'in yetki satırında ve §4.3'ün
thread anahtarında geçiyor — sözlüğün kendi `SPEC_DEVIATIONS` başlığı da bunu zaten kaydetmiş.

Çözüm: `ToggleRow` iki boyu da taşır (`size="default" | "compact"`), varsayılan `40×22`.
`PermissionGroupCard` `compact` kullanır. Tek anahtar uygulaması kaldı — iki uygulama iki ayrı
`aria` davranışı demekti.

### S2 — `Erişim` gizlendiğinde adım numaraları kayar

Referans hep dört adım çiziyor (`1 · 2 · 3 · 4`), ama 00 §5 `Erişim` adımını yalnız
yönetici/sahibe render ettiriyor. Sabit numaralar korunsaydı üye rolünde ekranda `1 · 2 · 4`
kalırdı. Numara bir **sıra** göstergesi olduğu için görünen adımlardan sayılıyor: üye `1 · 2 · 3`
görür. Testli (`create-channel-modal.test.tsx` → "adım numaraları görünen adımlardan sayılır").

### S3 — RTC bölgesi: SPEC'in beş şehri çizilmiyor

SPEC §6.2 `Otomatik · İstanbul · Frankfurt · Amsterdam · Londra · New York` veriyor. Şerit
dosyası "`availableRtcRegions` varsa ondan; yoksa SPEC listesi + `TODO(api):`" diyor.
**Uygulanmadı**, gerekçesi kodda okundu:

`apps/web/src/lib/livekit/rtc-regions.ts:57` — `resolveLiveKitRtcUrl` dağıtımın
`LIVEKIT_RTC_REGION_*` haritasında olmayan her bölge için
`ApiError("Requested RTC region is not available", 400, "RTC_REGION_UNAVAILABLE")` atıyor ve
`assertLiveKitRtcRegionAvailable` bunu hem kanal oluşturmada hem güncellemede çağırıyor
(`channel-service.ts:31`, `:195`).

Yani beş şehir sabit çizilseydi, uç onları tanımadığı sürece **her kaydetme denemesi 400
dönerdi** — K3'ün kaldırdığı kesikli "yakında" çipinden beter, çalışıyormuş gibi duran bir çip.
Bunun yerine: liste dağıtımın yayımladığı anahtarlardan kurulur, anahtar yoksa yalnız
`Otomatik` çizilir ve **nedeni yazılır** (`server.channel.rtcRegion.unavailable`). Kayıtlı ama
artık yayımlanmayan bir bölge çipte kalır ve `channel-rtc-region-error` ile işaretlenir.

### S4 — `Role bağlı` satırındaki kesikli `+ Rol ekle` çipi yok

SPEC §6.2 rol satırına `Yönetici` · `Ekip` çipleri + kesikli `+ Rol ekle` koyuyor. Üründe rol
oluşturma sunucu ayarlarında (§8.5) yaşıyor; penceredeki `+ Rol ekle` hiçbir yere açılmazdı.
Bunun yerine sunucunun **bütün** atanabilir rolleri çip olarak çizilir (seçili primary, seçilmemiş
nötr) — eklenecek bir şey kalmıyor. Rol yoksa `Bu sunucuda atanabilir rol yok.` yazar.

### S5 — Kategori penceresinin "oluşturuldu" kartı kaldırıldı

Eski pencere kaydettikten sonra 1100 ms yeşil bir onay kartı gösterip kapanıyordu. SPEC §6.1'de
böyle bir blok yok — pencere kaydedip kapanır. Kart ve zamanlayıcı silindi
(`workspace.modal.category{Ready,Created,Updated}` anahtarları artık kullanılmıyor; `serverSettings.*`
ile birlikte Ş11–Ş13'te temizlenecekler).

### S6 — Sunucu ayarları kaplaması `z-[95]` → `70`

K11'in gereği. Kaplama `z-[95]` iken **her** pencerenin üstünde kalıyordu: ayarlardan açılan
kategori/kanal penceresi ekranda hiç görünmüyordu. Artık `useLayerStack`'ten okuyor.

**Ş14'e not:** uygulamanın geri kalanının `z-index` merdiveni SPEC'in `60/70/80`'inden yüksek
(`toast 95`, `settings-window 90`, `user-profile-popover 90/91`, `context-menu 90`,
`command-palette 85`). İki merdiven bir arada yaşıyor. Sunucu ekranı kendi içinde tutarlı
(`popover < settings < modal`), ama sunucu ayarları artık uygulama düzeyindeki bu yüzeylerin
**altında**. Pratikte çakışan bir senaryo bulunamadı (hepsi ayarların içinden değil, arkasındaki
sohbetten açılıyor); yine de iki merdivenin tek merdivene indirilmesi Ş14'ün token/katman
denetimine ait.

Sapma yok denecek diğer her şey (ölçüler, metinler, renk tokenları) referansla birebir.

---

## 3. TODO(api)

| #   | Konu                      | Durum                                                                                                                                                                                                                                                                |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **RTC bölge listesi**     | Dağıtım `LIVEKIT_RTC_REGION_*` yayımlamıyorsa yalnız `Otomatik` çizilir. Uç şehir listesini yayımladığında burada değişecek tek şey `server.channel.rtcRegion.<KEY>` çevirileridir — bileşende kod değişmez. Kaynak: `channel-advanced-settings.tsx` dosya başı notu |
| 2   | **`Geçmişi oku` yetkisi** | `PermissionGroupCard` bu satırı `alwaysOn` çiziyor (kapatılamaz, sayaca dâhil). Gerçek bir bit isteniyorsa karar **Ş12'nin** — `permission-groups.ts` üç seçeneği ve bedellerini yazıyor                                                                             |

Mock kalmadı: dört paylaşılan parça da gerçek veriye bağlı, iki pencere de mevcut uçlara
(`POST /servers/[serverId]/categories`, `POST /servers/[serverId]/channels` + izin ayarı) yazıyor.

---

## 4. Doğrulama çıktısı

```
pnpm --filter @wizards/types test     →  529 tests, 0 fail
pnpm --filter @wizards/db test        →  146 tests, 0 fail
pnpm --filter @wizards/web typecheck  →  EXIT=0
pnpm --filter @wizards/web lint       →  0 error (config testleri 10/10)
pnpm --filter @wizards/web test       →  6699 tests, 6696 pass, 0 fail, 3 skipped
```

Ş8'in eklediği testler: `layer-stack` 14 · `modal-form-model` 12 · `shared-parts` 17 ·
`create-category-modal` 8 · `create-channel-modal` 17 · `channel-advanced-settings` +2 ·
`modal-focus-contract` +4 · `parity` +5 = **79**.

Yeni hex araması temiz:

```
rg "#[0-9a-fA-F]{3,8}" components/servers/{shared,modals}/… lib/servers/{layer-stack,use-layer-stack,modal-form-model}.ts
→ 0 eşleşme
```

**Koşulamayan:** `pnpm --filter @wizards/web e2e:a11y` ve
`playwright test e2e/specs/design/server-parity.spec.ts` — e2e ortamı (DB + çalışan sunucu) bu
oturumda yok. `e2e/specs/smoke/server.spec.ts`'in "channel advanced settings persist…" testi yeni
çip diline **yeniden yazıldı** ve tipten geçiyor, ama tarayıcıda sürülmedi.

---

## 5. Sonraki şerit için not

1. **Katman yığını tek kaynak.** `useLayerStack({ id, kind, onClose, open })` çağır ve `zIndex`'i
   ondan al. `z-[70]`/`z-[80]` yazma — `modal-focus-contract.test.ts` bunu artık denetliyor.
   Ayarlar açıkken pencere açmak ayarları **kapatmaz**; `Esc` yalnız en üsttekini kapatır.
2. **Pencere kabuğu Ş9'undu, Ş8'e ait.** `ServerModalShell` genişliği `SERVER_METRICS.modalWidths`
   anahtarından alır; ikinci bir modal altyapısı yazma. Gövdeyi test edebilmek için pencereni
   `…ModalView` olarak da dışa aç: `ui/modal` hidrasyondan önce `null` döner ve `renderToStaticMarkup`
   kabukla birlikte hiçbir şey görmez.
3. **`ToggleRow`, `OptionChipGroup`, `DiscoveryTagPicker`, `PermissionGroupCard` hazır.**
   - `ToggleRow`: kapalı satır için `disabled` + `disabledReason` ver — `aria-disabled` ve
     görünür neden birlikte gelir (00 §8). `size="compact"` §8.5'in anahtarıdır.
   - `OptionChipGroup`: `variant="settings"` §8.3/§8.7 için; çip etiketiyle başlıktaki çip
     ayrışacaksa `valueLabel` kullan (`Kullanıcı limiti` örneği).
   - `DiscoveryTagPicker`: `variant="settings" | "create"`; metinleri `label`/`lead`/
     `suggestionsLabel` ile ezebilirsin, ölçü ezilmez.
   - `PermissionGroupCard`: `isOwner` **render kapısıdır**, pasifleştirme değil.
4. **Ş11 için (K4).** `server-settings-overlay.tsx` silinirken iki şey taşınmalı:
   `useLayerStack({ kind: "settings" })` kaydı ve `DiscoveryTagPicker variant="settings"` çağrısı.
   Bölümün geri kalanı için `server.settings.*` ağacı hazır; `serverSettings.*` hâlâ canlı.
5. **Ş12 için.** `server.settings.roles.groupCount` ve `server.settings.roles.permission.alwaysOn`
   eklendi. `PermissionGroupCard` `countGroupSelected`'ı okuyor — sayacı ikinci kez hesaplama.
6. **Sözlükte anahtar taşındı.** `createServer.switch*` / `createServer.tag*` / `suggestion*` ve
   `settingsSections.discovery*` / `*Switch*` artık **yok**. Yerleri: `SERVER_METRICS.toggleRow`
   ve `SERVER_METRICS.discoveryTagPicker`. Bunları bileşen üzerinden tüketirsen fark etmezsin.
7. **Paralel şeritlerle çakışma.** Ş10 ile aynı anda koştuk ve iki yerde temas ettik:
   `option-chip-group.tsx`'e `advanced` varyantını Ş10 ekledi (korundu);
   `server.discoveryTags.*` anahtarları iki kez yazıldı, ikinci kopya silindi
   (`create-server-modal.tsx`'te `active` → `disabled` tek satır düzeltildi).
