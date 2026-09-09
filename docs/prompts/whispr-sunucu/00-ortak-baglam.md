# 00 — Ortak bağlam (Sunucu ekranı, kanallar, sunucu yönetimi)

**Bu dosya uygulanmaz, okunur.** Her şerit işe başlamadan önce buradaki gerçekleri, kararları ve
tuzakları bilir. Şeritler arası her çelişki burada çözülür.

Kaynak paket: `design_handoff/design_handoff_sunucu/`
Otorite sırası: `design/Sunucu.dc.html` inline `style` **>** `design/Sunucu-referans.html` **>**
`SPEC-SUNUCU.md` **>** `PROMPT.md`.
Ortak kabuk ve ölçekleme: `design_handoff/app/SPEC-ANA-SAYFA.md` §1, §8.
Plan ve kararlar: `docs/prompts/whispr-sunucu/PLAN.md`. Dal: `uat`.

---

## 1. Kapsam sınırı

| Yüzey              | Ölçü                        | Tetikleyici                           |
| ------------------ | --------------------------- | ------------------------------------- |
| Kanal kenar çubuğu | 252 px kolon                | Sunucu rotası                         |
| Metin kanalı       | esnek                       | Kanal satırı                          |
| Ses kanalı         | esnek                       | Sesli kanal satırı                    |
| Sağ panel          | 326 px kolon                | Başlıktaki `Üyeler` / `ara` düğmeleri |
| Pencereler         | 460 · 480 · 560 · 660 · 940 | Sunucu menüsü, ray `+`, ayarlar       |
| Sunucu ayarları    | `min(1180px, 100%)` × %100  | Sunucu menüsü › Sunucu ayarları       |

**Dokunulmayacak:** sunucu rayı (74 px, yalnız `+` düğmesinin eylemi bağlanır), gezinme paneli
(280 px, K1), kullanıcı barı, `/channels/[serverId]/[channelId]` rotası, mobil ekranlar, admin paneli.

Diff bunların dışına taşıyorsa şerit hatalıdır.

---

## 2. Doğrulanmış gerçekler (kodda okundu, tahmin değil)

### 2.1 Kabuk

- `components/shell/wizards-shell.tsx` (1826) dört kolonu kurar; `ServerRail` · `AppNavPanel` ·
  `ChannelSidebar` · içerik · `ServerMemberPanel` · `WorkspaceModals` · `ServerSettingsOverlay`.
- `lib/home/metrics.ts` → `HOME_METRICS.rail.width = 74` (SPEC ile aynı),
  `HOME_METRICS.panel.width = 280` (**SPEC 228 diyor — K1 gereği 280 kalır**).
  Sapmanın kaydı `lib/messages/metrics.ts` → `NAV_PANEL_ADJUSTMENTS`.
- Ölçek motoru hazır: `pxToRem` · `pxToEm(px, basePx)` · `hairline()` · `lib/home/scale.ts`
  `selectUiScale` (16 · 18 · 24 · 32 px adımları) · `useUiScale`.
  **Yeni ölçek motoru yazılmaz.** İkon boyutları `pxToEm`, kalan her ölçü `pxToRem`.

### 2.2 Kanal kenar çubuğu (bugün)

- `channel-sidebar.tsx` (2039): dnd-kit ile kategori/kanal sıralama (`SortableChannelRow`,
  `SortableCategoryGroup`, `ChannelDropZone`), `collapsedCategories` store'da,
  `useVoiceStates(serverId)` ile ses durumu, `UserProfileFooter` (mikrofon/kulaklık/dişli) **burada**.
- **Yok:** sunucu başlığı + menü, `⌘K` arama popover'ı (bugün inline `input`), daraltıldığında
  "yalnız aktif/okunmamış/konuşulan kanal" filtresi, bağlı ses şeridi.
- `UserProfileFooter` ve dnd kablolaması **korunur**; yalnız görsel dil ve yeni bloklar eklenir.

### 2.3 Metin kanalı (bugün)

- `chat/message-item.tsx`, `message-list.tsx`, `chat-area.tsx`, `message-toolbar.tsx`,
  `thread-panel.tsx` **zaten** `MESSAGES_METRICS` sözlüğünü kullanıyor — mesaj satırı, tepki çipi,
  thread düğmesi, kod parçası, dosya kartı dili **hazır**. Yeniden çizilmez.
- `PinnedStrip` + `PinnedListSheet` bağlı (`components/messages/`), `TypingIndicator` var.
- `chat/message-search-panel.tsx` → `SearchMode = "basic" | "advanced"` **zaten var**;
  eksik olan SPEC §4.3'ün alan seti.

### 2.4 Ses (bugün)

- `voice-channel-view.tsx` (891) + `voice/room/voice-room-primitives.tsx` (1403) canlı LiveKit.
- Hazır yardımcılar: `lib/voice/participant-view-model.ts`, `video-quality.ts`,
  `video-subscription.ts`, `screen-share.ts`, `krisp-quality.ts`, `use-voice-audio-levels.ts`,
  `audio-device-options.ts`.
- **K5:** kablolama korunur; kart/ızgara/sahne/kontrol çubuğu SPEC ölçüleriyle yeniden çizilir.

### 2.5 Sözleşme (`packages/types/src/workspace.ts`, 877 satır)

Hazır ve **yeniden yazılmayacak** olanlar:

| Şema                                         | Not                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceChannelPermissionPresetSchema`     | `PUBLIC \| LOCKED_VISIBLE \| PRIVATE \| ROLE_GATED` — SPEC §6.2'nin dört seçeneği                                                       |
| `CHANNEL_SLOW_MODE_DELAYS`                   | 12 değer, SPEC ile birebir                                                                                                              |
| `CHANNEL_BITRATE_OPTIONS`                    | `[32_000, 64_000, 96_000, 128_000]`, varsayılan 64 kbps                                                                                 |
| `CHANNEL_USER_LIMIT_MAX`                     | 10                                                                                                                                      |
| `WorkspacePermissionKeySchema`               | 25 anahtar; SPEC'in 18'i **bu kümeden seçilir**, yeni anahtar üretilmez                                                                 |
| `ServerTagSchema` / `SERVER_TAG_LIMIT`       | slug, ≤24 karakter, en fazla 5                                                                                                          |
| `CreateInviteSchema`                         | `expiresInHours` 1–720 (`null`=süresiz), `maxUses` 1–1000 (`null`=sınırsız)                                                             |
| `ServerScheduledEventSchema` + create/update | RSVP, `interestedCount`, `channelId` dâhil                                                                                              |
| `UpdateServerFieldsSchema`                   | `allowGifs`/`allowFileUploads`/`allowMemberAdds`/`messageCharacterLimit`/`deletedMessageNoticeMinutes`/`tags`/`isPublic`/`discoverable` |

### 2.6 Veri tabanı

- `Server`: `shortName(4)`, `description`, `isPublic`, `discoverable`, `tags[]`, `features[]`,
  `messageCharacterLimit(2000)`, `deletedMessageNoticeMinutes(60)`, `type`, `authorizationRevision`.
- `Channel`: `slowModeDelay`, `bitrate(64000)`, `userLimit`, `rtcRegion`, `videoQualityMode`, `locked`.
- `Role`: `color Int`, `mentionable`, `permissions BigInt`, `isDefault`, `position`.
- `ServerMember.communicationDisabledUntil` → **zaman aşımı kolonu var**.
- `ServerBan` tablosu → **ban var**. `ServerInvite.targetUserId` → **hedefli davet var**.
- **Eksik olan yalnız iki kolon:** `Server.iconColor`, `Server.slowModeDelay` (Ş0 ekler).
- Migration **yalnız** `packages/db/prisma/rebaseline-migrations/` altına yazılır. Başka klasör
  Prisma tarafından okunmaz.

### 2.7 Token ve tipografi

- `--info: 199 89% 48%` `globals.css:37`'de **zaten var** (+`-foreground`, `-soft`, `-readable`).
- `--accent-2: 291 64% 55%` **eklenecek** (açık ve koyu blokların ikisine de) — K8.
- `--font-display` = Outfit, `--font-sans` = Figtree `app/layout.tsx`'te **hazır**.
  Bileşene font adı gömülmez.
- Renk **yalnız** `hsl(var(--token))` / `hsl(var(--token)/alpha)`. Yeni hex, yeni tema sınıfı yok.

### 2.8 Parity ve denetim düzeni

- `e2e/helpers/design-parity.ts` + `e2e/specs/design/{home,messages}-parity.spec.ts` düzeni.
- `lib/{events,mentions,settings}/parity.test.ts` düzeni → `lib/servers/parity.test.ts`.
- `lib/home/token-audit.ts` → yeni dosyalar bu denetimden geçer.
- `packages/db/prisma/schema-*.test.mjs` düzeni → `schema-server-screen.test.mjs`.

---

## 3. Ölçü sözlüğü kuralı

Her ölçü `apps/web/src/lib/servers/metrics.ts` içindeki **SERVER_METRICS**'ten gelir.
Bileşende çıplak sayı yazılmaz. Sözlük renk taşımaz — yalnız ölçü, yarıçap, boşluk, ağırlık,
satır yüksekliği, süre. Gölge kayıtlarındaki `alpha` opaklıktır, renk değil.

```ts
// örnek
sidebar: { width: 252, headerPaddingY: 14, headerPaddingX: 13, menuTop: 70, menuRadius: 16, ... }
```

`HOME_METRICS`'te zaten olan bir ölçü **kopyalanmaz**, oradan okunur (ray 74, panel 280,
kabuk yarıçapı 26, kabuk min 1360×920).

---

## 4. Katman kuralı (K11)

- Sunucu ayarları `z-index 70`, pencereler `z-index 80`.
- Aynı anda **tek** açılır/panel/pencere açık kalır; yeni açılan öncekini kapatır.
- Ayarlardan açılan kategori/kanal/etkinlik penceresi ayarların **üstünde** çizilir, kapanınca
  ayarlara geri dönülür (ayar kapanmaz).
- `Esc` **en üstteki** katmanı kapatır.
- Tek kaynak: Ş8'in yazdığı `useLayerStack`. Şeritler kendi `z-index`'ini uydurmaz.

---

## 5. Yetki kuralı (PROMPT §4)

- Sunucu ayarlarının tamamı ve kanal penceresindeki `Erişim` adımı **yönetici/sahip** içindir.
- `Yönetici` yetkisi, `Rolü sil`, `Sahipliği devret`, `Sunucuyu sil` **yalnızca sahip**.
- Yetkisi olmayan kullanıcıya bu bölümler **hiç render edilmez** — pasifleştirme yeterli değil.
- `yalnızca sahip` çipi taşıyan her kontrol sahip dışındakilere çizilmez.
- Her şerit, eklediği yetkili yüzey için **negatif test** yazar (üye olarak bak, DOM'da yok).

---

## 6. Doğrulama kuralları (PROMPT §7 — canlı, kaydetmeden önce)

| Alan                     | Sınır                               |
| ------------------------ | ----------------------------------- |
| Kategori adı · kanal adı | 1–48                                |
| Kanal konusu             | 0–120                               |
| Sunucu adı               | 2–64 · kısa ad 0–4 · açıklama 0–160 |
| Rol adı                  | 1–**32** (K6 daraltması)            |
| Etkinlik adı             | 1–**60** · açıklama 0–**180** (K6)  |
| Keşif etiketi            | en fazla 5, her biri 24 karakter    |

- Sayaç sınırın **%85**'ini geçince `warning` rengine döner.
- Yazı kanalı adı slug'lanır (boşluk → tire, küçük harf); ses kanalı adı serbest.
- `Keşfet'te listele`, sunucu herkese açık olmadan açılamaz; herkese açık kapatılırsa listeleme de kapanır.
- `Sunucuyu kalıcı olarak sil` yalnız yazılan metin sunucu adına **birebir** eşitse aktif.
- `Sahipliği devret` yalnız üye seçili **ve** onay anahtarı açıkken aktif.
- Pasif düğme: `surface-tertiary` zemin, `text-muted` metin, `cursor: not-allowed`, gölge yok.

---

## 7. i18n kuralı

- Yeni anahtarlar `server.*` önekinde (`server.settings.visibility.title`, `server.create.name.hint`).
  Bu önek bugün **hiç kullanılmıyor**, çakışma yok.
- Bugünkü `serverSettings.*` anahtarları Ş11–Ş13'te `server.settings.*` altına taşınır; eski anahtar
  silinir, kullanan kalmaz.
- TR karşılığı SPEC'teki metnin **birebir aynısı**. Metin yeniden yazılmaz, kısaltılmaz, "iyileştirilmez".
- EN karşılığı aynı commit'te eklenir; iki dosya anahtar bazında eşit kalır.
- Sayaç ve özet satırları (`3 / 25`, `# welcome-chat · 7 gün · 25 kullanım`, `14 yetki seçili`)
  çoğul kurallarıyla kurulur.

---

## 8. Erişilebilirlik (PROMPT §9)

- Tıklanabilir her satır gerçek `button`/`a`; ikon-only düğmelere `aria-label`.
- Anahtarlar `role="switch"` + `aria-checked`; radyo grupları `role="radiogroup"` + ok tuşları.
- Pencerelerde focus tuzağı, açılışta ilk odaklanabilir öğe, kapanışta tetikleyiciye dönüş.
- Okunmamış sayaçları okunabilir etiket taşır ("12 okunmamış mesaj").
- Ses kartındaki konuşma halkası tek ipucu olamaz; ekran okuyucu için "konuşuyor" metni bulunur.
  `prefers-reduced-motion` altında dalga durur.
- Devre dışı kontroller (`Keşfet'te listele`, sahip satırının çıkarma düğmesi) `aria-disabled`
  ve nedenini açıklayan metin taşır.
- Sürükle-bırak listelerinin klavye alternatifi vardır (yukarı/aşağı düğmeleri tasarımda mevcut).

---

## 9. Performans (PROMPT §11)

- Kanal listesi ve mesaj listesi **mevcut** `@tanstack/react-virtual` sanallaştırmasını kullanır;
  yeni sanallaştırıcı eklenmez.
- Ses dalgası yalnız aktif konuşmacı için animasyonlu çalışır.
- Sunucu ayarları bölümleri `lazy` yüklenir; her bölüm kendi `Skeleton`'unu gösterir.
- Kamera/ekran akışı yokken yer tutucu çizilir, boş `<video>` mount edilmez.

---

## 10. Doğrulama komutları

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/db test
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```

- `typecheck` ve `lint` **pnpm üzerinden** koşmalı; runner `npm_execpath` denetliyor,
  `npm run` ile derlemeye başlamadan ölür.
- E2E: `pnpm --filter @wizards/web e2e:a11y`, `playwright test e2e/specs/design/server-parity.spec.ts`.

---

## 11. Rapor kuralı

Her şerit bitince `docs/prompts/whispr-sunucu/raporlar/<serit>.md` yazar:

1. **Ne yapıldı** — dosya listesi, satır sayısı.
2. **SPEC'ten sapmalar** — her biri gerekçesiyle. Sapma yoksa "yok" yazılır.
3. **TODO(api)** — kalan mock'lar, hangi uç eksik.
4. **Doğrulama çıktısı** — komut + sonuç (test sayısı dâhil).
5. **Sonraki şerit için not** — bulunan tuzak, değişen sözleşme.

Rapor yoksa şerit bitmemiştir.
