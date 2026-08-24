# Dalga 2 · Ş6 — `MentionCard` + tür pili + `⋯` menüsü

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5, Ş7, Ş8.

Ekranın en çok tekrar eden parçası. Bu şerit **yalnız kartı** yazar; akışa yerleşimi Ş5'in,
yanıt kutusunun içeriği Ş7'nin işidir (kart yalnız `replySlot` render eder).

---

## Sahiplenilen dosyalar

- `apps/web/src/components/mentions/mention-card.tsx` (yeni)
- `apps/web/src/components/mentions/mention-card-menu.tsx` (yeni)
- `apps/web/src/components/mentions/mention-kind-badge.tsx` (yeni)
- `apps/web/src/components/mentions/mention-source-tile.tsx` (yeni)
- `apps/web/src/components/mentions/mention-card.test.tsx` (yeni)
- `apps/web/src/components/mentions/mention-card-menu.test.tsx` (yeni)

**Okunur, yazılmaz:** `ui/avatar`, `ui/badge`, `ui/context-menu`, `lib/mentions/metrics`,
`lib/mentions/contracts`.

---

## İş

### 1. Kart kabuğu (SPEC §5)

- `article` etiketi, `aria-label` = `mentions.a11y.cardLabel` interpolasyonu.
- padding `13 15 12 16`, radius 16, `position:relative`, `gap:8` ile dizilir.

| Durum     | Zemin                 | Kenar            | Sol şerit                                          |
| --------- | --------------------- | ---------------- | -------------------------------------------------- |
| Okunmamış | `--surface-card`      | `--primary/0.32` | 3px `--primary`, `top/bottom:15`, radius `0 4 4 0` |
| Okunmuş   | `--surface-card/0.45` | `--border/0.5`   | —                                                  |

- Hover: zemin `--surface-soft/0.75`, geçiş `.14s`, `--hov: 1`.
- Sol şerit görsel; yanında **görünmez metin** (`sr-only`) `mentions.a11y.unreadStripe`.
- `active` (klavye imleci) durumu ring ile gösterilir (`ring-ring`), zemin değişmez —
  imleç ile okunmamışlık iki ayrı bilgi.

### 2. Anatomi

1. **Üst satır** (`gap:9`): 36px `Avatar` · ad 600 14 display · `@kullanıcıadı` 500 11.5 muted ·
   3px ayraç noktası · kaynak (17×17 radius 6 tile + `{sunucu} › #{kanal}` 11.5, nowrap +
   ellipsis) · sağ uçta tür pili + saat.
   - DM kaynağında tile yuvarlak ve metin `Direkt mesajlar › {ad}`.
   - Kaynak metni **tek satır**, `min-width:0` zinciri kırılmadan ellipsis yapar.
2. **Tür pili** (`mention-kind-badge.tsx`): padding `3 8`, radius 999, `tone/0.14` zemin,
   `tone` metin, 600 10.

   | `kind`     | Etiket      | Ton         |
   | ---------- | ----------- | ----------- |
   | `me`       | `Bana özel` | `--primary` |
   | `role`     | `Rol`       | `--info`    |
   | `everyone` | `@herkes`   | `--warning` |
   | `thread`   | `Thread`    | `--success` |

3. **Alıntı bloğu** (opsiyonel): marginTop 9, padding `7 11`, sol kenar 2px `--border`,
   radius `0 10 10 0`, `--surface-soft/0.55`; yazar 600 11.5 `--text-secondary` + metin 11.5
   muted, **tek satır ellipsis**.
4. **Gövde**: marginTop 7, 14/1.55 `--text-secondary`, `text-wrap:pretty`.
   Bahsetme etiketi gövdenin **başında inline çip**: padding `1 7`, radius 7,
   `--primary/0.16`, `--primary` 600 13.5. Çip metni sunucudan gelen `tag` alanıdır (Ş3);
   istemci gövdeden regex ile çıkarmaz.
5. **Thread satırı** (opsiyonel): marginTop 8, 13px baloncuk ikonu + 600 11.5 `--primary` —
   `{count} yanıt · thread hâlâ açık` / kapandıysa `… thread kapandı`.
6. **Eylem satırı**: marginTop 11, `flex-wrap:wrap`, gap 7. Üç `button`, height 30,
   padding `0 12`, radius 10, `1px --border/0.7`, 600 11.5:
   - `Yanıtla` — açıkken zemin `--primary/0.14`, kenar `--primary/0.45`, metin `--primary`.
   - `Bağlamda gör` — açıkken zemin `--surface-soft`, kenar `--border`, metin `--foreground`.
   - `Okundu işaretle` ↔ `Okunmadı işaretle` — etiket `mention.unread` değerinden türer.
     Sağ uçta `⋯` butonu 28×28 radius 9, `opacity: calc(var(--act) + var(--hov))`,
     `aria-label` + `aria-haspopup="menu"` + `aria-expanded`.
     **`--act` yoğunluk değişkenidir**; klavye ile odaklanıldığında opaklık her hâlükârda 1
     olmalı (`:focus-visible` kuralı) — aksi halde `⋯` klavyeyle görünmez bir hedef olur.
7. **`replySlot`** eylem satırının altında render edilir (içeriği Ş7'nin).

### 3. `⋯` menüsü (SPEC §5.1)

- Mevcut `ContextMenu` + `ContextMenuItem` + `ContextMenuSeparator` kullanılır; yeni menü
  bileşeni yazılmaz.
- Genişlik 218, radius 14, `--surface-card`, `1px --border`,
  gölge `0 20px 44px -22px --shadow-color`, padding 6, `z-index:5`.
- **Yön:** akıştaki ilk iki kartta aşağı (`top:34`), sonrakilerde yukarı (`bottom:34`).
  Yön `menuDirection` prop'u ile **Ş5'ten** gelir (kart kendi indeksini bilmez);
  Ş5 indeks 0 ve 1 için `"down"`, diğerleri için `"up"` verir.
- Satırlar: padding `8 10`, radius 10, gap 10, 500 12.5, 15px ikon.

  | #   | Satır                                                         | `MentionMenuAction` |
  | --- | ------------------------------------------------------------- | ------------------- |
  | 1   | `Mesaj bağlantısını kopyala`                                  | `copy-link`         |
  | 2   | `Sonra oku`                                                   | `read-later`        |
  | 3   | `{kanal} kanalını sessize al` / DM'de `Bu sohbeti sessize al` | `mute-source`       |
  | —   | ayırıcı                                                       | —                   |
  | 4   | `Listeden kaldır` (`--danger` 600, hover `--danger/0.14`)     | `dismiss`           |

- Kapanma: `⋯`'ye tekrar basış, satır seçimi, `Esc`, dış tıklama. Kapanışta odak `⋯`'ye döner.
- Menü akış dışına **taşmaz**; taşma testi 456px'lik (panel açık) akışta da koşulur.
- Kart eylemleri hiçbir mutasyonu kendi çağırmaz — hepsi prop olarak dışarı verilir.
  Kart saf bir sunum bileşenidir; testleri sahte veriyle koşar.

### 4. Kart gövdesine tıklama (SPEC §9)

- Gövde tıklaması `onOpen()` çağırır (Ş5 bahsetmeyi kanalda/DM'de açar ve okundu işaretler).
- Buton, menü, çip ve bağlantı tıklamaları gövdeye **sızmaz** (`stopPropagation`).
- Gövde tıklanabilir olduğu için karta `role` verilmez; erişilebilir yol üst satırdaki
  ad/kaynak bağlantısıdır — bütün karta `button` sarmak iç içe buton üretirdi.

---

## Kabul

- [ ] Okunmamış/okunmuş iki durum tasarımdaki zemin/kenar/şerit değerlerini birebir taşıyor.
- [ ] Dört tür pili doğru etiket ve tonda; `role` `--info` token'ını kullanıyor.
- [ ] Alıntı tek satır ellipsis; uzun kanal adı üst satırı taşırmıyor.
- [ ] `Okundu işaretle` ↔ `Okunmadı işaretle` etiketi doğru dönüyor.
- [ ] Menü 4 satır + ayırıcı; DM kartında 3. satır `Bu sohbeti sessize al`.
- [ ] İlk iki kartta aşağı, sonrakilerde yukarı açılıyor ve akış dışına taşmıyor.
- [ ] `Esc` ve dış tıklama kapatıyor, odak `⋯`'ye dönüyor.
- [ ] Klavyeyle odaklanınca `⋯` görünür (opaklık 1).
- [ ] Kartta hiçbir sabit renk/px yok; bütün metinler `t(...)` üzerinden.
- [ ] `mention-card.test.tsx` dört türü, iki okunma durumunu ve üç eylemin çağrılarını
      doğruluyor; `mention-card-menu.test.tsx` yön, kapanma ve DM metnini doğruluyor.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
