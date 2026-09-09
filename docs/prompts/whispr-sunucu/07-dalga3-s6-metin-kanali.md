# Ş6 — Metin kanalı: başlık, sabitlenen çubuk, bildirim çipi (Dalga 3)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §3 (tamamı).
> Bağımlılık: **Ş0**, Ş4 (kenar çubuğu), Ş5 (sağ panel). Paralel: Ş7.

---

## Görev

Metin kanalının **çerçevesini** SPEC §3'e hizala. Mesaj satırı, tepki çipi, thread düğmesi, dosya
kartı, kod parçası ve tarih ayracı **zaten** `MESSAGES_METRICS` sözlüğüyle çizildiği için yeniden
yazılmaz — bu şerit başlık, sabitlenen çubuk, bildirim durumu ve bestekar ölçüleriyle sınırlı.

Önce doğrula: `chat/message-item.tsx` ve `message-list.tsx` SPEC §3.3'ün her maddesini karşılıyor mu?
Karşılamayan madde varsa **yalnız o madde** düzeltilir ve rapora yazılır.

---

## 1. Kanal başlığı (§3.1)

- `padding: 14px 20px`, alt kenar `border/.45`.
- `#` ikonu 20 (muted) / sesli kanalda hoparlör, ad `600 16.5px Outfit`.
- Kategori çipi (`r999`, `surface-soft`) — örn. `PAYCORE`.
- **Bildirim durumu çipi** (warning) yalnız `Yalnızca bahsedilmeler` veya `Sessize alındı` iken.
- Alt satır: `<konu> · N üye erişebilir`. Erişebilen üye sayısı kanal izinlerinden türetilir;
  karşılığı yoksa `TODO(api):` + tipli adapter.
- Sağda `33 r11` düğmeler: **ara** · **bildirim** · **sabitlenenler**, `1×22` ayraç, sonra
  `Üyeler` düğmesi (h33, ikon + metin). Aktif düğme `primary/.16` + primary.
- Zil ikonunun rengi bildirim tercihine göre değişir (primary / warning / danger).

## 2. Sabitlenen mesaj çubuğu (§3.2)

- `padding: 8px 20px`, zemin `surface-secondary/.7`, alt kenar `border/.4`.
- Warning raptiye ikonu 13, `N sabitlenen mesaj` (`600 11.5px`), tek satır özet (ellipsis),
  sağda `Tümünü gör` (primary) → mevcut `PinnedListSheet`.
- Sabitlenen yoksa çubuk **çizilmez**.
- Mevcut `PinnedStrip` bileşeni bu ölçülere hizalanır; DM tarafındaki kullanımı bozulmaz
  (gerekirse varyant prop'u, yeni bileşen değil).

## 3. Bildirim tercihi

- `/api/v1/channels/[channelId]/notification-settings` ucu **zaten var** — kullanılır.
- Tercih: `all | mentions | none`. Değişiklik başlıktaki çipi ve zil rengini **anında** günceller
  (optimistik + geri alma).
- Pencere Ş9'da; bu şerit yalnız tetikleyiciyi ve okuma tarafını bağlar.

## 4. Bestekar (§3.4)

- `padding: 0 20px 18px`. Kutu `9px 12px`, `r15`, `1px border`, `surface-card`.
- Solda dosya ekleme `34 r11` (`surface-soft`, hover primary), ortada input
  (`#<kanal> kanalına yaz`, `14.5px`), sağda `Aa` · emoji · `GIF` (34) ve gönder `36 r12 primary`
  (`box-shadow: 0 8px 18px -12px primary`).
- Sunucu `allowGifs` / `allowFileUploads` kapalıysa ilgili düğme **render edilmez**.
- Yavaş mod etkinse (Ş1'in `max(server, channel)` kuralı) bestekarda kalan süre gösterilir;
  mevcut yavaş mod göstergesi varsa yeniden yazılmaz.

## 5. Yazıyor göstergesi (§3.3 son madde)

- Üç nokta (5px, primary → `.6` → `.3`) + `<ad> yazıyor…`, `12px` muted.
- Mevcut `TypingIndicator` bu ölçülere hizalanır.

---

## Sınırlar

- Mesaj satırı, tepkiler, thread paneli, düzenleme/silme akışı **değişmez**.
- Yeni mesaj ucu, yeni socket olayı yok.
- Ses kanalı başlığı Ş7'de.

---

## Kabul kriterleri

- [ ] Başlık: ikon, ad, kategori çipi, bildirim çipi, alt satır, 3 ikon düğmesi + `Üyeler` düğmesi
      SPEC ölçülerinde; aktif düğme tonu doğru.
- [ ] Bildirim tercihi değişince çip ve zil rengi anında değişiyor; sunucuya yazılıyor.
- [ ] Sabitlenen çubuk yalnız sabit mesaj varken çiziliyor; `Tümünü gör` sheet'i açıyor;
      DM tarafındaki `PinnedStrip` kullanımı bozulmadı.
- [ ] Bestekar ölçüleri SPEC'te; `allowGifs`/`allowFileUploads` kapalıyken düğmeler yok.
- [ ] `N üye erişebilir` gerçek veriden veya işaretli `TODO(api):` adapterden geliyor.
- [ ] §3.3 denetimi yapıldı; sapma varsa düzeltildi ve raporlandı.
- [ ] Yeni hex yok; typecheck/lint/test yeşil; parity spec'in metin kanalı bölümü açıldı.

## Rapor

`raporlar/s6-metin-kanali.md` — §3.3 denetim sonucu (karşılanan/karşılanmayan madde listesi) girer.
