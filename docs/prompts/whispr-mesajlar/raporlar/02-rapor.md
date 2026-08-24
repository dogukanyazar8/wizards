# Dalga 1 · Ş1 — Kabuk (4 kolon) + sohbet rayı 276 — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

### Kabuk dört kolona çıktı (karar #2)

`lib/home/secondary-column.ts` → **`lib/home/third-column.ts`**. Fonksiyonun anlamı değişti:
artık 2. sütunu değil **3.** sütunu seçiyor.

| Rota                                                   | 3. sütun                      |
| ------------------------------------------------------ | ----------------------------- |
| `/home`, `/mentions`, `/events`, `/inbox`, `/discover` | `null`                        |
| `/channels`, `/channels/@me*`                          | `messages` (sohbet rayı 276)  |
| `/channels/[serverId]/*`, `/servers/[serverId]/*`      | `channels` (`ChannelSidebar`) |

`WizardsShell`:

- `AppNavPanel` artık **her rotada** çiziliyor, sabit `--nav-panel-width` (228) genişliğinde.
- Üçüncü sütun ayrı bir kap; `--third-column-width` Mesajlar'da 276, sunucuda kullanıcının
  ayarladığı kanal listesi genişliği.
- Sol blok genişliği `ray + panel (+ üçüncü sütun)` olarak hesaplanıyor.
- `--channel-sidebar-width` yerini `--nav-panel-width` + `--third-column-width` aldı.
- `--m-pad`, `--m-gap`, `--act` yayınlanıyor — `lib/messages/density.ts` üzerinden mevcut
  `InterfaceDensity` tercihinden türetiliyor, ikinci bir yoğunluk kaynağı yok.

`ChannelSidebar` üçüncü sütunda `showUserFooter={false}` alıyor: kullanıcı barı artık gezinme
panelinin ayağında ve iki kez çizilmesi iki kez odaklanılabilen bir ayar düğmesi demek olurdu.

### Sohbet rayı (276) — SPEC §3

- `components/messages/messages-rail.tsx` — başlık + toplam okunmamış rozeti, `Yeni mesaj` +
  yeni grup butonu, arama alanı, `Sabitlenenler` / `Sohbetler` bölümleri, iskelet, boş durum.
- `messages-rail-row.tsx` — satır gerçek bir `<a>`: geri/ileri, orta tık ve "yeni sekmede aç"
  çalışsın. Okunmamış rozeti `sr-only` cümle taşıyor ("3 okunmamış mesaj"); ekran okuyucu yalnız
  "3" duyarsa neyin üçü olduğunu bilmez.
- `messages-rail-container.tsx` — veri katmanı. Kabuk rayı **çizmez**, yalnız yerleştirir:
  `useDMConversations` bir sohbet ekranı bağımlılığı ve kabuğun her rotada onu açması Ana
  Sayfa'da hiç okunmayan bir sorgu olurdu.
- `lib/messages/rail-presentation.ts` — saf eşleyici (21 test): baş harfler (Türkçe büyütme),
  presence eşlemesi, saat sütunu (`09:26` / `Dün` / `Pzt` / `12 Ağu`), bölüm ayrımı, süzme.

**Okunmamış tek kaynak (PROMPT §9):** ray başlığındaki sayı `useUnreadCounters`'tan geliyor —
gezinme panelindeki `Mesajlar` rozetiyle aynı hook. `messages-rail.test.tsx` iki yüzeyi aynı
fikstürle birlikte çizip ikisinin de aynı sayıyı gösterdiğini doğruluyor.

### `MessagesLayout` — ana alan + sağ panel yuvası

Ş7'nin panelini yerleştirir; panel kendi konumlandırmasını yazmaz (aynı 340 iki yerde
tanımlanmaz). İki mod, tek kural:

- **≥1100 docked:** `role="complementary"`, focus tuzağı **yok**. Tuzak, klavye kullanıcısını
  ekranın geri kalanından koparırdı — panel açıkken mesaj listesine sekmeyle geçmek meşru.
- **<1100 overlay:** `role="dialog"` + `aria-modal`, backdrop, `Esc`. Arkadaki içerik zaten
  görünmüyor; oraya kaçan focus ekranda kaybolurdu.

---

## Sözleşme değişikliği

```ts
// lib/home/third-column.ts
export type ThirdColumn = "channels" | "messages" | null;
export function selectThirdColumn(pathname: string): ThirdColumn;

// components/messages/messages-layout.tsx
export type MessagesLayoutProps = {
  children: React.ReactNode;
  panel?: React.ReactNode; // Ş7 doldurur
  panelOpen: boolean;
  onClosePanel?: (() => void) | undefined;
};
```

CSS değişkenleri: `--nav-panel-width`, `--third-column-width`, `--m-pad`, `--m-gap`, `--act`.
`--channel-sidebar-width` **kaldırıldı**.

---

## Plandan sapmalar

1. **`lib/home/metrics.ts` panel daraltması Ş0.1'de yapıldı**, burada değil — bir sözlük
   değişikliğidir (Dalga 0 raporu §5).
2. **Modül adı değişti:** `secondary-column` → `third-column`. Adı korumak, "ikinci sütun"
   demeye devam eden ama üçüncüyü seçen bir dosya bırakırdı.
3. **`navCollapsed` eşiği rotaya göre ayrıldı.** Kural artık üçüncü sütunu **olmayan** rotalara
   ve Mesajlar'a ait (<960 → drawer). Sunucu rotaları kabuğun kendi `md:` eşiğinde (768) kaldı:
   kanal listesi bu pakette değişmedi ve eşiği kaydırmak, dokunmadığımız bir ekranı 768–960
   arasında sessizce yeniden düzenlerdi.
4. **Yeni mesaj / yeni grup butonları modalları açmıyor.** Ş8 henüz yok; ikisi de mevcut
   `?dmAction=new` / `?dmAction=group` niyetine bağlı ve `TODO(Ş8)` ile işaretli.
5. **Ray sanallaştırılmadı.** Eşik sözlükte (`rail.virtualizeAbove = 60`) ama uygulanmadı:
   ölçülmeden eklenen sanallaştırma, 20 satırlık bir listede kazancı olmayan bir karmaşıklık.
   Dalga 3 §5'in "200 sohbet ilk boya ≤ 200ms" ölçümü bunu karara bağlayacak.

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3409 / 3409
```

`e2e/specs/design/messages-shell.spec.ts` yazıldı (dört kolon, sabit genişlikler, <960 drawer,
üç sol kolon = 578) ama **koşulmadı**: üretim derlemesi + tohumlanmış veritabanı gerekiyor.
Dalga 3 §1'de koşacak.

---

## Açık kalanlar

- **`MessagesLayout` henüz hiçbir yere monte edilmedi.** Ş5 sohbet gövdesini yazarken
  `DMConversationPage` içine girecek; bugün yalnız bileşen ve testi var.
- **Overlay dalı birim testinde doğrulanamıyor:** `useResponsiveLayout` `window` okuyor, sunucu
  render'ında ölçüm 0. Docked davranışı kilitlendi; geçiş `messages-responsive.spec.ts`
  (Dalga 3) ile gerçek tarayıcıda ölçülecek.
- **`DmSidebar` / `FriendsSidebar` hâlâ duruyor.** Mesajlar rotası artık `MessagesRail`
  kullanıyor ama eski ray silinmedi — kaldırma kararı Dalga 3 §8'de, referans taraması sonrası.
- **`graphify update .`** Windows dosya kilidine takıldı (`WinError 5`,
  `graphify-out\.graph.tmp.json`). Ortam sorunu; bir sonraki turda tekrar denenecek.
