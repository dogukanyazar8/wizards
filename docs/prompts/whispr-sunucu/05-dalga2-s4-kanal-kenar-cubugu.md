# Ş4 — Kanal kenar çubuğu 252 (Dalga 2)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §2 (tamamı), §1.
> Bağımlılık: **Ş0**. Paralel: Ş5.

---

## Görev

`components/shell/channel-sidebar.tsx`'i SPEC §2'ye göre yenile: sunucu başlığı, beş satırlık sunucu
menüsü, `⌘K` arama popover'ı, kategori/kanal listesi + daraltma kuralı, ses kanalı katılımcı
satırları, bağlı ses şeridi.

**Korunacak:** dnd-kit sıralama kablolaması, `collapsedCategories` store'u, `useVoiceStates`,
`UserProfileFooter` (avatar · durum · mikrofon · kulaklık · dişli). Bunların API'si bozulmaz.

---

## 1. Sunucu başlığı (§2.1)

- `padding: 14px 13px`, alt kenar `border/.45`, tıklanınca menü; açıkken zemin `surface-soft`.
- İkon `32 r11` — rengi `server.iconColor` (Ş1), yoksa deterministik türetme.
- Ad `600 15px Outfit`, alt satır success noktası + `6 çevrimiçi · 24 üye` (`500 11px`),
  sağda chevron 16.
- Gerçek `button`, `aria-expanded` + `aria-haspopup="menu"`.

## 2. Sunucu menüsü (§2.2) — `server-menu.tsx`

`left/right: 9`, `top: 70`, `r16`, `padding 6`, `surface-card`, gölge `0 28px 56px -24px`.
**Tam olarak beş satır**, sırasıyla:

| Satır            | Renk           | Sağ ipucu | Eylem                                        |
| ---------------- | -------------- | --------- | -------------------------------------------- |
| Davet bağlantısı | primary        | `7 gün`   | Ş9 davet penceresi                           |
| Kategori oluştur | text-secondary | —         | Ş8 kategori penceresi                        |
| Kanal oluştur    | text-secondary | —         | Ş8 kanal penceresi                           |
| Sunucu ayarları  | text-secondary | —         | Ş11 ayarlar katmanı                          |
| Sunucudan ayrıl  | danger         | —         | Menüyü kapatır + mevcut `leaveServerRequest` |

- Yetkisiz üyeye `Kategori oluştur` · `Kanal oluştur` · `Sunucu ayarları` **render edilmez** (00 §5).
- Menü açıkken arama popover'ı kapanır (K11).
- `role="menu"` + ok tuşu gezinme + `Esc`.

## 3. Kanal arama (§2.3) — `channel-search-popover.tsx`

- Tetikleyici düğme: `8px 10px`, `r12`, `1px border/.7`, `surface-soft/.7`, arama ikonu 15,
  metin "Kanal ara", sağda `⌘K` çipi (`r6`, `surface-tertiary`).
- Popover `top: 114`: sorgu satırı (primary çerçeve, sağda `ESC` çipi),
  `KANALLAR · N SONUÇ` başlığı, sonuç satırları (ikon + ad + kategori).
- `⌘K` / `Ctrl+K` **mevcut komut paleti kısayolunu ezmez** — çakışma varsa çip yalnız görsel kalır
  ve gerçek kısayol rapora yazılır.
- Sonuç seçimi kanala gider; `Esc` kapatır, focus tetikleyiciye döner.
- Bugünkü inline `input` kaldırılır.

## 4. Kategori ve kanal listesi (§2.4)

- Kategori başlığı: `5px 5px 5px 4px`, caret 12 (`rotate(-90deg)` kapalıyken, `transition .18s`),
  ad `600 10.5px Outfit .13em uppercase`, opsiyonel `N gizli` çipi, sağda `+` düğmesi `20×20`.
- **Daraltıldığında** yalnız aktif / okunmamışı olan / içinde konuşan kanallar görünür —
  kural Ş0'ın `shouldShowInCollapsedCategory` fonksiyonundan gelir, burada yeniden yazılmaz.
- Kanal satırı: `7px 9px`, `r11`, `gap 8`, ikon 17, ad `13.5px` (aktif/okunmamış `600`),
  aktif `primary/.14` + solda `3.5×18` primary şerit (`left:-9px`).
  Sağda kilit ikonu 12 · okunmamış rozeti (`19×18 r6 danger`) · ses kanalında katılımcı sayacı (success).
- Ses kanalı altındaki katılımcılar: `4px 9px 4px 26px`, avatar 22 (konuşanda
  `box-shadow: 0 0 0 2px success`), ad `500 12px`, sağda susturulmuş ikonu (danger) veya `CANLI` çipi.
- Okunmamış rozeti `aria-label` ile okunur ("12 okunmamış mesaj").
- Liste mevcut sanallaştırmayı kullanır; yenisi eklenmez.

## 5. Bağlı ses şeridi (§2.5) — `connected-voice-strip.tsx`

- Yalnız kullanıcı bir ses kanalındayken; `margin 0 9px 8px`, `padding 10px 11px`, `r14`,
  `success/.12` zemin, `success/.35` çerçeve.
- Solda 4 çubuklu seviye göstergesi (`use-voice-audio-levels`), ortada kanal adı (success) +
  `<sunucu> · <gecikme> ms`, sağda ayrılma düğmesi `26 r9` danger tonunda.
- Gecikme değeri mevcut ses istatistiklerinden; karşılığı yoksa `TODO(api):`.
- `prefers-reduced-motion` altında çubuklar durur.

## 6. Erişim ve durum

- Kilitli/gizli kanal `canAccess=false` ise satır SPEC'teki kilit ikonuyla çizilir; gizli kanal
  normal üyeye **hiç** render edilmez.
- Tüm ölçüler `SERVER_METRICS.sidebar` / `.voiceStrip`'ten.

---

## Sınırlar

- Ray ve gezinme paneline dokunulmaz.
- `UserProfileFooter` gövdesi değişmez (yalnız kapsayıcı ölçüsü hizalanabilir).
- Pencerelerin **içeriği** bu şeritte yazılmaz; menü yalnız store eylemini tetikler.
- Yeni store alanı eklenecekse `lib/store.ts`'teki mevcut düzene uyar.

---

## Kabul kriterleri

- [ ] Kenar çubuğu 252; başlık, menü, arama, liste, ses şeridi SPEC ölçülerinde.
- [ ] Menüde **tam olarak beş** satır; yetkisiz üyede üç satır render edilmiyor (negatif test).
- [ ] Daraltılmış kategori yalnız aktif/okunmamış/konuşulan kanalı gösteriyor (birim + render testi).
- [ ] Arama popover'ı açılıyor, süzüyor, `Esc` kapatıyor, focus geri dönüyor.
- [ ] Ses kanalı katılımcı satırları, konuşma halkası ve `CANLI` çipi doğru.
- [ ] Bağlı ses şeridi yalnız bağlıyken çiziliyor; ayrılma düğmesi çalışıyor.
- [ ] dnd sıralama ve `collapsedCategories` davranışı bozulmadı (mevcut testler yeşil).
- [ ] Yeni hex yok; typecheck/lint/test yeşil; `server-parity.spec.ts`'in kenar çubuğu bölümü açıldı.

## Rapor

`raporlar/s4-kanal-kenar-cubugu.md` — `⌘K` çakışma bulgusu **mutlaka** girer.
