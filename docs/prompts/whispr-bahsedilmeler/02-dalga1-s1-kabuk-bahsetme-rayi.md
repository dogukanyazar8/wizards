# Dalga 1 · Ş1 — Kabuk 4. kolonu + Bahsetme rayı (276)

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş2, Ş3, Ş4.

Bu şerit **yalnız sol taraftaki üçüncü sütunu** kurar. Akış, kart, panel ve modal başka
şeritlerin işidir; bu şerit onlara `URL durumu` üzerinden konuşur, prop geçmez.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/home/third-column.ts` — yalnız `"mentions"` dalı
- `apps/web/src/lib/home/third-column.test.ts` — yeni dal testi
- `apps/web/src/components/shell/wizards-shell.tsx` — yalnız `thirdColumn === "mentions"`
  dallanması ve `thirdColumnWidth` hesabı (başka hiçbir satır)
- `apps/web/src/components/mentions/mentions-rail-container.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-sidebar.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-sidebar-row.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-sidebar.test.tsx` (yeni)
- `apps/web/src/lib/mentions/client.ts` (yeni — yalnız ray sorguları; Ş3 aynı dosyayı
  **genişletir**, çakışmayı önlemek için Ş1 yalnız `mentionsQueryKeys` + `fetchMentionCounts`
  yazar ve Ş3'ün ekleyeceği fonksiyonlar için `// Ş3` yorum sınırı bırakır)

**Okunur, yazılmaz:** `channel-sidebar.tsx`, `channel-item.tsx` (satır dili), `app-nav-panel.tsx`,
`server-rail.tsx` (`MobileDrawerTrigger`).

---

## İş

### 1. Kabuğun 4. kolonu

1. `selectThirdColumn`: `firstSegment === "mentions"` → `"mentions"`. `ThirdColumn` tipi
   `"channels" | "mentions" | "messages" | null` olur. Dosyanın başındaki yorum bloğu
   güncellenir — `/mentions` artık `null` dalında değildir.
2. `wizards-shell.tsx`:
   - `thirdColumnWidth` `"mentions"` için `pxToRem(MENTIONS_METRICS.shell.railWidth)` (276).
   - `thirdColumn === "mentions" ? <MentionsRailContainer currentUserId={…} onNavigate={navigate}/>`
     dalı. `MessagesRailContainer` çağrısının yapısı birebir örnek alınır.
   - Ana alanın `paddingLeft`/offset hesabı zaten `--third-column-width` üzerinden; ekstra
     sayı eklenmez.
3. `<960px`: ray drawer'a taşınır. Kabuk zaten `MobileDrawerTrigger` deseni taşıyor; Mesajlar
   rayının kullandığı yolu izle, ikinci bir drawer mekanizması yazma.

### 2. `MentionsSidebar` (276)

Ölçüler **yalnız** `MENTIONS_METRICS.sidebar` sözlüğünden. Bölümler SPEC §3 sırasıyla:

1. **Başlık** — `Bahsedilmeler` 700 22 display + sağda okunmamış sayacı (`--danger`).
   Okunmamış yoksa sayaç **render edilmez** (boş rozet değil, yok).
2. **Aksiyon satırı** — `Tümünü okundu işaretle` (flex:1, primary dolgu, çift tik ikonu,
   gölge `0 8px 18px -12px --primary`, hover `brightness(1.08)`) + zil butonu 36×36.
   - Buton `mentions.readAll` mutasyonunu çağırır (Ş3 uçlarını yazar; Ş1 sözleşmeye göre çağırır,
     uç yokken `TODO(api):` adapter ile mock döner).
   - Zil butonu URL'e `?modal=settings` yazar; modalı Ş8 render eder. Modal açıkken buton
     zemini `--primary/0.15`, ikon `--primary` — bunu URL'den okur.
3. **Arama** — height 36, radius 11, placeholder `Bahsetmelerde ara`. Yazılan değer
   **debounce 250ms** ile URL'e `?q=` olarak yazılır (`router.replace`, `scroll:false`).
   Sunucu tarafı filtre Ş3'ün işidir; ray yalnız durumu taşır.
4. **`Türe göre`** bölüm etiketi + 4 tür satırı. Her satır:
   - tile 28×28 radius 9, glif `@` / `R` / `T` / `!`,
   - tonlar sırasıyla `--primary` · `--info` · `--success` · `--warning`,
   - alt metinler: `Bana özel` → kullanıcının gerçek `@username`'i (K9; birden çok takı
     üretilmez), `Rol bahsetmeleri` → kullanıcının **bahsedilebilir** rollerinin adları
     (`@tasarım · @ürün`, en çok 3 tane, fazlası `+{n}`), `Thread yanıtları` →
     `Takip ettiğin thread'ler`, `Okunmamış` → `Sayaca yansıyanlar`.
   - sağda sayı pili; `Okunmamış` satırının pili `--danger` + `#fff`.
   - Tıklama → URL `filter` değeri (`me` / `role` / `thread` / `unread`); aynı satıra
     tekrar tıklamak `all`'a döner.
5. **Ayırıcı** + **`Kaynağa göre`** etiketi + sağda toplam kaynak sayısı.
6. **Kaynak satırları** — pencerede (`window`) en az 1 bahsetmesi olan **her** kaynak listelenir;
   sunucular bahsetme sayısına göre azalan, `Direkt mesajlar` **her zaman en sonda** ve tile'ı
   `radius: 50%`. Liste `overflow-y:auto` — 30 sunuculu kullanıcıda ray kaymaz.
   Tıklama → `?source=<serverId|dm>`; tekrar tıklamak kaldırır.

### 3. Yükleme ve hata

- Ray ve akış **bağımsız** yüklenir (PROMPT kural 7). Ray kendi `Skeleton`'unu gösterir:
  4 tür satırı + 4 kaynak satırı yüksekliğinde.
- Sayaç sorgusu hata verirse ray satırları sayısız render edilir (pil yok), ekran çökmez.

### 4. Sayaç tek kaynak

Ray başlığındaki sayaç, `Okunmamış` satırının pili, `Okunmamış` sekmesinin pili ve gezinme
panelindeki rozet **aynı sayıyı** gösterir. Ş1 bunları `mentionsQueryKeys.counts()` tek
sorgusundan okur; ikinci bir `reduce` yazmaz. Gezinme paneli rozeti Ş3'ün `app/summary`
değişikliğiyle aynı kaynağa oturur — Ş1 `app-nav-panel.tsx`'e **dokunmaz**.

---

## Kabul

- [ ] `/mentions` rotasında kabuk 74 + 228 + 276 gösteriyor; `/messages` ve `/channels/*`
      davranışı değişmedi (`third-column.test.ts` üç dalı da doğruluyor).
- [ ] Ray ölçüleri sözlükten; dosyada arbitrary px sınıfı ve hex renk yok.
- [ ] 4 tür satırı doğru glif/ton/alt metin/sayı taşıyor; `Okunmamış` pili `--danger`.
- [ ] Kaynak listesi gerçek veriden; `Direkt mesajlar` en sonda ve yuvarlak tile.
- [ ] Arama 250ms debounce ile `?q=` yazıyor; geri tuşu önceki aramaya dönüyor.
- [ ] Filtre ve kaynak seçimi URL'e yansıyor, tekrar tıklama seçimi kaldırıyor.
- [ ] `<960px` rayı drawer'a düşüyor, ikinci bir drawer mekanizması yazılmadı.
- [ ] Ray akışı beklemeden yükleniyor (akış sorgusu askıdayken ray dolu).
- [ ] `mentions-sidebar.test.tsx`: render, boş sayaç gizleme, filtre toggle, kaynak sıralaması.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
