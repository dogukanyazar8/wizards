# Ş11 — Sunucu ayarları kabuğu + Genel · Görünürlük · İçerik (Dalga 5)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §8 (kabuk), §8.1, §8.2, §8.3.
> Bağımlılık: **Ş0**, **Ş1**, Ş8. Paralel: Ş12, Ş13. Karar: **K4** (eski dosya silinir).

---

## 0. Ön koşul — davranış envanteri (R4)

Kod yazmadan önce `components/shell/server-settings-overlay.tsx`'in envanterini çıkar ve rapora yaz:

- hangi mutation'lar çağrılıyor, hangi query key'ler invalidate ediliyor,
- hangi yetki guard'ları var (`isOwner` / `isAdmin` / rol koruması: `isProtectedRole`,
  `getRoleGuardCopy`),
- hangi `data-testid`'ler e2e tarafından kullanılıyor,
- hangi i18n anahtarları (`serverSettings.*`) bağlı.

Bu envanterdeki her madde 9 bölümden birine **taşınır**; kaybolan madde varsa raporda gerekçelenir.

---

## 1. Kabuk (§8)

`components/shell/server-settings/server-settings-overlay.tsx` (yeni):

- Kaplama `z-index 70`, `padding 26`, `background: hsl(var(--background)/.74)`.
- Kart `width: min(1180px, 100%)`, `height: 100%`, `r24`, `surface-base`, `1px border`,
  `box-shadow: 0 50px 110px -40px`.
- **Sol kolon 262** (`surface-panel`, sağ kenar `border/.5`):
  - Üstte sunucu kartı `15px 14px`, alt kenar `border/.45`: `42 r14` ikon (`iconColor`),
    ad `600 14.5px Outfit`, alt satır `N üye` · 3px ayraç noktası · görünürlük rozeti
    (`Özel` surface-tertiary/muted · `Herkese açık` success · `Keşfet'te` primary).
  - Menü satırları `9px 10px`, `r11`, ikon 17, `13px` (aktif `600`), sağda sayı çipi.

| #   | Bölüm                   | Sayı            | Üst açıklama                                      |
| --- | ----------------------- | --------------- | ------------------------------------------------- |
| 1   | Genel                   | —               | Sunucu kimliği, ikonu ve açıklaması               |
| 2   | Görünürlük ve Keşfet    | —               | Sunucuyu kimler bulabilir ve nasıl listelenir?    |
| 3   | İçerik ve Mesajlaşma    | —               | Medya izinleri ve mesaj davranışı                 |
| 4   | Kanallar ve Kategoriler | kanal sayısı    | Kategorileri ve kanalları düzenle, sırala, taşı   |
| 5   | Roller ve Yetkiler      | rol sayısı      | Rolleri düzenle, yetkileri grup grup ver          |
| 6   | Üyeler ve Moderasyon    | üye sayısı      | Üyeleri ara, rol ata, gerekirse çıkar             |
| 7   | Davetler                | davet sayısı    | Davet bağlantıları oluştur ve yönet               |
| 8   | Etkinlikler             | etkinlik sayısı | Yaklaşan ve iptal edilmiş etkinlikler             |
| 9   | Tehlike bölgesi         | —               | Geri alınamayan işlemler. Yalnızca sunucu sahibi. |

Sayılar **gerçek veriden** (K12: kenar çubuğuyla tek kaynak). `Tehlike bölgesi` satırı her zaman
danger; seçiliyken `danger/.12` zemin ve yalnız **sahibe** render edilir.

- **Sağ kolon** başlık çubuğu `14px 22px`, `surface-card`, alt kenar `border/.5`: başlık
  `600 17px Outfit` (tehlike bölümünde danger), altında bölüm açıklaması, sağda success noktalı
  `Değişiklikler kaydedildi` ve `31` kapatma düğmesi. Gövde `20px 22px 26px`, kaydırılır.
- Her bölüm `React.lazy` + kendi `Skeleton`'u (PROMPT §11).
- Tüm ayarlar **yalnız yönetici/sahip**; üyeye overlay hiç açılmaz.
- `Değişiklikler kaydedildi` göstergesi gerçek mutation durumundan; sahte gecikme yok.

## 2. Genel (§8.1)

İki kolon (`1fr / 286`).

**Sol:**

- İkon kartı: `76 r24` ikon, **6 renk swatch'ı** (`27 r9`), `Görsel yükle` / `Kaldır`,
  ipucu "PNG veya JPG · en az 256×256. Görsel yoksa kısaltma gösterilir."
  Swatch → `iconColor` (Ş1). Swatch bileşeni Ş10'unkiyle **ortak**, kopyalanmaz.
- Form kartı: `Sunucu adı` (`0/48`) + `Kısaltma` (116px kolon, ortalanmış, `0/4`, otomatik büyük
  harf) ve `Açıklama` textarea (`0/160`).
  **Not:** SPEC burada ad sayacını `0/48` diyor, sözleşme 2–64. Sözleşme otoritedir; sayaç `0/64`
  yazılır ve sapma rapora geçer. _(Ş0 raporunda aksi karar varsa ona uyulur.)_

**Sağ — Sunucu profili önizlemesi:** 52px ikon, ad, görünürlük rozeti + `N üye`, açıklama;
ayraçtan sonra `Üye N` · `Kanal N` · `Rol N` · `Görünürlük <değer>` satırları; en altta not
"Bu kart davet önizlemesinde ve Keşfet listelemesinde görünür."

## 3. Görünürlük ve Keşfet (§8.2)

Üç satır (`13px 15px`, `r16`, `surface-card`, ikon `32 r11`):

1. `Sunucu türü · Kişisel` + `Salt okunur` çipi — "Küçük ekip ve arkadaş grupları için." (anahtar yok;
   değer `Server.type`).
2. `Herkese açık` — "Bağlantıyı bilen herkes katılabilir." (anahtar → `isPublic`).
3. `Keşfet'te listele` — kapalıyken "Önce sunucuyu herkese açık yap.", satır `opacity: .55`,
   anahtar `not-allowed` + `aria-disabled` + neden metni; açıkken "Sunucu Keşfet'te seçilen
   etiketin kategorisinde listelenir." (anahtar → `discoverable`).
   **`Herkese açık` kapatılırsa `Keşfet'te listele` de otomatik kapanır** — tek yerde, iyimser
   güncellemede de geçerli.

`Keşif etiketleri` kartı: Ş8'in `DiscoveryTagPicker`'ı, `0/5` sayacı (5'te warning), açıklama,
`ÖNERİLEN ETİKETLER` + 5 grup (kod rozetleri `OY · İŞ · ÇA · Kİ · DE`), altta bilgi notu
"Keşfet listelemesi açıldığında sunucu, seçilen etiketin kategorisinde gösterilecek."

## 4. İçerik ve Mesajlaşma (§8.3)

- İki `ToggleRow`: `GIF gönderimi` ("Yazı kanallarında GIF arama ve gönderme.") ·
  `Dosya yükleme` ("Görsel, ekran görüntüsü ve belge paylaşımı.") → `allowGifs` / `allowFileUploads`.
- Üç seçenek kartı (başlık + sağda primary değer çipi + açıklama + `OptionChipGroup`):
  - `Mesaj karakter limiti` — 2B · 250 · 40.000 (varsayılan **2B**) → `messageCharacterLimit`.
  - `Silinen mesaj bildirimi` — 5 dk · 15 dk · 30 dk · 1 sa · 3 sa · 6 sa · 24 sa
    → `deletedMessageNoticeMinutes`. **K7:** mevcut sunucunun kayıtlı değeri neyse o seçili gelir;
    varsayılan sessizce değiştirilmez.
  - `Sunucu genelinde yavaş mod` — kanal ayarındaki 12 seçenek, varsayılan `Kapalı`
    → `Server.slowModeDelay` (Ş1). Açıklama: "Kanal bazlı yavaş moddan bağımsız çalışır;
    iki süre birlikte tanımlıysa uzun olan uygulanır."
    **"Yakında" etiketi yok — gerçek, çalışan bir ayardır.**

---

## Sınırlar

- Bölüm 4–9 diğer şeritlerde; bu şerit onların dosyalarını **oluşturur ama doldurmaz**
  (iskelet + Skeleton yeterli, Ş12/Ş13 doldurur).
- Yeni uç yazılmaz; hepsi `PATCH /servers/[serverId]`.
- Eski `server-settings-overlay.tsx` bu şeritte **silinir**; Ş12/Ş13 yeni dosyalarda çalışır.

---

## Kabul kriterleri

- [ ] Envanter raporu çıkarıldı; taşınmayan davranış yok (veya gerekçeli).
- [ ] Kabuk ölçüleri SPEC'te; sol menü 9 bölüm ve **gerçek** sayılar; `Tehlike bölgesi` danger ve
      yalnız sahipte.
- [ ] Bölümler lazy; her biri kendi Skeleton'unu gösteriyor.
- [ ] Genel: swatch'lar `iconColor` yazıyor, sayaçlar ve %85 warning çalışıyor, sağdaki profil canlı.
- [ ] Görünürlük: `Keşfet'te listele` yalnız herkese açıkken açılıyor; herkese açık kapanınca
      listeleme de kapanıyor (testli); etiket seçici 5 sınırıyla çalışıyor.
- [ ] İçerik: iki anahtar + üç seçenek grubu gerçek alanlara yazıyor; sunucu geneli yavaş mod
      kaydediliyor ve mesaj gönderiminde etkili (Ş1 testiyle birlikte).
- [ ] Üye rolüyle overlay açılmıyor (negatif test).
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s11-ayarlar-genel.md` — envanter tablosu ve `0/48` vs `0/64` sapması **mutlaka** girer.
