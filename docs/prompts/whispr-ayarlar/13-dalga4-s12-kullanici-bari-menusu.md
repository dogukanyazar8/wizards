# Dalga 4 · Ş12 — Kullanıcı barı menüsü (308 px) + Rahatsız Etmeyin

**Ön koşul:** Dalga 3 kapısı yeşil. **Paralel:** Ş11.

Referans kare: `screens/03-kullanici-menusu.png`. Otorite: SPEC §3, `.dc.html` `dndDurs` /
`devRows` / `meter` dizileri.

**Bu şerit kabuğa dokunan tek şerittir.** Diff `channel-sidebar.tsx` içinde yalnız `quick`
popover'ını değiştirmeli; avatar, durum satırı, mikrofon ve kulaklık butonları **aynen kalır**.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/shell/user-bar-menu.tsx` (yeni)
- `apps/web/src/components/shell/user-bar-dnd-card.tsx` (yeni)
- `apps/web/src/components/shell/user-bar-device-row.tsx` (yeni)
- `apps/web/src/components/shell/user-bar-input-meter.tsx` (yeni)
- `apps/web/src/components/shell/channel-sidebar.tsx` (**düzenlenir** — yalnız `quick` dalı)
- `apps/web/src/lib/presence/dnd.ts` (yeni — K8 süre sözleşmesi) + `.test.ts`
- `apps/web/src/hooks/use-presence-idle-timeout-preference.ts` (**düzenlenir** — K9 taşıması)
- Her biri için `.test.tsx`

**Okunur, yazılmaz:** `components/voice/audio-device-select.tsx`, `lib/settings/navigation.ts`,
`hooks/use-audio-devices.ts` (Ş8), `components/providers/focus-controls-provider.tsx`.

---

## İş

### 1. Kutu

```
position absolute · left 82px · bottom 14px · z-index 36
radius 20 · H(surface-card) · border 1px H(border) · box-shadow 0 32px 72px -30px H(shadow-color)
width 308
```

Kullanıcı barındaki dişli açıkken `H(surface-soft)` zemin + `H(foreground)` ikon.
`role="dialog"`, `Esc` kapatır, focus tetikleyiciye döner.

Mevcut popover'ın `data-testid="user-quick-menu"` niteliği ve dışarı tıklama / `Escape`
dinleyicileri **korunur** — testler ve `data-notification-popup` istisnası çalışmaya devam etmeli.

### 2. DURUM — Rahatsız Etmeyin (K8)

Kart: 32 px ikon + 40×23 anahtar.

| Durum  | Kart                                | İkon                                    | Anahtar               | Alt satır                    |
| ------ | ----------------------------------- | --------------------------------------- | --------------------- | ---------------------------- |
| Kapalı | `H(surface-soft,.5)` / kenar şeffaf | `H(surface-tertiary)` / `H(text-muted)` | `H(surface-tertiary)` | `Bildirimler normal geliyor` |
| Açık   | `H(danger,.1)` / `H(danger,.35)`    | `H(danger,.18)` / `H(danger)`           | `H(danger)`           | `Bildirimler durdu · {süre}` |

Açıkken altında süre çipleri: `30 dk · 1 saat · 8 saat · Ben açana kadar`
(`height:27`, `radius:9`, seçili `H(danger,.16)`/`H(danger,.45)`).
**Dördü tek satırda** — sığmıyorsa çip yazı boyutu değil, iç boşluk küçülür; sarma yok.

**Sözleşme (K8):**

```ts
// lib/presence/dnd.ts
export function buildDndPatch(
  duration: DndDuration,
  currentStatus: UserStatus,
): {
  status: "DND";
  statusExpiresAt: string | null; // "Ben açana kadar" → null
  statusRestoreTo: UserStatus; // DND açılmadan önceki durum
  statusFocusMinutes: number | null;
};
export function clearDndPatch(restoreTo: UserStatus): { status: UserStatus; statusExpiresAt: null };
```

- Anahtar `status = DND` yazar (`updatePresenceStatusAction` genişletilir).
- `statusRestoreTo` **DND açılmadan önceki** durumdur; DND açıkken süre değiştirmek bu alanı
  **ezmez** (tekrar açma senaryosunda kullanıcı kendi durumunu kaybetmesin).
- Süre bitince mevcut odak makinesi (`FocusControlsProvider` + `statusExpiresAt`) eski duruma
  döndürür. **İkinci bir geri sayım kurulmaz.**
- Kullanıcı barındaki durum noktası ve durum satırı otomatik hizalanır — ayrı state yok.

### 3. SES CİHAZLARI

Sağda `Bu cihaz` etiketi. İki satır: `GİRİŞ CİHAZI` ve `ÇIKIŞ CİHAZI`.
Satır `padding:9px 10px`, `radius:12`, 28 px ikon, üstte küçük caps etiket, altta cihaz adı,
sağda chevron. Açıldığında satırın **altında** liste (`radius:12`, `H(surface-soft,.55)`),
seçili cihazda tik.

Cihaz listeleri **gerçek** `enumerateDevices()` sonucundan (`useAudioDevices`, Ş8);
tasarımdaki adlar örnek veridir. Mevcut `AudioDeviceSelect` mantığı yeniden kullanılabilir ama
**görünüm** tasarımın satır dilinde çizilir.

Aynı anda tek cihaz listesi açık; menü kutunun dışına taşmaz (308 px içinde kalır).

`role="listbox"` + `option`, `↑/↓`, `Enter`, `Esc`.

### 4. Giriş seviyesi ölçeri

14 segment; dolu segment sayısı gerçek mikrofon seviyesinden (`useMicLevel`, Ş8).
Renk: normal `--success`, son iki segment `--warning`.
`Test et` düğmesi ölçeri **canlandırır**; kapatınca stream durur (kaynak sızıntısı yasak).

Ölçer `aria-hidden` — görsel geri bildirim; erişilebilir karşılığı `Test et` düğmesinin durum
metnidir (`aria-live`).

### 5. Eylemler

| Satır                     | Hedef                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `Ayarlar` (`⌘,` ipucuyla) | `/settings/account/profile`                                           |
| `Bildirim ayarları`       | 560 px bildirim ayarları penceresi (Ş11)                              |
| `Uygulamadan çıkış yap`   | `H(danger)` metin, `H(danger,.14)` ikon zemini; mevcut `logoutAction` |

`⌘,` kısayolu **gerçekten** çalışır (macOS'ta `⌘,`, Windows/Linux'ta `Ctrl+,`); ipucu metni
platforma göre yazılır, sabit `⌘` gömülmez.

`Uygulamadan çıkış yap` mevcut akışı korur: sesli kanaldan çık → socket kapat → `logoutAction`.

### 6. Idle timeout taşıması (K9)

`Boşta sayılma süresi` kontrolü menüden **çıkar**. `usePresenceIdleTimeoutPreference` hook'u
**kalır** ama artık `UserSettings.idleTimeoutMinutes` kolonundan okur/yazar (Ş0'da eklendi);
kontrol Ayarlar › Hesabım › Gizlilik › Görünürlük'te (Ş7).

Yerel depolama tabanlı eski tercih bir kez sunucuya **göç ettirilir**, sonra yerel anahtar silinir.

---

## Kabul

- [ ] Diff `channel-sidebar.tsx` içinde yalnız `quick` popover dalına dokunuyor; avatar, durum
      satırı, mikrofon ve kulaklık butonları **değişmedi**.
- [ ] `data-testid="user-quick-menu"` korunmuş; mevcut kabuk testleri yeşil.
- [ ] Menü sırası: DND → cihazlar → Ayarlar → Bildirim ayarları → Çıkış.
- [ ] DND açıkken 4 süre çipi **tek satırda**; sarma yok.
- [ ] DND anahtarı `status = DND` yazıyor; kullanıcı barındaki nokta danger'a dönüyor.
- [ ] Süre seçimi `statusExpiresAt` kuruyor; `Ben açana kadar` `null` yazıyor.
- [ ] DND açıkken süre değiştirmek `statusRestoreTo`'yu **ezmiyor**.
- [ ] Süre bitince eski duruma dönüyor; **ikinci geri sayım kurulmamış** (kod taraması).
- [ ] Cihaz listeleri gerçek `enumerateDevices()`'ten; seçilide tik var.
- [ ] Aynı anda tek cihaz listesi açık; menü 308 px kutudan taşmıyor.
- [ ] Ölçer gerçek mikrofon seviyesinden; `Test et` kapanınca stream duruyor.
- [ ] `⌘,` / `Ctrl+,` gerçekten Ayarlar'ı açıyor; ipucu platforma göre.
- [ ] `Bildirim ayarları` 560 px pencereyi açıyor (menü kapanarak).
- [ ] Çıkış akışı mevcut sırayı koruyor.
- [ ] `Boşta sayılma süresi` menüde **yok**; Gizlilik sekmesinde var; yerel tercih sunucuya
      göç etmiş ve yerel anahtar silinmiş.
- [ ] `Esc` menüyü kapatıyor, focus dişliye dönüyor.
- [ ] Açık ve koyu temada `screens/03-kullanici-menusu.png` ile karşılaştırma yapıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/13-s12-rapor.md`
