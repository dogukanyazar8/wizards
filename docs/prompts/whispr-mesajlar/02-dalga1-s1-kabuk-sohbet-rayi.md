# Dalga 1 · Ş1 — Kabuk (4 kolon) + sohbet rayı 276

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş2, Ş3, Ş4 ile aynı anda.

Amaç: Mesajlar ekranının **çerçevesi**. İçerik değil — ana alan bu şeritte yalnız `children`'ı
alır ve Dalga 2 doldurur.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/shell/wizards-shell.tsx
apps/web/src/components/shell/app-nav-panel.tsx
apps/web/src/lib/home/secondary-column.ts
apps/web/src/lib/home/secondary-column.test.ts
apps/web/src/lib/home/metrics.ts                        (yalnız panel.width + iki font boyutu)
apps/web/src/components/messages/messages-rail.tsx      (yeni)
apps/web/src/components/messages/messages-rail.test.tsx (yeni)
apps/web/src/components/messages/messages-rail-row.tsx  (yeni)
apps/web/src/components/messages/messages-layout.tsx    (yeni)
apps/web/src/hooks/use-messages-rail.ts                 (yeni)
apps/web/src/app/(main)/channels/[serverId]/page.tsx
apps/web/src/app/(main)/channels/[serverId]/[channelId]/page.tsx
apps/web/e2e/specs/design/home-parity.spec.ts           (yalnız yenilenen anlık görüntü/ölçü)
```

**Dokunulmaz:** `components/shell/server-rail.tsx`, `channel-sidebar.tsx`,
`components/dm/dm-sidebar.tsx` (eski ray yerinde kalır, Mesajlar rotasında kullanılmaz —
kaldırma kararı Dalga 3'te verilir).

---

## Sözleşme (dışa verdiklerin)

```ts
// components/messages/messages-layout.tsx
export type MessagesLayoutProps = {
  children: React.ReactNode; // ana alan — Dalga 2 doldurur
  panel?: React.ReactNode; // sağ panel 340 — Ş7 doldurur
  panelOpen: boolean;
};
```

Ş7 sağ paneli **bu** prop'tan geçirir; kendi konumlandırmasını yazmaz.

---

## İş

### 1. Kabuk dört kolona çıkar (karar #2)

`selectSecondaryColumn` sözleşmesi değişir: 2. sütun artık **her rotada** `AppNavPanel`'dir.
Fonksiyon kaldırılmaz, anlamı daralır — dönüş tipi `"nav" | "channels"` olur ve **3. sütunu**
seçer:

| Rota                                                   | 3. sütun                                         |
| ------------------------------------------------------ | ------------------------------------------------ |
| `/home`, `/mentions`, `/events`, `/inbox`, `/discover` | yok (ana alan gezinme panelinin sağından başlar) |
| `/channels`, `/channels/@me`, `/channels/@me/[id]`     | `MessagesRail` (276)                             |
| `/channels/[serverId]/*`, `/servers/[serverId]/*`      | `ChannelSidebar`                                 |

`secondary-column.test.ts` yeniden yazılır; testin adı `selectThirdColumn` olur. Ana Sayfa
davranışı **değişmez** (orada 3. sütun yok), yalnız panel genişliği daralır.

### 2. Gezinme paneli 272 → 228

- `HOME_METRICS.panel.width`: 272 → 228.
- Nav satırı font 14.5 → 14; sunucu satırı adı 13.5 → 13, `nowrap + ellipsis`.
- Diğer her değer (yarıçap 13, ikon 18, badge, ayak barı) **aynı kalır**.
- `HOME_METRICS.eventsScreen.dayPanelWidth = 272` bu değişiklikten **etkilenmez** — o ayrı bir
  ölçüdür, aynı sayı olması tesadüftür. Yanlışlıkla birlikte değiştirme.

Ana Sayfa parity anlık görüntüleri yenilenir (`home-parity.spec.ts`, `e2e/specs/visual`). Yenileme
öncesi/sonrası ekran görüntüsü rapora eklenir — daralmanın Ana Sayfa bento ızgarasında kırpma
yaratmadığı **gösterilerek** doğrulanır, iddia edilerek değil.

### 3. Yoğunluk değişkenleri yayını

`wizards-shell.tsx` içindeki `--density-*` bloğuna, Ş0.1'in `lib/messages/density.ts` sözlüğünden:

```
--m-pad, --m-gap, --act
```

`pxToRem` ile. Mevcut `--density-*` değişkenleri kaldırılmaz.

### 4. `MessagesRail` (276) — SPEC §3

Yeni bileşen; `DmSidebar`'ın kopyası değil, ama **veri kaynağı ortak**: `useDmConversations`
(`hooks/use-dm-conversations.ts`) ve `useUnreadCounters`. Rayın başlığındaki toplam okunmamış sayı
ile gezinme panelindeki `Mesajlar` badge'i **aynı hook'tan** okur — PROMPT'un tek entegrasyon
şartı budur ve `messages-rail.test.tsx` bunu iki yüzeyi birlikte render ederek doğrular.

Anatomi:

1. **Başlık** padding `16 16 12`: `Mesajlar` 700/22 display + toplam okunmamış badge (`--danger`,
   600/10 display). Sağdaki filtre/sıralama ikon butonu: **`Mesajlar.dc.html`'e bak** — SPEC §3
   onu tarif ediyor, `screens/01` ve `screens/08` göstermiyor (00-ortak-baglam §6.8). Kararı ve
   dayanağını rapora yaz.
2. **Birincil aksiyon:** tam genişlik `Yeni mesaj` (kalem ikonu, h 38, radius 12, `--primary`,
   `#fff`) + yanında yeni grup ikon butonu. İkisi de Ş8'in modallarını açar; bu şeritte
   `onNewMessage` / `onNewGroup` prop'ları ile yukarı bildirilir, modal **yazılmaz**.
3. **Arama alanı:** h 38, radius 12, `--surface-soft/0.7`, `1px --border/0.6`, 16px ikon,
   placeholder `messages.rail.searchPlaceholder`. İstemci tarafı süzme (ad + son mesaj metni),
   `useDeferredValue` ile.
4. **`Sabitlenenler`** ve **`Sohbetler`** bölüm etiketleri (600/10.5 display, `.15em`, uppercase,
   muted) + sayı. Sabitlenenler = `pinnedAt` dolu satırlar; sıralama aynı listeden dilim, ikinci
   bir sorgu yok (`dm-sidebar.tsx:586` bu ayrımı zaten doğru yapıyor, mantığı oradan al).
5. **Satır** (`messages-rail-row.tsx`): padding `8 10`, radius 12, gap 10, hover
   `--surface-soft/0.7`, seçili `--surface-soft`. DM'de 40px avatar + 11px presence noktası;
   grupta 40×40 radius 11 renkli tile + iki harf (600/14 display, renk
   `getGroupAvatarForeground`). Orta: ad (okunmamışsa 700, değilse 600, 13.5) + tek satır ellipsis
   önizleme (12 muted, kendi mesajın `Sen: ` ön ekiyle). Sağ: saat (500/10.5 muted) + okunmamış
   badge (min-w 18, h 18, radius 6, `--danger`).
   - Satır gerçek `<a href>`'tir (`/channels/@me/{id}`), `button` değil — geri/ileri ve orta tık
     çalışsın.
   - Badge `aria-label` taşır: `messages.rail.unreadLabel` (`"{count} okunmamış mesaj"`).
   - Presence noktasının metin karşılığı `<span className="sr-only">`.
6. **Skeleton:** `MESSAGES_DENSITY_BY_SCALE[scale].railRows` kadar satır (×1'de 9).
7. **Alt kullanıcı barı yok** (00-ortak-baglam §6.7).

### 5. Sanallaştırma eşiği

Ray listesi 60 satırın üstünde sanallaştırılır (mevcut `MessageList`'in kullandığı yaklaşımla aynı
kütüphane). Altında düz render — 250 üyeli grup listesi değil, sohbet listesi bu; erken
sanallaştırma ölçülmeden eklenmez. Eşik `lib/messages/metrics.ts` sözlüğünde durur.

### 6. Rotalar

- `/channels` ve `/channels/@me` → ana alanda **Arkadaşlar** görünümü (Ş3). Bu şeritte yalnız
  `MessagesLayout` iskeleti + `FriendsView` mevcut hâliyle geçirilir.
- `/channels/@me/[conversationId]` → `DMConversationPage`, `MessagesLayout` içinde.
- Sohbet seçili değilken ve hiç sohbet yokken **boş durum** (Ş8) — bu şeritte yer tutucu bırak,
  `TODO(Ş8)` işaretle.

### 7. Kırılımlar (SPEC PROMPT §7)

- `<1100px`: sağ panel overlay olur (`MessagesLayout` `panelOpen` iken `position:absolute` +
  backdrop).
- `<960px`: sohbet rayı drawer'a taşınır, tetikleyici mevcut `MobileDrawerTrigger`.
- Mevcut `useResponsiveLayout` hook'u kullanılır; yeni bir eşik sistemi kurulmaz.

---

## Test

- `messages-rail.test.tsx`: başlık sayısı = nav badge sayısı (aynı fixture, iki yüzey);
  sabitlenen/sohbet bölümlerinin ayrımı; okunmamış `aria-label`; seçili satır zemini; skeleton
  satır sayısı ölçek adımına göre.
- `secondary-column.test.ts`: yeniden yazılmış tablo.
- `metrics.test.ts` (Ş0.1'in dosyası **değil** — `lib/home/metrics.test.ts`): panel genişliği 228.
- e2e `design/messages-shell.spec.ts` (yeni): 1360×920'da dört kolonun genişlikleri
  `74 / 228 / 276 / kalan`; `expectNoOverflow`.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(messages-rail|secondary-column|metrics)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design/messages-shell.spec.ts
```

Rapor: `raporlar/02-rapor.md`. §"Sözleşme değişikliği" bölümü `MessagesLayoutProps`'u ve
`selectThirdColumn` dönüş tipini yazar.
