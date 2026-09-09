# Dalga 2 · Ş6 — Satır motoru: grup, satır, 13 kontrol, açılır menü yönü

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5.

**Bu şerit paketin belkemiğidir.** 170 satırın tamamı buradan doğar; atlanıp elle markup yazmak
işi ikiye katlar (PROMPT "Çalışma sırası" §2). Ş7–Ş10 bu motoru **tüketir**, genişletmez.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/rows/settings-group.tsx` (yeni)
- `apps/web/src/components/settings/rows/settings-row.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-toggle.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-select.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-segment.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-slider.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-input.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-textarea.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-actions.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-risky-block.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-sound-row.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-jump.tsx` + `setting-nav.tsx` (yeni)
- `apps/web/src/components/settings/rows/setting-custom-block.tsx` (yeni — blok kayıt defteri)
- `apps/web/src/components/settings/rows/render-settings-tab.tsx` (yeni — ağaçtan sekme çizen tek fonksiyon)
- `apps/web/src/lib/settings/menu-placement.ts` (yeni — yön hesabı) + `.test.ts`
- `apps/web/src/lib/settings/use-setting-value.ts` (yeni — okuma/yazma köprüsü) + `.test.ts`
- Her bileşen için `.test.tsx`

**Okunur, yazılmaz:** `lib/settings/{tree,metrics}.ts`, `components/ui/*`.

---

## İş

### 1. `SettingsGroup`

```
başlık (600 13px display) + yanında not (500 11px muted) → 9px boşluk
kap: radius 16 · border 1px H(border,.65) · H(surface-card) · position relative
```

- Başlık **isteğe bağlı** (sapma #8) — hero grubu ve Hakkında'nın ilk grubu etiketsiz.
- Kapta **`overflow:hidden` YASAK** (tuzak #6). Yalnız `SettingCustomBlock` `fullWidth`
  bayrağıyla kendi içinde kırpar.
- Satır arası ayırıcı: satırın **üst** kenarı `1px H(border,.45)`, ilk satırda `0`.

### 2. `SettingsRow`

```
padding 13px 15px
sol: başlık 600 12.5px + isteğe bağlı pil + açıklama 11.5px muted (max-width 400)
sağ: kontrol yuvası
```

**Tek kontrol ekseni** (PROMPT §3): her satırın kontrolü sağda aynı hizada biter (1081 px).
Açıklama **kontrol yuvasının dışında**, solda; asla etiketle kontrol arasına sıkışmaz.

Satır `<div role="group">`; başlık ve açıklama `id` taşır, kontrol `aria-labelledby` +
`aria-describedby` ile bağlanır.

`<720px`: kontrol satırın altına iner (etiket üstte, kontrol altta) — CSS ile, JS ile değil.

### 3. Kontroller

| Bileşen                | Geometri                                                             | ARIA / klavye                                                                      |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SettingToggle`        | 38×22, topuz 16; açık `H(primary)`, kapalı `H(surface-tertiary)`     | `role="switch" aria-checked`; `Space`/`Enter`                                      |
| `SettingToggle locked` | açık + `cursor:not-allowed` + `opacity:.55` + `Kilitli` pili         | `aria-disabled` + `aria-describedby` açıklama                                      |
| `SettingSelect`        | 210×34 düğme `radius:10`; menü `radius:12`, max 222 px, seçilide tik | `aria-expanded`, `role="listbox"`/`option`, `↑/↓`, `Enter`, `Esc`, **tip-ahead**   |
| `SettingSegment`       | `H(surface-secondary)` kap, aktif `H(primary)`/`#fff`                | `role="radiogroup"`, `←/→`                                                         |
| `SettingSlider`        | − / ray / + / değer, 220 px blok                                     | `role="slider"` + `aria-valuemin/max/now/text`; `←/→`, `Home`/`End`, `PageUp/Down` |
| `SettingInput`         | 260 px `radius:10`, isteğe bağlı `@` öneki                           | gerçek `<input>`; önek `aria-hidden`, değere dahil değil                           |
| `SettingTextarea`      | tam genişlik + sağ altta `75 / 190` sayacı                           | sayaç `aria-live="polite"`, sınırda `aria-invalid`                                 |
| `SettingActions`       | 1–3 düğme `height:32`; ilki `primary` ya da `danger`                 | gerçek `<button>`                                                                  |
| `SettingRiskyBlock`    | satır altında açılır blok                                            | `aria-expanded` + `aria-controls`; **aynı anda tek blok**                          |
| `SettingSoundRow`      | anahtar + profil segmenti + seviye + `Önizle`                        | üç kontrol ayrı ayrı etiketli                                                      |
| `SettingJump`          | düğme, başka sekmeye geçirir                                         | `<button>`; hedef `tree.ts`'ten                                                    |
| `SettingNav`           | dış hedefe götürür                                                   | `<a>` ya da `<button>`                                                             |
| `SettingCustomBlock`   | blok kayıt defterinden çözülür                                       | bloğun kendi sözleşmesi                                                            |

**Kontrol seçimi anlama göre** (PROMPT §4) — bu kural `tree.ts`'te zaten kodlanmış;
motor `type` alanına uyar, kendi kararını vermez.

**Düğme kümeleri yasak.** `SettingActions` en çok 3 düğme alır ve **kendi satırında** durur;
"E-posta işlemleri" gibi uydurma toplayıcı satır üretilmez.

### 4. Açılır menü yönü (tuzak #6)

`lib/settings/menu-placement.ts`:

```ts
export function resolveMenuPlacement(input: {
  triggerBottom: number;
  triggerTop: number;
  scrollAreaBottom: number;
  scrollAreaTop: number;
  menuHeight: number; // en çok 222
  threshold?: number; // varsayılan 236
}): { direction: "down" | "up"; maxHeight: number };
```

Tıklama anında ölçülür (`getBoundingClientRect`), render sırasında değil.
Alternatif olarak menü `position:fixed` ile tetikleyiciye çıpalanır — hangisi seçilirse
seçilsin **kırpılmama** ölçülebilir olmalı: ilk ve son seçenek kaydırma alanı içinde.

Kaydırma sırasında açık menü **kapanır** (yeniden konumlandırma yerine); `scroll` dinleyicisi
`passive`.

### 5. Değer köprüsü

`use-setting-value.ts` satır anahtarını okuma/yazma yoluna bağlar:

```ts
export function useSettingValue<T>(key: string): {
  value: T;
  setValue: (next: T) => void; // iyimser + kuyruklu PATCH
  status: "idle" | "saving" | "saved" | "error";
  locked: boolean;
};
```

- **Dokununca kaydeder** (PROMPT §7) — profil alanları hariç (onlar kirli bayrağı kurar).
- **Paylaşılan anahtarlar tek durumdur** (tuzak #4): `nd2`, `na5`, `na6`, `nq1`, `ns1` iki
  sekmede aynı `key` ile okunur; ikinci bir yerel state kurulmaz.
- Yazmalar **kuyruklanır** ve anahtar bazında son yazan kazanır; 250 ms içinde arka arkaya
  gelen yamalar tek PATCH'te birleştirilir (kaydırıcı sürüklerken 40 istek çıkmasın).
- Hata → `status: "error"`, değer **geri alınır**, kabuk `Kaydedilemedi` gösterir.
- `settings.updated` socket olayı geldiğinde değer sessizce hizalanır (kendi yazması değilse).

### 6. Ağaçtan çizim

```tsx
export function renderSettingsTab(section: SettingsSection, tab: SettingsTab): ReactNode;
```

`SETTINGS_TREE`'den grupları ve satırları çizer; `type` alanına göre kontrolü seçer.
**Bölüm şeritleri (Ş7–Ş10) elle satır markup'ı yazmaz** — yalnız özel blokları ve satır içi
riskli blok gövdelerini yazar.

### 7. Blok kayıt defteri

```ts
export const SETTINGS_BLOCKS: Record<SettingsBlockKey, ComponentType<SettingsBlockProps>>;
```

Ş6 defteri **boş yer tutucularla** kurar (her blok `SettingsSkeleton` çizer + `data-block` niteliği).
Ş7–Ş10 kendi bloklarını buraya kaydeder. Böylece bölüm şeritleri paralel çalışırken aynı dosyada
çakışmaz: her şerit **yalnız kendi anahtarlarının** satırını değiştirir.

---

## Kabul

- [ ] 13 kontrol tipi de var; her biri kendi testine sahip.
- [ ] Grup kabında `overflow:hidden` **yok** (kod taraması testi).
- [ ] Menü yön hesabı 236 px eşiğinde yön değiştiriyor; sınır testleri (235 / 236 / 237).
- [ ] Kaydırma sırasında açık menü kapanıyor.
- [ ] Tip-ahead çalışıyor: `Eu` yazınca `Europe/Istanbul` seçiliyor.
- [ ] Kaydırıcı `←/→`, `Home`/`End`, `PageUp/Down` ile çalışıyor ve `aria-valuetext` birim taşıyor.
- [ ] Kilitli anahtar `aria-disabled` + açıklama taşıyor, tıklamaya cevap vermiyor.
- [ ] Textarea sayacı `aria-live`; sınırı aşınca `aria-invalid`.
- [ ] `@` öneki değere dahil değil (`pu` anahtarı `dogukan` yazıyor, `@dogukan` değil).
- [ ] Aynı anda **tek** açılır menü ve **tek** riskli blok açık kalıyor.
- [ ] Paylaşılan anahtar iki farklı sekmede aynı değeri gösteriyor; birinde değişince diğeri
      anında hizalanıyor.
- [ ] Kaydırıcı sürüklemesi tek PATCH'e birleşiyor (istek sayacı testi).
- [ ] Yazma hatası değeri geri alıyor ve kabuğa `error` bildiriyor.
- [ ] `renderSettingsTab` 170 satırın hepsini hatasız çiziyor (ağaç üzerinden tarama testi).
- [ ] Tek kontrol ekseni: bir sekmedeki tüm kontrollerin sağ kenarı aynı (ölçüm testi).
- [ ] `<720px` kontroller satırın altına iniyor (CSS, JS değil).

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/07-s6-rapor.md`
